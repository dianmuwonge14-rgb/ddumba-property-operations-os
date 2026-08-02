import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0240_collector_direct_banking.sql", import.meta.url), "utf8");
const action = readFileSync(new URL("../app/actions/collector-banking.ts", import.meta.url), "utf8");
const legacyAction = readFileSync(new URL("../app/actions/collectors.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/collector-banking/data.ts", import.meta.url), "utf8");
const collectorPage = readFileSync(new URL("../app/office/collector/banking/page.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../app/office/admin/collector-banking/page.tsx", import.meta.url), "utf8");
const collectorComponent = readFileSync(new URL("../components/office/collectors/CollectorBankingConsole.tsx", import.meta.url), "utf8");
const adminComponent = readFileSync(new URL("../components/office/collectors/AdminCollectorBankingConsole.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const legacyOfficePanel = readFileSync(new URL("../components/office/collectors/OfficeCollectorSubmissions.tsx", import.meta.url), "utf8");

test("collector banking uses private storage and a dedicated verified deposit ledger", () => {
  assert.match(migration, /collector-bank-slips/);
  assert.match(migration, /public\s*=\s*false/);
  assert.match(migration, /create table if not exists public\.collector_banking_submissions/);
  assert.match(migration, /slip_file_path text not null/);
  assert.match(migration, /slip_checksum text/);
  assert.match(migration, /pending_verification/);
  assert.match(migration, /banking_verified/);
  assert.match(migration, /source_type = 'collector_bank_deposit'/);
});

test("collector banking submission requires a deposit slip and reserves cash", () => {
  assert.match(action, /formData\.get\("depositSlip"\)/);
  assert.match(action, /Upload the bank deposit slip before submitting/);
  assert.match(action, /\.storage\.from\("collector-bank-slips"\)\.upload/);
  assert.match(action, /reserved_amount: amount/);
  assert.match(action, /amount > available/);
  assert.match(action, /duplicate_key/);
  assert.match(action, /recipient_type: "admin"/);
});

test("admin verification reduces collector cash and increases bank cash without office cash", () => {
  assert.match(action, /movement_type: "banking_verified"/);
  assert.match(action, /source_type: "collector_bank_deposit"/);
  assert.match(action, /account_type", "bank"/);
  assert.match(action, /office_id: null/);
  assert.doesNotMatch(action, /account_type", "office_cash"[\s\S]{0,400}collector_bank_deposit/);
  assert.match(action, /recomputeCollectorBalance/);
  assert.match(action, /recipient_type: "collector"/);
});

test("legacy collector-to-office workflow cannot create or approve new handovers", () => {
  assert.match(legacyAction, /Collector cash must be banked directly from Bank Collections/);
  assert.match(legacyAction, /Collector-to-office handover review is closed/);
  assert.doesNotMatch(legacyOfficePanel, /decideCollectorMoneySubmission/);
  assert.doesNotMatch(legacyOfficePanel, /Approve Selected|Approve receipt|Reject Selected/);
  assert.match(legacyOfficePanel, /Historical Money Submissions/);
});

test("collector and admin pages are mounted and navigation exposes the new flow", () => {
  assert.match(collectorPage, /getCollectorBankingPageData/);
  assert.match(adminPage, /getAdminCollectorBankingData/);
  assert.match(sidebar, /\/office\/collector\/banking", label: "Bank Collections"/);
  assert.match(sidebar, /\/office\/admin\/collector-banking", label: "Bank Deposit Slips"/);
  assert.doesNotMatch(sidebar, /Money Submission/);
});

test("collector UI and admin UI contain required slip and review actions", () => {
  for (const label of ["Cash Collected Today", "Cash Currently Held", "Already Banked Today", "Awaiting Banking", "Pending Verification", "Verified Banking", "Rejected Banking", "Last Bank Deposit"]) {
    assert.match(collectorComponent, new RegExp(label));
  }
  assert.match(collectorComponent, /capture="environment"/);
  assert.match(collectorComponent, /Submit for Admin Verification/);
  for (const label of ["Verify", "Reject", "Request clearer image", "Request correction", "View full slip", "Download slip"]) {
    assert.match(adminComponent, new RegExp(label));
  }
  assert.match(data, /createSignedUrl/);
});
