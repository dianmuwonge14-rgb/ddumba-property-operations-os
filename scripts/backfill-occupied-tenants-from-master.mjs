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
  const number = Number(normalize(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizePhone(value) {
  const phone = normalize(value).replace(/[^\d+]/g, "");
  return phone || null;
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
  for (let i = 0; i < rows.length; i += size) output.push(rows.slice(i, i + size));
  return output;
}

async function readWorkbookRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const worksheet = workbook.getWorksheet("HOUSES") ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found.");
  const rows = [];
  const seen = new Set();
  const duplicateRows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values;
    const tenantName = normalize(values[1]);
    const roomNumber = normalize(values[2]);
    const phone = normalizePhone(values[3]);
    const landlord = normalize(values[4]);
    const location = normalize(values[5]);
    const monthlyRent = parseMoney(values[6]);
    if (!roomNumber || !landlord || !location || !monthlyRent) continue;
    const sourceKey = `${key(location)}:${key(roomNumber)}`;
    if (seen.has(sourceKey)) {
      duplicateRows.push({ rowNumber, tenantName, roomNumber, phone, landlord, location, monthlyRent });
      continue;
    }
    seen.add(sourceKey);
    rows.push({ rowNumber, tenantName, roomNumber, phone, landlord, location, monthlyRent });
  }
  return { rows, duplicateRows };
}

async function main() {
  const client = supabase();
  const { rows: workbookRows, duplicateRows } = await readWorkbookRows();
  const [companyResult, offices, properties, rooms, tenants, leases, collections] = await Promise.all([
    client.from("companies").select("id,name").limit(1).single(),
    fetchAll(client, "offices", "id,office_name,name,code"),
    fetchAll(client, "properties", "id,office_id,property_name,name"),
    fetchAll(client, "rooms", "id,company_id,office_id,property_id,room_number,monthly_rent,landlord_id,status,outstanding_balance"),
    fetchAll(client, "tenants", "id,company_id,office_id,property_id,room_id,full_name,phone,monthly_rent,balance,status,tenant_code"),
    fetchAll(client, "leases", "id,company_id,office_id,property_id,room_id,tenant_id,monthly_rent,status"),
    fetchAll(client, "collections", "id,room_id,tenant_id,amount,amount_paid"),
  ]);
  if (companyResult.error) throw new Error(companyResult.error.message);
  const company = companyResult.data;
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const workbookByLocationRoom = new Map(workbookRows.map((row) => [`${key(row.location)}:${key(row.roomNumber)}`, row]));
  const duplicateByLocationRoom = new Map(duplicateRows.map((row) => [`${key(row.location)}:${key(row.roomNumber)}`, row]));
  const tenantByRoomId = new Map(tenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id, tenant]));
  const activeLeaseByRoomId = new Map(leases.filter((lease) => lease.status === "active").map((lease) => [lease.room_id, lease]));
  const paidByRoomId = new Map();
  for (const collection of collections) {
    if (!collection.room_id) continue;
    paidByRoomId.set(collection.room_id, (paidByRoomId.get(collection.room_id) ?? 0) + Number(collection.amount_paid ?? collection.amount ?? 0));
  }

  const targetRooms = rooms.filter((room) => room.company_id === company.id && room.office_id && room.property_id && Number(room.monthly_rent ?? 0) > 0);
  const tenantInserts = [];
  const tenantUpdates = [];
  const roomUpdates = [];
  const leaseInserts = [];
  const auditRows = [];
  const missingPhoneRooms = [];

  for (const room of targetRooms) {
    const property = propertyById.get(room.property_id);
    const workbookRow = workbookByLocationRoom.get(`${key(property?.property_name ?? property?.name)}:${key(room.room_number)}`)
      ?? (room.room_number === "E201-2" ? duplicateByLocationRoom.get(`${key(property?.property_name ?? property?.name)}:${key("E201")}`) : null);
    const fullName = workbookRow?.tenantName || "Unnamed Tenant";
    const phone = workbookRow?.phone ?? null;
    const monthlyRent = Number(workbookRow?.monthlyRent ?? room.monthly_rent ?? 0);
    const balance = Math.max(0, monthlyRent - (paidByRoomId.get(room.id) ?? 0));
    if (!phone) missingPhoneRooms.push({ room: room.room_number, officeId: room.office_id, propertyId: room.property_id });

    const existingTenant = tenantByRoomId.get(room.id);
    if (!existingTenant) {
      tenantInserts.push({
        balance,
        company_id: company.id,
        full_name: fullName,
        monthly_rent: monthlyRent,
        office_id: room.office_id,
        phone,
        property_id: room.property_id,
        reliability_score: 75,
        risk_score: 25,
        room_id: room.id,
        status: "active",
        tenant_code: `T-${normalize(room.room_number).replace(/\s+/g, "")}`,
        tenant_reliability_score: 75,
        tenant_risk_level: "Low Risk",
        tenant_score_reason: "Initial tenant setup from master workbook occupancy backfill.",
        tenant_score_updated_at: new Date().toISOString(),
        tenant_type: "residential",
      });
    } else {
      tenantUpdates.push({
        id: existingTenant.id,
        before: existingTenant,
        update: {
          balance,
          full_name: existingTenant.full_name || fullName,
          monthly_rent: monthlyRent,
          office_id: room.office_id,
          phone: existingTenant.phone || phone,
          property_id: room.property_id,
          room_id: room.id,
          status: "active",
        },
      });
    }

    if (room.status !== "occupied" || Number(room.monthly_rent ?? 0) !== monthlyRent || Number(room.outstanding_balance ?? 0) !== balance) {
      roomUpdates.push({
        id: room.id,
        before: room,
        update: {
          monthly_rent: monthlyRent,
          outstanding_balance: balance,
          status: "occupied",
        },
      });
    }
  }

  if (!DRY_RUN) {
    const insertedTenants = [];
    for (const batch of chunk(tenantInserts)) {
      const { data, error } = await client.from("tenants").insert(batch).select("*");
      if (error) throw new Error(`tenants insert: ${error.message}`);
      insertedTenants.push(...(data ?? []));
    }
    for (const item of tenantUpdates) {
      const { error } = await client.from("tenants").update(item.update).eq("id", item.id);
      if (error) throw new Error(`tenant update ${item.id}: ${error.message}`);
    }
    for (const item of roomUpdates) {
      const { error } = await client.from("rooms").update(item.update).eq("id", item.id);
      if (error) throw new Error(`room update ${item.id}: ${error.message}`);
    }

    const allTenants = [...tenants, ...insertedTenants].map((tenant) => {
      const update = tenantUpdates.find((item) => item.id === tenant.id)?.update;
      return update ? { ...tenant, ...update } : tenant;
    });
    const tenantByRoom = new Map(allTenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id, tenant]));
    for (const room of targetRooms) {
      if (activeLeaseByRoomId.has(room.id)) continue;
      const tenant = tenantByRoom.get(room.id);
      if (!tenant) continue;
      leaseInserts.push({
        billing_day: 1,
        company_id: company.id,
        deposit_amount: 0,
        monthly_rent: Number(tenant.monthly_rent ?? room.monthly_rent ?? 0),
        office_id: room.office_id,
        property_id: room.property_id,
        room_id: room.id,
        start_date: new Date().toISOString().slice(0, 10),
        status: "active",
        tenant_id: tenant.id,
      });
    }
    for (const batch of chunk(leaseInserts)) {
      const { error } = await client.from("leases").insert(batch);
      if (error) throw new Error(`leases insert: ${error.message}`);
    }

    auditRows.push(...insertedTenants.map((tenant) => ({
      action: "excel_room_occupancy_tenant_created",
      after_data: tenant,
      company_id: company.id,
      entity_id: tenant.id,
      entity_type: "tenant",
      office_id: tenant.office_id,
    })));
    auditRows.push(...tenantUpdates.map((item) => ({
      action: "excel_room_occupancy_tenant_updated",
      before_data: item.before,
      after_data: item.update,
      company_id: company.id,
      entity_id: item.id,
      entity_type: "tenant",
      office_id: item.update.office_id,
    })));
    auditRows.push(...roomUpdates.map((item) => ({
      action: "excel_room_marked_occupied",
      before_data: item.before,
      after_data: item.update,
      company_id: company.id,
      entity_id: item.id,
      entity_type: "room",
      office_id: item.before.office_id,
    })));
    if (auditRows.length) {
      for (const batch of chunk(auditRows)) {
        const { error } = await client.from("audit_logs").insert(batch);
        if (error) throw new Error(`audit_logs: ${error.message}`);
      }
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    targetRooms: targetRooms.length,
    existingTenants: tenants.length,
    existingActiveLeases: activeLeaseByRoomId.size,
    tenantInserts: tenantInserts.length,
    tenantUpdates: tenantUpdates.length,
    roomUpdates: roomUpdates.length,
    leaseInserts: leaseInserts.length,
    unnamedTenantsCreatedOrEnsured: tenantInserts.filter((tenant) => tenant.full_name === "Unnamed Tenant").length + tenantUpdates.filter((item) => item.update.full_name === "Unnamed Tenant").length,
    phoneNumbersAttached: tenantInserts.filter((tenant) => tenant.phone).length + tenantUpdates.filter((item) => item.update.phone).length,
    missingPhoneRooms: missingPhoneRooms.length,
    sampleMissingPhoneRooms: missingPhoneRooms.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
