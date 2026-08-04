/**
 * Finds storage objects with no corresponding `resumes` row.
 *
 * These accumulate when a delete cannot resolve its storage path — the row
 * goes, the PDF stays, and nothing ever references it again. Since resume PDFs
 * are personal data, leaving them in the bucket is a retention problem, not
 * just wasted space.
 *
 * Read-only by default. Pass --delete to actually remove them.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY: listing every user's objects is exactly
 * the cross-user read that RLS is there to prevent, so it cannot run on the
 * publishable key.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY;
const DELETE = process.argv.includes("--delete");

if (!SECRET) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required to audit across users.");
  process.exit(1);
}

const auth = {
  apikey: SECRET,
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
};

/** Storage list is per-prefix, so enumerate user folders then their contents. */
async function listFolder(prefix) {
  const res = await fetch(`${SUPA}/storage/v1/object/list/resumes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list "${prefix}" failed: ${res.status} ${await res.text()}`);
  return res.json();
}

console.log("Auditing the resumes bucket...\n");

const userFolders = (await listFolder("")).filter((entry) => !entry.metadata);

const objects = [];
for (const folder of userFolders) {
  for (const file of await listFolder(`${folder.name}/`)) {
    if (!file.metadata) continue; // a nested folder, not an object
    objects.push({
      path: `${folder.name}/${file.name}`,
      size: file.metadata.size ?? 0,
      created: file.created_at,
    });
  }
}

const rowsRes = await fetch(`${SUPA}/rest/v1/resumes?select=storage_path`, { headers: auth });
const referenced = new Set((await rowsRes.json()).map((r) => r.storage_path));

const orphans = objects.filter((o) => !referenced.has(o.path));
const orphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);

console.log(`objects in bucket : ${objects.length}`);
console.log(`referenced by rows: ${referenced.size}`);
console.log(`orphaned          : ${orphans.length} (${(orphanBytes / 1024).toFixed(1)} KB)\n`);

if (!orphans.length) {
  console.log("Nothing to clean up.");
  process.exit(0);
}

for (const orphan of orphans.slice(0, 30)) {
  console.log(`  ${orphan.path}  ${(orphan.size / 1024).toFixed(1)}KB  ${orphan.created ?? ""}`);
}
if (orphans.length > 30) console.log(`  ... and ${orphans.length - 30} more`);

if (!DELETE) {
  console.log(`\nRead-only. Re-run with --delete to remove these ${orphans.length} objects.`);
  process.exit(0);
}

console.log(`\nDeleting ${orphans.length} orphaned objects...`);

// Chunked so a large bucket does not exceed the request limit.
let removed = 0;
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100).map((o) => o.path);
  const res = await fetch(`${SUPA}/storage/v1/object/resumes`, {
    method: "DELETE",
    headers: auth,
    body: JSON.stringify({ prefixes: batch }),
  });
  if (!res.ok) {
    console.error(`  batch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  removed += batch.length;
  console.log(`  removed ${removed}/${orphans.length}`);
}

console.log(`\nDone. Removed ${removed} orphaned objects.`);
