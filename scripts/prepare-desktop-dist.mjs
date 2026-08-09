import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = resolve(root, "desktop-dist");

rmSync(dist, { force: true, recursive: true });
mkdirSync(dist, { recursive: true });

writeFileSync(resolve(dist, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ddumba Property Operations OS</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        min-height: 100vh;
        margin: 0;
        background: radial-gradient(circle at 12% 0%, rgba(34, 211, 238, 0.26), transparent 32%),
          radial-gradient(circle at 88% 2%, rgba(16, 185, 129, 0.18), transparent 30%),
          linear-gradient(135deg, #020617 0%, #07111f 48%, #0f172a 100%);
        color: #f8fafc;
      }
      main {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 32px;
      }
      section {
        width: min(760px, 100%);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 28px;
        background: rgba(15, 23, 42, 0.78);
        box-shadow: 0 30px 80px rgba(0,0,0,0.36);
        padding: 28px;
        backdrop-filter: blur(22px);
      }
      .eyebrow {
        color: #67e8f9;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 10px;
        font-size: clamp(30px, 5vw, 48px);
        line-height: 1;
      }
      p {
        color: #cbd5e1;
        font-size: 15px;
        font-weight: 650;
        line-height: 1.55;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
      }
      button, a {
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        background: rgba(34, 211, 238, 0.16);
        color: #ecfeff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
        padding: 12px 16px;
        text-decoration: none;
      }
      .secondary {
        background: rgba(255,255,255,0.08);
        color: #e2e8f0;
      }
      .status {
        margin-top: 18px;
        border-radius: 18px;
        background: rgba(2, 6, 23, 0.62);
        padding: 14px 16px;
        color: #bae6fd;
        font-size: 13px;
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="eyebrow">Desktop Edition</div>
        <h1>Ddumba Property Operations OS</h1>
        <p>
          This packaged desktop shell is connected to the existing Ddumba OS backend and includes native commands for
          local SQLite cache, offline payment queueing, and sync status. Use the online workspace first to authenticate
          and prepare the offline cache.
        </p>
        <div class="actions">
          <button id="open-web">Open Ddumba OS</button>
          <button id="init-db" class="secondary">Initialize Local SQLite</button>
          <a class="secondary" href="https://ddumba-property-operations-os-evgw.vercel.app" target="_self">Production Login</a>
        </div>
        <div id="status" class="status">Ready.</div>
      </section>
    </main>
    <script>
      const status = document.getElementById("status");
      const productionUrl = "https://ddumba-property-operations-os-evgw.vercel.app";
      document.getElementById("open-web").addEventListener("click", () => {
        window.location.href = productionUrl;
      });
      document.getElementById("init-db").addEventListener("click", async () => {
        try {
          const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
          if (!invoke) {
            status.textContent = "Native desktop bridge is not available in this context.";
            return;
          }
          const result = await invoke("desktop_init_offline_database");
          status.textContent = "Local SQLite initialized. Search target: " + result.search_target_ms + "ms.";
        } catch (error) {
          status.textContent = error?.message ?? String(error);
        }
      });
    </script>
  </body>
</html>
`);
