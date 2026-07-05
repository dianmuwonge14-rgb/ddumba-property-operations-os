import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const PAGE_SIZE = 1000;

loadDotEnv(".env.local");
loadDotEnv(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const startedAt = Date.now();
const warnings = [];
const failures = [];

const tableSpecs = {
  companies: "id,name,status",
  offices: "id,company_id,office_name,name,status",
  users: "id,company_id,default_office_id,status",
  employees: "id,company_id,office_id,user_id,status",
  rooms: "id,company_id,office_id,property_id,landlord_id,room_number,status",
  properties: "id,company_id,office_id,landlord_id,property_name,status",
  tenants: "id,company_id,office_id,room_id,property_id,full_name,status",
  leases: "id,company_id,office_id,property_id,room_id,tenant_id,status",
  collections: "id,company_id,office_id,room_id,tenant_id,status,payment_date,created_at,amount,amount_paid",
  payment_correction_requests: "id,company_id,office_id,payment_id,tenant_id,room_id,status,correction_type",
  payment_date_change_requests: "id,company_id,office_id,payment_id,tenant_id,room_id,status",
  tenant_rent_months: "id,company_id,office_id,tenant_id,room_id,rent_month,status",
  tenant_rent_allocations: "id,company_id,office_id,tenant_id,room_id,payment_id,allocation_month,allocation_type",
  tenant_balance_adjustments: "id,company_id,office_id,tenant_id,room_id,status",
  promises: "id,company_id,office_id,tenant_id,room_id,status",
  expenses: "id,company_id,office_id,expense_date",
  landlord_payments: "id,company_id,office_id,landlord_id,status",
  landlord_monthly_payables: "id,company_id,office_id,landlord_id,settlement_month,status",
  landlord_advances: "id,company_id,office_id,landlord_id,status,lifecycle_status",
  landlord_advance_repayment_schedule: "id,company_id,office_id,landlord_id,advance_id,status",
  landlord_advance_deductions: "id,company_id,office_id,landlord_id,advance_id,status",
  landlord_bulk_room_requests: "id,company_id,office_id,status",
  tenant_relocation_requests: "id,company_id,office_id,tenant_id,old_room_id,new_room_id,status",
  office_cash_balances: "id,company_id,office_id",
  office_cash_movements: "id,company_id,office_id,source_id,movement_type",
  cash_accounts: "id,company_id,office_id,account_type,status",
  cash_transactions: "id,company_id,office_id,cash_account_id,source_id,source_type,transaction_type",
  bank_deposits: "id,company_id,office_id",
  admin_cash_movements: "id,company_id,office_id",
  office_daily_attendance: "id,company_id,office_id,user_id,attendance_date",
  employee_advances: "id,company_id,office_id,employee_id,status",
  employee_advance_requests: "id,company_id,office_id,employee_id,status",
  employee_lunch_ledger: "id,company_id,office_id,employee_id",
  employee_allowance_settings: "id,company_id,office_id,employee_id",
  employee_expenses: "id,company_id,office_id,employee_id,status",
  employee_payroll_months: "id,company_id,office_id,employee_id,month_key",
  employee_salary_payments: "id,company_id,office_id,employee_id,month_key",
  employee_fines: "id,company_id,office_id,employee_id,month_key,status",
  monthly_rollover_runs: "id,company_id,office_id,rent_month,status",
  audit_logs: "id,company_id,office_id,entity_type,entity_id,action",
  notifications: "id,company_id,office_id,entity_type,entity_id",
};

const rows = {};
for (const [table, columns] of Object.entries(tableSpecs)) {
  rows[table] = await fetchOptional(table, columns);
}

const maps = Object.fromEntries(
  Object.entries(rows).map(([table, tableRows]) => [table, new Map(tableRows.map((row) => [row.id, row]))]),
);

checkCompanyOfficeScope();
checkOrphans();
checkDuplicates();
checkWorkflowHealth();

const result = {
  generatedAt: new Date().toISOString(),
  runtimeMs: Date.now() - startedAt,
  tables: Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length])),
  warnings,
  summary: {
    tablesChecked: Object.keys(rows).length,
    warnings: warnings.length,
    failures: failures.length,
    status: failures.length ? "fail" : "pass",
  },
  failures,
};

const outputDir = path.join(process.cwd(), "outputs");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `final-production-integrity-audit-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log(JSON.stringify({
  generatedAt: result.generatedAt,
  runtimeMs: result.runtimeMs,
  summary: result.summary,
  outputPath,
  firstFailures: failures.slice(0, 80),
  warnings: warnings.slice(0, 80),
}, null, 2));

function checkCompanyOfficeScope() {
  const companyIds = new Set(rows.companies.map((company) => company.id));
  const officeIds = new Set(rows.offices.map((office) => office.id));

  for (const [table, tableRows] of Object.entries(rows)) {
    for (const row of tableRows) {
      if (row.company_id && !companyIds.has(row.company_id)) {
        fail("orphan_company", table, row.id, `company_id ${row.company_id} does not exist`);
      }
      if (row.office_id && !officeIds.has(row.office_id)) {
        fail("orphan_office", table, row.id, `office_id ${row.office_id} does not exist`);
      }
    }
  }
}

function checkOrphans() {
  const checks = [
    ["users", "default_office_id", "offices"],
    ["employees", "office_id", "offices"],
    ["employees", "user_id", "users"],
    ["properties", "landlord_id", "landlords"],
    ["properties", "office_id", "offices"],
    ["rooms", "office_id", "offices"],
    ["rooms", "property_id", "properties"],
    ["rooms", "landlord_id", "landlords"],
    ["tenants", "office_id", "offices"],
    ["tenants", "room_id", "rooms"],
    ["tenants", "property_id", "properties"],
    ["leases", "office_id", "offices"],
    ["leases", "property_id", "properties"],
    ["leases", "room_id", "rooms"],
    ["leases", "tenant_id", "tenants"],
    ["collections", "office_id", "offices"],
    ["collections", "room_id", "rooms"],
    ["collections", "tenant_id", "tenants"],
    ["payment_correction_requests", "payment_id", "collections"],
    ["payment_correction_requests", "tenant_id", "tenants"],
    ["payment_correction_requests", "room_id", "rooms"],
    ["payment_date_change_requests", "payment_id", "collections"],
    ["payment_date_change_requests", "tenant_id", "tenants"],
    ["payment_date_change_requests", "room_id", "rooms"],
    ["tenant_rent_months", "tenant_id", "tenants"],
    ["tenant_rent_months", "room_id", "rooms"],
    ["tenant_rent_allocations", "tenant_id", "tenants"],
    ["tenant_rent_allocations", "room_id", "rooms"],
    ["tenant_rent_allocations", "payment_id", "collections"],
    ["tenant_balance_adjustments", "tenant_id", "tenants"],
    ["tenant_balance_adjustments", "room_id", "rooms"],
    ["promises", "tenant_id", "tenants"],
    ["promises", "room_id", "rooms"],
    ["expenses", "office_id", "offices"],
    ["landlord_payments", "landlord_id", "landlords"],
    ["landlord_monthly_payables", "landlord_id", "landlords"],
    ["landlord_advances", "landlord_id", "landlords"],
    ["landlord_advance_repayment_schedule", "advance_id", "landlord_advances"],
    ["landlord_advance_repayment_schedule", "landlord_id", "landlords"],
    ["landlord_advance_deductions", "advance_id", "landlord_advances"],
    ["landlord_advance_deductions", "landlord_id", "landlords"],
    ["tenant_relocation_requests", "tenant_id", "tenants"],
    ["tenant_relocation_requests", "old_room_id", "rooms"],
    ["tenant_relocation_requests", "new_room_id", "rooms"],
    ["cash_transactions", "cash_account_id", "cash_accounts"],
    ["employee_advances", "employee_id", "employees"],
    ["employee_advance_requests", "employee_id", "employees"],
    ["employee_lunch_ledger", "employee_id", "employees"],
    ["employee_allowance_settings", "employee_id", "employees"],
    ["employee_expenses", "employee_id", "employees"],
    ["employee_payroll_months", "employee_id", "employees"],
    ["employee_salary_payments", "employee_id", "employees"],
    ["employee_fines", "employee_id", "employees"],
    ["office_daily_attendance", "office_id", "offices"],
    ["office_daily_attendance", "user_id", "users"],
  ];

  for (const [childTable, childColumn, parentTable] of checks) {
    if (!rows[childTable] || !rows[parentTable]) continue;
    const parent = maps[parentTable];
    for (const row of rows[childTable]) {
      const value = row[childColumn];
      if (value && !parent.has(value)) {
        fail("orphan_reference", childTable, row.id, `${childColumn} ${value} does not exist in ${parentTable}`);
      }
    }
  }
}

function checkDuplicates() {
  duplicateBy("active_room_number_per_office_property", rows.rooms.filter(activeRow), (row) => [row.company_id, row.office_id, row.property_id || "none", normalize(row.room_number)].join("|"));
  duplicateBy("active_tenant_room", rows.tenants.filter(activeRow).filter((row) => row.room_id), (row) => [row.company_id, row.room_id].join("|"));
  duplicateBy("active_lease_room_tenant", rows.leases.filter(activeRow), (row) => [row.company_id, row.room_id, row.tenant_id].join("|"));
  duplicateBy("tenant_rent_month", rows.tenant_rent_months, (row) => [row.company_id, row.tenant_id, row.room_id, month(row.rent_month)].join("|"));
  duplicateBy("landlord_monthly_payable", rows.landlord_monthly_payables.filter((row) => !inactive(row.status)), (row) => [row.company_id, row.office_id, row.landlord_id, month(row.settlement_month)].join("|"));
  duplicateBy("daily_attendance", rows.office_daily_attendance, (row) => [row.company_id, row.office_id, row.user_id, day(row.attendance_date)].join("|"));
  duplicateBy("active_cash_account", rows.cash_accounts.filter(activeRow), (row) => [row.company_id, row.office_id || "company", row.account_type].join("|"));
}

function checkWorkflowHealth() {
  for (const collection of rows.collections) {
    if (!collection.payment_date && !collection.created_at) {
      fail("payment_missing_business_date", "collections", collection.id, "payment record has no payment_date or created_at fallback");
    }
  }

  for (const request of rows.payment_correction_requests.filter((row) => row.status === "approved")) {
    if (!maps.collections.has(request.payment_id)) {
      fail("approved_payment_correction_missing_payment", "payment_correction_requests", request.id, "approved correction points to missing payment");
    }
  }

  for (const rollover of rows.monthly_rollover_runs.filter((row) => row.status === "completed")) {
    if (!rollover.rent_month) {
      fail("rollover_missing_month", "monthly_rollover_runs", rollover.id, "completed rollover has no rent_month");
    }
  }
}

function duplicateBy(type, tableRows, keyFn) {
  const seen = new Map();
  for (const row of tableRows) {
    const key = keyFn(row);
    if (!key || key.includes("undefined")) continue;
    const current = seen.get(key) || [];
    current.push(row.id);
    seen.set(key, current);
  }
  for (const [key, ids] of seen.entries()) {
    if (ids.length > 1) {
      fail("duplicate_business_key", type, ids.join(","), `${key} appears ${ids.length} times`);
    }
  }
}

async function fetchOptional(table, columns) {
  try {
    return await fetchAll(table, columns);
  } catch (error) {
    warnings.push(`${table}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function fetchAll(table, columns) {
  const fetched = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    fetched.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return fetched;
  }
}

function fail(type, table, id, message) {
  failures.push({ type, table, id, message });
}

function activeRow(row) {
  return !inactive(row.status);
}

function inactive(status) {
  return ["archived", "deleted", "inactive", "voided", "removed", "rejected", "cancelled", "canceled", "terminated"].includes(normalize(status));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function day(value) {
  return String(value ?? "").slice(0, 10);
}

function month(value) {
  return String(value ?? "").slice(0, 7);
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
