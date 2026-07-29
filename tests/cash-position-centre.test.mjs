import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/office/admin/cash-position/page.tsx", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/cash-position-centre/types.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/office/cash-position/CashPositionCentre.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");

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

test("admin navigation exposes Cash Position Centre near cash control", () => {
  const cashBanking = sidebarSource.indexOf('/office/admin/cash-banking", label: "Cash Banking"');
  const cashPosition = sidebarSource.indexOf('/office/admin/cash-position", label: "Cash Position Centre"');
  assert.ok(cashBanking > 0, "Cash Banking nav entry should exist");
  assert.ok(cashPosition > cashBanking, "Cash Position Centre should appear after Cash Banking");
  assert.match(sidebarSource, /pathname\.includes\("\/cash-position"\)/);
});

test("cash position centre includes requested executive KPIs and live office table fields", () => {
  for (const label of [
    "Total Cash Collected Today",
    "Cash Held By Offices",
    "Cash Held By Collectors",
    "Total Cash Already Banked",
    "Total Cash Handed To Admin",
    "Security Deposits Held",
    "Company Cash Available",
    "Cash Waiting To Be Banked",
    "Unreconciled Cash",
    "Cash Difference Alerts",
  ]) {
    assert.match(dataSource + componentSource, new RegExp(label));
  }
  for (const field of ["cashCollectedToday", "cashHeldInOffice", "cashHeldByCollectors", "alreadyBanked", "outstandingToBank", "bankingPercentage", "weeklyPerformance", "monthlyPerformance"]) {
    assert.match(typesSource, new RegExp(field));
  }
});

test("cash position centre ships filters, AI insights, charts and exports", () => {
  for (const label of ["Today", "Yesterday", "Last 7 Days", "This Month", "Previous Month", "Financial Year", "Custom Date Range", "Specific Day"]) {
    assert.match(componentSource, new RegExp(label));
  }
  assert.match(componentSource, /AI Cash Director/);
  assert.match(componentSource, /Daily Cash Movement/);
  assert.match(componentSource, /Office Comparison/);
  assert.match(componentSource, /Collector Comparison/);
  assert.match(componentSource, /CSV/);
  assert.match(componentSource, /Excel/);
  assert.match(componentSource, /window\.print\(\)/);
});

test("cash position centre keeps banking writes on the canonical cash banking workflow", () => {
  assert.match(componentSource, /\/office\/admin\/cash-banking/);
  assert.doesNotMatch(componentSource, /from\("cash_transactions"\)\.insert/);
  assert.doesNotMatch(componentSource, /from\("collections"\)\.insert/);
});
