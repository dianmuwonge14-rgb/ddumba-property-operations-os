import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORKBOOK = "/Volumes/Untitled/HERITAGE 20.xlsx";
const BATCH_ID = process.argv.includes("--batch") ? process.argv[process.argv.indexOf("--batch") + 1] : null;

function loadEnvLocal() {
  const env = fs.readFileSync(".env.local", "utf8");
  const get = (key) => env.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRole: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function supabase() {
  const env = loadEnvLocal();
  return createClient(env.url, env.serviceRole, { auth: { persistSession: false } });
}

function decodeXml(value) {
  return String(value ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function stripTags(value) {
  return decodeXml(String(value ?? "").replace(/<[^>]+>/g, ""));
}

function attr(xml, name) {
  const match = xml.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function columnNumber(ref) {
  const letters = String(ref ?? "").match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let total = 0;
  for (const letter of letters) total = total * 26 + letter.charCodeAt(0) - 64;
  return total;
}

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return normalize(value).toLowerCase();
}

function money(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function excelDate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  return new Date(Math.floor(serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function monthDate(value) {
  const text = normalize(value);
  const match = text.match(/^([A-Za-z]{3,9})(\d{4})$/);
  if (!match) return null;
  const month = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 }[match[1].toLowerCase()];
  return month ? `${match[2]}-${String(month).padStart(2, "0")}-01` : null;
}

function officeName(value) {
  const text = key(value);
  if (text.includes("kigungu")) return "Kigungu Main Office";
  if (text.includes("kapeeka")) return "Kapeeka Office";
  if (text.includes("lugonjo")) return "Lugonjo Office";
  if (text.includes("kiyindi")) return "Kiyindi Office";
  if (text.includes("mbale")) return "Mbale Office";
  return null;
}

async function workbookRows(sheetName) {
  const zip = await JSZip.loadAsync(fs.readFileSync(WORKBOOK));
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const shared = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const sharedXml = await sharedFile.async("string");
    for (const match of sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)) shared.push(stripTags(match[0]));
  }
  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const target = attr(match[0], "Target");
    rels.set(attr(match[0], "Id"), target.startsWith("/") ? target.slice(1) : path.posix.normalize(`xl/${target}`));
  }
  let sheetTarget = null;
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    if (attr(match[0], "name") === sheetName) sheetTarget = rels.get(attr(match[0], "r:id"));
  }
  const xml = await zip.file(sheetTarget).async("string");
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
    const rowNumber = Number(attr(rowMatch[0], "r"));
    const values = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const cell = cellMatch[0];
      const col = columnNumber(attr(cell, "r"));
      const type = attr(cell, "t");
      const v = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      if (type === "s") values[col - 1] = shared[Number(v?.[1])] ?? null;
      else values[col - 1] = v ? (Number.isFinite(Number(decodeXml(v[1]))) ? Number(decodeXml(v[1])) : decodeXml(v[1])) : null;
    }
    rows.push({ rowNumber, values });
  }
  return rows;
}

async function insertMany(client, table, rows, select = "id", size = 500) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    if (!chunk.length) continue;
    const { data, error } = await client.from(table).insert(chunk).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    output.push(...(data ?? []));
  }
  return output;
}

async function main() {
  const client = supabase();
  const batchId = BATCH_ID ?? (await client.from("historical_import_batches").select("id").eq("status", "running").order("created_at", { ascending: false }).limit(1).single()).data.id;
  const { data: batch } = await client.from("historical_import_batches").select("*").eq("id", batchId).single();
  const { data: company } = await client.from("companies").select("*").limit(1).single();
  const [offices, properties, rooms, tenants, landlords, stagedRows] = await Promise.all([
    client.from("offices").select("*").eq("company_id", company.id),
    client.from("properties").select("*").eq("company_id", company.id),
    client.from("rooms").select("*").eq("company_id", company.id),
    client.from("tenants").select("*").eq("company_id", company.id),
    client.from("landlords").select("*").eq("company_id", company.id),
    client.from("historical_import_rows").select("id,sheet_name,row_number").eq("batch_id", batchId),
  ]);
  for (const result of [offices, properties, rooms, tenants, landlords, stagedRows]) if (result.error) throw new Error(result.error.message);
  const officeByName = new Map(offices.data.map((office) => [key(office.office_name || office.name), office]));
  const propertyByOfficeName = new Map(properties.data.map((property) => [`${property.office_id}:${key(property.property_name || property.name)}`, property]));
  const roomByOfficeNumber = new Map(rooms.data.map((room) => [`${room.office_id}:${key(room.room_number)}`, room]));
  const tenantByRoom = new Map(tenants.data.filter((tenant) => tenant.room_id && tenant.status !== "import_review").map((tenant) => [tenant.room_id, tenant]));
  const landlordByName = new Map(landlords.data.map((landlord) => [key(landlord.full_name), landlord]));
  const rowIdByKey = new Map(stagedRows.data.map((row) => [`${row.sheet_name}:${row.row_number}`, row.id]));

  const paymentRows = (await workbookRows("Tenants Payments Received")).filter(({ rowNumber, values }) => {
    return rowNumber >= 17 && normalize(values[6]) && money(values[7]) && officeName(values[11]);
  });

  const missingRooms = [];
  const missingTenants = [];
  for (const row of paymentRows) {
    const office = officeByName.get(key(officeName(row.values[11])));
    if (!office) continue;
    const roomNumber = normalize(row.values[6]);
    if (!roomByOfficeNumber.has(`${office.id}:${key(roomNumber)}`)) {
      const propertyName = normalize(row.values[11]);
      const property = propertyByOfficeName.get(`${office.id}:${key(propertyName)}`);
      missingRooms.push({
        company_id: company.id,
        office_id: office.id,
        property_id: property?.id ?? null,
        room_number: roomNumber,
        monthly_rent: money(row.values[12]),
        outstanding_balance: money(row.values[13]),
        status: "occupied",
        historical_import_batch_id: batchId,
        historical_import_row_id: rowIdByKey.get(`Tenants Payments Received:${row.rowNumber}`),
        workbook_sheet_name: "Tenants Payments Received",
        workbook_row_number: row.rowNumber,
        workbook_raw_data: { source: "payment_recovery", values: row.values },
      });
    }
  }
  const uniqueRooms = [...new Map(missingRooms.map((room) => [`${room.office_id}:${key(room.room_number)}`, room])).values()];
  if (uniqueRooms.length) {
    await insertMany(client, "rooms", uniqueRooms, "id,office_id,room_number");
    const fresh = await client.from("rooms").select("*").eq("company_id", company.id);
    roomByOfficeNumber.clear();
    for (const room of fresh.data ?? []) roomByOfficeNumber.set(`${room.office_id}:${key(room.room_number)}`, room);
  }

  for (const row of paymentRows) {
    const office = officeByName.get(key(officeName(row.values[11])));
    if (!office) continue;
    const room = roomByOfficeNumber.get(`${office.id}:${key(row.values[6])}`);
    if (!room || tenantByRoom.has(room.id)) continue;
    const tenantName = normalize(row.values[10]);
    if (!tenantName) continue;
    missingTenants.push({
      company_id: company.id,
      office_id: office.id,
      property_id: room.property_id,
      room_id: room.id,
      full_name: tenantName,
      monthly_rent: money(row.values[12]),
      balance: money(row.values[13]),
      reliability_score: 75,
      risk_score: 25,
      tenant_reliability_score: 75,
      tenant_risk_level: "Low Risk",
      tenant_score_reason: "Historical tenant imported from payments received workbook sheet.",
      tenant_score_updated_at: new Date().toISOString(),
      status: "active",
      tenant_type: "individual",
      historical_import_batch_id: batchId,
      historical_import_row_id: rowIdByKey.get(`Tenants Payments Received:${row.rowNumber}`),
      workbook_sheet_name: "Tenants Payments Received",
      workbook_row_number: row.rowNumber,
      workbook_raw_data: { source: "payment_recovery", values: row.values },
    });
  }
  const uniqueTenants = [...new Map(missingTenants.map((tenant) => [tenant.room_id, tenant])).values()];
  if (uniqueTenants.length) {
    await insertMany(client, "tenants", uniqueTenants, "id,room_id");
    const fresh = await client.from("tenants").select("*").eq("company_id", company.id);
    tenantByRoom.clear();
    for (const tenant of fresh.data ?? []) if (tenant.room_id && tenant.status !== "import_review") tenantByRoom.set(tenant.room_id, tenant);
  }

  const collections = [];
  for (const row of paymentRows) {
    const office = officeByName.get(key(officeName(row.values[11])));
    if (!office) continue;
    const room = roomByOfficeNumber.get(`${office.id}:${key(row.values[6])}`);
    const tenant = room ? tenantByRoom.get(room.id) : null;
    const property = room?.property_id ? properties.data.find((item) => item.id === room.property_id) : null;
    const rowId = rowIdByKey.get(`Tenants Payments Received:${row.rowNumber}`);
    const amount = money(row.values[7]);
    if (!room || !amount || !rowId) continue;
    collections.push({
      company_id: company.id,
      office_id: office.id,
      property_id: property?.id ?? null,
      room_id: room.id,
      tenant_id: tenant?.id ?? null,
      amount,
      amount_paid: amount,
      expected_amount: money(row.values[12]),
      balance: money(row.values[13]),
      paid_at: monthDate(row.values[4]) ? `${monthDate(row.values[4])}T12:00:00.000Z` : null,
      status: "posted",
      type: "historical_excel_import",
      payment_method: "historical_excel",
      reference_number: `HERITAGE-PAY-${row.rowNumber}`,
      notes: `Historical payment import for ${normalize(row.values[10]) || "tenant"} / ${normalize(row.values[6])}`,
      historical_import_batch_id: batchId,
      historical_import_row_id: rowId,
      workbook_sheet_name: "Tenants Payments Received",
      workbook_row_number: row.rowNumber,
      workbook_raw_data: { source: "payment_recovery", values: row.values },
      workbook_month: normalize(row.values[4]) || null,
      workbook_payment_date: monthDate(row.values[4]),
      commission_percent: money(row.values[16]) && amount ? money(row.values[16]) / amount : null,
      total_collection: money(row.values[14]),
    });
  }
  const insertedCollections = await insertMany(client, "collections", collections, "id,historical_import_row_id", 500);

  const links = [];
  for (const table of ["properties", "rooms", "tenants", "landlords", "expenses", "collections"]) {
    const { data, error } = await client.from(table).select("id,historical_import_row_id,company_id").eq("historical_import_batch_id", batchId).not("historical_import_row_id", "is", null);
    if (error) throw new Error(error.message);
    for (const record of data ?? []) {
      links.push({ batch_id: batchId, row_id: record.historical_import_row_id, company_id: record.company_id ?? company.id, target_table: table, target_id: record.id, action: "inserted" });
    }
  }
  await insertMany(client, "historical_import_record_links", links, "id", 1000);

  const counts = {};
  for (const table of ["properties", "rooms", "tenants", "landlords", "collections", "expenses", "landlord_payments", "office_daily_reports"]) {
    const result = await client.from(table).select("id", { count: "exact", head: true }).eq("historical_import_batch_id", batchId);
    counts[table] = result.count ?? 0;
  }
  const staged = await client.from("historical_import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  const linkCount = await client.from("historical_import_record_links").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  const summary = {
    ...(batch.summary ?? {}),
    recovered: true,
    paymentRowsDiscovered: paymentRows.length,
    paymentCollectionsImported: insertedCollections.length,
    rowsStaged: staged.count ?? 0,
    linksCreated: linkCount.count ?? links.length,
    inserted: counts,
  };
  await client.from("historical_import_batches").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    total_rows_staged: staged.count ?? 0,
    total_records_imported: (counts.properties + counts.rooms + counts.tenants + counts.landlords + counts.collections + counts.expenses + counts.landlord_payments + counts.office_daily_reports),
    duplicates_merged: 0,
    errors_count: 0,
    summary,
  }).eq("id", batchId);
  console.log(JSON.stringify({ batchId, summary }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
