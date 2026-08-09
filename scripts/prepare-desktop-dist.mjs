import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "desktop-dist");
const tauriResources = resolve(root, "src-tauri/resources");
const nextResource = resolve(tauriResources, "next-app");
const nodeResource = resolve(tauriResources, "node");
const standalone = resolve(root, ".next/standalone");
const standaloneStatic = resolve(standalone, ".next/static");
const standalonePublic = resolve(standalone, "public");

function copyRuntimeNode() {
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const target = resolve(nodeResource, platform, process.platform === "win32" ? "node.exe" : "node");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(process.execPath, target);
}

if (!existsSync(resolve(standalone, "server.js"))) {
  throw new Error("Next standalone server was not found. Run `npm run build` before `npm run desktop:prepare`.");
}

rmSync(dist, { force: true, recursive: true });
rmSync(nextResource, { force: true, recursive: true });
mkdirSync(dist, { recursive: true });
mkdirSync(nextResource, { recursive: true });

copyFileSync(resolve(root, "src-tauri/icons/icon.png"), resolve(dist, "icon.png"));
cpSync(standalone, nextResource, { recursive: true });

rmSync(standaloneStatic, { force: true, recursive: true });
mkdirSync(dirname(standaloneStatic), { recursive: true });
cpSync(resolve(root, ".next/static"), standaloneStatic, { recursive: true });

if (existsSync(resolve(root, "public"))) {
  rmSync(standalonePublic, { force: true, recursive: true });
  cpSync(resolve(root, "public"), standalonePublic, { recursive: true });
}

copyRuntimeNode();

writeFileSync(resolve(dist, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ddumba Property Operations OS</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body {
        align-items: center;
        background: radial-gradient(circle at 18% 12%, rgba(34, 211, 238, 0.18), transparent 30%), linear-gradient(135deg, #020617, #07111f 45%, #0f172a);
        color: #f8fafc;
        display: grid;
        margin: 0;
        min-height: 100vh;
        padding: 28px;
        place-items: center;
      }
      main {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 24px;
        background: rgba(15,23,42,0.82);
        box-shadow: 0 24px 80px rgba(0,0,0,0.38);
        max-width: 680px;
        padding: 28px;
        text-align: center;
        width: 100%;
      }
      img { border-radius: 22px; height: 86px; width: 86px; object-fit: cover; }
      .eyebrow { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .22em; margin-top: 18px; text-transform: uppercase; }
      h1 { font-size: clamp(28px, 5vw, 44px); line-height: 1; margin: 10px 0; }
      p { color: #cbd5e1; font-size: 15px; font-weight: 750; line-height: 1.6; margin: 0; }
      .status { border-radius: 16px; background: rgba(2,6,23,.55); color: #bae6fd; font-size: 13px; font-weight: 900; margin-top: 18px; padding: 13px; }
      button { border: 0; border-radius: 14px; background: #06b6d4; color: #042f2e; cursor: pointer; font: inherit; font-size: 13px; font-weight: 950; margin-top: 18px; padding: 12px 16px; }
    </style>
  </head>
  <body>
    <main>
      <img src="./icon.png" alt="Ddumba OS" />
      <div class="eyebrow">Desktop Runtime</div>
      <h1>Ddumba Property Operations OS</h1>
      <p>Starting the same Ddumba OS application you use online from the bundled local desktop runtime.</p>
      <div id="status" class="status">Preparing local Ddumba OS server...</div>
      <button id="retry" hidden>Try Again</button>
    </main>
    <script>
      const statusEl = document.getElementById("status");
      const retryEl = document.getElementById("retry");

      async function invoke(command, args) {
        const tauri = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
        if (!tauri) throw new Error("Desktop runtime is not available.");
        return tauri(command, args);
      }

      async function boot() {
        retryEl.hidden = true;
        statusEl.textContent = "Starting local Ddumba OS...";
        try {
          const status = await invoke("desktop_next_server_status");
          if (!status.ready) {
            throw new Error(status.error || "Local Ddumba OS server is not ready yet.");
          }
          statusEl.textContent = "Opening Ddumba OS...";
          window.location.replace(status.url);
        } catch (error) {
          statusEl.textContent = error instanceof Error ? error.message : "Ddumba OS could not start.";
          retryEl.hidden = false;
        }
      }

      retryEl.addEventListener("click", boot);
      setTimeout(boot, 250);
    </script>
  </body>
</html>
`);
