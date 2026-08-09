import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const path of [".next", "desktop-dist", "src-tauri/resources"]) {
  rmSync(resolve(root, path), { force: true, recursive: true });
}
