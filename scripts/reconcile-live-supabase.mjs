import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const PAGE_SIZE = 1000;
const INACTIVE_STATUSES = new Set(["archived", "deleted", "removed", "inactive"]);
const INACTIVE_FINANCIAL_STATUSES = new Set(["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled", "archived", "deleted"]);
const APPROVED_EXPENSE_STATUSES = new Set(["", "approved", "active", "recorded"]);

loadDotEnv(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const period = resolvePeriod();
const startedAt = Date.now();
const warnings = [];

const tables = await loadTables({
  offices: ["offices", "id,office_name,name,status,company_id"],
  rooms: ["rooms", "id,company_id,office_id,landlord_id,property_id,room_number,monthly_rent,status,outstanding_balance"],
  tenants: ["tenants", "id,company_id,office_id,room_id,full_name,status,balance,monthly_rent"],
  properties: ["properties", "id,company_id,office_id,landlord_id,property_name,status"],
  landlords: ["landlords", "id,company_id,full_name,status,commission_rate,commission_calculation_mode"],
  collections: ["collections", "id,company_id,office_id,tenant_id,room_id,amount,amount_paid,status,payment_date,paid_at,created_at,payment_method"],
  expenses: ["expenses", "id,company_id,office_id,amount,approved_at,expense_date,created_at"],
  promises: ["promises", "id,company_id,office_id,tenant_id,room_id,status,promised_amount,amount,promised_date,promise_date,fulfilled_at"],
  landlordPayments: ["landlord_payments", "id,company_id,office_id,landlord_id,amount,status,paid_at,created_at"],
  landlordPayables: ["landlord_monthly_payables", "id,company_id,office_id,landlord_id,settlement_month,net_payable,unpaid_balance,status"],
  landlordAdvances: ["landlord_advances", "id,company_id,office_id,landlord_id,status,lifecycle_status,total_repayable,advance_amount,principal_amount,deducted_amount,remaining_total_balance,remaining_balance,created_at,date_given"],
  cashAccounts: ["cash_accounts", "id,company_id,office_id,account_type,name,status"],
  cashTransactions: ["cash_transactions", "id,company_id,office_id,cash_account_id,amount,transaction_type,source_type,source_id,transaction_date,created_at"],
  tenantRentMonths: ["tenant_rent_months", "id,company_id,office_id,tenant_id,room_id,rent_month,rent_amount,amount_paid,outstanding_amount,status"],
  leases: ["leases", "id,company_id,office_id,room_id,tenant_id,status,billing_day,start_date,monthly_rent"],
  employeeRows: ["employees", "id,company_id,office_id,status,basic_salary,daily_lunch_allowance"],
});

const companyIds = unique(tables.offices.map((row) => row.company_id).filter(Boolean));
const reports = [];
for (const companyId of companyIds) {
  const companyRows = scopeCompany(tables, companyId);
  const companyOffices = companyRows.offices.filter((office) => !isInactive(office.status));
  const officeReports = companyOffices.map((office) => reconcileOffice(companyId, office, companyRows));
  reports.push({
    companyId,
    officeCount: companyOffices.length,
    offices: officeReports,
    totals: sumOfficeReports(officeReports),
    mismatches: officeReports.flatMap((report) => report.mismatches.map((mismatch) => ({ officeId: report.officeId, officeName: report.officeName, ...mismatch }))),
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  period,
  runtimeMs: Date.now() - startedAt,
  warnings,
  summary: {
    companiesChecked: reports.length,
    officesChecked: reports.reduce((total, report) => total + report.officeCount, 0),
    mismatchesFound: reports.reduce((total, report) => total + report.mismatches.length, 0),
  },
  reports,
};

const outputDir = path.join(process.cwd(), "outputs");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `live-reconciliation-${period.startDate}-to-${period.endDate}.json`);
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log(JSON.stringify({
  generatedAt: result.generatedAt,
  period,
  runtimeMs: result.runtimeMs,
  warnings,
  summary: result.summary,
  outputPath,
  mismatches: reports.flatMap((report) => report.mismatches).slice(0, 50),
}, null, 2));

function reconcileOffice(companyId, office, rows) {
  const officeId = office.id;
  const rooms = rows.rooms.filter((room) => resolvedOfficeId(room, rows) === officeId && !isInactive(room.status));
  const tenants = rows.tenants.filter((tenant) => resolvedTenantOfficeId(tenant, rows.rooms) === officeId && normalizeStatus(tenant.status) !== "import_review" && !isInactive(tenant.status));
  const properties = rows.properties.filter((property) => property.office_id === officeId && !isInactive(property.status));
  const collections = rows.collections.filter((row) => row.office_id === officeId && isActiveFinancial(row) && inRange(row.payment_date || row.paid_at || row.created_at));
  const allCollections = rows.collections.filter((row) => row.office_id === officeId && isActiveFinancial(row));
  const expenses = rows.expenses.filter((row) => row.office_id === officeId && isApprovedExpense(row) && inRange(row.expense_date || row.created_at));
  const allExpenses = rows.expenses.filter((row) => row.office_id === officeId && isApprovedExpense(row));
  const promises = rows.promises.filter((row) => row.office_id === officeId);
  const landlordPayments = rows.landlordPayments.filter((row) => row.office_id === officeId && isActiveFinancial(row) && inRange(row.paid_at || row.created_at));
  const landlordPayables = rows.landlordPayables.filter((row) => row.office_id === officeId && !isInactive(row.status) && String(row.settlement_month || "").slice(0, 7) === period.startDate.slice(0, 7));
  const landlordAdvances = rows.landlordAdvances.filter((row) => row.office_id === officeId);
  const tenantRentMonths = rows.tenantRentMonths.filter((row) => row.office_id === officeId && String(row.rent_month || "").slice(0, 7) === period.startDate.slice(0, 7));
  const allTenantRentMonths = rows.tenantRentMonths.filter((row) => row.office_id === officeId);
  const employees = rows.employeeRows.filter((row) => row.office_id === officeId && !isInactive(row.status));
  const cash = reconcileCash(officeId, rows, allCollections, allExpenses);
  const landlordFinance = calculateLandlordFinance(rooms, rows.landlords);
  const dueOccupiedRooms = rooms.filter((room) => isOccupiedRoom(room) && isRoomDueThisPeriod(room, rows));
  const dueOccupiedRentRoll = sum(dueOccupiedRooms, (room) => effectiveRoomRent(room, rows));
  const activeAdvances = landlordAdvances.filter(isActiveAdvance);
  const paidByLandlord = new Map();
  for (const payment of landlordPayments) {
    if (!payment.landlord_id) continue;
    paidByLandlord.set(payment.landlord_id, (paidByLandlord.get(payment.landlord_id) || 0) + amount(payment.amount));
  }
  const unpaidLandlordComputed = landlordFinance.byLandlord.reduce((total, item) => total + Math.max(0, item.landlordPayable - (paidByLandlord.get(item.landlordId) || 0)), 0);

  const metrics = {
    properties: properties.length,
    rooms: rooms.length,
    occupiedRooms: rooms.filter(isOccupiedRoom).length,
    vacantRooms: rooms.filter(isVacantRoom).length,
    activeTenants: tenants.length,
    currentMonthRentRows: tenantRentMonths.length,
    rentRollFromRooms: landlordFinance.rentRoll,
    dueOccupiedRentRollFromRooms: dueOccupiedRentRoll,
    rentRollFromTenantRentMonths: sum(tenantRentMonths, (row) => row.rent_amount),
    tenantOutstandingFromProfiles: sum(tenants, (tenant) => tenant.balance),
    tenantOutstandingFromRentMonths: sum(allTenantRentMonths, (row) => row.outstanding_amount),
    collectionsAmount: sum(collections, collectionAmount),
    collectionsRows: collections.length,
    expensesAmount: sum(expenses, (row) => row.amount),
    expensesRows: expenses.length,
    promisesActive: promises.filter((promise) => !["paid", "fulfilled", "broken"].includes(normalizeStatus(promise.status))).length,
    landlordPayableComputed: landlordFinance.landlordPayable,
    landlordPayableLedger: sum(landlordPayables, (row) => row.net_payable),
    landlordUnpaidComputed: unpaidLandlordComputed,
    landlordUnpaidLedger: sum(landlordPayables, (row) => row.unpaid_balance),
    landlordPaymentsMade: sum(landlordPayments, (row) => row.amount),
    landlordAdvancesGiven: sum(activeAdvances, advanceTotal),
    landlordAdvanceBalance: sum(activeAdvances, advanceRemaining),
    employeeCount: employees.length,
    cash,
  };

  const mismatches = [];
  checkMismatch(mismatches, "dueOccupiedRentRollFromRooms_vs_tenantRentMonths", metrics.dueOccupiedRentRollFromRooms, metrics.rentRollFromTenantRentMonths, "due occupied room rent vs current tenant_rent_months.rent_amount");
  checkMismatch(mismatches, "landlordPayable_computed_vs_ledger", metrics.landlordPayableComputed, metrics.landlordPayableLedger, "computed room landlord payable vs landlord_monthly_payables.net_payable");
  checkMismatch(mismatches, "landlordUnpaid_computed_vs_ledger", metrics.landlordUnpaidComputed, metrics.landlordUnpaidLedger, "computed unpaid landlord balance vs landlord_monthly_payables.unpaid_balance");
  checkMismatch(mismatches, "cashAtOffice_formula_vs_cashTransactions", cash.moneyAtOfficeFormula, cash.moneyAtOfficeTransactions, "collections/expenses formula vs cash_transactions office_cash balance");

  return {
    companyId,
    officeId,
    officeName: office.office_name || office.name || "Office",
    metrics,
    mismatches,
  };
}

function reconcileCash(officeId, rows, periodCollections, periodExpenses) {
  const officeCashAccounts = rows.cashAccounts.filter((account) => account.office_id === officeId && account.account_type === "office_cash" && normalizeStatus(account.status || "active") === "active");
  const officeCashAccountIds = new Set(officeCashAccounts.map((account) => account.id));
  const officeTransactions = rows.cashTransactions.filter((row) => officeCashAccountIds.has(row.cash_account_id));
  const officeInflows = officeTransactions.filter((row) => row.transaction_type === "inflow");
  const officeOutflows = officeTransactions.filter((row) => row.transaction_type === "outflow");
  const banked = officeOutflows.filter((row) => row.source_type === "bank_deposit");
  const adminFloatIn = officeInflows.filter((row) => row.source_type === "admin_float");
  const adminFloatOut = officeOutflows.filter((row) => row.source_type === "admin_float");
  const moneyAtOfficeTransactions = sum(officeInflows, (row) => row.amount) - sum(officeOutflows, (row) => row.amount);
  const moneyAtOfficeFormula = sum(periodCollections, collectionAmount) + sum(adminFloatIn, (row) => row.amount) - sum(adminFloatOut, (row) => row.amount) - sum(periodExpenses, (row) => row.amount) - sum(banked, (row) => row.amount);
  return {
    moneyAtOfficeTransactions,
    moneyAtOfficeFormula,
    moneyBanked: sum(banked, (row) => row.amount),
    adminFloatNet: sum(adminFloatIn, (row) => row.amount) - sum(adminFloatOut, (row) => row.amount),
  };
}

function isRoomDueThisPeriod(room, rows) {
  const tenant = rows.tenants.find((item) => item.room_id === room.id && normalizeStatus(item.status) === "active");
  if (!tenant) return false;
  const lease = activeLeaseForRoom(room.id, tenant.id, rows.leases);
  const dueDay = Math.min(28, Math.max(1, Number(lease?.billing_day || (lease?.start_date ? String(lease.start_date).slice(8, 10) : 1) || 1)));
  return dueDay <= Number(period.endDate.slice(8, 10));
}

function effectiveRoomRent(room, rows) {
  const tenant = rows.tenants.find((item) => item.room_id === room.id && normalizeStatus(item.status) === "active");
  const lease = tenant ? activeLeaseForRoom(room.id, tenant.id, rows.leases) : null;
  return amount(lease?.monthly_rent ?? tenant?.monthly_rent ?? room.monthly_rent);
}

function activeLeaseForRoom(roomId, tenantId, leases) {
  return leases
    .filter((lease) => lease.room_id === roomId && lease.tenant_id === tenantId && normalizeStatus(lease.status) === "active")
    .sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")))[0] || null;
}

function calculateLandlordFinance(rooms, landlords) {
  const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
  const grouped = new Map();
  for (const room of rooms) {
    const key = room.landlord_id || `unassigned:${room.id}`;
    grouped.set(key, [...(grouped.get(key) || []), room]);
  }
  let rentRoll = 0;
  let companyCommission = 0;
  let landlordPayable = 0;
  const byLandlord = [];
  for (const [landlordId, landlordRooms] of grouped.entries()) {
    const landlord = landlordId.startsWith("unassigned:") ? null : landlordById.get(landlordId) || null;
    const gross = sum(landlordRooms, (room) => room.monthly_rent);
    const vacantDeduction = sum(landlordRooms.filter(isVacantRoom), (room) => room.monthly_rent);
    const occupiedRent = Math.max(0, gross - vacantDeduction);
    const rate = finiteNumber(landlord?.commission_rate, 10);
    const mode = landlord?.commission_calculation_mode === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
    const commissionBase = mode === "occupied_room_based" ? occupiedRent : gross;
    const commission = commissionBase * rate / 100;
    const payable = mode === "occupied_room_based"
      ? Math.max(0, occupiedRent - commission)
      : Math.max(0, gross - commission - vacantDeduction);
    rentRoll += gross;
    companyCommission += commission;
    landlordPayable += payable;
    byLandlord.push({ landlordId: landlordId.startsWith("unassigned:") ? null : landlordId, rentRoll: gross, companyCommission: commission, landlordPayable: payable });
  }
  return { rentRoll, companyCommission, landlordPayable, byLandlord };
}

async function loadTables(definitions) {
  const loaded = {};
  for (const [key, [table, columns]] of Object.entries(definitions)) {
    const start = Date.now();
    try {
      loaded[key] = await fetchAll(table, columns);
      warnings.push(`${table}: ${loaded[key].length} rows in ${Date.now() - start}ms`);
    } catch (error) {
      warnings.push(`${table}: ${error instanceof Error ? error.message : String(error)}`);
      loaded[key] = [];
    }
  }
  return loaded;
}

async function fetchAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
}

function scopeCompany(tables, companyId) {
  return Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.filter((row) => row.company_id === companyId || key === "offices")]));
}

function sumOfficeReports(reports) {
  return reports.reduce((total, report) => ({
    rentRollFromRooms: total.rentRollFromRooms + report.metrics.rentRollFromRooms,
    collectionsAmount: total.collectionsAmount + report.metrics.collectionsAmount,
    expensesAmount: total.expensesAmount + report.metrics.expensesAmount,
    landlordPayableComputed: total.landlordPayableComputed + report.metrics.landlordPayableComputed,
    landlordPayableLedger: total.landlordPayableLedger + report.metrics.landlordPayableLedger,
    mismatches: total.mismatches + report.mismatches.length,
  }), { rentRollFromRooms: 0, collectionsAmount: 0, expensesAmount: 0, landlordPayableComputed: 0, landlordPayableLedger: 0, mismatches: 0 });
}

function checkMismatch(mismatches, id, expected, actual, source) {
  const diff = Math.round(expected - actual);
  if (Math.abs(diff) > 1) mismatches.push({ id, expected: Math.round(expected), actual: Math.round(actual), diff, source });
}

function collectionAmount(row) {
  return amount(row.amount_paid ?? row.amount);
}

function activeStatus(value) {
  const status = normalizeStatus(value || "active");
  return status || "active";
}

function isInactive(value) {
  return INACTIVE_STATUSES.has(activeStatus(value));
}

function isActiveFinancial(row) {
  return !INACTIVE_FINANCIAL_STATUSES.has(activeStatus(row.status));
}

function isApprovedExpense(row) {
  const status = activeStatus(row.status);
  if (INACTIVE_FINANCIAL_STATUSES.has(status)) return false;
  return Boolean(row.approved_at) || APPROVED_EXPENSE_STATUSES.has(status);
}

function isActiveAdvance(row) {
  const status = activeStatus(row.status);
  const lifecycle = activeStatus(row.lifecycle_status);
  if (["pending", "rejected", "cancelled", "canceled", "archived", "voided"].includes(status)) return false;
  if (["cleared", "cancelled", "canceled", "archived"].includes(lifecycle)) return false;
  return ["approved", "active", "partially_deducted"].includes(status) || ["active", "paused"].includes(lifecycle);
}

function isOccupiedRoom(room) {
  return normalizeStatus(room.status).includes("occupied");
}

function isVacantRoom(room) {
  const status = normalizeStatus(room.status);
  return status.includes("vacant") || status.includes("empty");
}

function resolvedOfficeId(room, rows) {
  return room.office_id || null;
}

function resolvedTenantOfficeId(tenant, rooms) {
  if (tenant.office_id) return tenant.office_id;
  return rooms.find((room) => room.id === tenant.room_id)?.office_id || null;
}

function advanceTotal(row) {
  return amount(row.total_repayable ?? row.advance_amount ?? row.principal_amount ?? row.amount);
}

function advanceRemaining(row) {
  const explicit = amount(row.remaining_total_balance ?? row.remaining_balance ?? row.balance_remaining);
  if (explicit > 0) return explicit;
  return Math.max(0, advanceTotal(row) - amount(row.deducted_amount ?? row.amount_repaid ?? row.recovered_amount));
}

function inRange(value) {
  const date = String(value || "").slice(0, 10);
  return Boolean(date && date >= period.startDate && date <= period.endDate);
}

function amount(value) {
  return finiteNumber(value, 0);
}

function finiteNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sum(rows, getter) {
  return rows.reduce((total, row) => total + amount(getter(row)), 0);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolvePeriod() {
  const now = new Date();
  const year = new Intl.DateTimeFormat("en", { timeZone: "Africa/Kampala", year: "numeric" }).format(now);
  const month = new Intl.DateTimeFormat("en", { timeZone: "Africa/Kampala", month: "2-digit" }).format(now);
  const day = new Intl.DateTimeFormat("en", { timeZone: "Africa/Kampala", day: "2-digit" }).format(now);
  const startDate = process.argv.find((arg) => arg.startsWith("--start="))?.slice("--start=".length) || `${year}-${month}-01`;
  const endDate = process.argv.find((arg) => arg.startsWith("--end="))?.slice("--end=".length) || `${year}-${month}-${day}`;
  return { startDate, endDate };
}

function loadDotEnv(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
