import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

loadDotEnv(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const apply = process.argv.includes("--apply");
const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const duplicateExpenseIds = [
  "21f4af27-b9c2-4c22-81a1-55b78ac4ac7a",
  "30a0784d-b18c-4f72-a3bb-484180b9a4a8",
  "c00a5b76-d987-4be4-af4b-f94761d6c4fb",
];

const cashOutflows = [
  {
    amount: 5_000,
    description: "Backfilled cash outflow for office expense Lunch-Musakira Adam.",
    expenseId: "db116e5a-890b-49e3-a6f3-d0157950c7da",
    officeName: "Lugonjo Office",
    sourceId: "db116e5a-890b-49e3-a6f3-d0157950c7da",
    sourceType: "expense",
    transactionDate: "2026-06-20",
  },
  {
    amount: 5_000,
    description: "Backfilled cash outflow for office expense Fuel.",
    expenseId: "c3c405f1-986a-4756-8e75-989263b73188",
    officeName: "Lugonjo Office",
    sourceId: "c3c405f1-986a-4756-8e75-989263b73188",
    sourceType: "expense",
    transactionDate: "2026-06-22",
  },
  {
    amount: 3_483_000,
    description: "Backfilled cash outflow for approved landlord advance request 49840361-36dd-41cb-8e85-3bcdcd5a1f3d.",
    expenseId: "d7a66f3a-03b5-4024-8f4d-e354008d95f0",
    officeName: "Kapeeka Office",
    sourceId: "49840361-36dd-41cb-8e85-3bcdcd5a1f3d",
    sourceType: "landlord_payment_expense_request",
    transactionDate: "2026-06-30",
  },
  {
    amount: 3_740_000,
    description: "Backfilled cash outflow for approved landlord advance request 9f8e1139-fd71-4753-bde1-6cad48efcafa.",
    expenseId: "a8a9280a-bc54-44e2-9260-b45db76ee924",
    officeName: "Kapeeka Office",
    sourceId: "9f8e1139-fd71-4753-bde1-6cad48efcafa",
    sourceType: "landlord_payment_expense_request",
    transactionDate: "2026-06-30",
  },
];

const removalReversals = [
  {
    amount: 50_000,
    collectionId: "5091fcb1-b30a-4b82-88c9-b42655a9a098",
    description: "Backfilled payment removal reversal for collection 5091fcb1-b30a-4b82-88c9-b42655a9a098.",
    officeName: "Kigungu Main Office",
  },
  {
    amount: 40_000,
    collectionId: "ed45a4a4-4224-49ed-a627-6c268dfbcb73",
    description: "Backfilled payment removal reversal for collection ed45a4a4-4224-49ed-a627-6c268dfbcb73.",
    officeName: "Kigungu Main Office",
  },
];

const offices = await fetchOffices();
const officeByName = new Map(offices.map((office) => [office.office_name || office.name, office]));
const companyId = offices[0]?.company_id;
if (!companyId) throw new Error("No company found.");

const plan = {
  apply,
  duplicateExpensesToDelete: await existingDuplicateExpenses(),
  cashOutflowsToInsert: [],
  removalReversalsToInsert: [],
};

for (const item of cashOutflows) {
  const office = officeByName.get(item.officeName);
  if (!office) throw new Error(`Office not found: ${item.officeName}`);
  const cashAccountId = await officeCashAccountId(office.id);
  const exists = await cashTransactionExists({
    amount: item.amount,
    officeId: office.id,
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    transactionType: "outflow",
  });
  if (!exists) {
    plan.cashOutflowsToInsert.push({ ...item, cashAccountId, officeId: office.id });
  }
}

for (const item of removalReversals) {
  const office = officeByName.get(item.officeName);
  if (!office) throw new Error(`Office not found: ${item.officeName}`);
  const cashAccountId = await officeCashAccountId(office.id);
  const exists = await cashTransactionExists({
    amount: item.amount,
    officeId: office.id,
    sourceId: item.collectionId,
    sourceType: "payment_removal_reversal",
    transactionType: "outflow",
  });
  if (!exists) {
    plan.removalReversalsToInsert.push({ ...item, cashAccountId, officeId: office.id });
  }
}

console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("Dry run only. Re-run with --apply to write these repairs.");
  process.exit(0);
}

for (const item of plan.cashOutflowsToInsert) {
  const { error } = await supabase.from("cash_transactions").insert({
    amount: item.amount,
    cash_account_id: item.cashAccountId,
    company_id: companyId,
    description: item.description,
    office_id: item.officeId,
    recorded_by: null,
    source_id: item.sourceId,
    source_type: item.sourceType,
    transaction_date: item.transactionDate,
    transaction_type: "outflow",
  });
  if (error) throw new Error(`cash_transactions insert failed for ${item.sourceId}: ${error.message}`);
}

for (const item of plan.removalReversalsToInsert) {
  const { error } = await supabase.from("cash_transactions").insert({
    amount: item.amount,
    cash_account_id: item.cashAccountId,
    company_id: companyId,
    description: item.description,
    office_id: item.officeId,
    recorded_by: null,
    source_id: item.collectionId,
    source_type: "payment_removal_reversal",
    transaction_date: new Date().toISOString(),
    transaction_type: "outflow",
  });
  if (error) throw new Error(`payment reversal insert failed for ${item.collectionId}: ${error.message}`);
}

if (plan.duplicateExpensesToDelete.length > 0) {
  const { error } = await supabase.from("expenses").delete().in("id", plan.duplicateExpensesToDelete.map((item) => item.id));
  if (error) throw new Error(`duplicate expense cleanup failed: ${error.message}`);
}

const { error: auditError } = await supabase.from("audit_logs").insert({
  action: "cash_reconciliation_repair_2026_07",
  after_data: plan,
  before_data: null,
  company_id: companyId,
  entity_id: null,
  entity_type: "cash_reconciliation",
  office_id: null,
});
if (auditError) throw new Error(`audit insert failed: ${auditError.message}`);

console.log(JSON.stringify({ ok: true, applied: plan }, null, 2));

async function fetchOffices() {
  const { data, error } = await supabase.from("offices").select("id,company_id,office_name,name");
  if (error) throw new Error(error.message);
  return data || [];
}

async function existingDuplicateExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("id,office_id,amount,item,expense_date,created_at")
    .in("id", duplicateExpenseIds)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data || [];
}

async function officeCashAccountId(officeId) {
  const { data, error } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("office_id", officeId)
    .eq("account_type", "office_cash")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error(`No active office_cash account for office ${officeId}`);
  return data.id;
}

async function cashTransactionExists(input) {
  const { data, error } = await supabase
    .from("cash_transactions")
    .select("id")
    .eq("office_id", input.officeId)
    .eq("source_id", input.sourceId)
    .eq("source_type", input.sourceType)
    .eq("transaction_type", input.transactionType)
    .eq("amount", input.amount)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
