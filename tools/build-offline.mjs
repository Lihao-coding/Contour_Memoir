import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
const dist = new URL("../dist/", import.meta.url);


const assets = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && entry.name !== "offline-worker.js")
  .map((entry) => relative(fileURLToPath(dist), join(entry.parentPath, entry.name)).split(sep).map(encodeURIComponent).join("/"))
  .sort();
const hash = createHash("sha256");
await Promise.all(assets.map((file) => readFile(new URL(file, dist)))).then((contents) => {
  contents.forEach((content, index) => hash.update(assets[index]).update(content));
});
const version = hash.digest("hex").slice(0, 16);
const template = await readFile(new URL("./offline-worker.js", import.meta.url), "utf8");
await writeFile(new URL("offline-worker.js", dist), template
  .replace("__PACK_VERSION__", JSON.stringify(version)).replace("__PACK_ASSETS__", JSON.stringify(assets)));
console.log(`Offline route pack: ${assets.length} files, ${version}`);
