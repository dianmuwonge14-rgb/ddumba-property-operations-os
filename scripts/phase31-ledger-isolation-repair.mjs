import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const PAGE_SIZE = 1000;
const TARGET_OFFICES = ["Kigungu", "Lugonjo", "Kapeeka", "Kiyindi", "Mbale"];

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

async function fetchAll(client, table, select, apply = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await apply(client.from(table).select(select).range(from, to));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function amount(value) {
  return Number(value ?? 0) || 0;
}

function officeLabel(office) {
  return office?.office_name || office?.name || "Unknown office";
}

function targetOfficeKey(name) {
  const normalized = String(name ?? "").toLowerCase();
  return TARGET_OFFICES.find((office) => normalized.includes(office.toLowerCase())) ?? "Other";
}

function totalsByOffice(tenants, officeById) {
  const totals = new Map(TARGET_OFFICES.concat("Other").map((office) => [office, 0]));
  for (const tenant of tenants) {
    if (tenant.status === "import_review") continue;
    const office = targetOfficeKey(officeLabel(officeById.get(tenant.office_id)));
    totals.set(office, amount(totals.get(office)) + amount(tenant.balance));
  }
  return Object.fromEntries([...totals.entries()].map(([office, total]) => [office, Math.round(total)]));
}

async function existingLedgerRepair(client, tenantId) {
  const { data, error } = await client
    .from("tenant_ledger_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_type", "historical_balance_repair")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function repairBalances(client, missingRows) {
  let repairedTenants = 0;
  let ledgerRows = 0;

  for (const tenant of missingRows) {
    const repairedBalance = amount(tenant.outstanding_balance_bf);
    if (repairedBalance <= 0 || tenant.status === "import_review") continue;

    const { error: tenantError } = await client
      .from("tenants")
      .update({ balance: repairedBalance })
      .eq("id", tenant.id)
      .or("balance.is.null,balance.eq.0");

    if (tenantError) throw new Error(`tenant ${tenant.id}: ${tenantError.message}`);
    repairedTenants += 1;

    const hasLedger = await existingLedgerRepair(client, tenant.id);
    if (!hasLedger) {
      const { error: ledgerError } = await client.from("tenant_ledger_entries").insert({
        amount: repairedBalance,
        balance_after: repairedBalance,
        company_id: tenant.company_id,
        description: "Historical workbook outstanding balance repaired into tenant ledger.",
        entry_type: "debit",
        lease_id: null,
        office_id: tenant.office_id,
        source_id: tenant.id,
        source_type: "historical_balance_repair",
        tenant_id: tenant.id,
      });
      if (ledgerError) throw new Error(`ledger ${tenant.id}: ${ledgerError.message}`);
      ledgerRows += 1;
    }
  }

  return { repairedTenants, ledgerRows };
}

async function repairRoomBalances(client) {
  const [tenants, rooms] = await Promise.all([
    fetchAll(client, "tenants", "id,room_id,balance,status", (query) => query.not("room_id", "is", null).neq("status", "import_review")),
    fetchAll(client, "rooms", "id,outstanding_balance"),
  ]);
  const roomTotals = new Map();
  for (const tenant of tenants) {
    roomTotals.set(tenant.room_id, amount(roomTotals.get(tenant.room_id)) + amount(tenant.balance));
  }
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  let repairedRooms = 0;

  for (const [roomId, tenantTotal] of roomTotals.entries()) {
    const room = roomById.get(roomId);
    if (!room || tenantTotal <= amount(room.outstanding_balance)) continue;
    const { error } = await client.from("rooms").update({ outstanding_balance: tenantTotal }).eq("id", roomId);
    if (error) throw new Error(`room ${roomId}: ${error.message}`);
    repairedRooms += 1;
  }

  return { repairedRooms };
}

async function main() {
  const repair = process.argv.includes("--repair-balances");
  const client = supabase();
  const [offices, tenantsBefore] = await Promise.all([
    fetchAll(client, "offices", "id,name,office_name"),
    fetchAll(client, "tenants", "id,company_id,office_id,room_id,full_name,status,balance,outstanding_balance_bf"),
  ]);
  const officeById = new Map(offices.map((office) => [office.id, office]));
  const missingRows = tenantsBefore.filter((tenant) =>
    tenant.status !== "import_review" &&
    amount(tenant.balance) === 0 &&
    amount(tenant.outstanding_balance_bf) > 0 &&
    tenant.company_id &&
    tenant.office_id
  );
  const beforeTotals = totalsByOffice(tenantsBefore, officeById);
  let repairResult = { repairedTenants: 0, ledgerRows: 0, repairedRooms: 0 };

  if (repair) {
    const tenantRepair = await repairBalances(client, missingRows);
    const roomRepair = await repairRoomBalances(client);
    repairResult = { ...tenantRepair, ...roomRepair };
  }

  const tenantsAfter = await fetchAll(client, "tenants", "id,office_id,status,balance,outstanding_balance_bf");
  const stillMissingRows = tenantsAfter.filter((tenant) =>
    tenant.status !== "import_review" &&
    amount(tenant.balance) === 0 &&
    amount(tenant.outstanding_balance_bf) > 0
  );

  console.log(JSON.stringify({
    mode: repair ? "repair" : "dry-run",
    beforeTotals,
    afterTotals: totalsByOffice(tenantsAfter, officeById),
    missingWorkbookBalancesBefore: missingRows.length,
    missingWorkbookBalancesAfter: stillMissingRows.length,
    ...repairResult,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
