import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import fs from "node:fs";
import path from "node:path";

const WORKBOOK = "/Volumes/Untitled/HERITAGE 20.xlsx";
const BATCH_ID = "aa36d8e9-a9f6-4a94-bdca-2c2257416e7f";
const PAGE_SIZE = 1000;

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
  if (!url || !key) throw new Error("Missing Supabase URL or service role key.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = normalize(value).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function chunks(values, size = 200) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
}

function stripTags(xml) {
  return decodeXml(xml.replace(/<[^>]+>/g, ""));
}

function columnNumber(ref) {
  const match = String(ref ?? "").match(/[A-Z]+/);
  if (!match) return 0;
  let number = 0;
  for (const char of match[0]) number = number * 26 + char.charCodeAt(0) - 64;
  return number;
}

async function workbookRows(workbookPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(workbookPath));
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const sharedStrings = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const sharedXml = await sharedFile.async("string");
    for (const item of sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)) sharedStrings.push(stripTags(item[0]));
  }

  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(match[0], "Id");
    const target = attr(match[0], "Target");
    if (!id || !target) continue;
    rels.set(id, target.startsWith("/") ? target.replace(/^\//, "") : path.posix.normalize(`xl/${target}`));
  }

  const sheets = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(match[0], "name");
    const relId = attr(match[0], "r:id");
    const file = relId ? zip.file(rels.get(relId)) : null;
    if (!name || !file) continue;
    const xml = await file.async("string");
    const rows = new Map();
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
      const rowNumber = Number(attr(rowMatch[0], "r"));
      if (!rowNumber) continue;
      const values = [];
      for (const cellMatch of rowMatch[0].matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
        const cellXml = cellMatch[0];
        const col = columnNumber(attr(cellXml, "r"));
        if (!col) continue;
        const type = attr(cellXml, "t");
        let value = null;
        if (type === "inlineStr") {
          const inline = cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
          value = inline ? stripTags(inline[1]) : null;
        } else {
          const v = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
          const raw = v ? decodeXml(v[1]) : null;
          if (type === "s") value = sharedStrings[Number(raw)] ?? null;
          else if (raw != null && raw !== "" && Number.isFinite(Number(raw))) value = Number(raw);
          else value = raw;
        }
        values[col - 1] = value;
      }
      rows.set(rowNumber, values);
    }
    sheets.set(name, rows);
  }
  return sheets;
}

async function fetchAll(client, table, build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select("*", { count: "exact" }).range(from, from + PAGE_SIZE - 1);
    query = build ? build(query) : query;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

function roomFromTenant(tenant) {
  const raw = tenant.workbook_raw_data ?? {};
  return normalize(raw["HOUSE NO"] ?? raw.House ?? raw.Room ?? raw["Room No"] ?? raw["ROOM NO"]);
}

async function repairTenants(client) {
  const before = await count(client, "tenants", (query) => query.neq("status", "import_review").is("room_id", null));
  const [tenants, rooms] = await Promise.all([
    fetchAll(client, "tenants", (query) => query.neq("status", "import_review").is("room_id", null)),
    fetchAll(client, "rooms"),
  ]);

  const roomByExactScope = new Map();
  for (const room of rooms) {
    const roomKey = `${room.office_id ?? ""}|${room.property_id ?? ""}|${key(room.room_number)}`;
    if (!roomByExactScope.has(roomKey)) roomByExactScope.set(roomKey, room);
  }

  let matched = 0;
  let skipped = 0;
  const examples = [];
  const updates = [];
  for (const tenant of tenants) {
    const roomNumber = roomFromTenant(tenant);
    if (!roomNumber || !tenant.office_id || !tenant.property_id) {
      skipped += 1;
      continue;
    }
    const room = roomByExactScope.get(`${tenant.office_id}|${tenant.property_id}|${key(roomNumber)}`);
    if (!room) {
      skipped += 1;
      continue;
    }
    updates.push({
        id: tenant.id,
        room_id: room.id,
        updated_at: new Date().toISOString(),
        tenant_score_reason: "Historical room link repaired from workbook house number during Phase 30 production hardening.",
      });
    matched += 1;
    if (examples.length < 5) examples.push({ tenant: tenant.full_name, house: roomNumber, room_id: room.id });
  }

  for (const chunk of chunks(updates, 200)) {
    const { error } = await client.from("tenants").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }

  const after = await count(client, "tenants", (query) => query.neq("status", "import_review").is("room_id", null));
  return { before, after, repaired: matched, skipped, examples };
}

async function repairExpenses(client, sheets) {
  const beforeZero = await count(client, "expenses", (query) => query.eq("historical_import_batch_id", BATCH_ID).eq("amount", 0));
  const beforePositive = await count(client, "expenses", (query) => query.eq("historical_import_batch_id", BATCH_ID).gt("amount", 0));
  const expenses = await fetchAll(client, "expenses", (query) => query.eq("historical_import_batch_id", BATCH_ID).eq("amount", 0));

  let repaired = 0;
  let noWorkbookValue = 0;
  const duplicateHeaderSheets = new Set();
  const examples = [];
  const updates = [];
  for (const expense of expenses) {
    if (!/cash flow/i.test(expense.workbook_sheet_name ?? "")) {
      noWorkbookValue += 1;
      continue;
    }
    const row = sheets.get(expense.workbook_sheet_name)?.get(expense.workbook_row_number);
    const amountTaken = parseMoney(row?.[10]);
    if (!amountTaken || amountTaken <= 0) {
      noWorkbookValue += 1;
      continue;
    }
    duplicateHeaderSheets.add(expense.workbook_sheet_name);
    const comment = normalize(row?.[9]) || expense.description || expense.item || "Historical workbook expense";
    updates.push({
        id: expense.id,
        amount: amountTaken,
        item: comment,
        description: comment,
        workbook_comment: comment,
        updated_at: new Date().toISOString(),
      });
    repaired += 1;
    if (examples.length < 5) examples.push({ sheet: expense.workbook_sheet_name, row: expense.workbook_row_number, amount: amountTaken, comment });
  }

  for (const chunk of chunks(updates, 200)) {
    const { error } = await client.from("expenses").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }

  const afterZero = await count(client, "expenses", (query) => query.eq("historical_import_batch_id", BATCH_ID).eq("amount", 0));
  const afterPositive = await count(client, "expenses", (query) => query.eq("historical_import_batch_id", BATCH_ID).gt("amount", 0));
  return {
    beforeZero,
    beforePositive,
    afterZero,
    afterPositive,
    repaired,
    noWorkbookValue,
    duplicateHeaderSheets: [...duplicateHeaderSheets].sort(),
    examples,
  };
}

async function count(client, table, build) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  query = build ? build(query) : query;
  const { count: result, error } = await query;
  if (error) throw error;
  return result ?? 0;
}

async function main() {
  if (!fs.existsSync(WORKBOOK)) throw new Error(`Workbook not found: ${WORKBOOK}`);
  const client = supabase();
  const sheets = await workbookRows(WORKBOOK);
  const tenants = await repairTenants(client);
  const expenses = await repairExpenses(client, sheets);
  console.log(JSON.stringify({ workbook: WORKBOOK, tenants, expenses }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
