import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "desktop-dist");

rmSync(dist, { force: true, recursive: true });
mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, "src-tauri/icons/icon.png"), resolve(dist, "icon.png"));

writeFileSync(resolve(dist, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ddumba Property Operations OS Desktop</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #06111f; color: #f8fafc; }
      body::before { content: ""; position: fixed; inset: 0; z-index: -1; background:
        radial-gradient(circle at 14% 0%, rgba(34, 211, 238, 0.22), transparent 32%),
        radial-gradient(circle at 88% 0%, rgba(16, 185, 129, 0.16), transparent 30%),
        linear-gradient(135deg, #020617, #07111f 48%, #0f172a); }
      button, input, select, textarea { font: inherit; }
      button, a.button { border: 0; border-radius: 14px; background: #06b6d4; color: #042f2e; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 950; padding: 11px 14px; text-decoration: none; }
      button.secondary, a.secondary { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.12); }
      button.danger { background: #fecaca; color: #7f1d1d; }
      button:disabled { cursor: not-allowed; opacity: 0.55; }
      input, select, textarea { width: 100%; border: 1px solid rgba(148,163,184,0.28); border-radius: 14px; background: rgba(15,23,42,0.78); color: #f8fafc; outline: none; padding: 12px 13px; }
      label { color: #cbd5e1; display: grid; font-size: 12px; font-weight: 900; gap: 7px; }
      .app { margin: 0 auto; max-width: 1440px; padding: 22px; }
      .topbar { align-items: center; display: flex; gap: 14px; justify-content: space-between; margin-bottom: 18px; }
      .brand { align-items: center; display: flex; gap: 12px; min-width: 0; }
      .logo { border-radius: 18px; height: 52px; width: 52px; object-fit: cover; box-shadow: 0 14px 40px rgba(14,165,233,0.28); }
      .eyebrow { color: #67e8f9; font-size: 11px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: clamp(22px, 3vw, 34px); line-height: 1; }
      h2 { font-size: 20px; }
      h3 { font-size: 15px; }
      .muted { color: #94a3b8; }
      .status { align-items: center; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; display: inline-flex; gap: 8px; padding: 9px 12px; font-size: 12px; font-weight: 950; }
      .dot { border-radius: 999px; height: 9px; width: 9px; background: #22c55e; box-shadow: 0 0 0 5px rgba(34,197,94,0.12); }
      .offline .dot { background: #f97316; box-shadow: 0 0 0 5px rgba(249,115,22,0.14); }
      .syncing .dot { background: #38bdf8; box-shadow: 0 0 0 5px rgba(56,189,248,0.14); }
      .error .dot { background: #ef4444; box-shadow: 0 0 0 5px rgba(239,68,68,0.14); }
      .grid { display: grid; gap: 14px; }
      .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; }
      .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; background: rgba(15,23,42,0.78); box-shadow: 0 24px 70px rgba(0,0,0,0.28); padding: 16px; backdrop-filter: blur(18px); }
      .panel { display: none; }
      .panel.active { display: block; }
      .nav { display: grid; gap: 8px; }
      .nav button { justify-content: flex-start; width: 100%; }
      .nav button.active { background: #e0f2fe; color: #082f49; }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .kpi { border: 1px solid rgba(255,255,255,0.10); border-radius: 18px; background: rgba(255,255,255,0.06); padding: 14px; }
      .kpi strong { display: block; font-size: 24px; margin-top: 5px; }
      .results { display: grid; gap: 8px; max-height: 460px; overflow: auto; padding-right: 4px; }
      .result { border: 1px solid rgba(255,255,255,0.10); border-radius: 16px; background: rgba(2,6,23,0.42); cursor: pointer; padding: 12px; text-align: left; }
      .result.active { border-color: #67e8f9; background: rgba(8,145,178,0.22); }
      .row { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .message { border-radius: 16px; margin-top: 12px; padding: 12px; font-size: 13px; font-weight: 850; }
      .ok { background: rgba(34,197,94,0.14); color: #bbf7d0; }
      .warn { background: rgba(245,158,11,0.14); color: #fde68a; }
      .bad { background: rgba(239,68,68,0.14); color: #fecaca; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 10px 8px; text-align: left; vertical-align: top; }
      th { color: #93c5fd; font-size: 11px; text-transform: uppercase; }
      .receipt { background: #fff; color: #0f172a; border-radius: 12px; padding: 16px; max-width: 420px; }
      .receipt h3 { font-size: 18px; }
      @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .row, .three { grid-template-columns: 1fr; } }
      @media print { body { background: #fff; } body * { visibility: hidden; } #printable-receipt, #printable-receipt * { visibility: visible; } #printable-receipt { left: 0; position: absolute; top: 0; } }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <img class="logo" src="./icon.png" alt="Ddumba OS" onerror="this.style.display='none'" />
          <div>
            <div class="eyebrow">Desktop Offline Workspace</div>
            <h1>Ddumba Property Operations OS</h1>
            <p class="muted" id="identity-line">Local-first desktop edition</p>
          </div>
        </div>
        <div class="status" id="connection-status"><span class="dot"></span><span>Starting...</span></div>
      </header>

      <main id="root"></main>
    </div>

    <script>
      const API_BASE = "https://ddumba-property-operations-os-evgw.vercel.app";
      const APP_VERSION = "0.1.1";
      const root = document.getElementById("root");
      const identityLine = document.getElementById("identity-line");
      const statusEl = document.getElementById("connection-status");
      const state = { session: null, selected: null, searchRows: [], message: "", panel: "search", syncing: false };

      const invoke = (command, args = {}) => {
        const fn = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
        if (!fn) throw new Error("Native desktop bridge is unavailable.");
        return fn(command, args);
      };
      const uuid = () => crypto.randomUUID();
      const today = () => new Date().toISOString().slice(0, 10);
      const money = (value) => "UGX " + Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
      const safe = (value) => String(value ?? "");
      const first = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";

      function setMessage(text, tone = "ok") { state.message = text ? '<div class="message ' + tone + '">' + text + '</div>' : ""; render(); }
      function bootstrap() { return state.session?.bootstrap || {}; }
      function profile() { return bootstrap().profile || {}; }
      function company() { return bootstrap().company || {}; }
      function offices() { return bootstrap().offices || []; }
      function activeOffice() { return offices()[0] || {}; }
      function employeeId() { return bootstrap().employeeId || null; }
      function pendingText(count) { return count === 1 ? "1 pending change" : count + " pending changes"; }

      async function pendingRows() {
        try { return await invoke("desktop_list_offline_mutations", { statuses: ["waiting_to_sync", "failed", "conflict"], limit: 250 }); }
        catch { return []; }
      }

      async function setConnection(status, count = 0) {
        const label = status === "syncing" ? "SYNCING" : navigator.onLine ? (count ? "ONLINE - PENDING" : "ONLINE - SYNCED") : "OFFLINE";
        statusEl.className = "status " + (status === "syncing" ? "syncing" : navigator.onLine ? (status === "error" ? "error" : "") : "offline");
        statusEl.innerHTML = '<span class="dot"></span><span>' + label + (count ? " · " + pendingText(count) : "") + '</span>';
      }

      async function refreshStatus() {
        const rows = await pendingRows();
        await setConnection(state.syncing ? "syncing" : "normal", rows.length);
      }

      async function init() {
        await invoke("desktop_init_offline_database");
        const saved = await invoke("desktop_get_session");
        if (saved) state.session = saved;
        window.addEventListener("online", () => { refreshStatus(); syncNow(); });
        window.addEventListener("offline", refreshStatus);
        setInterval(() => { if (navigator.onLine) syncNow(false); else refreshStatus(); }, 30000);
        await refreshStatus();
        render();
        if (state.session && navigator.onLine) syncNow(false);
      }

      async function onlineLogin(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const deviceId = localStorage.getItem("ddumba.desktop.device_id") || uuid();
        localStorage.setItem("ddumba.desktop.device_id", deviceId);
        setMessage("Signing in and preparing offline workspace...", "warn");
        try {
          const response = await fetch(API_BASE + "/api/desktop/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId,
              deviceName: navigator.userAgent.slice(0, 80) || "Windows desktop",
              identifier: form.get("identifier"),
              pin: form.get("pin"),
              platform: navigator.platform || "desktop",
            }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error(payload.message || "Desktop login failed.");
          await invoke("desktop_save_session", { session: { desktop_token: payload.desktopToken, expires_at: payload.expiresAt, bootstrap: payload.bootstrap } });
          state.session = { desktopToken: payload.desktopToken, expiresAt: payload.expiresAt, bootstrap: payload.bootstrap };
          await syncBootstrap();
          setMessage("Online login complete. Offline workspace is ready on this device.", "ok");
        } catch (error) {
          setMessage(error.message || String(error), "bad");
        }
      }

      async function syncBootstrap() {
        if (!state.session?.desktopToken) throw new Error("Desktop session is missing.");
        const response = await fetch(API_BASE + "/api/desktop/bootstrap", { headers: { Authorization: "Bearer " + state.session.desktopToken } });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Initial sync failed.");
        await invoke("desktop_save_cache_records", { records: payload.records || [] });
        state.session.bootstrap = payload.bootstrap || state.session.bootstrap;
        await invoke("desktop_save_session", { session: { desktop_token: state.session.desktopToken, expires_at: state.session.expiresAt, bootstrap: state.session.bootstrap } });
        return payload;
      }

      async function search(event) {
        event?.preventDefault();
        const query = document.getElementById("search-query")?.value || "";
        const rows = await invoke("desktop_search_cache", { query, cacheTypes: ["room", "tenant", "landlord", "defaulter"], officeId: activeOffice().id || null, limit: 50 });
        state.searchRows = rows;
        state.selected = rows[0] || null;
        render();
      }

      function rowTitle(row) {
        const p = row.payload || {};
        if (row.cache_type === "room") return "Room " + first(p.room_number, p.normalized_room_number, p.id);
        if (row.cache_type === "tenant" || row.cache_type === "defaulter") return first(p.full_name, p.name, "Tenant");
        if (row.cache_type === "landlord") return first(p.full_name, p.name, "Landlord");
        return first(p.name, p.id);
      }
      function rowSubtitle(row) {
        const p = row.payload || {};
        return [row.cache_type, first(p.phone, p.status), p.balance != null ? "Balance " + money(p.balance) : "", p.monthly_rent != null ? "Rent " + money(p.monthly_rent) : ""].filter(Boolean).join(" · ");
      }
      function selectedTenantPayload() {
        const row = state.selected;
        if (!row) return null;
        const p = row.payload || {};
        if (row.cache_type === "tenant" || row.cache_type === "defaulter") return { tenantId: p.id, roomId: p.room_id, tenantName: first(p.full_name, p.name), roomNumber: p.room_number || p.room_id, balance: p.balance, revision: p.updated_at || p.created_at || null };
        if (row.cache_type === "room") return { tenantId: p.tenant_id || p.current_tenant_id || "", roomId: p.id, tenantName: p.tenant_name || "Tenant", roomNumber: first(p.room_number, p.normalized_room_number), balance: p.outstanding_balance, revision: p.updated_at || p.created_at || null };
        return null;
      }

      async function recordPayment(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const tenant = selectedTenantPayload();
        if (!tenant?.tenantId) return setMessage("Select a cached tenant or occupied room before recording payment.", "bad");
        const amount = Number(form.get("amount") || 0);
        if (!(amount > 0)) return setMessage("Enter a valid payment amount.", "bad");
        const tx = uuid();
        const localCreatedAt = new Date().toISOString();
        const payload = {
          amount,
          paymentDate: form.get("businessDate") || today(),
          paymentKind: "tenant_normal",
          paymentMethod: form.get("paymentMethod") || "cash",
          paymentSource: "tenant",
          referenceNumber: form.get("reference") || "",
          tenantId: tenant.tenantId,
        };
        const provisional = await invoke("desktop_save_offline_payment", { payment: {
          amount,
          base_revision: tenant.revision,
          business_date: payload.paymentDate,
          company_id: company().id,
          device_id: localStorage.getItem("ddumba.desktop.device_id") || uuid(),
          employee_id: employeeId(),
          local_created_at: localCreatedAt,
          office_id: activeOffice().id,
          payload,
          payment_method: payload.paymentMethod,
          reference: payload.referenceNumber,
          room_id: tenant.roomId || null,
          tenant_id: tenant.tenantId,
          transaction_uuid: tx,
          user_id: profile().id,
        }});
        state.lastReceipt = { provisional, tx, tenant, amount, method: payload.paymentMethod, date: payload.paymentDate, localCreatedAt };
        await refreshStatus();
        setMessage("Payment saved offline with receipt " + provisional + ". It will sync automatically when online.", "ok");
      }

      async function recordGeneric(event, type) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const tx = uuid();
        const payload = Object.fromEntries(form.entries());
        payload.amount = Number(payload.amount || 0);
        await invoke("desktop_save_offline_mutation", { mutation: {
          base_revision: null,
          business_date: payload.businessDate || today(),
          company_id: company().id,
          employee_id: employeeId(),
          local_created_at: new Date().toISOString(),
          office_id: activeOffice().id,
          payload,
          transaction_type: type,
          transaction_uuid: tx,
          user_id: profile().id,
        }});
        await refreshStatus();
        setMessage(type.replace("_", " ") + " saved offline and queued for sync.", "ok");
      }

      async function syncNow(showMessage = true) {
        if (!state.session?.desktopToken || !navigator.onLine || state.syncing) return;
        const rows = await invoke("desktop_list_offline_mutations", { statuses: ["waiting_to_sync", "failed"], limit: 100 });
        if (!rows.length) { await refreshStatus(); return; }
        state.syncing = true; await setConnection("syncing", rows.length);
        try {
          const mutations = rows.map((row) => ({
            baseRevision: row.base_revision,
            businessDate: row.business_date,
            companyId: row.company_id,
            deviceId: localStorage.getItem("ddumba.desktop.device_id"),
            employeeId: row.employee_id,
            localCreatedAt: row.local_created_at,
            officeId: row.office_id,
            payload: row.payload,
            retryCount: row.retry_count,
            syncStatus: row.sync_status,
            transactionType: row.transaction_type,
            transactionUuid: row.transaction_uuid,
            userId: row.user_id,
          }));
          const response = await fetch(API_BASE + "/api/desktop/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.session.desktopToken },
            body: JSON.stringify({ deviceId: localStorage.getItem("ddumba.desktop.device_id"), mutations }),
          });
          const payload = await response.json();
          for (const item of payload.accepted || []) {
            const status = String(item.status || "").includes("synced") ? "synced" : item.status;
            await invoke("desktop_update_offline_mutation_status", { transactionUuid: item.transactionUuid, syncStatus: status, serverAcknowledgementId: item.serverAcknowledgementId || null, failureReason: null });
          }
          for (const item of payload.rejected || []) {
            await invoke("desktop_update_offline_mutation_status", { transactionUuid: item.transactionUuid, syncStatus: "failed", serverAcknowledgementId: null, failureReason: item.reason || "Sync failed" });
          }
          if (navigator.onLine) await syncBootstrap().catch(() => null);
          if (showMessage) setMessage("Sync completed. Accepted: " + (payload.accepted || []).length + ", rejected: " + (payload.rejected || []).length + ".", payload.rejected?.length ? "warn" : "ok");
        } catch (error) {
          await setConnection("error", rows.length);
          if (showMessage) setMessage(error.message || String(error), "bad");
        } finally {
          state.syncing = false; await refreshStatus(); render();
        }
      }

      async function switchPanel(panel) { state.panel = panel; render(); if (panel === "outbox") await renderOutbox(); }

      function loginScreen() {
        return '<div class="layout"><section class="card"><h2>Desktop Login</h2><p class="muted" style="margin-top:6px">Sign in online once to authorize this device and download your permitted office data. After that, this installed app can open offline.</p><form class="grid" style="margin-top:16px" onsubmit="onlineLogin(event)"><label>Username / phone / employee code<input name="identifier" autocomplete="username" /></label><label>PIN / Password<input name="pin" type="password" autocomplete="current-password" required /></label><button type="submit">Login and sync offline workspace</button></form>' + state.message + '</section><section class="card"><h2>Offline-first behavior</h2><div class="grid" style="margin-top:14px"><div class="kpi"><span class="muted">Bundled UI</span><strong>Local</strong></div><div class="kpi"><span class="muted">Database</span><strong>SQLite</strong></div><div class="kpi"><span class="muted">Outbox</span><strong>Durable</strong></div><div class="kpi"><span class="muted">Sync</span><strong>Auto</strong></div></div></section></div>';
      }

      function workspace() {
        const boot = bootstrap();
        identityLine.textContent = first(profile().fullName, "Desktop user") + " · " + first(activeOffice().office_name, activeOffice().name, company().name, "Authorized workspace");
        return '<div class="layout"><aside class="card"><div class="nav">' +
          nav("search", "Search & Balances") + nav("payments", "Payment Entry") + nav("promises", "Promise Centre") + nav("expenses", "Expenses") + nav("collections", "Collections / Outbox") + nav("receipt", "Offline Receipt") +
          '</div><div class="message warn">Internet loss will not close this workspace. Pending entries stay in SQLite until synchronized.</div><button class="secondary" style="width:100%;margin-top:10px" onclick="syncNow(true)">Sync Now</button></aside><section class="card">' +
          panelHtml() + state.message + '</section></div>';
      }
      function nav(key, label) { return '<button class="' + (state.panel === key ? "active" : "secondary") + '" onclick="switchPanel(\\'' + key + '\\')">' + label + '</button>'; }
      function panelHtml() {
        if (state.panel === "payments") return paymentPanel();
        if (state.panel === "promises") return genericPanel("promise", "Promise Centre", "Promise amount", "Promise date");
        if (state.panel === "expenses") return genericPanel("expense_request", "Expenses", "Expense amount", "Expense date");
        if (state.panel === "collections") return '<h2>Collections / Sync Outbox</h2><p class="muted">Queued offline entries and recent sync status.</p><div id="outbox" style="margin-top:14px"></div>';
        if (state.panel === "receipt") return receiptPanel();
        return searchPanel();
      }
      function searchPanel() {
        return '<h2>Tenant, room and landlord search</h2><form class="row" style="margin-top:14px" onsubmit="search(event)"><input id="search-query" placeholder="Room number, tenant, phone, landlord, defaulter" /><button type="submit">Search local cache</button></form><div class="row" style="margin-top:14px"><div class="results">' + state.searchRows.map((row, i) => '<button class="result ' + (state.selected?.id === row.id && state.selected?.cache_type === row.cache_type ? 'active' : '') + '" onclick="state.selected=state.searchRows[' + i + '];render()"><strong>' + rowTitle(row) + '</strong><br><span class="muted">' + rowSubtitle(row) + '</span></button>').join("") + '</div><div class="card">' + selectedDetails() + '</div></div>';
      }
      function selectedDetails() {
        if (!state.selected) return '<p class="muted">Select a cached room, tenant, landlord or defaulter.</p>';
        const p = state.selected.payload || {};
        return '<h3>' + rowTitle(state.selected) + '</h3><p class="muted" style="margin-top:6px">' + rowSubtitle(state.selected) + '</p><pre style="white-space:pre-wrap;color:#cbd5e1;font-size:12px;max-height:320px;overflow:auto">' + JSON.stringify(p, null, 2) + '</pre>';
      }
      function paymentPanel() {
        const t = selectedTenantPayload();
        return '<h2>Offline Payment Entry</h2><p class="muted">Selected: ' + (t ? first(t.tenantName, t.roomNumber, t.tenantId) : 'None') + '</p><form class="grid" style="margin-top:14px" onsubmit="recordPayment(event)"><div class="three"><label>Amount paid<input name="amount" type="number" min="1" required /></label><label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option></select></label><label>Business date<input name="businessDate" type="date" value="' + today() + '" /></label></div><label>Reference<input name="reference" placeholder="Bank / mobile money reference if any" /></label><button type="submit">Save Offline Payment</button></form>';
      }
      function genericPanel(type, title, amountLabel, dateLabel) {
        return '<h2>' + title + '</h2><form class="grid" style="margin-top:14px" onsubmit="recordGeneric(event,\\'' + type + '\\')"><div class="row"><label>' + amountLabel + '<input name="amount" type="number" min="0" /></label><label>' + dateLabel + '<input name="businessDate" type="date" value="' + today() + '" /></label></div><label>Notes<textarea name="notes" rows="4"></textarea></label><button type="submit">Save Offline</button></form>';
      }
      function receiptPanel() {
        if (!state.lastReceipt) return '<h2>Offline Receipt</h2><p class="muted">Record an offline payment to generate a provisional receipt.</p>';
        const r = state.lastReceipt;
        return '<div id="printable-receipt" class="receipt"><h3>OFFLINE - PENDING SYNC</h3><p><strong>Receipt:</strong> ' + r.provisional + '</p><p><strong>Tenant:</strong> ' + first(r.tenant.tenantName, r.tenant.tenantId) + '</p><p><strong>Room:</strong> ' + first(r.tenant.roomNumber, r.tenant.roomId) + '</p><p><strong>Amount:</strong> ' + money(r.amount) + '</p><p><strong>Payment Method:</strong> ' + r.method + '</p><p><strong>Office:</strong> ' + first(activeOffice().office_name, activeOffice().name) + '</p><p><strong>Prepared By:</strong> ' + first(profile().fullName, "Desktop user") + '</p><p><strong>Offline UUID:</strong> ' + r.tx + '</p></div><button style="margin-top:12px" onclick="window.print()">Print Receipt</button>';
      }
      async function renderOutbox() {
        const rows = await invoke("desktop_list_offline_mutations", { statuses: ["waiting_to_sync", "failed", "conflict", "synced"], limit: 100 });
        const target = document.getElementById("outbox");
        if (!target) return;
        target.innerHTML = '<table><thead><tr><th>Type</th><th>Date</th><th>Status</th><th>Amount</th><th>UUID</th></tr></thead><tbody>' + rows.map((row) => '<tr><td>' + row.transaction_type + '</td><td>' + row.business_date + '</td><td>' + row.sync_status + '</td><td>' + money(row.payload?.amount) + '</td><td>' + row.transaction_uuid + '</td></tr>').join("") + '</tbody></table>';
      }
      function render() {
        root.innerHTML = state.session ? workspace() : loginScreen();
        if (state.panel === "outbox") renderOutbox();
      }
      window.onlineLogin = onlineLogin; window.search = search; window.state = state; window.render = render; window.recordPayment = recordPayment; window.recordGeneric = recordGeneric; window.switchPanel = switchPanel; window.syncNow = syncNow;
      init().catch((error) => { root.innerHTML = '<section class="card"><h2>Desktop startup failed</h2><p class="message bad">' + (error.message || String(error)) + '</p></section>'; });
    </script>
  </body>
</html>
`);
