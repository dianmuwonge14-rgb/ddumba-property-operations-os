import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_WORKBOOK = "/Volumes/Untitled/HERITAGE 20.xlsx";
const OFFICE_ALIASES = [
  ["kigungu", "Kigungu Main Office"],
  ["kapeeka", "Kapeeka Office"],
  ["lugonjo", "Lugonjo Office"],
  ["kiyindi", "Kiyindi Office"],
  ["mbale", "Mbale Office"],
];

const COLLECTION_COLUMNS = new Set([
  "amount",
  "amount_paid",
  "balance",
  "collection_number",
  "company_id",
  "created_at",
  "expected_amount",
  "landlord_id",
  "notes",
  "office_id",
  "paid_at",
  "payment_method",
  "property_id",
  "reference_number",
  "room_id",
  "status",
  "tenant_id",
  "type",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "day_of_week",
  "brought_forward",
  "income",
  "removed",
  "outstanding_balance_bf",
  "commission_percent",
  "forward_payment",
  "total_collection",
  "workbook_comment",
  "workbook_month",
  "workbook_payment_date",
]);

const TENANT_COLUMNS = new Set([
  "alternative_phone",
  "balance",
  "company_id",
  "created_at",
  "full_name",
  "monthly_rent",
  "national_id",
  "office_id",
  "phone",
  "property_id",
  "reliability_score",
  "risk_score",
  "room_id",
  "status",
  "tenant_reliability_score",
  "tenant_risk_level",
  "tenant_score_reason",
  "tenant_score_updated_at",
  "tenant_code",
  "tenant_type",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "outstanding_balance_bf",
  "forward_payment",
  "workbook_comment",
]);

const ROOM_COLUMNS = new Set([
  "company_id",
  "created_at",
  "landlord_id",
  "monthly_rent",
  "office_id",
  "outstanding_balance",
  "property_id",
  "room_number",
  "status",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "removed",
  "workbook_comment",
]);

const PROPERTY_COLUMNS = new Set([
  "company_id",
  "created_at",
  "expected_collection",
  "landlord_id",
  "name",
  "office_id",
  "property_code",
  "property_name",
  "status",
  "total_units",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "workbook_comment",
]);

const LANDLORD_COLUMNS = new Set([
  "advance_taken",
  "amount_paid",
  "balance_remaining",
  "company_id",
  "created_at",
  "expected_income",
  "full_name",
  "landlord_code",
  "national_id",
  "phone",
  "status",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "commission_percent",
  "workbook_comment",
]);

const EXPENSE_COLUMNS = new Set([
  "amount",
  "category",
  "company_id",
  "created_at",
  "description",
  "expense_date",
  "expense_number",
  "item",
  "office_id",
  "property_id",
  "vendor",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "day_of_week",
  "brought_forward",
  "income",
  "workbook_comment",
  "workbook_month",
  "workbook_payment_date",
]);

const LANDLORD_PAYMENT_COLUMNS = new Set([
  "amount",
  "company_id",
  "created_at",
  "landlord_id",
  "office_id",
  "paid_at",
  "payment_method",
  "payout_reference",
  "status",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "day_of_week",
  "commission_percent",
  "forward_payment",
  "total_collection",
  "workbook_comment",
  "workbook_month",
  "workbook_payment_date",
]);

const REPORT_COLUMNS = new Set([
  "company_id",
  "office_id",
  "report_date",
  "total_collections",
  "total_expenses",
  "landlord_payments",
  "vacant_rooms",
  "new_tenants",
  "broken_promises",
  "challenges_faced",
  "general_office_notes",
  "status",
  "historical_import_batch_id",
  "historical_import_row_id",
  "workbook_sheet_name",
  "workbook_row_number",
  "workbook_raw_data",
  "day_of_week",
  "brought_forward",
  "income",
  "total_collection",
  "workbook_comment",
  "workbook_month",
]);

function parseArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (!key.startsWith("--")) continue;
    const next = process.argv[i + 1];
    if (!next || next.startsWith("--")) args.set(key.slice(2), true);
    else {
      args.set(key.slice(2), next);
      i += 1;
    }
  }
  return {
    workbook: args.get("workbook") || DEFAULT_WORKBOOK,
    mode: args.get("mode") || "test_write",
    limit: args.has("limit") ? Number(args.get("limit")) : null,
    bulk: Boolean(args.get("bulk")),
  };
}

function loadEnvLocal() {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

function createSupabase() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return normalize(value).toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/[^\d+]/g, "");
}

function looksLikeRoomCode(value) {
  const text = normalize(value);
  return /^[A-Z]?\d+[A-Z]?(?:[-/][A-Z0-9]+)?$/i.test(text);
}

function parseMoney(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object" && value.result != null) return parseMoney(value.result);
  const raw = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!raw || raw === "-" || raw === ".") return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

function parsePercent(value) {
  const money = parseMoney(value);
  if (money == null) return null;
  return money > 1 ? money / 100 : money;
}

function excelDateToISO(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseDate(value, fallbackYear) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return excelDateToISO(value);
  if (typeof value === "object" && value.result != null) return parseDate(value.result, fallbackYear);
  const text = normalize(value);
  if (!text) return null;
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 25000 && serial < 90000) return excelDateToISO(serial);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const month = monthNumber(text);
  if (month && fallbackYear) return `${fallbackYear}-${String(month).padStart(2, "0")}-01`;
  return null;
}

function monthNumber(value) {
  const text = key(value).slice(0, 3);
  return { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[text] ?? null;
}

function cellValue(cell) {
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return value.result;
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value && "text" in value) return value.text;
  }
  return value;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(value) {
  return decodeXml(String(value ?? "").replace(/<[^>]+>/g, ""));
}

function columnNumber(ref) {
  const letters = String(ref ?? "").match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let total = 0;
  for (const letter of letters) total = total * 26 + letter.charCodeAt(0) - 64;
  return total;
}

function attr(xml, name) {
  const match = xml.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : null;
}

async function loadWorkbookXml(workbookPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(workbookPath));
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = [];
  if (sharedFile) {
    const sharedXml = await sharedFile.async("string");
    const itemMatches = sharedXml.matchAll(/<si[\s\S]*?<\/si>/g);
    for (const item of itemMatches) sharedStrings.push(stripTags(item[0]));
  }

  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    if (!id || !target) continue;
    const normalized = target.startsWith("/")
      ? target.replace(/^\//, "")
      : path.posix.normalize(`xl/${target}`);
    rels.set(id, normalized);
  }

  const worksheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = match[0];
    const name = attr(tag, "name");
    const sheetId = Number(attr(tag, "sheetId") ?? worksheets.length + 1);
    const relId = attr(tag, "r:id");
    const target = relId ? rels.get(relId) : null;
    const file = target ? zip.file(target) : null;
    if (!name || !file) continue;
    const xml = await file.async("string");
    const rows = new Map();
    let maxRow = 0;
    let maxCol = 0;
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
      const rowXml = rowMatch[0];
      const rowNumber = Number(attr(rowXml, "r"));
      if (!rowNumber) continue;
      const values = [];
      for (const cellMatch of rowXml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
        const cellXml = cellMatch[0];
        const ref = attr(cellXml, "r");
        const col = columnNumber(ref);
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
        maxCol = Math.max(maxCol, col);
      }
      rows.set(rowNumber, values);
      maxRow = Math.max(maxRow, rowNumber);
    }
    worksheets.push({
      id: sheetId,
      name,
      rowCount: maxRow,
      actualRowCount: rows.size,
      actualColumnCount: maxCol,
      getRow(index) {
        const values = rows.get(index) ?? [];
        return {
          getCell(col) {
            return { value: values[col - 1] ?? null };
          },
          eachCell(options, callback) {
            values.forEach((value, index) => {
              if (value != null && normalize(value) !== "") callback({ value }, index + 1);
            });
          },
        };
      },
    });
  }
  return { worksheets };
}

function rowValues(row) {
  const values = [];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    values[colNumber - 1] = cellValue(cell);
  });
  return values;
}

function headerScore(value) {
  const text = key(value);
  if (!text) return 0;
  let score = 0;
  for (const pattern of ["tenant", "house", "room", "landlord", "amount", "paid", "balance", "date", "rent", "office", "expense", "location"]) {
    if (text.includes(pattern)) score += 1;
  }
  return score;
}

function findHeaderRow(worksheet) {
  let best = null;
  const max = Math.min(15, worksheet.rowCount);
  for (let index = 1; index <= max; index += 1) {
    const values = rowValues(worksheet.getRow(index));
    const score = values.reduce((sum, value) => sum + headerScore(value), 0);
    if (!best || score > best.score) best = { row: index, score };
  }
  return best && best.score >= 2 ? best.row : null;
}

function buildHeaderMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    const clean = key(header).replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    if (clean) map.set(clean, index + 1);
  });
  return map;
}

function pick(row, headerMap, names) {
  for (const name of names) {
    const clean = key(name).replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    const col = headerMap.get(clean);
    if (!col) continue;
    const value = cellValue(row.getCell(col));
    if (value != null && normalize(value) !== "") return value;
  }
  return null;
}

function rawRowObject(row, headers) {
  const raw = {};
  headers.forEach((header, index) => {
    const name = normalize(header) || `Column ${index + 1}`;
    const value = cellValue(row.getCell(index + 1));
    if (value != null && normalize(value) !== "") raw[name] = value;
  });
  return raw;
}

function inferOffice(sheetName, raw) {
  const text = `${sheetName} ${Object.values(raw).join(" ")}`.toLowerCase();
  const found = OFFICE_ALIASES.find(([needle]) => text.includes(needle));
  return found?.[1] ?? null;
}

function sheetPriority(name) {
  const text = key(name);
  if (text.includes("tenants masterfile")) return 0;
  if (text.includes("payments received")) return 1;
  if (text.includes("cash flow")) return 2;
  if (text.includes("landlord payments")) return 3;
  if (text.includes("landlords masterfile")) return 4;
  if (text.includes("defaulters")) return 5;
  if (text.includes("empty rooms")) return 6;
  if (text.includes("deductions")) return 7;
  return 50;
}

function inferEntities(sheetName, raw, normalized) {
  const text = `${sheetName} ${Object.keys(raw).join(" ")} ${Object.values(raw).join(" ")}`.toLowerCase();
  const entities = new Set();
  if (normalized.roomNumber) entities.add("rooms");
  if (normalized.tenantName || normalized.phone || normalized.tenantCode || normalized.nationalId) entities.add("tenants");
  if (normalized.landlordName) entities.add("landlords");
  if (normalized.collectionAmount != null || text.includes("cash flow") || text.includes("payments received")) entities.add("collections");
  if (normalized.expenseAmount != null || text.includes("expense") || text.includes("deduction")) entities.add("expenses");
  if (normalized.landlordPaymentAmount != null || text.includes("landlord payment") || text.includes("net payment")) entities.add("landlord_payments");
  if (normalized.comment) entities.add("daily_reports");
  return [...entities];
}

function normalizeRow(row, headerMap, sheetName) {
  const rawMonth = pick(row, headerMap, ["month", "mnth", "m"]);
  const rawYear = pick(row, headerMap, ["year", "yr"]);
  const year = parseMoney(rawYear) || new Date().getFullYear();
  const paymentDate = parseDate(pick(row, headerMap, ["payment date", "date", "paid at", "created at"]), year)
    || parseDate(rawMonth, year);
  let tenantName = normalize(pick(row, headerMap, ["tenant name", "tenant", "client name", "occupant"]));
  const landlordName = normalize(pick(row, headerMap, ["landlord", "owner", "land lord"]));
  const roomNumber = normalize(pick(row, headerMap, ["house no", "house", "room", "room no", "room number", "unit", "door"]));
  const phone = normalizePhone(pick(row, headerMap, ["phone", "telephone", "contact", "tel"]));
  const raw = rawRowObject(row, [...headerMap.keys()]);

  const normalized = {
    officeName: null,
    tenantName: tenantName || null,
    landlordName: landlordName || null,
    roomNumber: roomNumber || null,
    phone: phone || null,
    nationalId: normalize(pick(row, headerMap, ["national id", "nin", "id no"])) || null,
    tenantCode: normalize(pick(row, headerMap, ["tenant code", "code"])) || null,
    propertyName: normalize(pick(row, headerMap, ["property", "location", "building", "estate"])) || null,
    rent: parseMoney(pick(row, headerMap, ["rent per month", "rent rate", "rent", "monthly rent"])),
    collectionAmount: parseMoney(pick(row, headerMap, ["amount paid", "actual pay", "amount received", "cash received", "paid", "income", "collection amount", "amount (ugx) paid in"])),
    expectedAmount: parseMoney(pick(row, headerMap, ["expected amount", "rent per month", "rent rate", "rent", "b/f"])),
    balance: parseMoney(pick(row, headerMap, ["balance", "outstanding", "outstanding bal b/f", "amt defaulted", "debt"])),
    expenseAmount: parseMoney(pick(row, headerMap, ["expense", "expenses", "deduction", "deductions", "amount taken", "expense incurred"])),
    expenseCategory: normalize(pick(row, headerMap, ["category", "expense incurred", "item", "reason"])) || null,
    landlordPaymentAmount: parseMoney(pick(row, headerMap, ["landlord payment", "net payment", "final pay", "amount paid landlord"])),
    dayOfWeek: normalize(pick(row, headerMap, ["day of week", "day"])) || null,
    broughtForward: parseMoney(pick(row, headerMap, ["b/f", "bf", "brought forward"])),
    income: parseMoney(pick(row, headerMap, ["income"])),
    removed: /^(yes|true|removed)$/i.test(normalize(pick(row, headerMap, ["removed"]))),
    outstandingBalanceBf: parseMoney(pick(row, headerMap, ["outstanding bal b/f", "outstanding bf"])),
    commissionPercent: parsePercent(pick(row, headerMap, ["commission %", "commission", "comm %"])),
    forwardPayment: parseMoney(pick(row, headerMap, ["forward payment", "forward pay"])),
    totalCollection: parseMoney(pick(row, headerMap, ["total collection", "total collected"])),
    comment: normalize(pick(row, headerMap, ["comment", "comments", "remarks", "notes"])) || null,
    workbookMonth: normalize(rawMonth) || null,
    paymentDate,
    raw,
  };
  if (
    normalized.tenantName
    && (key(normalized.tenantName) === key(normalized.roomNumber) || looksLikeRoomCode(normalized.tenantName))
    && !normalized.phone
    && !normalized.tenantCode
    && !normalized.nationalId
  ) {
    normalized.tenantName = null;
  }
  normalized.officeName = inferOffice(sheetName, raw) || normalized.officeName;
  return normalized;
}

function rowHash(raw) {
  return crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

function fileHash(workbookPath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(workbookPath));
  return hash.digest("hex");
}

function keep(payload, allowed) {
  return Object.fromEntries(Object.entries(payload).filter(([column, value]) => value !== undefined && allowed.has(column)));
}

async function insertOne(supabase, table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function insertMany(supabase, table, rows, select = "*", chunkSize = 500) {
  const output = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await supabase.from(table).insert(chunk).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    output.push(...(data ?? []));
  }
  return output;
}

async function insertManyNoReturn(supabase, table, rows, chunkSize = 1000) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function updateBatch(supabase, id, payload) {
  const { error } = await supabase.from("historical_import_batches").update(payload).eq("id", id);
  if (error) throw new Error(`historical_import_batches update: ${error.message}`);
}

async function updateRowStatus(supabase, id, payload) {
  const { error } = await supabase.from("historical_import_rows").update(payload).eq("id", id);
  if (error) throw new Error(`historical_import_rows update: ${error.message}`);
}

async function logError(supabase, payload) {
  await supabase.from("historical_import_errors").insert(payload);
}

async function linkRecord(supabase, payload) {
  await supabase.from("historical_import_record_links").insert(payload);
}

async function insertLinkBatch(supabase, links) {
  if (!links.length) return;
  const { error } = await supabase.from("historical_import_record_links").insert(links);
  if (error) throw new Error(`historical_import_record_links: ${error.message}`);
}

function firstBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const lookup = keyFn(item);
    if (lookup && !map.has(lookup)) map.set(lookup, item);
  }
  return map;
}

function mapBy(rows, selector) {
  const map = new Map();
  for (const row of rows) {
    const value = selector(row);
    if (value) map.set(value, row);
  }
  return map;
}

async function loadState(supabase, companyId) {
  const [offices, properties, rooms, tenants, landlords] = await Promise.all([
    supabase.from("offices").select("*").eq("company_id", companyId),
    supabase.from("properties").select("*").eq("company_id", companyId),
    supabase.from("rooms").select("*").eq("company_id", companyId),
    supabase.from("tenants").select("*").eq("company_id", companyId),
    supabase.from("landlords").select("*").eq("company_id", companyId),
  ]);
  for (const result of [offices, properties, rooms, tenants, landlords]) if (result.error) throw new Error(result.error.message);
  return {
    offices: offices.data ?? [],
    properties: properties.data ?? [],
    rooms: rooms.data ?? [],
    tenants: tenants.data ?? [],
    landlords: landlords.data ?? [],
    officeByName: mapBy(offices.data ?? [], (office) => key(office.office_name || office.name)),
    propertyByOfficeName: mapBy(properties.data ?? [], (property) => `${property.office_id}:${key(property.property_name || property.name)}`),
    roomByOfficeNumber: mapBy(rooms.data ?? [], (room) => `${room.office_id}:${key(room.room_number)}`),
    tenantByCode: mapBy(tenants.data ?? [], (tenant) => key(tenant.tenant_code)),
    tenantByPhone: mapBy(tenants.data ?? [], (tenant) => normalizePhone(tenant.phone)),
    tenantByNationalId: mapBy(tenants.data ?? [], (tenant) => key(tenant.national_id)),
    tenantByRoom: mapBy(tenants.data ?? [], (tenant) => tenant.room_id),
    landlordByName: mapBy(landlords.data ?? [], (landlord) => key(landlord.full_name)),
  };
}

async function ensureOffice(supabase, state, companyId, officeName) {
  if (!officeName) return null;
  const existing = state.officeByName.get(key(officeName));
  if (existing) return existing;
  const code = officeName.split(/\s+/).map((part) => part[0]).join("").slice(0, 8).toUpperCase();
  const office = await insertOne(supabase, "offices", {
    company_id: companyId,
    office_name: officeName,
    name: officeName,
    office_code: code,
    code,
    status: "active",
  });
  state.offices.push(office);
  state.officeByName.set(key(officeName), office);
  return office;
}

async function ensureLandlord(supabase, state, companyId, normalized, row) {
  if (!normalized.landlordName) return null;
  const existing = state.landlordByName.get(key(normalized.landlordName));
  if (existing) return existing;
  const landlord = await insertOne(supabase, "landlords", keep({
    company_id: companyId,
    full_name: normalized.landlordName,
    phone: normalized.phone || null,
    status: "active",
    expected_income: normalized.rent,
    historical_import_batch_id: row.batchId,
    historical_import_row_id: row.rowId,
    workbook_sheet_name: row.sheetName,
    workbook_row_number: row.rowNumber,
    workbook_raw_data: normalized.raw,
    commission_percent: normalized.commissionPercent,
    workbook_comment: normalized.comment,
  }, LANDLORD_COLUMNS));
  state.landlords.push(landlord);
  state.landlordByName.set(key(normalized.landlordName), landlord);
  return landlord;
}

async function ensureProperty(supabase, state, companyId, office, landlord, normalized, row) {
  if (!office || !normalized.propertyName) return null;
  const lookup = `${office.id}:${key(normalized.propertyName)}`;
  const existing = state.propertyByOfficeName.get(lookup);
  if (existing) return existing;
  const property = await insertOne(supabase, "properties", keep({
    company_id: companyId,
    office_id: office.id,
    landlord_id: landlord?.id ?? null,
    property_name: normalized.propertyName,
    name: normalized.propertyName,
    status: "active",
    expected_collection: normalized.expectedAmount ?? normalized.rent ?? null,
    historical_import_batch_id: row.batchId,
    historical_import_row_id: row.rowId,
    workbook_sheet_name: row.sheetName,
    workbook_row_number: row.rowNumber,
    workbook_raw_data: normalized.raw,
    workbook_comment: normalized.comment,
  }, PROPERTY_COLUMNS));
  state.properties.push(property);
  state.propertyByOfficeName.set(lookup, property);
  return property;
}

async function ensureRoom(supabase, state, companyId, office, property, landlord, normalized, row) {
  if (!office || !normalized.roomNumber) return null;
  const lookup = `${office.id}:${key(normalized.roomNumber)}`;
  const existing = state.roomByOfficeNumber.get(lookup);
  if (existing) return existing;
  const room = await insertOne(supabase, "rooms", keep({
    company_id: companyId,
    office_id: office.id,
    property_id: property?.id ?? null,
    landlord_id: landlord?.id ?? null,
    room_number: normalized.roomNumber,
    monthly_rent: normalized.rent,
    outstanding_balance: normalized.balance ?? normalized.outstandingBalanceBf,
    status: normalized.removed ? "removed" : normalized.tenantName ? "occupied" : "vacant",
    historical_import_batch_id: row.batchId,
    historical_import_row_id: row.rowId,
    workbook_sheet_name: row.sheetName,
    workbook_row_number: row.rowNumber,
    workbook_raw_data: normalized.raw,
    removed: normalized.removed || null,
    workbook_comment: normalized.comment,
  }, ROOM_COLUMNS));
  state.rooms.push(room);
  state.roomByOfficeNumber.set(lookup, room);
  return room;
}

function findTenant(state, normalized, room) {
  if (normalized.tenantCode && state.tenantByCode.get(key(normalized.tenantCode))) return state.tenantByCode.get(key(normalized.tenantCode));
  if (normalized.nationalId && state.tenantByNationalId.get(key(normalized.nationalId))) return state.tenantByNationalId.get(key(normalized.nationalId));
  if (normalized.phone && state.tenantByPhone.get(normalized.phone)) return state.tenantByPhone.get(normalized.phone);
  if (room?.id && normalized.tenantName) {
    const roomTenant = state.tenantByRoom.get(room.id);
    if (roomTenant?.status !== "import_review" && roomTenant?.full_name) return roomTenant;
  }
  return null;
}

async function ensureTenant(supabase, state, companyId, office, property, room, normalized, row) {
  if (!office) return null;
  const existing = findTenant(state, normalized, room);
  if (existing) return existing;
  if (!normalized.tenantName && !normalized.phone && !normalized.tenantCode && !normalized.nationalId) return null;
  const score = normalized.balance && normalized.balance > 0 ? 65 : 75;
  const tenant = await insertOne(supabase, "tenants", keep({
    company_id: companyId,
    office_id: office.id,
    property_id: property?.id ?? room?.property_id ?? null,
    room_id: room?.id ?? null,
    full_name: normalized.tenantName || null,
    phone: normalized.phone || null,
    national_id: normalized.nationalId || null,
    tenant_code: normalized.tenantCode || null,
    monthly_rent: normalized.rent,
    balance: normalized.balance ?? normalized.outstandingBalanceBf ?? null,
    reliability_score: score,
    risk_score: 100 - score,
    tenant_reliability_score: score,
    tenant_risk_level: score >= 75 ? "Low Risk" : "Medium Risk",
    tenant_score_reason: "Historical reliability initialized from imported workbook balance and payment history.",
    tenant_score_updated_at: new Date().toISOString(),
    status: "active",
    tenant_type: "individual",
    historical_import_batch_id: row.batchId,
    historical_import_row_id: row.rowId,
    workbook_sheet_name: row.sheetName,
    workbook_row_number: row.rowNumber,
    workbook_raw_data: normalized.raw,
    outstanding_balance_bf: normalized.outstandingBalanceBf,
    forward_payment: normalized.forwardPayment,
    workbook_comment: normalized.comment,
  }, TENANT_COLUMNS));
  state.tenants.push(tenant);
  if (tenant.tenant_code) state.tenantByCode.set(key(tenant.tenant_code), tenant);
  if (tenant.phone) state.tenantByPhone.set(normalizePhone(tenant.phone), tenant);
  if (tenant.national_id) state.tenantByNationalId.set(key(tenant.national_id), tenant);
  if (tenant.room_id) state.tenantByRoom.set(tenant.room_id, tenant);
  return tenant;
}

async function insertFinancials(supabase, companyId, office, property, room, tenant, landlord, normalized, row) {
  const links = [];
  const common = {
    company_id: companyId,
    office_id: office?.id ?? null,
    property_id: property?.id ?? room?.property_id ?? null,
    historical_import_batch_id: row.batchId,
    historical_import_row_id: row.rowId,
    workbook_sheet_name: row.sheetName,
    workbook_row_number: row.rowNumber,
    workbook_raw_data: normalized.raw,
    day_of_week: normalized.dayOfWeek,
    brought_forward: normalized.broughtForward,
    income: normalized.income,
    workbook_comment: normalized.comment,
    workbook_month: normalized.workbookMonth,
    workbook_payment_date: normalized.paymentDate,
  };

  if (office && normalized.collectionAmount != null && (tenant || room)) {
    const collection = await insertOne(supabase, "collections", keep({
      ...common,
      room_id: room?.id ?? null,
      tenant_id: tenant?.id ?? null,
      landlord_id: landlord?.id ?? null,
      amount: normalized.collectionAmount,
      amount_paid: normalized.collectionAmount,
      expected_amount: normalized.expectedAmount ?? normalized.rent,
      balance: normalized.balance,
      paid_at: normalized.paymentDate ? `${normalized.paymentDate}T12:00:00.000Z` : null,
      status: "posted",
      type: "historical_excel_import",
      payment_method: "historical_excel",
      reference_number: `HERITAGE-${row.sheetName}-${row.rowNumber}`,
      notes: normalized.comment,
      removed: normalized.removed || null,
      outstanding_balance_bf: normalized.outstandingBalanceBf,
      commission_percent: normalized.commissionPercent,
      forward_payment: normalized.forwardPayment,
      total_collection: normalized.totalCollection,
    }, COLLECTION_COLUMNS));
    links.push(["collections", collection.id, "inserted"]);
  }

  if (office && normalized.expenseAmount != null) {
    const expense = await insertOne(supabase, "expenses", keep({
      ...common,
      amount: normalized.expenseAmount,
      category: normalized.expenseCategory || "Historical workbook expense",
      item: normalized.expenseCategory || normalized.comment || "Historical workbook expense",
      description: normalized.comment,
      expense_date: normalized.paymentDate,
      expense_number: `HERITAGE-EXP-${row.sheetName}-${row.rowNumber}`,
    }, EXPENSE_COLUMNS));
    links.push(["expenses", expense.id, "inserted"]);
  }

  if (office && landlord && normalized.landlordPaymentAmount != null) {
    const payment = await insertOne(supabase, "landlord_payments", keep({
      ...common,
      property_id: undefined,
      landlord_id: landlord.id,
      amount: normalized.landlordPaymentAmount,
      paid_at: normalized.paymentDate ? `${normalized.paymentDate}T12:00:00.000Z` : null,
      payment_method: "historical_excel",
      payout_reference: `HERITAGE-LP-${row.sheetName}-${row.rowNumber}`,
      status: "paid",
      commission_percent: normalized.commissionPercent,
      forward_payment: normalized.forwardPayment,
      total_collection: normalized.totalCollection,
    }, LANDLORD_PAYMENT_COLUMNS));
    links.push(["landlord_payments", payment.id, "inserted"]);
  }

  if (office && normalized.comment && normalized.paymentDate) {
    const report = await insertOne(supabase, "office_daily_reports", keep({
      ...common,
      report_date: normalized.paymentDate,
      total_collections: normalized.collectionAmount ?? normalized.totalCollection ?? 0,
      total_expenses: normalized.expenseAmount ?? 0,
      landlord_payments: normalized.landlordPaymentAmount ?? 0,
      vacant_rooms: 0,
      new_tenants: tenant ? 1 : 0,
      broken_promises: 0,
        challenges_faced: null,
        general_office_notes: normalized.comment,
      status: "submitted",
      total_collection: normalized.totalCollection,
    }, REPORT_COLUMNS));
    links.push(["office_daily_reports", report.id, "inserted"]);
  }
  return links;
}

async function bulkMain(args) {
  if (!fs.existsSync(args.workbook)) throw new Error(`Workbook does not exist: ${args.workbook}`);
  const supabase = createSupabase();
  const probe = await supabase.from("historical_import_batches").select("id").limit(1);
  if (probe.error) throw new Error(`Historical import schema is not ready: ${probe.error.message}`);

  const { data: company, error: companyError } = await supabase.from("companies").select("*").limit(1).single();
  if (companyError || !company) throw new Error(companyError?.message || "No company found.");

  const workbook = await loadWorkbookXml(args.workbook);
  const batch = await insertOne(supabase, "historical_import_batches", {
    company_id: company.id,
    source_name: path.basename(args.workbook),
    source_workbook_path: args.workbook,
    source_file_hash: fileHash(args.workbook),
    mode: args.mode,
    status: "running",
    started_at: new Date().toISOString(),
    total_sheets: workbook.worksheets.length,
  });

  const started = Date.now();
  const summary = {
    source: args.workbook,
    bulk: true,
    limit: args.limit,
    sheets: [],
    rowsDiscovered: 0,
    rowsStaged: 0,
    imported: 0,
    duplicatesMerged: 0,
    skipped: 0,
    errors: 0,
    links: {},
    inserted: {},
    unresolvedRows: [],
  };

  const stagedMeta = [];
  let processed = 0;
  for (const worksheet of [...workbook.worksheets].sort((a, b) => sheetPriority(a.name) - sheetPriority(b.name))) {
    const headerRow = findHeaderRow(worksheet);
    if (!headerRow) continue;
    const headers = rowValues(worksheet.getRow(headerRow)).map((value) => normalize(value));
    const headerMap = buildHeaderMap(headers);
    const sheet = await insertOne(supabase, "historical_import_sheets", {
      batch_id: batch.id,
      company_id: company.id,
      sheet_name: worksheet.name,
      sheet_index: worksheet.id,
      header_row: headerRow,
      row_count: Math.max(0, worksheet.actualRowCount - headerRow),
      column_count: worksheet.actualColumnCount,
      headers,
      inferred_entities: [],
      field_mappings: [],
      missing_columns: [],
      unmapped_fields: [],
    });
    summary.sheets.push({ sheet: worksheet.name, rows: Math.max(0, worksheet.actualRowCount - headerRow) });
    summary.rowsDiscovered += Math.max(0, worksheet.actualRowCount - headerRow);

    const payloads = [];
    const metas = [];
    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      if (args.limit && processed >= args.limit) break;
      const row = worksheet.getRow(rowNumber);
      const raw = rawRowObject(row, headers);
      if (!Object.keys(raw).length) continue;
      processed += 1;
      const normalized = normalizeRow(row, headerMap, worksheet.name);
      normalized.raw = raw;
      const officeName = normalized.officeName || inferOffice(worksheet.name, raw);
      const hasSafeDestination = Boolean(officeName && (
        normalized.roomNumber || normalized.propertyName || normalized.landlordName || normalized.tenantName
        || normalized.phone || normalized.tenantCode || normalized.nationalId || normalized.collectionAmount != null
        || normalized.expenseAmount != null || normalized.landlordPaymentAmount != null || normalized.comment
      ));
      payloads.push({
        batch_id: batch.id,
        sheet_id: sheet.id,
        company_id: company.id,
        sheet_name: worksheet.name,
        row_number: rowNumber,
        row_hash: rowHash(raw),
        raw_row: raw,
        normalized_data: { ...normalized, raw: undefined, officeName },
        mapped_entities: inferEntities(worksheet.name, raw, normalized),
        import_status: hasSafeDestination ? "imported" : "skipped",
        error_message: hasSafeDestination ? null : "No safe normalized destination found for row.",
        duplicate_key: {
          tenant_code: normalized.tenantCode,
          room_number: normalized.roomNumber,
          phone: normalized.phone,
          national_id: normalized.nationalId,
          property_room: normalized.propertyName && normalized.roomNumber ? `${normalized.propertyName}:${normalized.roomNumber}` : null,
        },
      });
      metas.push({ sheetName: worksheet.name, rowNumber, normalized, officeName, hasSafeDestination });
      if (payloads.length >= 500) {
        const rows = await insertMany(supabase, "historical_import_rows", payloads, "id,sheet_name,row_number,import_status");
        const ids = new Map(rows.map((item) => [`${item.sheet_name}:${item.row_number}`, item.id]));
        for (const meta of metas) stagedMeta.push({ ...meta, rowId: ids.get(`${meta.sheetName}:${meta.rowNumber}`) });
        summary.rowsStaged += rows.length;
        payloads.length = 0;
        metas.length = 0;
        console.log(JSON.stringify({ progress: "staged", rowsProcessed: processed, rowsStaged: summary.rowsStaged, imported: summary.imported, duplicatesMerged: summary.duplicatesMerged, skipped: summary.skipped, errors: summary.errors, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
      }
    }
    if (payloads.length) {
      const rows = await insertMany(supabase, "historical_import_rows", payloads, "id,sheet_name,row_number,import_status");
      const ids = new Map(rows.map((item) => [`${item.sheet_name}:${item.row_number}`, item.id]));
      for (const meta of metas) stagedMeta.push({ ...meta, rowId: ids.get(`${meta.sheetName}:${meta.rowNumber}`) });
      summary.rowsStaged += rows.length;
      console.log(JSON.stringify({ progress: "staged", rowsProcessed: processed, rowsStaged: summary.rowsStaged, imported: summary.imported, duplicatesMerged: summary.duplicatesMerged, skipped: summary.skipped, errors: summary.errors, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
    }
    if (args.limit && processed >= args.limit) break;
  }

  let state = await loadState(supabase, company.id);
  const importable = stagedMeta.filter((meta) => meta.hasSafeDestination && meta.rowId);
  const links = [];

  const officeNames = [...new Set(importable.map((meta) => meta.officeName).filter(Boolean))];
  const missingOffices = officeNames.filter((officeName) => !state.officeByName.has(key(officeName)));
  if (missingOffices.length) {
    await insertMany(supabase, "offices", missingOffices.map((officeName) => {
      const code = officeName.split(/\s+/).map((part) => part[0]).join("").slice(0, 8).toUpperCase();
      return { company_id: company.id, office_name: officeName, name: officeName, office_code: code, code, status: "active" };
    }), "id");
    summary.inserted.offices = missingOffices.length;
    state = await loadState(supabase, company.id);
  }

  const landlordPayloads = [];
  for (const [lookup, meta] of firstBy(importable.filter((meta) => meta.normalized.landlordName), (meta) => key(meta.normalized.landlordName))) {
    if (state.landlordByName.has(lookup)) continue;
    landlordPayloads.push(keep({
      company_id: company.id,
      full_name: meta.normalized.landlordName,
      phone: meta.normalized.phone || null,
      status: "active",
      expected_income: meta.normalized.rent,
      historical_import_batch_id: batch.id,
      historical_import_row_id: meta.rowId,
      workbook_sheet_name: meta.sheetName,
      workbook_row_number: meta.rowNumber,
      workbook_raw_data: meta.normalized.raw,
      commission_percent: meta.normalized.commissionPercent,
      workbook_comment: meta.normalized.comment,
    }, LANDLORD_COLUMNS));
  }
  if (landlordPayloads.length) {
    await insertMany(supabase, "landlords", landlordPayloads, "id");
    summary.inserted.landlords = landlordPayloads.length;
    state = await loadState(supabase, company.id);
  }

  const propertyPayloads = [];
  for (const [lookup, meta] of firstBy(importable.filter((meta) => meta.officeName && meta.normalized.propertyName), (meta) => {
    const office = state.officeByName.get(key(meta.officeName));
    return office ? `${office.id}:${key(meta.normalized.propertyName)}` : null;
  })) {
    if (state.propertyByOfficeName.has(lookup)) continue;
    const office = state.officeByName.get(key(meta.officeName));
    const landlord = meta.normalized.landlordName ? state.landlordByName.get(key(meta.normalized.landlordName)) : null;
    propertyPayloads.push(keep({
      company_id: company.id,
      office_id: office?.id ?? null,
      landlord_id: landlord?.id ?? null,
      property_name: meta.normalized.propertyName,
      name: meta.normalized.propertyName,
      status: "active",
      expected_collection: meta.normalized.expectedAmount ?? meta.normalized.rent ?? null,
      historical_import_batch_id: batch.id,
      historical_import_row_id: meta.rowId,
      workbook_sheet_name: meta.sheetName,
      workbook_row_number: meta.rowNumber,
      workbook_raw_data: meta.normalized.raw,
      workbook_comment: meta.normalized.comment,
    }, PROPERTY_COLUMNS));
  }
  if (propertyPayloads.length) {
    await insertMany(supabase, "properties", propertyPayloads, "id");
    summary.inserted.properties = propertyPayloads.length;
    state = await loadState(supabase, company.id);
  }

  const roomPayloads = [];
  for (const [lookup, meta] of firstBy(importable.filter((meta) => meta.officeName && meta.normalized.roomNumber), (meta) => {
    const office = state.officeByName.get(key(meta.officeName));
    return office ? `${office.id}:${key(meta.normalized.roomNumber)}` : null;
  })) {
    if (state.roomByOfficeNumber.has(lookup)) continue;
    const office = state.officeByName.get(key(meta.officeName));
    const property = meta.normalized.propertyName ? state.propertyByOfficeName.get(`${office?.id}:${key(meta.normalized.propertyName)}`) : null;
    const landlord = meta.normalized.landlordName ? state.landlordByName.get(key(meta.normalized.landlordName)) : null;
    roomPayloads.push(keep({
      company_id: company.id,
      office_id: office?.id ?? null,
      property_id: property?.id ?? null,
      landlord_id: landlord?.id ?? null,
      room_number: meta.normalized.roomNumber,
      monthly_rent: meta.normalized.rent,
      outstanding_balance: meta.normalized.balance ?? meta.normalized.outstandingBalanceBf,
      status: meta.normalized.removed ? "removed" : meta.normalized.tenantName ? "occupied" : "vacant",
      historical_import_batch_id: batch.id,
      historical_import_row_id: meta.rowId,
      workbook_sheet_name: meta.sheetName,
      workbook_row_number: meta.rowNumber,
      workbook_raw_data: meta.normalized.raw,
      removed: meta.normalized.removed || null,
      workbook_comment: meta.normalized.comment,
    }, ROOM_COLUMNS));
  }
  if (roomPayloads.length) {
    await insertMany(supabase, "rooms", roomPayloads, "id");
    summary.inserted.rooms = roomPayloads.length;
    state = await loadState(supabase, company.id);
  }

  const tenantPayloads = [];
  for (const meta of importable) {
    const normalized = meta.normalized;
    const office = state.officeByName.get(key(meta.officeName));
    if (!office) continue;
    const room = normalized.roomNumber ? state.roomByOfficeNumber.get(`${office.id}:${key(normalized.roomNumber)}`) : null;
    const property = normalized.propertyName ? state.propertyByOfficeName.get(`${office.id}:${key(normalized.propertyName)}`) : null;
    if (findTenant(state, normalized, room)) continue;
    if (!normalized.tenantName && !normalized.phone && !normalized.tenantCode && !normalized.nationalId) continue;
    const score = normalized.balance && normalized.balance > 0 ? 65 : 75;
    tenantPayloads.push(keep({
      company_id: company.id,
      office_id: office.id,
      property_id: property?.id ?? room?.property_id ?? null,
      room_id: room?.id ?? null,
      full_name: normalized.tenantName || null,
      phone: normalized.phone || null,
      national_id: normalized.nationalId || null,
      tenant_code: normalized.tenantCode || null,
      monthly_rent: normalized.rent,
      balance: normalized.balance ?? normalized.outstandingBalanceBf ?? null,
      reliability_score: score,
      risk_score: 100 - score,
      tenant_reliability_score: score,
      tenant_risk_level: score >= 75 ? "Low Risk" : "Medium Risk",
      tenant_score_reason: "Historical reliability initialized from imported workbook balance and payment history.",
      tenant_score_updated_at: new Date().toISOString(),
      status: "active",
      tenant_type: "individual",
      historical_import_batch_id: batch.id,
      historical_import_row_id: meta.rowId,
      workbook_sheet_name: meta.sheetName,
      workbook_row_number: meta.rowNumber,
      workbook_raw_data: normalized.raw,
      outstanding_balance_bf: normalized.outstandingBalanceBf,
      forward_payment: normalized.forwardPayment,
      workbook_comment: normalized.comment,
    }, TENANT_COLUMNS));
  }
  if (tenantPayloads.length) {
    await insertMany(supabase, "tenants", tenantPayloads, "id");
    summary.inserted.tenants = tenantPayloads.length;
    state = await loadState(supabase, company.id);
  }
  console.log(JSON.stringify({ progress: "entities", inserted: summary.inserted, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));

  const collectionPayloads = [];
  const expensePayloads = [];
  const landlordPaymentPayloads = [];
  const reportPayloads = [];
  for (const meta of importable) {
    const normalized = meta.normalized;
    const office = state.officeByName.get(key(meta.officeName));
    if (!office) {
      summary.skipped += 1;
      if (summary.unresolvedRows.length < 20) summary.unresolvedRows.push({ sheet: meta.sheetName, row: meta.rowNumber, reason: "Office could not be resolved" });
      continue;
    }
    const landlord = normalized.landlordName ? state.landlordByName.get(key(normalized.landlordName)) : null;
    const property = normalized.propertyName ? state.propertyByOfficeName.get(`${office.id}:${key(normalized.propertyName)}`) : null;
    const room = normalized.roomNumber ? state.roomByOfficeNumber.get(`${office.id}:${key(normalized.roomNumber)}`) : null;
    const tenant = findTenant(state, normalized, room);
    const action = (target) => target?.historical_import_batch_id === batch.id ? "inserted" : "linked_existing";
    for (const [targetTable, target] of [["offices", office], ["landlords", landlord], ["properties", property], ["rooms", room], ["tenants", tenant]]) {
      if (!target?.id) continue;
      const targetAction = action(target);
      links.push({ batch_id: batch.id, row_id: meta.rowId, company_id: company.id, target_table: targetTable, target_id: target.id, action: targetAction, duplicate_strategy: targetAction === "linked_existing" ? "deduplicated by office/property/room/tenant key" : null });
      summary.links[targetTable] = (summary.links[targetTable] ?? 0) + 1;
      if (targetAction === "linked_existing" && targetTable !== "offices") summary.duplicatesMerged += 1;
    }
    const common = {
      company_id: company.id,
      office_id: office.id,
      property_id: property?.id ?? room?.property_id ?? null,
      historical_import_batch_id: batch.id,
      historical_import_row_id: meta.rowId,
      workbook_sheet_name: meta.sheetName,
      workbook_row_number: meta.rowNumber,
      workbook_raw_data: normalized.raw,
      day_of_week: normalized.dayOfWeek,
      brought_forward: normalized.broughtForward,
      income: normalized.income,
      workbook_comment: normalized.comment,
      workbook_month: normalized.workbookMonth,
      workbook_payment_date: normalized.paymentDate,
    };
    if (normalized.collectionAmount != null && (tenant || room)) {
      collectionPayloads.push(keep({ ...common, room_id: room?.id ?? null, tenant_id: tenant?.id ?? null, landlord_id: landlord?.id ?? null, amount: normalized.collectionAmount, amount_paid: normalized.collectionAmount, expected_amount: normalized.expectedAmount ?? normalized.rent, balance: normalized.balance, paid_at: normalized.paymentDate ? `${normalized.paymentDate}T12:00:00.000Z` : null, status: "posted", type: "historical_excel_import", payment_method: "historical_excel", reference_number: `HERITAGE-${meta.sheetName}-${meta.rowNumber}`, notes: normalized.comment, removed: normalized.removed || null, outstanding_balance_bf: normalized.outstandingBalanceBf, commission_percent: normalized.commissionPercent, forward_payment: normalized.forwardPayment, total_collection: normalized.totalCollection }, COLLECTION_COLUMNS));
    }
    if (normalized.expenseAmount != null) {
      expensePayloads.push(keep({ ...common, amount: normalized.expenseAmount, category: normalized.expenseCategory || "Historical workbook expense", item: normalized.expenseCategory || normalized.comment || "Historical workbook expense", description: normalized.comment, expense_date: normalized.paymentDate, expense_number: `HERITAGE-EXP-${meta.sheetName}-${meta.rowNumber}` }, EXPENSE_COLUMNS));
    }
    if (landlord && normalized.landlordPaymentAmount != null) {
      landlordPaymentPayloads.push(keep({ ...common, property_id: undefined, landlord_id: landlord.id, amount: normalized.landlordPaymentAmount, paid_at: normalized.paymentDate ? `${normalized.paymentDate}T12:00:00.000Z` : null, payment_method: "historical_excel", payout_reference: `HERITAGE-LP-${meta.sheetName}-${meta.rowNumber}`, status: "paid", commission_percent: normalized.commissionPercent, forward_payment: normalized.forwardPayment, total_collection: normalized.totalCollection }, LANDLORD_PAYMENT_COLUMNS));
    }
    if (normalized.comment && normalized.paymentDate) {
      reportPayloads.push(keep({ ...common, report_date: normalized.paymentDate, total_collections: normalized.collectionAmount ?? normalized.totalCollection ?? 0, total_expenses: normalized.expenseAmount ?? 0, landlord_payments: normalized.landlordPaymentAmount ?? 0, vacant_rooms: 0, new_tenants: tenant ? 1 : 0, broken_promises: 0, challenges_faced: null, general_office_notes: normalized.comment, status: "submitted", total_collection: normalized.totalCollection }, REPORT_COLUMNS));
    }
    summary.imported += 1;
  }

  for (const [table, payloads] of [["collections", collectionPayloads], ["expenses", expensePayloads], ["landlord_payments", landlordPaymentPayloads], ["office_daily_reports", reportPayloads]]) {
    const inserted = await insertMany(supabase, table, payloads, "id,historical_import_row_id", 500);
    summary.inserted[table] = inserted.length;
    for (const row of inserted) {
      links.push({ batch_id: batch.id, row_id: row.historical_import_row_id, company_id: company.id, target_table: table, target_id: row.id, action: "inserted" });
      summary.links[table] = (summary.links[table] ?? 0) + 1;
    }
    console.log(JSON.stringify({ progress: table, inserted: inserted.length, rowsProcessed: processed, rowsImported: summary.imported, duplicatesMerged: summary.duplicatesMerged, skipped: summary.skipped, errors: summary.errors, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
  }
  await insertManyNoReturn(supabase, "historical_import_record_links", links, 1000);
  console.log(JSON.stringify({ progress: "links", links: links.length, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));

  const status = summary.errors ? "completed_with_errors" : "completed";
  await updateBatch(supabase, batch.id, {
    status,
    completed_at: new Date().toISOString(),
    total_rows_discovered: summary.rowsDiscovered,
    total_rows_staged: summary.rowsStaged,
    total_records_imported: summary.imported,
    duplicates_merged: summary.duplicatesMerged,
    errors_count: summary.errors,
    summary,
  });
  console.log(JSON.stringify({ batchId: batch.id, status, summary }, null, 2));
}

async function main() {
  const args = parseArgs();
  if (args.bulk) return bulkMain(args);
  if (!fs.existsSync(args.workbook)) throw new Error(`Workbook does not exist: ${args.workbook}`);
  const supabase = createSupabase();

  const probe = await supabase.from("historical_import_batches").select("id").limit(1);
  if (probe.error) throw new Error(`Historical import schema is not ready: ${probe.error.message}`);

  const { data: company, error: companyError } = await supabase.from("companies").select("*").limit(1).single();
  if (companyError || !company) throw new Error(companyError?.message || "No company found.");

  const workbook = await loadWorkbookXml(args.workbook);

  const batch = await insertOne(supabase, "historical_import_batches", {
    company_id: company.id,
    source_name: path.basename(args.workbook),
    source_workbook_path: args.workbook,
    source_file_hash: fileHash(args.workbook),
    mode: args.mode,
    status: "running",
    started_at: new Date().toISOString(),
    total_sheets: workbook.worksheets.length,
  });

  const state = await loadState(supabase, company.id);
  const summary = {
    source: args.workbook,
    limit: args.limit,
    sheets: [],
    rowsDiscovered: 0,
    rowsStaged: 0,
    imported: 0,
    duplicatesMerged: 0,
    skipped: 0,
    errors: 0,
    links: {},
    unresolvedRows: [],
  };
  const pendingLinks = [];

  let processed = 0;
  for (const worksheet of [...workbook.worksheets].sort((a, b) => sheetPriority(a.name) - sheetPriority(b.name))) {
    const headerRow = findHeaderRow(worksheet);
    if (!headerRow) continue;
    const headers = rowValues(worksheet.getRow(headerRow)).map((value) => normalize(value));
    const headerMap = buildHeaderMap(headers);
    const sheet = await insertOne(supabase, "historical_import_sheets", {
      batch_id: batch.id,
      company_id: company.id,
      sheet_name: worksheet.name,
      sheet_index: worksheet.id,
      header_row: headerRow,
      row_count: Math.max(0, worksheet.actualRowCount - headerRow),
      column_count: worksheet.actualColumnCount,
      headers,
      inferred_entities: [],
      field_mappings: [],
      missing_columns: [],
      unmapped_fields: [],
    });
    summary.sheets.push({ sheet: worksheet.name, rows: Math.max(0, worksheet.actualRowCount - headerRow) });
    summary.rowsDiscovered += Math.max(0, worksheet.actualRowCount - headerRow);

    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      if (args.limit && processed >= args.limit) break;
      const row = worksheet.getRow(rowNumber);
      const raw = rawRowObject(row, headers);
      if (!Object.keys(raw).length) continue;
      processed += 1;
      const normalized = normalizeRow(row, headerMap, worksheet.name);
      normalized.raw = raw;
      const officeName = normalized.officeName || inferOffice(worksheet.name, raw);
      const mappedEntities = inferEntities(worksheet.name, raw, normalized);
      const duplicateKey = {
        tenant_code: normalized.tenantCode,
        room_number: normalized.roomNumber,
        phone: normalized.phone,
        national_id: normalized.nationalId,
        property_room: normalized.propertyName && normalized.roomNumber ? `${normalized.propertyName}:${normalized.roomNumber}` : null,
      };
      const staged = await insertOne(supabase, "historical_import_rows", {
        batch_id: batch.id,
        sheet_id: sheet.id,
        company_id: company.id,
        sheet_name: worksheet.name,
        row_number: rowNumber,
        row_hash: rowHash(raw),
        raw_row: raw,
        normalized_data: { ...normalized, raw: undefined, officeName },
        mapped_entities: mappedEntities,
        import_status: "staged",
        duplicate_key: duplicateKey,
      });
      summary.rowsStaged += 1;

      try {
        const office = await ensureOffice(supabase, state, company.id, officeName);
        const landlord = await ensureLandlord(supabase, state, company.id, normalized, {
          batchId: batch.id,
          rowId: staged.id,
          sheetName: worksheet.name,
          rowNumber,
        });
        const property = await ensureProperty(supabase, state, company.id, office, landlord, normalized, {
          batchId: batch.id,
          rowId: staged.id,
          sheetName: worksheet.name,
          rowNumber,
        });
        const room = await ensureRoom(supabase, state, company.id, office, property, landlord, normalized, {
          batchId: batch.id,
          rowId: staged.id,
          sheetName: worksheet.name,
          rowNumber,
        });
        const existingTenant = findTenant(state, normalized, room);
        const tenant = await ensureTenant(supabase, state, company.id, office, property, room, normalized, {
          batchId: batch.id,
          rowId: staged.id,
          sheetName: worksheet.name,
          rowNumber,
        });
        if (existingTenant) summary.duplicatesMerged += 1;
        const entityLinks = [];
        for (const [target, record] of [
          ["offices", office],
          ["landlords", landlord],
          ["properties", property],
          ["rooms", room],
          ["tenants", tenant],
        ]) {
          if (!record) continue;
          entityLinks.push([target, record.id, existingTenant && target === "tenants" ? "linked_existing" : "inserted"]);
        }
        entityLinks.push(...await insertFinancials(supabase, company.id, office, property, room, tenant, landlord, normalized, {
          batchId: batch.id,
          rowId: staged.id,
          sheetName: worksheet.name,
          rowNumber,
        }));
        for (const [targetTable, targetId, action] of entityLinks) {
          pendingLinks.push({
            batch_id: batch.id,
            row_id: staged.id,
            company_id: company.id,
            target_table: targetTable,
            target_id: targetId,
            action,
            duplicate_strategy: action === "linked_existing" ? "existing match by tenant code/phone/national id/room" : null,
          });
          summary.links[targetTable] = (summary.links[targetTable] ?? 0) + 1;
        }
        if (pendingLinks.length >= 500) {
          await insertLinkBatch(supabase, pendingLinks.splice(0, pendingLinks.length));
        }
        if (entityLinks.length) {
          await updateRowStatus(supabase, staged.id, { import_status: existingTenant ? "duplicate" : "imported", error_message: null });
          summary.imported += 1;
        } else {
          await updateRowStatus(supabase, staged.id, { import_status: "skipped", error_message: "No safe normalized destination found for row." });
          summary.skipped += 1;
          if (summary.unresolvedRows.length < 20) summary.unresolvedRows.push({ sheet: worksheet.name, row: rowNumber, reason: "No safe normalized destination found" });
        }
      } catch (error) {
        summary.errors += 1;
        await updateRowStatus(supabase, staged.id, { import_status: "error", error_message: error.message });
        await logError(supabase, {
          batch_id: batch.id,
          row_id: staged.id,
          company_id: company.id,
          sheet_name: worksheet.name,
          row_number: rowNumber,
          severity: "error",
          error_code: "ROW_IMPORT_FAILED",
          message: error.message,
          raw_context: raw,
        });
      }
    }
    if (args.limit && processed >= args.limit) break;
  }

  await insertLinkBatch(supabase, pendingLinks.splice(0, pendingLinks.length));

  const status = summary.errors ? "completed_with_errors" : "completed";
  await updateBatch(supabase, batch.id, {
    status,
    completed_at: new Date().toISOString(),
    total_rows_discovered: summary.rowsDiscovered,
    total_rows_staged: summary.rowsStaged,
    total_records_imported: summary.imported,
    duplicates_merged: summary.duplicatesMerged,
    errors_count: summary.errors,
    summary,
  });
  console.log(JSON.stringify({ batchId: batch.id, status, summary }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
