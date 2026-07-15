import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../components/office/landlords/LandlordPaymentsConsole.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../components/office/landlords/LandlordProfile.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/landlord-payables/data.ts", import.meta.url), "utf8");

test("landlord payments page records through canonical expense-routed action", () => {
  assert.match(source, /function LandlordPaymentEntryPanel/);
  assert.match(source, /submitLandlordPaymentFromTerminal/);
  assert.match(source, /officeId: selectedOfficeId/);
  assert.doesNotMatch(source, /markLandlordMonthlyPayablePaid/);
});

test("landlord payments page previews allocation using shared payable calculator", () => {
  assert.match(source, /summarizeLandlordPayables/);
  assert.match(source, /buildLandlordPaymentAllocationPlan/);
  assert.match(source, /Current Month Gross Payable/);
  assert.match(source, /Current Month Final Net Payable/);
  assert.match(source, /Pending Deductions Before 15th/);
  assert.match(source, /Included in total recovery deductions\. Not deducted separately\./);
  assert.match(source, /oldest unpaid month first/i);
  assert.match(source, /Advance is created only after every genuine unpaid balance becomes zero/);
});

test("landlord payment receipt workflow appears only after successful direct payment", () => {
  assert.match(source, /lastSubmission/);
  assert.match(source, /LandlordPaymentReceiptPreview/);
  assert.match(source, /Receipt ready · Payment allocated · Ledger updated · Supabase synced/);
  assert.match(source, /Official payment receipt will be generated after Admin approval/);
  assert.match(source, /print-landlord-payment-receipt/);
  assert.match(source, /landlord-payment-receipt-print-area/);
});

test("landlord payments search includes phone, rooms, office, and location index", () => {
  assert.match(dataSource, /landlord_search_index/);
  assert.match(dataSource, /room_numbers_text/);
  assert.match(dataSource, /location_text/);
  assert.match(dataSource, /searchable_text/);
  assert.match(source, /option\?\.phone/);
  assert.match(source, /option\?\.roomNumbersText/);
  assert.match(source, /option\?\.locationText/);
});

test("landlord payment report uses a dedicated one-page A4 print sheet", () => {
  assert.match(profileSource, /id="landlord-report-print-area"/);
  assert.match(profileSource, /landlord-report-sheet/);
  assert.match(profileSource, /landlord-report-header/);
  assert.match(profileSource, /landlord-report-summary/);
  assert.match(profileSource, /landlord-report-history/);
  assert.match(profileSource, /landlord-report-lower-grid/);
  assert.match(globalCss, /\.landlord-report-sheet/);
  assert.match(globalCss, /width: 210mm !important/);
  assert.match(globalCss, /height: 297mm !important/);
  assert.match(globalCss, /padding: 9mm !important/);
  assert.match(globalCss, /body:has\(#landlord-report-print-area\) \*/);
  assert.match(globalCss, /report-box-empty/);
});
