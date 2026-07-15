import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const providerSource = readFileSync(new URL("../components/navigation/NavigationMemoryProvider.tsx", import.meta.url), "utf8");
const officeLayoutSource = readFileSync(new URL("../components/office/shared/OfficeLayout.tsx", import.meta.url), "utf8");

test("navigation memory provider is installed globally in the office shell", () => {
  assert.match(officeLayoutSource, /NavigationMemoryProvider/);
  assert.match(officeLayoutSource, /accountId=\{context\.profile\?\.id/);
  assert.match(officeLayoutSource, /companyId=\{context\.activeCompany\?\.id/);
  assert.match(officeLayoutSource, /officeId=\{context\.activeOffice\?\.id/);
  assert.match(officeLayoutSource, /UnsavedChangesGuard/);
});

test("navigation memory stores route, query, filters and scroll position per tab", () => {
  assert.match(providerSource, /TAB_ID_KEY/);
  assert.match(providerSource, /PREVIOUS_ROUTE_KEY/);
  assert.match(providerSource, /CURRENT_ROUTE_KEY/);
  assert.match(providerSource, /routeMemoryKey/);
  assert.match(providerSource, /scrollX/);
  assert.match(providerSource, /scrollY/);
  assert.match(providerSource, /captureFilters/);
  assert.match(providerSource, /selectedTab/);
  assert.match(providerSource, /pageNumber/);
  assert.match(providerSource, /window\.history\.scrollRestoration = "manual"/);
});

test("form drafts are scoped by account, office, route, form and browser tab", () => {
  assert.match(providerSource, /DRAFT_PREFIX/);
  assert.match(providerSource, /function draftKey\(tabId: string, companyId: string, accountId: string, officeId: string, route: string, formId: string\)/);
  assert.match(providerSource, /sessionStorage/);
  assert.match(providerSource, /formIdentity/);
  assert.match(providerSource, /elementIdentity/);
  assert.match(providerSource, /collectFormDraft/);
  assert.match(providerSource, /restoreFormDraft/);
});

test("sensitive credentials are never persisted as drafts", () => {
  assert.match(providerSource, /SENSITIVE_MATCHER/);
  assert.match(providerSource, /pin\|password\|passcode\|otp\|token\|secret/);
  assert.match(providerSource, /\["password", "file", "hidden"\]/);
  assert.match(providerSource, /data-sensitive/);
  assert.match(providerSource, /isSensitiveElement/);
});

test("unsaved changes guard preserves drafts without auto-submitting", () => {
  assert.match(providerSource, /beforeunload/);
  assert.match(providerSource, /You have unsaved changes\. Leave this page and keep the draft\?/);
  assert.match(providerSource, /discardCurrentDraft/);
  assert.match(providerSource, /markSubmitted/);
  assert.doesNotMatch(providerSource, /form\.submit\(/);
  assert.doesNotMatch(providerSource, /requestSubmit\(/);
});

test("shared hooks and smart back controls are available for explicit workflow adoption", () => {
  assert.match(providerSource, /export function useNavigationMemory/);
  assert.match(providerSource, /export function useFormDraft/);
  assert.match(providerSource, /export function UnsavedChangesGuard/);
  assert.match(providerSource, /export function SmartBackButton/);
  assert.match(providerSource, /export function SmartBackLink/);
});
