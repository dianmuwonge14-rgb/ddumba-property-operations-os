import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const FILE = "/Users/daddytheo/Desktop/Master file.xlsx";
const CHUNK_SIZE = 250;

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

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = normalize(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function officeMatch(location, offices) {
  const locationKey = key(location);
  return offices.find((office) => {
    const names = [office.office_name, office.name, office.code].map(key);
    return names.some((officeKey) => officeKey && (officeKey.includes(locationKey) || locationKey.includes(officeKey.replace(/office|main/g, ""))));
  }) ?? null;
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

function chunks(rows) {
  const output = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) output.push(rows.slice(i, i + CHUNK_SIZE));
  return output;
}

async function readRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const ws = workbook.getWorksheet("HOUSES");
  if (!ws) throw new Error("Sheet HOUSES not found.");

  const rows = [];
  const errors = [];
  const seen = new Set();
  let duplicates = 0;

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber += 1) {
    const v = ws.getRow(rowNumber).values;
    const tenantName = normalize(v[1]);
    const roomNumber = normalize(v[2]);
    const phoneNumber = normalize(v[3]);
    const landlord = normalize(v[4]);
    const location = normalize(v[5]);
    const monthlyRate = parseMoney(v[6]);

    if (!tenantName && !roomNumber && !phoneNumber && !landlord && !location && !monthlyRate) continue;

    if (!roomNumber || !landlord || !location || !monthlyRate || monthlyRate <= 0) {
      errors.push({ rowNumber, roomNumber, location, landlord, monthlyRate, error: "Missing required room/landlord/location/monthly rent." });
      continue;
    }

    const rowKey = `${key(location)}:${key(roomNumber)}`;
    if (seen.has(rowKey)) {
      duplicates += 1;
      continue;
    }
    seen.add(rowKey);
    rows.push({ rowNumber, roomNumber, phoneNumber, landlord, location, monthlyRate });
  }

  return { rows, errors, duplicates };
}

async function main() {
  if (!process.argv.includes("--approved-rooms-only")) {
    throw new Error("Missing approval flag --approved-rooms-only.");
  }

  const client = supabase();
  const parsed = await readRows();
  const [{ data: company, error: companyError }, offices] = await Promise.all([
    client.from("companies").select("*").limit(1).single(),
    fetchAll(client, "offices", "id,company_id,office_name,name,code,status"),
  ]);
  if (companyError) throw new Error(companyError.message);

  const rows = parsed.rows.map((row) => ({ ...row, office: officeMatch(row.location, offices) })).filter((row) => row.office);
  const skippedNoOffice = parsed.rows.length - rows.length;

  let landlords = await fetchAll(client, "landlords", "id,company_id,full_name");
  const landlordByKey = new Map(landlords.map((landlord) => [`${landlord.company_id}:${key(landlord.full_name)}`, landlord]));
  const landlordPayloads = [];
  for (const row of rows) {
    const landlordKey = `${company.id}:${key(row.landlord)}`;
    if (landlordByKey.has(landlordKey)) continue;
    landlordByKey.set(landlordKey, { pending: true });
    landlordPayloads.push({ company_id: company.id, full_name: row.landlord, status: "active", trust_index: 75 });
  }
  for (const batch of chunks(landlordPayloads)) {
    const { error } = await client.from("landlords").insert(batch);
    if (error) throw new Error(`landlords: ${error.message}`);
  }
  landlords = await fetchAll(client, "landlords", "id,company_id,full_name");
  landlordByKey.clear();
  for (const landlord of landlords) landlordByKey.set(`${landlord.company_id}:${key(landlord.full_name)}`, landlord);

  let properties = await fetchAll(client, "properties", "id,company_id,office_id,property_name,name");
  const propertyByKey = new Map(properties.map((property) => [`${property.office_id}:${key(property.property_name ?? property.name)}`, property]));
  const propertyPayloads = [];
  for (const row of rows) {
    const propertyKey = `${row.office.id}:${key(row.location)}`;
    if (propertyByKey.has(propertyKey)) continue;
    propertyByKey.set(propertyKey, { pending: true });
    const landlord = landlordByKey.get(`${company.id}:${key(row.landlord)}`);
    const code = `${key(row.office.office_name ?? row.office.name).slice(0, 4).toUpperCase()}-${key(row.location).slice(0, 8).toUpperCase()}`;
    propertyPayloads.push({
      code,
      company_id: company.id,
      expected_collection: 0,
      landlord_id: landlord?.id ?? null,
      name: row.location,
      office_id: row.office.id,
      property_code: code,
      property_name: row.location,
      property_type: "residential_rental",
      status: "active",
    });
  }
  for (const batch of chunks(propertyPayloads)) {
    const { error } = await client.from("properties").insert(batch);
    if (error) throw new Error(`properties: ${error.message}`);
  }
  properties = await fetchAll(client, "properties", "id,company_id,office_id,property_name,name");
  propertyByKey.clear();
  for (const property of properties) propertyByKey.set(`${property.office_id}:${key(property.property_name ?? property.name)}`, property);

  const rooms = await fetchAll(client, "rooms", "id,company_id,office_id,property_id,room_number");
  const roomByKey = new Set(rooms.map((room) => `${room.office_id}:${room.property_id}:${key(room.room_number)}`));
  const roomPayloads = [];
  for (const row of rows) {
    const property = propertyByKey.get(`${row.office.id}:${key(row.location)}`);
    const landlord = landlordByKey.get(`${company.id}:${key(row.landlord)}`);
    if (!property) continue;
    const roomKey = `${row.office.id}:${property.id}:${key(row.roomNumber)}`;
    if (roomByKey.has(roomKey)) continue;
    roomByKey.add(roomKey);
    roomPayloads.push({
      company_id: company.id,
      landlord_id: landlord?.id ?? null,
      monthly_rent: row.monthlyRate,
      office_id: row.office.id,
      outstanding_balance: 0,
      property_id: property.id,
      room_number: row.roomNumber,
      status: "vacant",
    });
  }
  for (const batch of chunks(roomPayloads)) {
    const { error } = await client.from("rooms").insert(batch);
    if (error) throw new Error(`rooms: ${error.message}`);
  }

  const finalCounts = {};
  for (const table of ["landlords", "properties", "rooms", "tenants", "leases"]) {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    finalCounts[table] = count;
  }

  console.log(JSON.stringify({
    sourceRows: parsed.rows.length,
    workbookErrors: parsed.errors.length,
    duplicateRoomsSkipped: parsed.duplicates,
    skippedNoOffice,
    inserted: {
      landlords: landlordPayloads.length,
      properties: propertyPayloads.length,
      rooms: roomPayloads.length,
      tenants: 0,
      leases: 0,
    },
    finalCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
