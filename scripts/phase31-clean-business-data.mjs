import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const TABLES_IN_DELETE_ORDER = [
  "message_delivery_events",
  "notifications",
  "automation_tasks",
  "automation_runs",
  "automation_rules",
  "ai_insights",

  "office_rankings",
  "office_scores",
  "company_scorecards",
  "executive_kpi_snapshots",
  "report_access_logs",
  "reports",

  "attendance_corrections",
  "attendance_daily_summaries",
  "absence_records",
  "attendance_events",
  "office_daily_reports",

  "daily_cash_positions",
  "company_cash_positions",
  "cash_position",
  "cash_reconciliation_lines",
  "cash_reconciliations",
  "cash_transfers",
  "cash_account_balances",
  "cash_transactions",

  "petty_cash_disbursements",
  "petty_cash_requests",
  "expense_receipts",
  "expense_lines",
  "expenses",

  "tenant_ledger_entries",
  "receipts",
  "payment_allocations",
  "payments",
  "invoice_lines",
  "rent_invoices",
  "promise_followups",
  "promises",
  "collection_actions",
  "collections",
  "arrears_snapshots",

  "landlord_payout_allocations",
  "landlord_payouts",
  "landlord_statements",
  "landlord_settlement_lines",
  "landlord_settlements",
  "landlord_settlement_periods",
  "landlord_payments",
  "property_landlords",

  "eviction_steps",
  "eviction_cases",
  "move_out_records",
  "move_in_records",
  "lease_documents",
  "lease_charges",
  "leases",
  "tenant_documents",
  "tenant_contacts",
  "attachments",
  "room_status_history",
  "tenants",
  "rooms",
  "properties",
  "landlords",

  "historical_import_record_links",
  "historical_import_errors",
  "historical_import_field_mappings",
  "historical_import_rows",
  "historical_import_sheets",
  "historical_import_batches",
];

const BUSINESS_AUDIT_ENTITY_TYPES = [
  "property",
  "properties",
  "room",
  "rooms",
  "tenant",
  "tenants",
  "landlord",
  "landlords",
  "collection",
  "collections",
  "collection_action",
  "promise",
  "promise_followup",
  "expense",
  "expenses",
  "landlord_payment",
  "landlord_settlement",
  "lease",
  "rent_invoice",
  "invoice_line",
  "tenant_ledger_entries",
  "historical_import",
  "office_daily_report",
  "attendance_event",
  "payment",
  "receipt",
];

const AUDIT_ACTION_PATTERNS = [
  "historical",
  "import",
  "collection",
  "promise",
  "expense",
  "landlord",
  "tenant",
  "room",
  "property",
  "attendance",
  "daily_report",
  "payment",
];

function loadEnvLocal() {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
  }
}

function supabase() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function tableCount(client, table, apply = (query) => query) {
  const { count, error } = await apply(client.from(table).select("*", { count: "exact", head: true }));
  if (error) return { table, count: null, error: error.message };
  return { table, count: count ?? 0 };
}

async function deleteByIdPresence(client, table, apply = (query) => query) {
  const before = await tableCount(client, table, apply);
  if (before.error) return { table, deleted: 0, error: before.error };
  if (!before.count) return { table, deleted: 0 };

  const { error } = await apply(client.from(table).delete().not("id", "is", null));
  if (error) return { table, deleted: 0, error: error.message };

  const after = await tableCount(client, table, apply);
  if (after.error) return { table, deleted: before.count, verifyError: after.error };
  return { table, deleted: Math.max(0, before.count - after.count), remaining: after.count };
}

async function deleteAuditLogs(client) {
  const byEntity = await deleteByIdPresence(client, "audit_logs", (query) => query.in("entity_type", BUSINESS_AUDIT_ENTITY_TYPES));
  const filters = AUDIT_ACTION_PATTERNS.map((pattern) => `action.ilike.%${pattern}%`).join(",");
  const byAction = await deleteByIdPresence(client, "audit_logs", (query) => query.or(filters));
  return { byEntity, byAction };
}

async function main() {
  const client = supabase();
  const before = [];
  for (const table of TABLES_IN_DELETE_ORDER) {
    before.push(await tableCount(client, table));
  }
  const auditBefore = {
    byEntity: await tableCount(client, "audit_logs", (query) => query.in("entity_type", BUSINESS_AUDIT_ENTITY_TYPES)),
    byAction: await tableCount(client, "audit_logs", (query) => query.or(AUDIT_ACTION_PATTERNS.map((pattern) => `action.ilike.%${pattern}%`).join(","))),
    total: await tableCount(client, "audit_logs"),
  };

  const deletions = [];
  for (const table of TABLES_IN_DELETE_ORDER) {
    const result = await deleteByIdPresence(client, table);
    deletions.push(result);
    if (result.error) throw new Error(`${table}: ${result.error}`);
  }

  const auditDelete = await deleteAuditLogs(client);
  if (auditDelete.byEntity.error) throw new Error(`audit_logs by entity: ${auditDelete.byEntity.error}`);
  if (auditDelete.byAction.error) throw new Error(`audit_logs by action: ${auditDelete.byAction.error}`);

  const after = [];
  for (const table of TABLES_IN_DELETE_ORDER) {
    after.push(await tableCount(client, table));
  }
  const preserved = [];
  for (const table of ["companies", "offices", "users", "roles", "permissions", "role_permissions", "user_office_roles", "pin_credentials", "security_events", "cash_accounts", "employees"]) {
    preserved.push(await tableCount(client, table));
  }
  const auditAfter = {
    byEntity: await tableCount(client, "audit_logs", (query) => query.in("entity_type", BUSINESS_AUDIT_ENTITY_TYPES)),
    byAction: await tableCount(client, "audit_logs", (query) => query.or(AUDIT_ACTION_PATTERNS.map((pattern) => `action.ilike.%${pattern}%`).join(","))),
    total: await tableCount(client, "audit_logs"),
  };

  console.log(JSON.stringify({ before, auditBefore, deletions, auditDelete, after, auditAfter, preserved }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
