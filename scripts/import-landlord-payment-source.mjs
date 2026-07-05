import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PAYMENTS_WORKBOOK = "/Users/daddytheo/Desktop/LANDLORD PAYMENTS.xlsx";
const DEFAULT_CUT_WORKBOOK = "/Users/daddytheo/Desktop/LANDLORD'S CUT.xlsx";
const PAYMENTS_WORKBOOK_PATH = process.env.PAYMENTS_WORKBOOK_PATH || DEFAULT_PAYMENTS_WORKBOOK;
const CUT_WORKBOOK_PATH = process.env.LANDLORD_CUT_WORKBOOK_PATH || DEFAULT_CUT_WORKBOOK;
const TARGET_NAMES = new Set([
  "salongo",
  "tumwete robert",
  "alinaitwe nichols",
  "alinaitwe nicholas",
  "noah bayise",
  "matia 2",
]);
const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
const APPLY_ALL_MATCHED = process.argv.includes("--all");
const SETTLEMENT_MONTH = process.env.SETTLEMENT_MONTH || "2026-06-01";
const SOURCE_TABLE = "landlord_payment_source_records";

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

function normalizedName(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function compactKey(value) {
  return normalizedName(value).replace(/\s+/g, "");
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const cleaned = normalize(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function parseMarker(value) {
  const marker = normalize(value).toUpperCase();
  if (marker.includes("JUNE")) return "JUNE";
  if (marker.includes("MAY")) return "MAY";
  return marker || null;
}

function cell(row, index) {
  return row.getCell(index).value;
}

function hasLikelyHeaders(values) {
  const text = values.map(normalize).join(" ").toLowerCase();
  return text.includes("landlord") || text.includes("amount") || text.includes("net") || text.includes("paid");
}

async function readPaymentsWorkbook() {
  if (!fs.existsSync(PAYMENTS_WORKBOOK_PATH)) throw new Error(`Workbook not found: ${PAYMENTS_WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(PAYMENTS_WORKBOOK_PATH);
  const rows = [];
  for (const worksheet of workbook.worksheets) {
    let headerRowNumber = 1;
    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i += 1) {
      const values = worksheet.getRow(i).values.slice(1);
      if (hasLikelyHeaders(values)) {
        headerRowNumber = i;
        break;
      }
    }
    const headers = [];
    worksheet.getRow(headerRowNumber).eachCell({ includeEmpty: true }, (headerCell, colNumber) => {
      headers.push([normalizedName(headerCell.value), colNumber]);
    });
    const headerMap = new Map(headers.filter(([header]) => Boolean(header)));
    const findHeader = (...needles) => {
      for (const [header, index] of headerMap.entries()) {
        if (needles.some((needle) => header.includes(needle))) return index;
      }
      return null;
    };
    const landlordCol = findHeader("landlord", "names", "name") ?? 1;
    const grossCol = findHeader("gross", "portfolio", "rent roll") ?? 2;
    const netCol = findHeader("net", "payable", "amount") ?? 3;
    const markerCol = findHeader("paid", "month", "cleared") ?? 4;
    const officeCol = findHeader("office", "location", "branch");
    const commissionCol = findHeader("commission");

    for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const landlordName = normalize(cell(row, landlordCol));
      if (!landlordName) continue;
      const marker = parseMarker(cell(row, markerCol));
      const office = officeCol ? normalize(cell(row, officeCol)) : "";
      if (!marker) continue;
      rows.push({
        sourceFileName: path.basename(PAYMENTS_WORKBOOK_PATH),
        sourceSheetName: worksheet.name,
        sourceRowNumber: rowNumber,
        landlordName,
        normalizedLandlordName: normalizedName(landlordName),
        office,
        paidMarker: marker,
      });
    }
  }
  return rows;
}

async function readCutWorkbook() {
  if (!fs.existsSync(CUT_WORKBOOK_PATH)) throw new Error(`Workbook not found: ${CUT_WORKBOOK_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(CUT_WORKBOOK_PATH);
  const rows = [];
  for (const worksheet of workbook.worksheets) {
    let headerRowNumber = 1;
    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i += 1) {
      const values = worksheet.getRow(i).values.slice(1);
      if (hasLikelyHeaders(values)) {
        headerRowNumber = i;
        break;
      }
    }
    const headers = [];
    worksheet.getRow(headerRowNumber).eachCell({ includeEmpty: true }, (headerCell, colNumber) => {
      headers.push([normalizedName(headerCell.value), colNumber]);
    });
    const headerMap = new Map(headers.filter(([header]) => Boolean(header)));
    const findHeader = (...needles) => {
      for (const [header, index] of headerMap.entries()) {
        if (needles.some((needle) => header.includes(needle))) return index;
      }
      return null;
    };
    const landlordCol = findHeader("landlord", "names", "name") ?? 2;
    const netCol = findHeader("payment", "payable", "after commission", "amount") ?? 3;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const landlordName = normalize(cell(row, landlordCol));
      const net = parseMoney(cell(row, netCol));
      if (!landlordName || !net) continue;
      rows.push({
        sourceFileName: path.basename(CUT_WORKBOOK_PATH),
        sourceSheetName: worksheet.name,
        sourceRowNumber: rowNumber,
        landlordName,
        normalizedLandlordName: normalizedName(landlordName),
        landlordNetPayable: net,
      });
    }
  }
  return rows;
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

function nameCandidates(name) {
  const normalized = normalizedName(name);
  const candidates = new Set([normalized]);
  if (normalized.includes("bayise noah")) candidates.add("noah bayise");
  if (normalized.includes("bayiise noah")) candidates.add("noah bayise");
  if (normalized.includes("noah bayise")) candidates.add("bayise noah");
  if (normalized.includes("alinaitwe nichols")) candidates.add("alinaitwe nicholas");
  if (normalized.includes("alinaitwe nicholas")) candidates.add("alinaitwe nichols");
  return [...candidates];
}

function matchLandlord(source, landlords) {
  const sourceKeys = nameCandidates(source.normalizedLandlordName).map(compactKey);
  const exact = landlords.filter((landlord) => sourceKeys.includes(compactKey(landlord.full_name)));
  if (exact.length === 1) return { status: "matched", landlord: exact[0], candidates: exact };
  if (exact.length > 1) return { status: "ambiguous", landlord: null, candidates: exact };
  const contains = landlords.filter((landlord) => {
    const key = compactKey(landlord.full_name);
    return sourceKeys.some((sourceKey) => key.includes(sourceKey) || sourceKey.includes(key));
  });
  if (contains.length === 1) return { status: "matched", landlord: contains[0], candidates: contains };
  return { status: contains.length ? "ambiguous" : "unmatched", landlord: null, candidates: contains };
}

function calcFromSource(source, landlord, liveRoomGross = 0) {
  const rateFromLandlord = Number(landlord.commission_rate ?? 0);
  const rateFromRooms = liveRoomGross > 0 && source.landlordNetPayable > 0
    ? Number((((liveRoomGross - source.landlordNetPayable) / liveRoomGross) * 100).toFixed(4))
    : 0;
  const commissionPercentage = rateFromLandlord > 0 ? rateFromLandlord : rateFromRooms;
  let gross = commissionPercentage > 0
    ? Math.round(source.landlordNetPayable / (1 - commissionPercentage / 100))
    : liveRoomGross || source.landlordNetPayable;
  if (liveRoomGross > 0 && Math.abs(gross - liveRoomGross) <= 2) {
    gross = liveRoomGross;
  }
  const net = source.landlordNetPayable;
  const commissionAmount = Math.max(0, gross - net);
  const status = source.paidMarker === "JUNE" ? "paid" : "unpaid";
  const paid = status === "paid" ? net : 0;
  const outstanding = status === "paid" ? 0 : net;
  return { gross, net, commissionAmount, commissionPercentage, status, paid, outstanding };
}

async function ensureSourceTable(client) {
  const { error } = await client.from(SOURCE_TABLE).select("id").limit(1);
  if (!error) return true;
  return false;
}

async function main() {
  const client = supabase();
  const [paymentRows, cutRows, companyResult, landlords, payables, rooms] = await Promise.all([
    readPaymentsWorkbook(),
    readCutWorkbook(),
    client.from("companies").select("id,name").limit(1).single(),
    fetchAll(client, "landlords", "id,company_id,full_name,commission_rate,commission_calculation_mode"),
    fetchAll(client, "landlord_monthly_payables", "id,company_id,office_id,landlord_id,settlement_month,full_rent_roll,commission_percentage,commission_amount,net_payable,amount_paid,unpaid_balance,status,reasons_notes"),
    fetchAll(client, "rooms", "id,landlord_id,monthly_rent,status"),
  ]);
  if (companyResult.error) throw new Error(companyResult.error.message);
  const companyId = companyResult.data.id;
  const paymentByKey = new Map(paymentRows.flatMap((row) => nameCandidates(row.landlordName).map((name) => [compactKey(name), row])));
  const sourceRows = cutRows.map((cut) => ({
    ...cut,
    office: paymentByKey.get(compactKey(cut.landlordName))?.office ?? "",
    paidMarker: paymentByKey.get(compactKey(cut.landlordName))?.paidMarker ?? null,
    markerSourceFileName: paymentByKey.get(compactKey(cut.landlordName))?.sourceFileName ?? null,
    markerSourceRowNumber: paymentByKey.get(compactKey(cut.landlordName))?.sourceRowNumber ?? null,
  }));
  const sourceByKey = new Map(sourceRows.flatMap((row) => nameCandidates(row.landlordName).map((name) => [compactKey(name), row])));
  const targetSourceRows = [...new Set([...TARGET_NAMES].map((name) => sourceByKey.get(compactKey(name))).filter(Boolean))];
  const payableByLandlord = new Map(
    payables
      .filter((row) => row.settlement_month === SETTLEMENT_MONTH)
      .map((row) => [row.landlord_id, row]),
  );
  const roomGrossByLandlord = new Map();
  for (const room of rooms) {
    if (!room.landlord_id) continue;
    roomGrossByLandlord.set(room.landlord_id, (roomGrossByLandlord.get(room.landlord_id) ?? 0) + Number(room.monthly_rent ?? 0));
  }

  const comparisons = [];
  const matchedSourceRecords = [];
  const unmatched = [];
  const ambiguous = [];

  for (const source of sourceRows) {
    const match = matchLandlord(source, landlords);
    if (match.status === "matched") {
      matchedSourceRecords.push({ source, landlord: match.landlord });
    } else if (match.status === "ambiguous") {
      ambiguous.push({ source, candidates: match.candidates.map((candidate) => candidate.full_name) });
    } else {
      unmatched.push(source);
    }
  }

  for (const source of targetSourceRows) {
    const match = matchLandlord(source, landlords);
    const current = match.landlord ? payableByLandlord.get(match.landlord.id) : null;
    const liveRoomGross = match.landlord ? roomGrossByLandlord.get(match.landlord.id) ?? 0 : 0;
    const corrected = match.landlord ? calcFromSource(source, match.landlord, liveRoomGross) : null;
    comparisons.push({
      landlord: source.landlordName,
      matchStatus: match.status,
      matchedSupabaseName: match.landlord?.full_name ?? null,
      sourceRow: source.sourceRowNumber,
      sourceSheet: source.sourceSheetName,
      currentSupabaseGross: Number(current?.full_rent_roll ?? 0),
      sourceDerivedGross: corrected?.gross ?? null,
      liveRoomGross,
      difference: (corrected?.gross ?? 0) - Number(current?.full_rent_roll ?? 0),
      currentNetPayable: Number(current?.net_payable ?? 0),
      correctedNetPayable: corrected?.net ?? null,
      currentStatus: current?.status ?? null,
      correctedStatus: corrected?.status ?? null,
      correctedPaid: corrected?.paid ?? null,
      correctedOutstanding: corrected?.outstanding ?? null,
    });
  }

  const sourceTableExists = await ensureSourceTable(client);

  const result = {
    dryRun: DRY_RUN || !APPLY,
    sourceTableExists,
    paymentMarkerSourceFile: path.basename(PAYMENTS_WORKBOOK_PATH),
    payableSourceFile: path.basename(CUT_WORKBOOK_PATH),
    sourceRows: sourceRows.length,
    matchedRows: matchedSourceRecords.length,
    unmatchedRows: unmatched.length,
    ambiguousRows: ambiguous.length,
    targetComparisons: comparisons,
  };

  if (!APPLY) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const sourcePayload = matchedSourceRecords.map(({ source, landlord }) => {
    const corrected = calcFromSource(source, landlord, roomGrossByLandlord.get(landlord.id) ?? 0);
    return {
      import_batch_id: crypto.randomUUID(),
      company_id: companyId,
      landlord_id: landlord.id,
      office_id: payableByLandlord.get(landlord.id)?.office_id ?? null,
      landlord_name: source.landlordName,
      normalized_landlord_name: source.normalizedLandlordName,
      office_name: source.office || null,
      settlement_month: SETTLEMENT_MONTH,
      source_portfolio_gross: calcFromSource(source, landlord, roomGrossByLandlord.get(landlord.id) ?? 0).gross,
      source_commission: calcFromSource(source, landlord, roomGrossByLandlord.get(landlord.id) ?? 0).commissionAmount,
      source_commission_percentage: calcFromSource(source, landlord, roomGrossByLandlord.get(landlord.id) ?? 0).commissionPercentage,
      source_net_payable: source.landlordNetPayable,
      paid_unpaid_marker: source.paidMarker,
      active: true,
      source_file_name: source.sourceFileName,
      source_sheet_name: source.sourceSheetName,
      source_row_number: source.sourceRowNumber,
      raw_data: source,
    };
  });

  if (sourceTableExists) {
    const activeLandlordIds = matchedSourceRecords.map(({ landlord }) => landlord.id);
    if (activeLandlordIds.length) {
      const deactivate = await client
        .from(SOURCE_TABLE)
        .update({ active: false })
        .eq("company_id", companyId)
        .eq("settlement_month", SETTLEMENT_MONTH)
        .in("landlord_id", activeLandlordIds);
      if (deactivate.error) throw new Error(`${SOURCE_TABLE} deactivate: ${deactivate.error.message}`);
    }
    const { error: sourceError } = await client.from(SOURCE_TABLE).insert(sourcePayload);
    if (sourceError) throw new Error(`${SOURCE_TABLE}: ${sourceError.message}`);
  }

  const targetNames = new Set([...TARGET_NAMES].map(compactKey));
  const applied = [];
  for (const { source, landlord } of matchedSourceRecords) {
    if (!APPLY_ALL_MATCHED && !targetNames.has(compactKey(source.landlordName))) continue;
    const corrected = calcFromSource(source, landlord, roomGrossByLandlord.get(landlord.id) ?? 0);
    const current = payableByLandlord.get(landlord.id);
    if (!current) {
      throw new Error(`Missing ${SETTLEMENT_MONTH} payable row for ${landlord.full_name}`);
    }
    const reasons = [
      String(current.reasons_notes ?? "").trim(),
      `${source.sourceFileName} payable source override applied from ${source.sourceSheetName} row ${source.sourceRowNumber}. Portfolio gross ${corrected.gross}, net ${corrected.net}, marker ${source.paidMarker}.`,
    ].filter(Boolean).join(" ");
    const { data, error } = await client
      .from("landlord_monthly_payables")
      .update({
        full_rent_roll: corrected.gross,
        commission_percentage: corrected.commissionPercentage,
        commission_amount: corrected.commissionAmount,
        net_payable: corrected.net,
        amount_paid: corrected.paid,
        unpaid_balance: corrected.outstanding,
        status: corrected.status,
        reasons_notes: reasons,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select("*")
      .single();
    if (error) throw new Error(`landlord_monthly_payables ${landlord.full_name}: ${error.message}`);
    applied.push({ landlord: landlord.full_name, before: current, after: data, source });
  }

  const auditRows = applied.map((item) => ({
    action: "landlord_payment_source_gross_override",
    after_data: {
      source_workbook: item.source.sourceFileName,
      source_sheet: item.source.sourceSheetName,
      source_row: item.source.sourceRowNumber,
      before: {
        full_rent_roll: item.before.full_rent_roll,
        commission_amount: item.before.commission_amount,
        net_payable: item.before.net_payable,
        amount_paid: item.before.amount_paid,
        unpaid_balance: item.before.unpaid_balance,
        status: item.before.status,
      },
      after: {
        full_rent_roll: item.after.full_rent_roll,
        commission_amount: item.after.commission_amount,
        net_payable: item.after.net_payable,
        amount_paid: item.after.amount_paid,
        unpaid_balance: item.after.unpaid_balance,
        status: item.after.status,
      },
    },
    company_id: item.after.company_id,
    entity_id: item.after.landlord_id,
    entity_type: "landlord",
    office_id: item.after.office_id,
  }));
  if (auditRows.length) {
    const { error } = await client.from("audit_logs").insert(auditRows);
    if (error) throw new Error(`audit_logs: ${error.message}`);
  }

  console.log(JSON.stringify({ ...result, dryRun: false, applied: applied.map((item) => ({
    landlord: item.landlord,
      sourceGross: item.after.full_rent_roll,
    sourceNet: item.source.landlordNetPayable,
    status: item.after.status,
    paid: item.after.amount_paid,
    outstanding: item.after.unpaid_balance,
  })), sourceRecordsStored: sourceTableExists ? sourcePayload.length : 0, sourceRecordStorage: sourceTableExists ? SOURCE_TABLE : "pending_migration_0141_audit_logs_only" }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
