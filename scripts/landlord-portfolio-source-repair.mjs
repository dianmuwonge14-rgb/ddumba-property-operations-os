import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const WORKBOOK_PATH = "/Users/daddytheo/Desktop/Master file.xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

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

async function readSourceRows() {
  if (!fs.existsSync(WORKBOOK_PATH)) throw new Error(`Workbook not found: ${WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const worksheet = workbook.getWorksheet("HOUSES") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found in workbook.");

  const rows = [];
  const seen = new Set();
  const duplicates = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values;
    const roomNumber = normalize(values[2]);
    const landlord = normalize(values[4]);
    const location = normalize(values[5]);
    const monthlyRent = parseMoney(values[6]);
    if (!roomNumber || !landlord || !location || !monthlyRent) continue;
    const sourceKey = `${key(location)}:${key(roomNumber)}`;
    if (seen.has(sourceKey)) {
      duplicates.push({ rowNumber, roomNumber, landlord, location, monthlyRent });
      continue;
    }
    seen.add(sourceKey);
    rows.push({ rowNumber, roomNumber, landlord, location, monthlyRent });
  }
  return { rows, duplicates };
}

async function main() {
  const client = supabase();
  const { rows: sourceRows, duplicates } = await readSourceRows();
  const [company, offices, landlords, properties, rooms] = await Promise.all([
    client.from("companies").select("id,name").limit(1).single(),
    fetchAll(client, "offices", "id,company_id,office_name,name,code"),
    fetchAll(client, "landlords", "id,company_id,full_name"),
    fetchAll(client, "properties", "id,company_id,office_id,property_name,name"),
    fetchAll(client, "rooms", "id,company_id,office_id,property_id,room_number,landlord_id,monthly_rent"),
  ]);
  if (company.error) throw new Error(company.error.message);

  const landlordByKey = new Map(landlords.map((landlord) => [`${landlord.company_id}:${key(landlord.full_name)}`, landlord]));
  const propertyByKey = new Map(properties.map((property) => [`${property.office_id}:${key(property.property_name ?? property.name)}`, property]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const roomByKey = new Map(rooms.map((room) => {
    const property = propertyById.get(room.property_id);
    return [`${key(property?.property_name ?? property?.name)}:${key(room.room_number)}`, room];
  }));

  const missing = [];
  const unresolved = [];
  for (const source of sourceRows) {
    if (roomByKey.has(`${key(source.location)}:${key(source.roomNumber)}`)) continue;
    const office = officeMatch(source.location, offices);
    const property = office ? propertyByKey.get(`${office.id}:${key(source.location)}`) : null;
    const landlord = landlordByKey.get(`${company.data.id}:${key(source.landlord)}`);
    if (!office || !property || !landlord) {
      unresolved.push({
        ...source,
        reason: !office ? "office_not_found" : !property ? "property_not_found" : "landlord_not_found",
      });
      continue;
    }
    missing.push({ source, office, property, landlord });
  }

  const inserted = [];
  if (!DRY_RUN && missing.length) {
    const payload = missing.map(({ source, office, property, landlord }) => ({
      company_id: company.data.id,
      landlord_id: landlord.id,
      monthly_rent: source.monthlyRent,
      office_id: office.id,
      outstanding_balance: 0,
      property_id: property.id,
      room_number: source.roomNumber,
      status: "vacant",
    }));
    const { data, error } = await client.from("rooms").insert(payload).select("*");
    if (error) throw new Error(`rooms insert: ${error.message}`);
    inserted.push(...(data ?? []));

    const auditRows = inserted.map((room) => {
      const match = missing.find((item) => item.source.roomNumber === room.room_number && item.property.id === room.property_id);
      return {
        action: "landlord_portfolio_source_room_created",
        after_data: {
          room,
          source_workbook: path.basename(WORKBOOK_PATH),
          source_sheet: "HOUSES",
          source_row: match?.source.rowNumber ?? null,
          source_landlord: match?.source.landlord ?? null,
          source_location: match?.source.location ?? null,
        },
        company_id: company.data.id,
        entity_id: room.id,
        entity_type: "room",
        office_id: room.office_id,
      };
    });
    if (auditRows.length) {
      const { error } = await client.from("audit_logs").insert(auditRows);
      if (error) throw new Error(`audit_logs: ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    sourceRows: sourceRows.length,
    duplicateSourceRowsSkipped: duplicates.length,
    missingRoomsDetected: missing.length,
    insertedRooms: inserted.length,
    unresolved,
    byLandlord: missing.reduce((acc, item) => {
      const name = item.landlord.full_name;
      acc[name] ??= { rooms: 0, rent: 0 };
      acc[name].rooms += 1;
      acc[name].rent += item.source.monthlyRent;
      return acc;
    }, {}),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
