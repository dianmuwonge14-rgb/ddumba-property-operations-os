import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mapper = readFileSync(new URL("../lib/errors/business-errors.ts", import.meta.url), "utf8");
const response = readFileSync(new URL("../lib/errors/business-response.ts", import.meta.url), "utf8");
const notice = readFileSync(new URL("../components/shared/BusinessErrorNotice.tsx", import.meta.url), "utf8");
const rootError = readFileSync(new URL("../app/error.tsx", import.meta.url), "utf8");
const officeError = readFileSync(new URL("../app/office/error.tsx", import.meta.url), "utf8");
const adminAccounts = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const roomAvailability = readFileSync(new URL("../app/api/rooms/availability/route.ts", import.meta.url), "utf8");
const roomLookup = readFileSync(new URL("../app/api/collections/room-lookup/route.ts", import.meta.url), "utf8");
const tenantLookup = readFileSync(new URL("../app/api/collections/tenant/route.ts", import.meta.url), "utf8");
const paymentCorrections = readFileSync(new URL("../app/api/collections/payment-corrections/route.ts", import.meta.url), "utf8");

test("business error mapper covers common production validation failures", () => {
  for (const code of [
    "AUTHENTICATION_REQUIRED",
    "PHONE_ALREADY_EXISTS",
    "RECEPTIONIST_ALREADY_EXISTS",
    "EMPLOYEE_LOGIN_ALREADY_EXISTS",
    "DUPLICATE_EMPLOYEE",
    "ROOM_NUMBER_ALREADY_EXISTS",
    "SALARY_CONFIGURATION_MISSING",
    "OFFICE_INACTIVE",
    "COLLECTOR_INACTIVE",
    "LANDLORD_HAS_ACTIVE_ROOMS",
    "PERMISSION_DENIED",
    "BANK_SLIP_REQUIRED",
    "INVALID_OUTSTANDING_BALANCE",
    "PAYMENT_ALREADY_APPROVED",
    "RECEIPT_ALREADY_CANCELLED",
    "NO_ACTIVE_OFFICE_ASSIGNMENT",
    "COLLECTOR_PROFILE_MISSING",
    "PIN_ALREADY_IN_USE",
    "RELATED_RECORD_MISSING",
    "DUPLICATE_RECORD",
  ]) {
    assert.match(mapper, new RegExp(code));
  }
  assert.match(mapper, /success: false/);
  assert.match(mapper, /Reference:/);
  assert.doesNotMatch(mapper, /Server Components render/);
});

test("route errors render a safe business notice instead of the generic server component page", () => {
  assert.match(notice, /This action could not be completed/);
  assert.match(notice, /Code: \{error\.code\}/);
  assert.match(rootError, /businessErrorFromUnknown/);
  assert.match(rootError, /BusinessErrorNotice/);
  assert.match(officeError, /businessErrorFromUnknown/);
  assert.match(officeError, /Office workspace/);
});

test("api catches return structured business errors with backwards-compatible error text", () => {
  assert.match(response, /NextResponse\.json\(businessError/);
  assert.match(mapper, /error: mappedMessage/);
  assert.match(roomAvailability, /businessErrorResponse\(error, "Room availability check failed\."\)/);
  assert.match(roomLookup, /businessErrorResponse\(error, "Unable to lookup room\."\)/);
  assert.match(tenantLookup, /businessErrorResponse\(error, "Unable to open tenant\."\)/);
  assert.match(paymentCorrections, /businessErrorResponse\(error, "Payment correction history could not load\."\)/);
});

test("account creation logs raw failures but rethrows safe business messages", () => {
  assert.match(adminAccounts, /businessErrorFromUnknown/);
  assert.match(adminAccounts, /createOfficeAccount failed/);
  assert.match(adminAccounts, /createOfficeWithLogin failed/);
  assert.match(adminAccounts, /throw new Error\(businessError\.message\)/);
  assert.match(adminAccounts, /businessCode: businessError\.code/);
});
