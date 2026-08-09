import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("auth context enforces a one hour controlled session server-side", () => {
  const contextSource = readFileSync(new URL("../lib/auth/context.ts", import.meta.url), "utf8");
  assert.match(contextSource, /SESSION_DURATION_SECONDS = 60 \* 60/);
  assert.match(contextSource, /SESSION_EXPIRES_COOKIE/);
  assert.match(contextSource, /SESSION_CONTROLLED_COOKIE/);
  assert.match(contextSource, /hasControlledSession && !sessionExpiresAt/);
  assert.match(contextSource, /sessionExpiresAt && sessionExpiresAt <= Date\.now\(\)/);
  assert.match(contextSource, /setSessionCookies/);
  assert.match(contextSource, /clearSessionCookies/);
});

test("login, logout and session API manage timeout cookies and audit events", () => {
  const loginSource = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
  const logoutSource = readFileSync(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8");
  const sessionRoute = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");

  assert.match(loginSource, /setSessionCookies\(cookieStore\)/);
  assert.match(loginSource, /event_type: "login"/);
  assert.match(logoutSource, /clearSessionCookies\(cookieStore\)/);
  assert.match(logoutSource, /automatic_timeout_logout/);
  assert.match(sessionRoute, /export async function POST/);
  assert.match(sessionRoute, /reason === "continue_session"/);
  assert.match(sessionRoute, /event_type: "session_refresh"/);
  assert.match(sessionRoute, /export async function DELETE/);
  assert.match(sessionRoute, /automatic_timeout_logout/);
});

test("office shell warns five minutes before expiry and preserves drafts on timeout", () => {
  const layoutSource = readFileSync(new URL("../components/office/shared/OfficeLayout.tsx", import.meta.url), "utf8");
  const controllerSource = readFileSync(new URL("../components/office/shared/SessionTimeoutController.tsx", import.meta.url), "utf8");

  assert.match(layoutSource, /<SessionTimeoutController initialExpiresAt=\{context\.sessionExpiresAt\}/);
  assert.match(controllerSource, /SESSION_WARNING_MS = 5 \* 60 \* 1000/);
  assert.match(controllerSource, /Continue Session/);
  assert.match(controllerSource, /Log Out Now/);
  assert.match(controllerSource, /useNavigationMemory/);
  assert.match(controllerSource, /hasUnsavedDraft/);
  assert.match(controllerSource, /You have unsaved work/);
  assert.match(controllerSource, /touchSession\("continue_session"\)/);
});
