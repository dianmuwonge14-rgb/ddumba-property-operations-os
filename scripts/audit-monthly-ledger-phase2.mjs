import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMPANY_ID = process.env.COMPANY_ID || null;
const MONTH = process.env.AUDIT_MONTH || "2026-08";
const SELECTED_MONTH = `${MONTH}-01`;
const INVALID = new Set(["archived", "cancelled", "canceled", "corrected", "deleted", "duplicate", "pending", "rejected", "removed", "removed_by_admin_approval", "reversed", "superseded", "void", "voided", "inactive", "terminated"]);

function n(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function s(value) {
  return value == null ? "" : String(value);
}

function norm(value) {
  return s(value).trim().toLowerCase();
}

function dateOnly(value) {
  return s(value).slice(0, 10);
}

function paymentDate(row) {
  return dateOnly(row.payment_date) || dateOnly(row.paid_at) || dateOnly(row.created_at);
}

function effectiveCollection(row) {
  if (!row) return false;
  const status = norm(row.status || "posted");
  if (INVALID.has(status)) return false;
  if (status.includes("duplicate") || status.includes("reversed")) return false;
  if (row.financial_effective === false) return false;
  if (row.reversed_at || row.voided_at || row.deleted_at || row.superseded_at) return false;
  if (row.superseded_by_payment_id || row.corrected_by_payment_id) return false;
  return true;
}

function amount(row) {
  return n(row?.amount_paid ?? row?.amount);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampBillingDay(value) {
  const day = Number(value);
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.min(31, Math.trunc(day)));
}

function dateForBillingDay(year, monthIndex, billingDay) {
  const day = Math.min(clampBillingDay(billingDay), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function addMonths(date, months, billingDay) {
  const [year, month] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  return dateForBillingDay(targetYear, normalizedMonth, billingDay);
}

function previousDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function expectedCoverage(monthKey, billingDay) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = dateForBillingDay(year, month - 1, billingDay);
  return { start, end: previousDay(addMonths(start, 1, billingDay)) };
}

function availableAdvance(row) {
  return Math.max(0, n(row.amount_allocated) - n(row.consumed_by_balance_reconciliation));
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }
  return map;
}

async function fetchAll(table, columns, apply = (query) => query) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (COMPANY_ID) query = query.eq("company_id", COMPANY_ID);
    query = apply(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

function calculatePosition({ allocations, collections, monthlyRent, rentMonths }) {
  const effective = collections.filter(effectiveCollection);
  const paymentById = new Map(effective.map((row) => [s(row.id), row]));
  const paymentsThisMonth = effective
    .filter((row) => paymentDate(row).slice(0, 7) === MONTH)
    .reduce((total, row) => total + amount(row), 0);
  const currentRows = rentMonths.filter((row) => s(row.rent_month || row.due_date || row.coverage_start).slice(0, 7) === MONTH);
  const currentMonthRent = currentRows.length ? n(currentRows[0].rent_amount) || monthlyRent : monthlyRent;
  const priorRemaining = rentMonths
    .filter((row) => s(row.rent_month || row.due_date || row.coverage_start).slice(0, 7) < MONTH)
    .reduce((total, row) => total + n(row.outstanding_amount), 0);
  const currentPaymentToPrior = allocations
    .filter((row) => s(row.allocation_month).slice(0, 7) < MONTH)
    .filter((row) => paymentById.has(s(row.payment_id)) && paymentDate(paymentById.get(s(row.payment_id))).slice(0, 7) === MONTH)
    .reduce((total, row) => total + n(row.amount_allocated), 0);
  const openingArrears = priorRemaining + currentPaymentToPrior;
  const openingCredit = allocations
    .filter((row) => s(row.allocation_type) === "advance_month")
    .filter((row) => s(row.allocation_month).slice(0, 7) <= MONTH)
    .filter((row) => {
      const payment = paymentById.get(s(row.payment_id));
      return !payment || paymentDate(payment).slice(0, 7) < MONTH;
    })
    .reduce((total, row) => total + (n(row.consumed_by_balance_reconciliation) > 0 ? n(row.consumed_by_balance_reconciliation) : availableAdvance(row)), 0);
  const futureAdvance = allocations
    .filter((row) => s(row.allocation_type) === "advance_month")
    .filter((row) => s(row.allocation_month).slice(0, 7) > MONTH)
    .reduce((total, row) => total + availableAdvance(row), 0);
  const futureAdvanceOpeningCredit = allocations
    .filter((row) => s(row.allocation_type) === "advance_month")
    .filter((row) => s(row.allocation_month).slice(0, 7) > MONTH)
    .filter((row) => {
      const payment = paymentById.get(s(row.payment_id));
      return !payment || paymentDate(payment).slice(0, 7) < MONTH;
    })
    .reduce((total, row) => total + availableAdvance(row), 0);
  const raw = openingArrears + currentMonthRent - paymentsThisMonth - openingCredit - futureAdvanceOpeningCredit;
  return {
    currentMonthRent,
    currentRows,
    futureAdvance,
    openingArrears,
    openingCredit,
    futureAdvanceOpeningCredit,
    outstanding: Math.max(raw, 0),
    paymentsThisMonth,
    raw,
    advance: Math.max(-raw, 0),
  };
}

function classify(input) {
  const { allocations, collections, currentMonthRent, currentRows, duplicatePaymentKeys, lease, monthlyRent, position, rentMonths, room, tenant } = input;
  const details = [];
  const effective = collections.filter(effectiveCollection);
  const billingDay = clampBillingDay(lease?.billing_day ?? tenant.billing_day ?? 1);
  const coverage = expectedCoverage(MONTH, billingDay);
  const currentPaymentIds = new Set(effective.filter((row) => paymentDate(row).slice(0, 7) === MONTH).map((row) => s(row.id)));
  const allocationTotalForCurrentPayments = allocations
    .filter((row) => currentPaymentIds.has(s(row.payment_id)))
    .reduce((total, row) => total + n(row.amount_allocated), 0);
  const currentPaymentTotal = effective.filter((row) => paymentDate(row).slice(0, 7) === MONTH).reduce((total, row) => total + amount(row), 0);
  const duplicateForTenant = effective.some((row) => duplicatePaymentKeys.has([row.company_id, row.office_id, row.room_id, row.tenant_id, paymentDate(row), amount(row)].join("|")));
  const correctionConflict = effective.some((row) => row.correction_of_payment_id || row.corrected_by_payment_id || row.superseded_by_payment_id || row.superseded_at);
  const multipleCurrentRows = currentRows.length > 1;
  const missingCurrentRent = currentRows.length === 0 && monthlyRent > 0;
  const rentMismatch = currentRows.some((row) => monthlyRent > 0 && Math.abs(n(row.rent_amount) - monthlyRent) > 1);
  const billingMismatch = currentRows.some((row) => {
    const actualStart = dateOnly(row.coverage_start);
    const actualEnd = dateOnly(row.coverage_end);
    return (actualStart && actualStart !== coverage.start) || (actualEnd && actualEnd !== coverage.end);
  });
  const hasRoomLinkProblem = !room?.id || s(tenant.room_id) !== s(room?.id);
  const staleOnly = !hasRoomLinkProblem && !billingMismatch && !missingCurrentRent && !multipleCurrentRows && !rentMismatch && !duplicateForTenant && !correctionConflict && Math.abs(allocationTotalForCurrentPayments - currentPaymentTotal) <= 1;

  if (hasRoomLinkProblem) {
    details.push("Active tenant does not resolve cleanly to one current room.");
    return ["TENANCY/ROOM LINK ERROR", details];
  }
  if (billingMismatch) {
    details.push(`Expected current coverage ${coverage.start} to ${coverage.end} for billing day ${billingDay}.`);
    return ["WRONG BILLING PERIOD", details];
  }
  if (missingCurrentRent || multipleCurrentRows || rentMismatch || currentMonthRent <= 0) {
    if (missingCurrentRent) details.push("No current rent-month row exists; formula fell back to monthly rent.");
    if (multipleCurrentRows) details.push(`Multiple current rent-month rows exist: ${currentRows.length}.`);
    if (rentMismatch) details.push(`Current rent-month charge differs from authoritative monthly rent UGX ${monthlyRent.toLocaleString("en-UG")}.`);
    return ["RENT CHARGE ERROR", details];
  }
  if (duplicateForTenant) {
    details.push("Financially effective payments share room, tenant, date and amount.");
    return ["DUPLICATE PAYMENT", details];
  }
  if (correctionConflict) {
    details.push("A financially effective payment still carries correction/supersession linkage.");
    return ["CORRECTION LINK ERROR", details];
  }
  if (Math.abs(allocationTotalForCurrentPayments - currentPaymentTotal) > 1) {
    details.push(`Current payment total UGX ${currentPaymentTotal.toLocaleString("en-UG")} but linked allocations total UGX ${allocationTotalForCurrentPayments.toLocaleString("en-UG")}.`);
    return ["MISSING PAYMENT LINK", details];
  }
  const priorRemaining = rentMonths.filter((row) => s(row.rent_month).slice(0, 7) < MONTH).reduce((total, row) => total + n(row.outstanding_amount), 0);
  if (priorRemaining > 0 && position.openingArrears < priorRemaining - 1) {
    details.push(`Prior rent-month remaining UGX ${priorRemaining.toLocaleString("en-UG")} exceeds opening arrears UGX ${position.openingArrears.toLocaleString("en-UG")}.`);
    return ["WRONG MONTH ROLLOVER", details];
  }
  const maturedUnconsumed = allocations
    .filter((row) => s(row.allocation_type) === "advance_month" && s(row.allocation_month).slice(0, 7) <= MONTH)
    .reduce((total, row) => total + availableAdvance(row), 0);
  if (maturedUnconsumed > 1) {
    details.push(`Matured unconsumed advance remains UGX ${maturedUnconsumed.toLocaleString("en-UG")}.`);
    return ["WRONG OPENING ARREARS", details];
  }
  if (staleOnly) {
    details.push("Formula inputs reconcile; stored tenant/room balance snapshot disagrees.");
    return ["STALE BALANCE SNAPSHOT", details];
  }
  details.push("Inputs need human review before financial-history mutation.");
  return ["MANUAL REVIEW REQUIRED", details];
}

const offices = await fetchAll("offices", "id, office_name, name, status");
const companyId = COMPANY_ID || offices[0]?.company_id || null;
const [rooms, tenants, collections, rentMonths, allocations, leases] = await Promise.all([
  fetchAll("rooms", "id, company_id, office_id, property_id, landlord_id, room_number, status, monthly_rent, outstanding_balance"),
  fetchAll("tenants", "id, company_id, office_id, room_id, full_name, phone, status, balance, monthly_rent, billing_day, created_at"),
  fetchAll("collections", "id, company_id, office_id, room_id, tenant_id, payment_date, paid_at, amount, amount_paid, status, created_at, financial_effective, reversed_at, voided_at, deleted_at, superseded_at, superseded_by_payment_id, corrected_by_payment_id, correction_of_payment_id"),
  fetchAll("tenant_rent_months", "id, company_id, room_id, tenant_id, rent_month, due_date, coverage_start, coverage_end, rent_amount, amount_paid, outstanding_amount, status"),
  fetchAll("tenant_rent_allocations", "id, company_id, room_id, tenant_id, payment_id, allocation_month, allocation_type, amount_allocated, consumed_by_balance_reconciliation, allocation_source, is_historical_credit, coverage_start, coverage_end"),
  fetchAll("leases", "id, company_id, room_id, tenant_id, billing_day, start_date, monthly_rent, status", (query) => query.eq("status", "active")),
]);

const officeById = new Map(offices.map((row) => [s(row.id), s(row.office_name || row.name)]));
const roomById = new Map(rooms.map((row) => [s(row.id), row]));
const collectionsByTenant = groupBy(collections, (row) => s(row.tenant_id));
const rentMonthsByTenant = groupBy(rentMonths, (row) => s(row.tenant_id));
const allocationsByTenant = groupBy(allocations, (row) => s(row.tenant_id));
const leaseByTenant = new Map(leases.map((row) => [s(row.tenant_id), row]));
const effectiveCollections = collections.filter(effectiveCollection);
const duplicatePaymentGroups = groupBy(effectiveCollections, (row) => [row.company_id, row.office_id, row.room_id, row.tenant_id, paymentDate(row), amount(row)].join("|"));
const duplicatePaymentKeys = new Set([...duplicatePaymentGroups.entries()].filter(([, rows]) => rows.length > 1).map(([key]) => key));
const activeTenants = tenants.filter((row) => !INVALID.has(norm(row.status)) && s(row.room_id));

const categories = new Map([
  ["STALE BALANCE SNAPSHOT", []],
  ["WRONG OPENING ARREARS", []],
  ["MISSING PAYMENT LINK", []],
  ["DUPLICATE PAYMENT", []],
  ["WRONG BILLING PERIOD", []],
  ["WRONG MONTH ROLLOVER", []],
  ["CORRECTION LINK ERROR", []],
  ["RENT CHARGE ERROR", []],
  ["TENANCY/ROOM LINK ERROR", []],
  ["MANUAL REVIEW REQUIRED", []],
]);

for (const tenant of activeTenants) {
  const room = roomById.get(s(tenant.room_id));
  const tenantCollections = collectionsByTenant.get(s(tenant.id)) ?? [];
  const tenantRentMonths = rentMonthsByTenant.get(s(tenant.id)) ?? [];
  const tenantAllocations = allocationsByTenant.get(s(tenant.id)) ?? [];
  const lease = leaseByTenant.get(s(tenant.id));
  const monthlyRent = n(lease?.monthly_rent) || n(tenant.monthly_rent) || n(room?.monthly_rent);
  const position = calculatePosition({ allocations: tenantAllocations, collections: tenantCollections, monthlyRent, rentMonths: tenantRentMonths });
  const stored = Math.max(n(tenant.balance), n(room?.outstanding_balance));
  const conflict = position.outstanding > 1 && position.advance > 1;
  const mismatch = Math.abs(stored - position.outstanding) > 1 || conflict;
  const currentRows = position.currentRows;
  const billingDay = clampBillingDay(lease?.billing_day ?? tenant.billing_day ?? 1);
  const coverage = expectedCoverage(MONTH, billingDay);
  const billingMismatch = currentRows.some((row) => {
    const actualStart = dateOnly(row.coverage_start);
    const actualEnd = dateOnly(row.coverage_end);
    return (actualStart && actualStart !== coverage.start) || (actualEnd && actualEnd !== coverage.end);
  });
  if (!mismatch && !billingMismatch) continue;
  const [category, reasonDetails] = classify({
    allocations: tenantAllocations,
    collections: tenantCollections,
    currentMonthRent: position.currentMonthRent,
    currentRows,
    duplicatePaymentKeys,
    lease,
    monthlyRent,
    position,
    rentMonths: tenantRentMonths,
    room,
    tenant,
  });
  categories.get(category).push({
    room: s(room?.room_number || "Unknown"),
    tenant: s(tenant.full_name || "Unnamed Tenant"),
    tenantId: s(tenant.id),
    roomId: s(room?.id),
    office: officeById.get(s(room?.office_id || tenant.office_id)) || "Unknown",
    monthlyRent,
    storedOutstanding: stored,
    formulaOutstanding: position.outstanding,
    formulaAdvance: position.advance,
    openingArrears: position.openingArrears,
    openingCredit: position.openingCredit,
    paymentsThisMonth: position.paymentsThisMonth,
    currentMonthRent: position.currentMonthRent,
    raw: position.raw,
    reasonDetails,
  });
}

const counts = Object.fromEntries([...categories.entries()].map(([key, rows]) => [key, rows.length]));
const safeForAutomaticRepair = categories.get("STALE BALANCE SNAPSHOT").length;
const manualReview = [...categories.entries()].filter(([key]) => key !== "STALE BALANCE SNAPSHOT").reduce((total, [, rows]) => total + rows.length, 0);
const e13 = [...categories.values()].flat().find((row) => row.room === "E13");

console.log(JSON.stringify({
  auditMonth: MONTH,
  totalActiveTenanciesChecked: activeTenants.length,
  totalFormulaIssuesClassified: [...categories.values()].reduce((total, rows) => total + rows.length, 0),
  counts,
  safeForAutomaticRepair,
  requiresManualReview: manualReview,
  e13,
  examples: Object.fromEntries([...categories.entries()].map(([key, rows]) => [key, rows.slice(0, 5)])),
}, null, 2));
