import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

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

async function fetchAll(client, table, select, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(client.from(table).select(select)).range(from, from + 999);
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

async function main() {
  const client = supabase();
  const { data: company, error: companyError } = await client.from("companies").select("id,name").limit(1).single();
  if (companyError) throw new Error(companyError.message);
  const [rooms, tenants, leases, collections] = await Promise.all([
    fetchAll(client, "rooms", "id,company_id,office_id,property_id,room_number,monthly_rent,status,outstanding_balance"),
    fetchAll(client, "tenants", "id,company_id,office_id,property_id,room_id,full_name,phone,monthly_rent,balance,status"),
    fetchAll(client, "leases", "id,room_id,status"),
    fetchAll(client, "collections", "id,room_id,amount,amount_paid"),
  ]);

  const paidByRoomId = new Map();
  for (const collection of collections) {
    if (!collection.room_id) continue;
    paidByRoomId.set(collection.room_id, (paidByRoomId.get(collection.room_id) ?? 0) + Number(collection.amount_paid ?? collection.amount ?? 0));
  }

  const targetRooms = rooms.filter((room) => room.company_id === company.id && room.office_id && room.property_id && Number(room.monthly_rent ?? 0) > 0);
  const tenantByRoomId = new Map(tenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id, tenant]));
  const activeLeaseRoomIds = new Set(leases.filter((lease) => lease.status === "active").map((lease) => lease.room_id));

  const roomUpdates = targetRooms
    .map((room) => {
      const monthlyRent = Number(room.monthly_rent ?? 0);
      const balance = Math.max(0, monthlyRent - (paidByRoomId.get(room.id) ?? 0));
      if (room.status === "occupied" && Number(room.outstanding_balance ?? 0) === balance) return null;
      return { id: room.id, officeId: room.office_id, before: room, balance };
    })
    .filter(Boolean);

  await runPool(roomUpdates, 25, async (item) => {
    const { error } = await client
      .from("rooms")
      .update({ status: "occupied", outstanding_balance: item.balance })
      .eq("id", item.id);
    if (error) throw new Error(`room ${item.id}: ${error.message}`);
  });

  const tenantUpdates = tenants
    .filter((tenant) => tenant.room_id)
    .map((tenant) => {
      const room = rooms.find((candidate) => candidate.id === tenant.room_id);
      if (!room) return null;
      const monthlyRent = Number(room.monthly_rent ?? tenant.monthly_rent ?? 0);
      const balance = Math.max(0, monthlyRent - (paidByRoomId.get(room.id) ?? 0));
      if (
        tenant.status === "active" &&
        tenant.office_id === room.office_id &&
        tenant.property_id === room.property_id &&
        Number(tenant.monthly_rent ?? 0) === monthlyRent &&
        Number(tenant.balance ?? 0) === balance
      ) return null;
      return {
        id: tenant.id,
        officeId: room.office_id,
        update: {
          balance,
          monthly_rent: monthlyRent,
          office_id: room.office_id,
          property_id: room.property_id,
          status: "active",
        },
      };
    })
    .filter(Boolean);

  await runPool(tenantUpdates, 25, async (item) => {
    const { error } = await client.from("tenants").update(item.update).eq("id", item.id);
    if (error) throw new Error(`tenant ${item.id}: ${error.message}`);
  });

  const leaseInserts = [];
  for (const room of targetRooms) {
    if (activeLeaseRoomIds.has(room.id)) continue;
    const tenant = tenantByRoomId.get(room.id);
    if (!tenant) continue;
    leaseInserts.push({
      billing_day: 1,
      company_id: company.id,
      deposit_amount: 0,
      monthly_rent: Number(room.monthly_rent ?? tenant.monthly_rent ?? 0),
      office_id: room.office_id,
      property_id: room.property_id,
      room_id: room.id,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
      tenant_id: tenant.id,
    });
  }

  let insertedLeases = 0;
  for (const batch of chunk(leaseInserts)) {
    const { data, error } = await client.from("leases").insert(batch).select("id");
    if (error) throw new Error(`leases: ${error.message}`);
    insertedLeases += data?.length ?? 0;
  }

  const auditRows = [
    ...roomUpdates.map((item) => ({
      action: "excel_room_marked_occupied",
      before_data: item.before,
      after_data: { status: "occupied", outstanding_balance: item.balance },
      company_id: company.id,
      entity_id: item.id,
      entity_type: "room",
      office_id: item.officeId,
    })),
    ...tenantUpdates.map((item) => ({
      action: "excel_room_occupancy_tenant_updated",
      after_data: item.update,
      company_id: company.id,
      entity_id: item.id,
      entity_type: "tenant",
      office_id: item.officeId,
    })),
    {
      action: "excel_room_occupancy_backfill_completed",
      after_data: {
        target_rooms: targetRooms.length,
        room_updates: roomUpdates.length,
        tenant_updates: tenantUpdates.length,
        lease_inserts: insertedLeases,
      },
      company_id: company.id,
      entity_type: "occupancy_backfill",
      entity_id: company.id,
      office_id: null,
    },
  ];
  for (const batch of chunk(auditRows)) {
    const { error } = await client.from("audit_logs").insert(batch);
    if (error) throw new Error(`audit_logs: ${error.message}`);
  }

  console.log(JSON.stringify({
    targetRooms: targetRooms.length,
    roomUpdates: roomUpdates.length,
    tenantUpdates: tenantUpdates.length,
    leaseInserts: insertedLeases,
    auditRows: auditRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
