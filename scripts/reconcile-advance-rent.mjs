import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const INACTIVE_PAYMENT_STATUSES = new Set([
  "voided",
  "removed",
  "removed_by_admin_approval",
  "rejected",
  "pending",
  "cancelled",
  "canceled",
]);

function numberValue(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(month, count) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function dueDateForMonth(month, dueDay = 1) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), lastDay);
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isActivePayment(row) {
  return !INACTIVE_PAYMENT_STATUSES.has(String(row.status ?? "").toLowerCase());
}

function buildPaymentAllocations({ amount, balanceBefore, monthlyRent, paymentDate }) {
  const allocations = [];
  let remaining = Math.max(0, amount);
  const paymentMonth = monthStart(paymentDate);
  if (!paymentMonth || remaining <= 0) return allocations;

  const currentMonthDue = Math.max(0, monthlyRent);
  const totalDueBeforePayment = Math.max(0, balanceBefore);
  const currentOutstandingDue = Math.min(currentMonthDue || totalDueBeforePayment, totalDueBeforePayment);
  const arrearsDue = Math.max(0, totalDueBeforePayment - currentOutstandingDue);

  if (arrearsDue > 0 && remaining > 0) {
    const arrearsMonthCount = currentMonthDue > 0 ? Math.max(1, Math.ceil(arrearsDue / currentMonthDue)) : 1;
    let arrearsRemaining = arrearsDue;
    for (let index = arrearsMonthCount; index >= 1 && remaining > 0; index -= 1) {
      const monthDue = currentMonthDue > 0 ? Math.min(currentMonthDue, arrearsRemaining) : arrearsRemaining;
      const paid = Math.min(remaining, monthDue);
      if (paid > 0.004) {
        allocations.push({ month: addMonths(paymentMonth, -index), type: "arrears", amount: paid });
        remaining -= paid;
      }
      arrearsRemaining -= monthDue;
    }
  }

  const currentPaid = Math.min(remaining, currentOutstandingDue);
  if (currentPaid > 0.004) {
    allocations.push({ month: paymentMonth, type: "current_month", amount: currentPaid });
    remaining -= currentPaid;
  }

  let advanceMonthIndex = 1;
  while (remaining > 0.004 && advanceMonthIndex <= 120) {
    const paid = currentMonthDue > 0 ? Math.min(remaining, currentMonthDue) : remaining;
    allocations.push({ month: addMonths(paymentMonth, advanceMonthIndex), type: "advance_month", amount: paid });
    remaining -= paid;
    advanceMonthIndex += 1;
  }

  return allocations;
}

async function fetchAll(table, columns, queryBuilder) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns);
    if (queryBuilder) query = queryBuilder(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchAllIn(table, columns, column, ids, queryBuilder) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows = [];
  const chunkSize = 150;
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);
    rows.push(...await fetchAll(table, columns, (query) => {
      let nextQuery = query.in(column, chunk);
      if (queryBuilder) nextQuery = queryBuilder(nextQuery);
      return nextQuery;
    }));
  }
  return rows;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    map.set(value, [...(map.get(value) ?? []), row]);
  }
  return map;
}

function allocationTotal(rows, month, mode) {
  return rows
    .filter((row) => String(row.allocation_month).slice(0, 10) === month)
    .filter((row) => {
      if (mode === "future") return String(row.allocation_type) === "advance_month";
      return true;
    })
    .reduce((total, row) => total + numberValue(row.amount_allocated), 0);
}

async function insertAllocation(row, mutableRows) {
  if (numberValue(row.amount_allocated) <= 0.004) return null;
  const { data, error } = await supabase.from("tenant_rent_allocations").insert(row).select("*").single();
  if (error) throw error;
  mutableRows.push(data);
  return data;
}

async function upsertRentMonth({ tenant, room, lease, month, monthlyRent, paidForMonth, existing }) {
  const paid = Math.min(monthlyRent, Math.max(0, paidForMonth));
  const outstanding = Math.max(0, monthlyRent - paid);
  const payload = {
    amount_paid: paid,
    outstanding_amount: outstanding,
    rent_amount: monthlyRent,
    status: outstanding <= 0.004 ? "paid" : paid > 0 ? "partial" : "unpaid",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("tenant_rent_months").update(payload).eq("id", existing.id);
    if (error) throw error;
    Object.assign(existing, payload);
    return existing;
  }

  const dueDay = 1;
  const { data, error } = await supabase.from("tenant_rent_months").insert({
    company_id: tenant.company_id,
    office_id: tenant.office_id ?? room.office_id,
    landlord_id: room.landlord_id ?? null,
    room_id: room.id,
    tenant_id: tenant.id,
    lease_id: lease?.id ?? null,
    rent_month: month,
    due_day: dueDay,
    due_date: dueDateForMonth(month, dueDay),
    rent_amount: monthlyRent,
    amount_paid: paid,
    outstanding_amount: outstanding,
    status: payload.status,
    source: "advance_reconciliation",
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function reduceOrDeleteAdvance(row, nextAmount) {
  if (nextAmount <= 0.004) {
    const { error } = await supabase.from("tenant_rent_allocations").delete().eq("id", row.id);
    if (error) throw error;
    return null;
  }
  const { data, error } = await supabase
    .from("tenant_rent_allocations")
    .update({ amount_allocated: nextAmount, allocation_source: "advance_reconciliation_adjusted" })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const currentMonth = monthStart(new Date().toISOString());
  const activeCollections = (await fetchAll(
    "collections",
    "id,company_id,office_id,room_id,tenant_id,amount,amount_paid,expected_amount,balance_before_payment,balance_after_payment,used_to_clear_outstanding,allocated_to_next_month,payment_date,status,created_at",
  )).filter(isActivePayment);

  const overpaymentCollections = activeCollections.filter((collection) => {
    const paid = numberValue(collection.amount_paid ?? collection.amount);
    const dueBefore = numberValue(collection.balance_before_payment ?? collection.expected_amount);
    return paid > dueBefore + 0.004 && collection.tenant_id;
  });

  const candidateTenantIds = new Set(overpaymentCollections.map((collection) => collection.tenant_id));
  const [tenantsWithOutstanding, futureAdvanceAllocations, underCoveredRentMonths, zeroBalanceTenants, currentMonthAllocations] = await Promise.all([
    fetchAll(
      "tenants",
      "id,balance,status",
      (query) => query.eq("status", "active").gt("balance", 0),
    ),
    fetchAll(
      "tenant_rent_allocations",
      "tenant_id,allocation_month,allocation_type,amount_allocated",
      (query) => query.eq("allocation_type", "advance_month").gt("allocation_month", currentMonth),
    ),
    fetchAll(
      "tenant_rent_months",
      "tenant_id,rent_month,rent_amount,amount_paid,outstanding_amount,status",
      (query) => query.lte("rent_month", currentMonth).gt("outstanding_amount", 0),
    ),
    fetchAll(
      "tenants",
      "id,balance,status",
      (query) => query.eq("status", "active").eq("balance", 0),
    ),
    fetchAll(
      "tenant_rent_allocations",
      "tenant_id,allocation_month,allocation_type,amount_allocated",
      (query) => query.lte("allocation_month", currentMonth),
    ),
  ]);
  const tenantsWithFutureAdvance = new Set(
    futureAdvanceAllocations
      .filter((allocation) => numberValue(allocation.amount_allocated) > 0.004)
      .map((allocation) => allocation.tenant_id)
      .filter(Boolean),
  );
  for (const tenant of tenantsWithOutstanding) {
    if (tenantsWithFutureAdvance.has(tenant.id)) candidateTenantIds.add(tenant.id);
  }
  const zeroBalanceTenantIds = new Set(zeroBalanceTenants.map((tenant) => tenant.id).filter(Boolean));
  const tenantsWithCurrentCoverage = new Set(
    currentMonthAllocations
      .filter((allocation) => numberValue(allocation.amount_allocated) > 0.004)
      .map((allocation) => allocation.tenant_id)
      .filter(Boolean),
  );
  for (const row of underCoveredRentMonths) {
    if (zeroBalanceTenantIds.has(row.tenant_id) && tenantsWithCurrentCoverage.has(row.tenant_id)) {
      candidateTenantIds.add(row.tenant_id);
    }
  }

  const namedRooms = ["A2013", "A351", "CS10", "E418", "K29A", "R435", "T208"];
  const namedRoomRows = await fetchAll(
    "rooms",
    "id,room_number",
    (query) => query.in("room_number", namedRooms),
  );
  const namedRoomIds = namedRoomRows.map((room) => room.id);
  if (namedRoomIds.length) {
    const namedLeases = await fetchAll(
      "leases",
      "tenant_id,room_id,status",
      (query) => query.in("room_id", namedRoomIds).eq("status", "active"),
    );
    for (const lease of namedLeases) if (lease.tenant_id) candidateTenantIds.add(lease.tenant_id);
  }

  const tenantIds = [...candidateTenantIds].filter(Boolean);
  if (!tenantIds.length) {
    console.log(JSON.stringify({ ok: true, repaired_count: 0, message: "No advance-rent candidates found." }, null, 2));
    return;
  }

  const [tenants, allocations, rentMonths] = await Promise.all([
    fetchAllIn("tenants", "id,company_id,office_id,room_id,full_name,monthly_rent,balance,status", "id", tenantIds),
    fetchAllIn("tenant_rent_allocations", "id,company_id,office_id,tenant_id,room_id,payment_id,allocation_month,allocation_type,amount_allocated,allocation_source,is_historical_credit,created_at", "tenant_id", tenantIds),
    fetchAllIn("tenant_rent_months", "id,company_id,office_id,landlord_id,room_id,tenant_id,lease_id,rent_month,rent_amount,amount_paid,outstanding_amount,status,source", "tenant_id", tenantIds),
  ]);

  const roomIds = [...new Set(tenants.map((tenant) => tenant.room_id).filter(Boolean))];
  const [rooms, leases] = await Promise.all([
    roomIds.length ? fetchAllIn("rooms", "id,company_id,office_id,landlord_id,room_number,monthly_rent,outstanding_balance,status", "id", roomIds) : [],
    tenantIds.length ? fetchAllIn("leases", "id,company_id,office_id,room_id,tenant_id,monthly_rent,status", "tenant_id", tenantIds, (query) => query.eq("status", "active")) : [],
  ]);

  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const leaseByTenant = new Map(leases.map((lease) => [lease.tenant_id, lease]));
  const collectionsByTenant = groupBy(activeCollections.filter((collection) => candidateTenantIds.has(collection.tenant_id)), "tenant_id");
  const allocationsByTenant = groupBy(allocations, "tenant_id");
  const rentMonthsByTenant = groupBy(rentMonths, "tenant_id");

  const repaired = [];
  const skipped = [];

  for (const tenantId of tenantIds) {
    const tenant = tenantsById.get(tenantId);
    const room = tenant?.room_id ? roomsById.get(tenant.room_id) : null;
    const lease = tenant ? leaseByTenant.get(tenant.id) : null;
    if (!tenant || !room) {
      skipped.push({ tenant_id: tenantId, reason: "missing_active_room" });
      continue;
    }

    const monthlyRent = numberValue(lease?.monthly_rent ?? tenant.monthly_rent ?? room.monthly_rent);
    if (monthlyRent <= 0) {
      skipped.push({ tenant_id: tenant.id, room: room.room_number, reason: "missing_monthly_rent" });
      continue;
    }

    const tenantAllocations = [...(allocationsByTenant.get(tenant.id) ?? [])];
    const tenantRentMonths = [...(rentMonthsByTenant.get(tenant.id) ?? [])];
    const tenantCollections = (collectionsByTenant.get(tenant.id) ?? [])
      .sort((left, right) => String(left.payment_date ?? left.created_at).localeCompare(String(right.payment_date ?? right.created_at)));

    const before = {
      room_number: room.room_number,
      tenant_balance: numberValue(tenant.balance),
      room_balance: numberValue(room.outstanding_balance),
      future_advance: tenantAllocations
        .filter((allocation) => String(allocation.allocation_type) === "advance_month" && String(allocation.allocation_month).slice(0, 10) > currentMonth)
        .reduce((total, allocation) => total + numberValue(allocation.amount_allocated), 0),
    };
    let insertedAllocations = 0;
    let consumedAdvance = 0;

    for (const collection of tenantCollections) {
      const paymentDate = collection.payment_date ?? collection.created_at;
      const paymentMonth = monthStart(paymentDate);
      const paid = numberValue(collection.amount_paid ?? collection.amount);
      const dueBefore = Math.max(0, numberValue(collection.balance_before_payment ?? collection.expected_amount));
      if (!paymentMonth || paid <= 0) continue;

      const desiredByMonth = new Map();
      if (dueBefore > 0.004 && dueBefore < monthlyRent) {
        desiredByMonth.set(paymentMonth, (desiredByMonth.get(paymentMonth) ?? 0) + (monthlyRent - dueBefore));
      }
      for (const allocation of buildPaymentAllocations({ amount: paid, balanceBefore: dueBefore, monthlyRent, paymentDate })) {
        desiredByMonth.set(allocation.month, (desiredByMonth.get(allocation.month) ?? 0) + allocation.amount);
      }

      for (const [month, target] of desiredByMonth) {
        const isFuture = month > currentMonth;
        const existing = allocationTotal(tenantAllocations, month, isFuture ? "future" : "coverage");
        const missing = Math.max(0, target - existing);
        if (missing <= 0.004) continue;

        await insertAllocation({
          allocation_month: month,
          allocation_source: "advance_reconciliation",
          allocation_type: isFuture ? "advance_month" : month === paymentMonth || month === currentMonth ? "current_month" : "arrears",
          amount_allocated: missing,
          company_id: tenant.company_id,
          is_historical_credit: false,
          office_id: tenant.office_id ?? room.office_id,
          payment_id: collection.id,
          room_id: room.id,
          tenant_id: tenant.id,
        }, tenantAllocations);
        insertedAllocations += 1;
      }

      const nextMonth = addMonths(paymentMonth, 1);
      const desiredNextMonth = desiredByMonth.get(nextMonth) ?? 0;
      const balanceAfterPayment = Math.max(0, dueBefore - paid);
      const usedToClearOutstanding = Math.min(paid, dueBefore);
      const collectionSnapshotPatch = {};
      if (Math.abs(numberValue(collection.allocated_to_next_month) - desiredNextMonth) > 0.004) {
        collectionSnapshotPatch.allocated_to_next_month = desiredNextMonth;
      }
      if (Math.abs(numberValue(collection.balance_after_payment) - balanceAfterPayment) > 0.004) {
        collectionSnapshotPatch.balance_after_payment = balanceAfterPayment;
      }
      if (Math.abs(numberValue(collection.used_to_clear_outstanding) - usedToClearOutstanding) > 0.004) {
        collectionSnapshotPatch.used_to_clear_outstanding = usedToClearOutstanding;
      }
      if (Object.keys(collectionSnapshotPatch).length) {
        const { error } = await supabase.from("collections").update(collectionSnapshotPatch).eq("id", collection.id);
        if (error) throw error;
        Object.assign(collection, collectionSnapshotPatch);
      }
    }

    const monthsToReconcile = new Set([
      currentMonth,
      ...tenantRentMonths.map((row) => String(row.rent_month).slice(0, 10)),
      ...tenantAllocations.map((row) => String(row.allocation_month).slice(0, 10)).filter((month) => month <= currentMonth),
    ]);

    const rentMonthByMonth = new Map(tenantRentMonths.map((row) => [String(row.rent_month).slice(0, 10), row]));
    for (const month of [...monthsToReconcile].sort()) {
      const paidForMonth = allocationTotal(tenantAllocations, month, "coverage");
      const existing = rentMonthByMonth.get(month);
      if (!existing && month < currentMonth && paidForMonth < monthlyRent - 0.004) continue;
      if (!existing && paidForMonth <= 0.004 && month !== currentMonth) continue;
      const updated = await upsertRentMonth({ tenant, room, lease, month, monthlyRent, paidForMonth, existing });
      rentMonthByMonth.set(month, updated);
    }

    for (const [month, existing] of [...rentMonthByMonth.entries()]) {
      const paidForMonth = allocationTotal(tenantAllocations, month, "coverage");
      const source = String(existing.source ?? "");
      const isSyntheticUnderCoveredPastMonth = month < currentMonth
        && source === "advance_reconciliation"
        && paidForMonth < monthlyRent - 0.004
        && numberValue(existing.outstanding_amount) > 0.004;
      if (!isSyntheticUnderCoveredPastMonth) continue;
      const { error } = await supabase.from("tenant_rent_months").delete().eq("id", existing.id);
      if (error) throw error;
      rentMonthByMonth.delete(month);
    }

    let outstanding = [...rentMonthByMonth.values()]
      .filter((row) => String(row.rent_month).slice(0, 10) <= currentMonth)
      .reduce((total, row) => total + numberValue(row.outstanding_amount), 0);

    if (outstanding > 0.004) {
      const owedMonths = [...rentMonthByMonth.values()]
        .filter((row) => String(row.rent_month).slice(0, 10) <= currentMonth && numberValue(row.outstanding_amount) > 0.004)
        .sort((left, right) => String(left.rent_month).localeCompare(String(right.rent_month)));
      const futureAdvanceRows = tenantAllocations
        .filter((row) => String(row.allocation_type) === "advance_month" && String(row.allocation_month).slice(0, 10) > currentMonth && numberValue(row.amount_allocated) > 0.004)
        .sort((left, right) => String(left.allocation_month).localeCompare(String(right.allocation_month)));

      for (const advance of futureAdvanceRows) {
        let remainingAdvance = numberValue(advance.amount_allocated);
        for (const owedMonth of owedMonths) {
          if (remainingAdvance <= 0.004) break;
          const owedOutstanding = numberValue(owedMonth.outstanding_amount);
          if (owedOutstanding <= 0.004) continue;

          const portion = Math.min(remainingAdvance, owedOutstanding);
          const month = String(owedMonth.rent_month).slice(0, 10);
          await insertAllocation({
            allocation_month: month,
            allocation_source: "advance_reallocated_to_outstanding",
            allocation_type: month === currentMonth ? "current_month" : "arrears",
            amount_allocated: portion,
            company_id: tenant.company_id,
            is_historical_credit: false,
            office_id: tenant.office_id ?? room.office_id,
            payment_id: advance.payment_id ?? null,
            room_id: room.id,
            tenant_id: tenant.id,
          }, tenantAllocations);

          owedMonth.amount_paid = numberValue(owedMonth.amount_paid) + portion;
          owedMonth.outstanding_amount = Math.max(0, owedOutstanding - portion);
          owedMonth.status = numberValue(owedMonth.outstanding_amount) <= 0.004 ? "paid" : "partial";
          remainingAdvance -= portion;
          outstanding = Math.max(0, outstanding - portion);
          consumedAdvance += portion;
        }

        const updatedAdvance = await reduceOrDeleteAdvance(advance, remainingAdvance);
        const index = tenantAllocations.findIndex((row) => row.id === advance.id);
        if (updatedAdvance && index >= 0) tenantAllocations[index] = updatedAdvance;
        if (!updatedAdvance && index >= 0) tenantAllocations.splice(index, 1);
      }

      for (const owedMonth of owedMonths) {
        await upsertRentMonth({
          tenant,
          room,
          lease,
          month: String(owedMonth.rent_month).slice(0, 10),
          monthlyRent,
          paidForMonth: allocationTotal(tenantAllocations, String(owedMonth.rent_month).slice(0, 10), "coverage"),
          existing: owedMonth,
        });
      }
    }

    const finalRentMonths = [...rentMonthByMonth.values()];
    const finalOutstanding = finalRentMonths
      .filter((row) => String(row.rent_month).slice(0, 10) <= currentMonth)
      .reduce((total, row) => total + numberValue(row.outstanding_amount), 0);
    const finalFutureAdvance = tenantAllocations
      .filter((row) => String(row.allocation_type) === "advance_month" && String(row.allocation_month).slice(0, 10) > currentMonth)
      .reduce((total, row) => total + numberValue(row.amount_allocated), 0);

    if (Math.abs(numberValue(tenant.balance) - finalOutstanding) > 0.004) {
      const { error } = await supabase.from("tenants").update({ balance: finalOutstanding, updated_at: new Date().toISOString() }).eq("id", tenant.id);
      if (error) throw error;
    }
    if (Math.abs(numberValue(room.outstanding_balance) - finalOutstanding) > 0.004) {
      const { error } = await supabase.from("rooms").update({ outstanding_balance: finalOutstanding, updated_at: new Date().toISOString() }).eq("id", room.id);
      if (error) throw error;
    }

    const changed = insertedAllocations > 0
      || consumedAdvance > 0.004
      || Math.abs(before.tenant_balance - finalOutstanding) > 0.004
      || Math.abs(before.room_balance - finalOutstanding) > 0.004;

    if (changed) {
      const after = {
        advance_after: finalFutureAdvance,
        consumed_advance: consumedAdvance,
        inserted_allocations: insertedAllocations,
        outstanding_after: finalOutstanding,
        room_number: room.room_number,
      };
      const { error } = await supabase.from("audit_logs").insert({
        action: "advance_rent_reconciled",
        after_data: after,
        before_data: before,
        company_id: tenant.company_id,
        entity_id: tenant.id,
        entity_type: "tenant",
        office_id: tenant.office_id ?? room.office_id,
      });
      if (error) throw error;
      repaired.push({ room_number: room.room_number, tenant_id: tenant.id, ...after });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    candidate_tenants: tenantIds.length,
    overpayment_collections: overpaymentCollections.length,
    repaired_count: repaired.length,
    repaired,
    skipped_count: skipped.length,
    skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
