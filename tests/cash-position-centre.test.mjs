import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/office/admin/cash-position/page.tsx", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/cash-position-centre/types.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/office/cash-position/CashPositionCentre.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const officeHomeSource = readFileSync(new URL("../app/office/page.tsx", import.meta.url), "utf8");

test("cash position centre is an admin-only live Supabase page", () => {
  assert.match(pageSource, /getCashPositionCentreData/);
  assert.match(dataSource, /requireCompanyAdminMode\(\)/);
  assert.match(dataSource, /createSupabaseAdminClient\(\)/);
  assert.match(dataSource, /\.from\("collections"\)/);
  assert.match(dataSource, /\.from\("cash_transactions"\)/);
  assert.match(dataSource, /\.from\("field_collector_profiles"\)/);
  assert.match(dataSource, /\.from\("security_deposit_register"\)/);
  assert.doesNotMatch(componentSource, /placeholder/i);
});

test("admin navigation makes Cash Position Centre the CFO landing page", () => {
  const cashPosition = sidebarSource.indexOf('/office/admin/cash-position", label: "Cash Position Centre"');
  const dashboard = sidebarSource.indexOf('/office", label: "Dashboard"');
  assert.ok(cashPosition > 0, "Cash Position Centre nav entry should exist");
  assert.ok(cashPosition < dashboard, "Cash Position Centre should be first for Admin");
  assert.match(sidebarSource, /pathname\.includes\("\/cash-position"\)/);
  assert.match(sidebarSource, /logoHref = isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(loginSource, /isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(officeHomeSource, /redirect\("\/office\/admin\/cash-position"\)/);
});

test("cash position centre includes requested executive KPIs and live office table fields", () => {
  for (const label of [
    "Total Cash Collected",
    "Cash Held by Offices",
    "Cash Held by Collectors",
    "Cash Banked",
    "Cash Handed to Admin",
    "Outstanding to Bank",
    "Unreconciled Cash",
    "Security Deposit Cash",
    "Security Shortfall",
    "Today’s Collection Performance",
  ]) {
    assert.match(dataSource + componentSource, new RegExp(label));
  }
  for (const field of ["cashCollectedToday", "cashHeldInOffice", "cashHeldByCollectors", "alreadyBanked", "outstandingToBank", "bankingPercentage", "weeklyPerformance", "monthlyPerformance"]) {
    assert.match(typesSource, new RegExp(field));
  }
});

test("cash position centre ships filters, AI insights, charts and exports", () => {
  for (const label of ["Today", "Yesterday", "Last 7 Days", "This Month", "Previous Month", "This Year", "Custom Range", "Specific Day", "Collector", "Banking Status"]) {
    assert.match(componentSource, new RegExp(label));
  }
  assert.match(componentSource, /AI Cash Director/);
  assert.match(componentSource, /Daily Cash Movement/);
  assert.match(componentSource, /Office Performance Comparison/);
  assert.match(componentSource, /Collector Comparison/);
  assert.match(componentSource, /Security Liability vs Available Cash/);
  assert.match(componentSource, /DailyCashCards/);
  assert.match(componentSource, /OfficeComparisonCards/);
  assert.match(componentSource, /CollectorCards/);
  assert.match(componentSource, /CSV/);
  assert.match(componentSource, /Excel/);
  assert.match(componentSource, /PDF/);
  assert.match(componentSource, /window\.print\(\)/);
});

test("cash position centre keeps banking writes on the canonical cash banking workflow", () => {
  assert.match(componentSource, /\/office\/admin\/cash-banking/);
  assert.doesNotMatch(componentSource, /from\("cash_transactions"\)\.insert/);
  assert.doesNotMatch(componentSource, /from\("collections"\)\.insert/);
});
