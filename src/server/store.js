import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../data/store");

async function ensure() {
  await mkdir(root, { recursive: true });
}

export async function readJson(name, fallback) {
  await ensure();
  try {
    return JSON.parse(await readFile(join(root, name), "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(name, value) {
  await ensure();
  const text = JSON.stringify(value, null, 2);
  await writeFile(join(root, name), text);
  return text;
}

export function storeDir() {
  return root;
}
