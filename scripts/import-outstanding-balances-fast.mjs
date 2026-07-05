import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const FILE = "/Users/daddytheo/Desktop/OUTSTANDING BALANCE.xlsx";

function loadEnvLocal() {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
  }
}

function client() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseBalance(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(normalize(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

async function fetchAll(supabase, table, select, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(supabase.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function chunk(rows, size = 250) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) output.push(rows.slice(index, index + size));
  return output;
}

async function readRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const worksheet = workbook.getWorksheet("Sheet1") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found.");
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const roomNumber = normalize(row.getCell(2).value);
    const balance = parseBalance(row.getCell(3).value);
    if (!roomNumber && row.getCell(3).value === null) continue;
    if (!roomNumber || balance === null) {
      invalid.push({ rowNumber, roomNumber, balanceRaw: row.getCell(3).value });
      continue;
    }
    const roomKey = key(roomNumber);
    if (seen.has(roomKey)) duplicates.push({ rowNumber, roomNumber, balance, firstRow: seen.get(roomKey) });
    else seen.set(roomKey, rowNumber);
    valid.push({ rowNumber, roomNumber, balance, key: roomKey });
  }
  return { valid, invalid, duplicates };
}

async function main() {
  const supabase = client();
  const { valid, invalid, duplicates } = await readRows();
  const duplicateRowNumbers = new Set(duplicates.map((row) => row.rowNumber));
  const writableRows = valid.filter((row) => !duplicateRowNumbers.has(row.rowNumber));
  const [companyResult, rooms, tenants, leases, existingLedgers] = await Promise.all([
    supabase.from("companies").select("id,name").limit(1).single(),
    fetchAll(supabase, "rooms", "id,company_id,office_id,property_id,room_number,outstanding_balance"),
    fetchAll(supabase, "tenants", "id,company_id,office_id,property_id,room_id,balance"),
    fetchAll(supabase, "leases", "id,room_id,status"),
    fetchAll(supabase, "tenant_ledger_entries", "tenant_id,source_type", (query) => query.eq("source_type", "opening_outstanding_balance_import")),
  ]);
  if (companyResult.error) throw new Error(companyResult.error.message);
  const company = companyResult.data;
  const roomMap = new Map();
  for (const room of rooms) {
    const list = roomMap.get(key(room.room_number)) ?? [];
    list.push(room);
    roomMap.set(key(room.room_number), list);
  }
  const tenantByRoom = new Map(tenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id, tenant]));
  const leaseByRoom = new Map(leases.filter((lease) => lease.status === "active").map((lease) => [lease.room_id, lease]));
  const existingLedgerTenantIds = new Set(existingLedgers.map((ledger) => ledger.tenant_id));

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  for (const source of writableRows) {
    const candidates = roomMap.get(source.key) ?? [];
    if (!candidates.length) {
      unmatched.push(source);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ ...source, candidates: candidates.map((room) => room.id) });
      continue;
    }
    const room = candidates[0];
    const tenant = tenantByRoom.get(room.id);
    if (!tenant) {
      unmatched.push({ ...source, reason: "matched_room_has_no_tenant" });
      continue;
    }
    matched.push({ source, room, tenant, lease: leaseByRoom.get(room.id) ?? null });
  }

  for (const batch of chunk(matched.map((item) => ({ id: item.room.id, outstanding_balance: item.source.balance })))) {
    const { error } = await supabase.from("rooms").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`rooms upsert: ${error.message}`);
  }
  for (const batch of chunk(matched.map((item) => ({ id: item.tenant.id, balance: item.source.balance })))) {
    const { error } = await supabase.from("tenants").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`tenants upsert: ${error.message}`);
  }

  const ledgerRows = matched
    .filter((item) => item.source.balance !== 0 && !existingLedgerTenantIds.has(item.tenant.id))
    .map(({ source, tenant, lease }) => ({
      amount: Math.abs(source.balance),
      balance_after: source.balance,
      company_id: company.id,
      description: source.balance < 0
        ? `Opening outstanding balance imported. Tenant has rent advance paid of UGX ${Math.abs(Math.round(source.balance)).toLocaleString()}.`
        : "Opening outstanding balance imported.",
      entry_type: source.balance < 0 ? "credit" : "debit",
      lease_id: lease?.id ?? null,
      office_id: tenant.office_id,
      source_id: tenant.id,
      source_type: "opening_outstanding_balance_import",
      tenant_id: tenant.id,
    }));
  for (const batch of chunk(ledgerRows)) {
    const { error } = await supabase.from("tenant_ledger_entries").insert(batch);
    if (error) throw new Error(`tenant_ledger_entries: ${error.message}`);
  }

  const auditRows = matched.map(({ source, room, tenant }) => ({
    action: "opening_outstanding_balance_imported",
    before_data: {
      room_outstanding_balance: room.outstanding_balance,
      tenant_balance: tenant.balance,
    },
    after_data: {
      source_file: path.basename(FILE),
      source_sheet: "Sheet1",
      source_row: source.rowNumber,
      room_number: source.roomNumber,
      imported_balance: source.balance,
      rent_advance_paid: source.balance < 0 ? Math.abs(source.balance) : 0,
    },
    company_id: company.id,
    entity_id: room.id,
    entity_type: "room",
    office_id: room.office_id,
  }));
  for (const batch of chunk(auditRows)) {
    const { error } = await supabase.from("audit_logs").insert(batch);
    if (error) throw new Error(`audit_logs: ${error.message}`);
  }

  console.log(JSON.stringify({
    validRows: valid.length,
    writableRows: writableRows.length,
    matchedRowsWritten: matched.length,
    unmatchedRows: unmatched.length,
    ambiguousRows: ambiguous.length,
    invalidRows: invalid.length,
    duplicateExcelRoomNumbers: duplicates.length,
    totalOutstandingImported: matched.reduce((sum, item) => sum + item.source.balance, 0),
    ledgerRowsInserted: ledgerRows.length,
    auditRowsInserted: auditRows.length,
    unmatched: unmatched.slice(0, 80),
    ambiguous: ambiguous.slice(0, 40),
    invalidRows: invalid.slice(0, 40),
    duplicateExcelRowsNeedsReview: duplicates.slice(0, 40),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
