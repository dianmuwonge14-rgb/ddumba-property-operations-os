import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expensesConsole = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const expenseActions = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const expenseTypes = readFileSync(new URL("../lib/expenses/types.ts", import.meta.url), "utf8");
const proofRoute = readFileSync(new URL("../app/api/expenses/proof/[expenseId]/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0257_expense_optional_proof_attachments.sql", import.meta.url), "utf8");

test("unauthorised expenses expose optional proof upload without blocking no-attachment submissions", () => {
  assert.match(expensesConsole, /Attach Proof - Optional/);
  assert.match(expensesConsole, /Take Photo/);
  assert.match(expensesConsole, /Upload Photo \/ Slip/);
  assert.match(expensesConsole, /No attachment selected\. You can still submit this unauthorised expense\./);
  assert.match(expensesConsole, /proofFile \? await proofPayloadFromFile\(proofFile\) : null/);
  assert.match(expenseTypes, /supportingProof\?: ExpenseProofUploadInput \| null/);
});

test("expense proof uploads are stored privately with metadata and Admin notifications", () => {
  assert.match(expenseActions, /const EXPENSE_PROOF_BUCKET = "expense-proofs"/);
  assert.match(expenseActions, /ALLOWED_EXPENSE_PROOF_TYPES/);
  assert.match(expenseActions, /supporting_document_original_name/);
  assert.match(expenseActions, /supporting_document_mime_type/);
  assert.match(expenseActions, /supporting_document_uploaded_by_employee_id/);
  assert.match(expenseActions, /expense_supporting_proof_uploaded/);
  assert.match(expenseActions, /Supporting proof attached\./);
});

test("Admin review and history open private proof through the protected signed-url route", () => {
  assert.match(expensesConsole, /Proof Attached/);
  assert.match(expensesConsole, /No supporting proof attached\./);
  assert.match(expensesConsole, /\/api\/expenses\/proof\/\$\{encodeURIComponent\(expense\.id\)\}/);
  assert.match(proofRoute, /requirePermission\("expenses\.read"\)/);
  assert.match(proofRoute, /canAccessOffice\(context, data\.office_id\)/);
  assert.match(proofRoute, /createSignedUrl\(path, 60/);
  assert.doesNotMatch(proofRoute, /publicUrl/);
});

test("migration creates a private expense-proofs bucket and proof metadata columns", () => {
  assert.match(migration, /'expense-proofs'/);
  assert.match(migration, /public,\s*file_size_limit,\s*allowed_mime_types/s);
  assert.match(migration, /false,\s*10485760/s);
  for (const column of [
    "supporting_document_original_name",
    "supporting_document_mime_type",
    "supporting_document_file_size",
    "supporting_document_uploaded_by",
    "supporting_document_uploaded_by_employee_id",
    "supporting_document_uploaded_at",
    "supporting_document_checksum",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /expense_proofs_service/);
  assert.match(migration, /ddumba_v1_is_service_role/);
});
