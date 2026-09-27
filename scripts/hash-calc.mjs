import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/calc");
const files = (await readdir(dir)).filter((f) => f.endsWith(".js")).sort();
const h = createHash("sha256");
for (const f of files) {
  h.update(f);
  h.update(await readFile(join(dir, f)));
}
console.log(h.digest("hex"));
console.log(files.join(","));
