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

function supabase() {
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

async function fetchAll(client, table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999);
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

async function runPool(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

async function readWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const worksheet = workbook.getWorksheet("Sheet1") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found.");

  const validRows = [];
  const invalidRows = [];
  const duplicates = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const roomNumber = normalize(row.getCell(2).value);
    const balance = parseBalance(row.getCell(3).value);
    if (!roomNumber && row.getCell(3).value === null) continue;
    if (!roomNumber || balance === null) {
      invalidRows.push({ rowNumber, roomNumber, balanceRaw: row.getCell(3).value });
      continue;
    }
    const roomKey = key(roomNumber);
    if (seen.has(roomKey)) duplicates.push({ rowNumber, roomNumber, balance, firstRow: seen.get(roomKey) });
    else seen.set(roomKey, rowNumber);
    validRows.push({ rowNumber, roomNumber, balance, key: roomKey });
  }
  return { validRows, invalidRows, duplicates };
}

async function main() {
  const client = supabase();
  const { validRows, invalidRows, duplicates } = await readWorkbook();
  const [companyResult, rooms, tenants, leases] = await Promise.all([
    client.from("companies").select("id,name").limit(1).single(),
    fetchAll(client, "rooms", "id,company_id,office_id,property_id,room_number,monthly_rent,outstanding_balance,status"),
    fetchAll(client, "tenants", "id,company_id,office_id,property_id,room_id,full_name,phone,balance,status"),
    fetchAll(client, "leases", "id,company_id,office_id,property_id,room_id,tenant_id,status"),
  ]);
  if (companyResult.error) throw new Error(companyResult.error.message);
  const company = companyResult.data;
  const roomMap = new Map();
  for (const room of rooms) {
    const roomKey = key(room.room_number);
    const list = roomMap.get(roomKey) ?? [];
    list.push(room);
    roomMap.set(roomKey, list);
  }
  const tenantByRoomId = new Map(tenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id, tenant]));
  const activeLeaseByRoomId = new Map(leases.filter((lease) => lease.status === "active").map((lease) => [lease.room_id, lease]));

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  for (const source of validRows) {
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
    const tenant = tenantByRoomId.get(room.id) ?? null;
    const lease = activeLeaseByRoomId.get(room.id) ?? null;
    if (!tenant) {
      unmatched.push({ ...source, reason: "matched_room_has_no_tenant" });
      continue;
    }
    matched.push({ source, room, tenant, lease });
  }

  await runPool(matched, 25, async ({ source, room, tenant }) => {
    const [roomResult, tenantResult] = await Promise.all([
      client.from("rooms").update({ outstanding_balance: source.balance }).eq("id", room.id),
      client.from("tenants").update({ balance: source.balance }).eq("id", tenant.id),
    ]);
    if (roomResult.error) throw new Error(`room ${room.room_number}: ${roomResult.error.message}`);
    if (tenantResult.error) throw new Error(`tenant ${tenant.id}: ${tenantResult.error.message}`);
  });

  const ledgerRows = matched.map(({ source, tenant, lease }) => ({
    amount: source.balance,
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
    const { error } = await client.from("tenant_ledger_entries").insert(batch);
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
    const { error } = await client.from("audit_logs").insert(batch);
    if (error) throw new Error(`audit_logs: ${error.message}`);
  }

  const totalImported = matched.reduce((total, item) => total + item.source.balance, 0);
  console.log(JSON.stringify({
    validRows: validRows.length,
    matchedRowsWritten: matched.length,
    unmatchedRows: unmatched.length,
    ambiguousRows: ambiguous.length,
    invalidRows: invalidRows.length,
    duplicateExcelRoomNumbers: duplicates.length,
    totalOutstandingImported: totalImported,
    unmatched: unmatched.slice(0, 80),
    ambiguous: ambiguous.slice(0, 40),
    invalidRows: invalidRows.slice(0, 40),
    duplicateExcelRows: duplicates.slice(0, 40),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
