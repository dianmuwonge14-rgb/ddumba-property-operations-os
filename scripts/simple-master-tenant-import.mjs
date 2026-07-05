import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_FILE = "/Users/daddytheo/Desktop/Master file.xlsx";
const TENANT_SHEET_CANDIDATES = ["HOUSES", "TENANTS", "ROOMS"];
const REQUIRED_APPROVAL_FLAG = "--approved-clean-master-import";

const HEADER_ALIASES = {
  tenantName: ["tenant name", "tenant", "client name", "client"],
  roomNumber: ["room number", "house number", "room", "house no", "house"],
  phoneNumber: ["phone number", "phone", "telephone", "mobile"],
  landlord: ["landlord", "landlord name", "owner"],
  location: ["location", "property", "location / property", "property/location"],
  monthlyRate: ["monthly rate", "monthly rent", "rent", "rate"],
};

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

function cellValue(value) {
  if (value && typeof value === "object") {
    if ("text" in value) return value.text;
    if ("result" in value) return value.result;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
  }
  return value;
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = normalize(value).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function headerMatch(header, aliases) {
  const normalized = key(header);
  return aliases.some((alias) => normalized === key(alias));
}

function detectMapping(headers) {
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = headers.findIndex((header) => headerMatch(header, aliases));
    mapping[field] = index >= 0 ? index : -1;
  }
  return mapping;
}

function officeMatch(location, offices) {
  const locationKey = key(location);
  if (!locationKey) return null;
  return offices.find((office) => {
    const officeNames = [office.office_name, office.name, office.code].map(key);
    return officeNames.some((officeKey) => officeKey && (officeKey.includes(locationKey) || locationKey.includes(officeKey.replace(/office|main/g, ""))));
  }) ?? null;
}

function tenantCode(office, roomNumber, tenantName) {
  const officePrefix = key(office.office_name ?? office.name ?? "office").slice(0, 4).toUpperCase() || "OFF";
  const room = key(roomNumber).toUpperCase() || "ROOM";
  const name = key(tenantName).slice(0, 4).toUpperCase() || "TEN";
  return `${officePrefix}-${room}-${name}`;
}

async function readWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = TENANT_SHEET_CANDIDATES.map((name) => workbook.getWorksheet(name)).find(Boolean) ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("Workbook has no worksheets.");

  const headers = worksheet.getRow(1).values.slice(1).map((value) => normalize(cellValue(value)));
  const mapping = detectMapping(headers);
  const rows = [];
  const errors = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber).values.slice(1).map(cellValue);
    const hasAnyValue = row.some((value) => normalize(value));
    if (!hasAnyValue) continue;

    const normalized = {
      sourceRow: rowNumber,
      tenantName: normalize(row[mapping.tenantName]),
      roomNumber: normalize(row[mapping.roomNumber]),
      phoneNumber: normalize(row[mapping.phoneNumber]),
      landlord: normalize(row[mapping.landlord]),
      location: normalize(row[mapping.location]),
      monthlyRate: parseMoney(row[mapping.monthlyRate]),
      raw: Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? null])),
    };

    const rowErrors = [];
    if (!normalized.roomNumber) rowErrors.push("Missing room number.");
    if (!normalized.location) rowErrors.push("Missing location/property.");
    if (!normalized.landlord) rowErrors.push("Missing landlord.");
    if (!normalized.monthlyRate || normalized.monthlyRate <= 0) rowErrors.push("Missing monthly rate.");
    if (!normalized.tenantName) rowErrors.push("Missing tenant name; tenant and active lease will not be created.");

    if (rowErrors.length) {
      errors.push({ rowNumber, roomNumber: normalized.roomNumber || null, location: normalized.location || null, errors: rowErrors });
    }

    rows.push(normalized);
  }

  return { worksheetName: worksheet.name, headers, mapping, rows, errors };
}

function summarizePlan(parsed, offices) {
  const usableRoomRows = parsed.rows.filter((row) => row.roomNumber && row.location && row.landlord && row.monthlyRate && row.monthlyRate > 0);
  const tenantRows = usableRoomRows.filter((row) => row.tenantName);
  const locationCounts = new Map();
  const officeCounts = new Map();
  const landlordNames = new Set();
  const roomKeys = new Set();
  const duplicateRoomKeys = [];
  const unmappedLocations = new Map();

  for (const row of usableRoomRows) {
    locationCounts.set(row.location, (locationCounts.get(row.location) ?? 0) + 1);
    landlordNames.add(key(row.landlord));
    const office = officeMatch(row.location, offices);
    if (office) {
      officeCounts.set(office.office_name ?? office.name, (officeCounts.get(office.office_name ?? office.name) ?? 0) + 1);
      const roomKey = `${office.id}:${key(row.location)}:${key(row.roomNumber)}`;
      if (roomKeys.has(roomKey)) duplicateRoomKeys.push({ rowNumber: row.sourceRow, location: row.location, roomNumber: row.roomNumber });
      roomKeys.add(roomKey);
    } else {
      unmappedLocations.set(row.location, (unmappedLocations.get(row.location) ?? 0) + 1);
    }
  }

  return {
    sourceWorksheet: parsed.worksheetName,
    totalRows: parsed.rows.length,
    usableRoomRows: usableRoomRows.length,
    skippedRows: parsed.rows.length - usableRoomRows.length,
    tenantRowsWithNames: tenantRows.length,
    rowsMissingTenantName: usableRoomRows.length - tenantRows.length,
    uniqueLandlords: landlordNames.size,
    uniqueProperties: locationCounts.size,
    uniqueRooms: roomKeys.size,
    duplicateRoomKeys: duplicateRoomKeys.length,
    expectedCreatesOrUpdates: {
      offices: 0,
      properties: locationCounts.size,
      landlords: landlordNames.size,
      rooms: roomKeys.size,
      tenants: tenantRows.length,
      activeLeases: tenantRows.length,
      initialTenantBalances: tenantRows.reduce((total, row) => total + Number(row.monthlyRate ?? 0), 0),
      initialRoomOutstandingForOccupiedRooms: tenantRows.reduce((total, row) => total + Number(row.monthlyRate ?? 0), 0),
    },
    locationCounts: Object.fromEntries([...locationCounts.entries()].sort((a, b) => b[1] - a[1])),
    officeCounts: Object.fromEntries([...officeCounts.entries()].sort((a, b) => b[1] - a[1])),
    unmappedLocations: Object.fromEntries([...unmappedLocations.entries()].sort((a, b) => b[1] - a[1])),
    sampleRows: parsed.rows.slice(0, 10).map((row) => ({
      row: row.sourceRow,
      tenantName: row.tenantName || null,
      roomNumber: row.roomNumber,
      phoneNumber: row.phoneNumber || null,
      landlord: row.landlord,
      location: row.location,
      monthlyRate: row.monthlyRate,
      mappedOffice: officeMatch(row.location, offices)?.office_name ?? officeMatch(row.location, offices)?.name ?? null,
      importAction: row.tenantName ? "room + tenant + active lease" : "room only; tenant skipped because tenant name is blank",
    })),
    errorsPreview: parsed.errors.slice(0, 25),
    errorCount: parsed.errors.length,
  };
}

async function ensureLandlord(client, companyId, name) {
  const { data: existing, error: existingError } = await client
    .from("landlords")
    .select("*")
    .eq("company_id", companyId)
    .ilike("full_name", name)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing;
  const { data, error } = await client.from("landlords").insert({
    company_id: companyId,
    full_name: name,
    status: "active",
    trust_index: 75,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureProperty(client, companyId, office, location, landlordId) {
  const { data: existing, error: existingError } = await client
    .from("properties")
    .select("*")
    .eq("company_id", companyId)
    .eq("office_id", office.id)
    .ilike("property_name", location)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    await client.from("properties").update({
      landlord_id: existing.landlord_id ?? landlordId,
      status: "active",
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return existing;
  }
  const code = `${key(office.office_name ?? office.name).slice(0, 4).toUpperCase()}-${key(location).slice(0, 8).toUpperCase()}`;
  const { data, error } = await client.from("properties").insert({
    code,
    company_id: companyId,
    expected_collection: 0,
    landlord_id: landlordId,
    name: location,
    office_id: office.id,
    property_code: code,
    property_name: location,
    property_type: "residential_rental",
    status: "active",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureRoom(client, companyId, office, property, landlordId, row, status) {
  const { data: existing, error: existingError } = await client
    .from("rooms")
    .select("*")
    .eq("company_id", companyId)
    .eq("office_id", office.id)
    .eq("property_id", property.id)
    .ilike("room_number", row.roomNumber)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const payload = {
    landlord_id: landlordId,
    monthly_rent: row.monthlyRate,
    outstanding_balance: status === "occupied" ? row.monthlyRate : 0,
    status,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { data, error } = await client.from("rooms").update(payload).eq("id", existing.id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await client.from("rooms").insert({
    ...payload,
    company_id: companyId,
    office_id: office.id,
    property_id: property.id,
    room_number: row.roomNumber,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureTenantAndLease(client, companyId, office, property, room, row) {
  const { data: existing, error: existingError } = row.phoneNumber
    ? await client.from("tenants").select("*").eq("company_id", companyId).eq("phone", row.phoneNumber).limit(1).maybeSingle()
    : await client.from("tenants").select("*").eq("company_id", companyId).eq("room_id", room.id).ilike("full_name", row.tenantName).limit(1).maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const tenantPayload = {
    balance: row.monthlyRate,
    company_id: companyId,
    full_name: row.tenantName,
    monthly_rent: row.monthlyRate,
    office_id: office.id,
    phone: row.phoneNumber || null,
    property_id: property.id,
    reliability_score: 70,
    risk_score: 30,
    room_id: room.id,
    status: "active",
    tenant_code: tenantCode(office, row.roomNumber, row.tenantName),
    tenant_reliability_score: 70,
    tenant_risk_level: "Medium Risk",
    tenant_score_reason: "Initial clean master import. No payment history recorded yet.",
    tenant_score_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const tenant = existing
    ? (await client.from("tenants").update(tenantPayload).eq("id", existing.id).select("*").single()).data
    : (await client.from("tenants").insert(tenantPayload).select("*").single()).data;

  if (!tenant) throw new Error(`Could not create tenant for row ${row.sourceRow}.`);

  const { data: existingLease, error: leaseLookupError } = await client
    .from("leases")
    .select("*")
    .eq("company_id", companyId)
    .eq("tenant_id", tenant.id)
    .eq("room_id", room.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (leaseLookupError) throw new Error(leaseLookupError.message);

  if (existingLease) {
    const { error } = await client.from("leases").update({
      monthly_rent: row.monthlyRate,
      office_id: office.id,
      property_id: property.id,
      updated_at: new Date().toISOString(),
    }).eq("id", existingLease.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from("leases").insert({
      billing_day: 1,
      company_id: companyId,
      deposit_amount: 0,
      monthly_rent: row.monthlyRate,
      office_id: office.id,
      property_id: property.id,
      room_id: room.id,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
      tenant_id: tenant.id,
    });
    if (error) throw new Error(error.message);
  }

  return tenant;
}

async function writeImport(client, parsed, offices, companyId) {
  const usableRows = parsed.rows.filter((row) => row.roomNumber && row.location && row.landlord && row.monthlyRate && row.monthlyRate > 0);
  const stats = { landlords: 0, properties: 0, rooms: 0, tenants: 0, activeLeases: 0, skippedRows: 0, errors: [] };
  const landlordCache = new Map();
  const propertyCache = new Map();

  for (const row of usableRows) {
    try {
      const office = officeMatch(row.location, offices);
      if (!office) {
        stats.skippedRows += 1;
        stats.errors.push({ row: row.sourceRow, error: `No office matches location ${row.location}.` });
        continue;
      }

      const landlordKey = `${companyId}:${key(row.landlord)}`;
      let landlord = landlordCache.get(landlordKey);
      if (!landlord) {
        landlord = await ensureLandlord(client, companyId, row.landlord);
        landlordCache.set(landlordKey, landlord);
        stats.landlords += 1;
      }

      const propertyKey = `${office.id}:${key(row.location)}`;
      let property = propertyCache.get(propertyKey);
      if (!property) {
        property = await ensureProperty(client, companyId, office, row.location, landlord.id);
        propertyCache.set(propertyKey, property);
        stats.properties += 1;
      }

      const room = await ensureRoom(client, companyId, office, property, landlord.id, row, row.tenantName ? "occupied" : "vacant");
      stats.rooms += 1;

      if (!row.tenantName) {
        stats.skippedRows += 1;
        continue;
      }

      await ensureTenantAndLease(client, companyId, office, property, room, row);
      stats.tenants += 1;
      stats.activeLeases += 1;
    } catch (error) {
      stats.errors.push({ row: row.sourceRow, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArgIndex = args.indexOf("--file");
  const file = fileArgIndex >= 0 ? args[fileArgIndex + 1] : DEFAULT_FILE;
  const write = args.includes("--write");
  const approved = args.includes(REQUIRED_APPROVAL_FLAG);

  if (!fs.existsSync(file)) throw new Error(`Workbook not found: ${file}`);
  if (write && !approved) throw new Error(`Write mode requires ${REQUIRED_APPROVAL_FLAG}.`);

  const client = supabase();
  const [{ data: company, error: companyError }, { data: offices, error: officesError }] = await Promise.all([
    client.from("companies").select("*").limit(1).single(),
    client.from("offices").select("*").neq("status", "archived").order("office_name"),
  ]);
  if (companyError) throw new Error(companyError.message);
  if (officesError) throw new Error(officesError.message);

  const parsed = await readWorkbook(file);
  const plan = summarizePlan(parsed, offices ?? []);

  const output = {
    mode: write ? "write" : "dry-run",
    file,
    company: company?.name ?? company?.id ?? null,
    mappedColumns: {
      tenantName: parsed.headers[parsed.mapping.tenantName] ?? null,
      roomNumber: parsed.headers[parsed.mapping.roomNumber] ?? null,
      phoneNumber: parsed.headers[parsed.mapping.phoneNumber] ?? null,
      landlord: parsed.headers[parsed.mapping.landlord] ?? null,
      location: parsed.headers[parsed.mapping.location] ?? null,
      monthlyRate: parsed.headers[parsed.mapping.monthlyRate] ?? null,
    },
    plan,
    writeResult: null,
    approvalRequired: write ? false : `Reply with approval before running: node scripts/simple-master-tenant-import.mjs --write ${REQUIRED_APPROVAL_FLAG}`,
  };

  if (write) {
    output.writeResult = await writeImport(client, parsed, offices ?? [], company.id);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
