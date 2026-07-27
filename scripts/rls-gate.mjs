/**
 * RLS cross-user gate.
 *
 * Creates two users, has user A insert a resume, then has user B attempt to
 * read, update and delete it directly through the REST API — bypassing the UI
 * entirely. Every one of B's attempts must fail.
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

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const stamp = process.argv[2] ?? String(process.hrtime.bigint());
const users = [
  { label: "A", email: `rlstest.a.${stamp}@gmail.com`, password: "Test-Password-123!" },
  { label: "B", email: `rlstest.b.${stamp}@gmail.com`, password: "Test-Password-123!" },
];

async function signUp(user) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`signup ${user.label} failed: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function signIn(user) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`signin ${user.label} failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token, id: body.user.id };
}

const auth = (token) => ({
  apikey: KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

let failures = 0;
function assert(condition, label, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const signedUp = [];
for (const user of users) {
  const body = await signUp(user);
  signedUp.push(body);
}

// If the project requires email confirmation, password grant will fail.
let sessions;
try {
  sessions = await Promise.all(users.map(signIn));
} catch (error) {
  console.log("\nCannot sign in with password — email confirmation is probably ON.");
  console.log(String(error.message));
  console.log("\nTurn off 'Confirm email' in Authentication > Sign In / Providers > Email,");
  console.log("or confirm both users, then re-run this gate.");
  process.exit(2);
}

const [a, b] = sessions;
console.log(`\nuser A = ${a.id}\nuser B = ${b.id}\n`);

// --- A creates a resume row -------------------------------------------------
const insertRes = await fetch(`${URL}/rest/v1/resumes`, {
  method: "POST",
  headers: { ...auth(a.token), Prefer: "return=representation" },
  body: JSON.stringify({
    user_id: a.id,
    file_name: "secret-resume.pdf",
    storage_path: `${a.id}/secret.pdf`,
    file_size: 1234,
    extracted_text: "CONFIDENTIAL RESUME TEXT BELONGING TO USER A",
  }),
});
const inserted = await insertRes.json();
if (!insertRes.ok) {
  console.log("Setup failed — A could not insert own row:", JSON.stringify(inserted).slice(0, 300));
  process.exit(1);
}
const resumeId = inserted[0].id;
console.log("SETUP: user A created resume", resumeId, "\n");

console.log("A can reach its own data:");
{
  const res = await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}&select=*`, {
    headers: auth(a.token),
  });
  const rows = await res.json();
  assert(res.status === 200 && rows.length === 1, "A reads its own resume");
}

console.log("\nB must NOT reach A's data:");

// 1. Direct read by id
{
  const res = await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}&select=*`, {
    headers: auth(b.token),
  });
  const rows = await res.json();
  assert(
    Array.isArray(rows) && rows.length === 0,
    "B reading A's resume by id returns nothing",
    JSON.stringify(rows).slice(0, 150),
  );
}

// 2. Unfiltered table scan
{
  const res = await fetch(`${URL}/rest/v1/resumes?select=*`, { headers: auth(b.token) });
  const rows = await res.json();
  assert(
    Array.isArray(rows) && rows.length === 0,
    "B scanning the whole resumes table returns nothing",
    JSON.stringify(rows).slice(0, 150),
  );
}

// 3. Filtering by A's user_id explicitly
{
  const res = await fetch(`${URL}/rest/v1/resumes?user_id=eq.${a.id}&select=extracted_text`, {
    headers: auth(b.token),
  });
  const rows = await res.json();
  assert(
    Array.isArray(rows) && rows.length === 0,
    "B filtering on A's user_id returns nothing",
    JSON.stringify(rows).slice(0, 150),
  );
}

// 4. Update attempt
{
  const res = await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}`, {
    method: "PATCH",
    headers: { ...auth(b.token), Prefer: "return=representation" },
    body: JSON.stringify({ file_name: "hacked.pdf" }),
  });
  const rows = await res.json();
  assert(
    !res.ok || (Array.isArray(rows) && rows.length === 0),
    "B cannot update A's resume",
    `status ${res.status} ${JSON.stringify(rows).slice(0, 120)}`,
  );
}

// 5. Delete attempt
{
  const res = await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}`, {
    method: "DELETE",
    headers: { ...auth(b.token), Prefer: "return=representation" },
  });
  const rows = await res.json().catch(() => []);
  assert(
    !res.ok || (Array.isArray(rows) && rows.length === 0),
    "B cannot delete A's resume",
    `status ${res.status}`,
  );
}

// 6. Row still intact after B's attempts
{
  const res = await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}&select=file_name`, {
    headers: auth(a.token),
  });
  const rows = await res.json();
  assert(
    rows.length === 1 && rows[0].file_name === "secret-resume.pdf",
    "A's row survived B's write attempts unchanged",
    JSON.stringify(rows).slice(0, 120),
  );
}

// 7. Forging user_id on insert
{
  const res = await fetch(`${URL}/rest/v1/resumes`, {
    method: "POST",
    headers: { ...auth(b.token), Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: a.id,
      file_name: "planted.pdf",
      storage_path: `${a.id}/planted.pdf`,
      file_size: 10,
    }),
  });
  assert(!res.ok, "B cannot insert a row owned by A", `status ${res.status}`);
}

// 8. Storage: B listing A's folder
{
  const res = await fetch(`${URL}/storage/v1/object/list/resumes`, {
    method: "POST",
    headers: auth(b.token),
    body: JSON.stringify({ prefix: `${a.id}/`, limit: 100 }),
  });
  const rows = await res.json().catch(() => []);
  assert(
    !res.ok || (Array.isArray(rows) && rows.length === 0),
    "B cannot list A's storage folder",
    `status ${res.status} ${JSON.stringify(rows).slice(0, 120)}`,
  );
}

// 9. Quota RPC is per-caller
{
  const res = await fetch(`${URL}/rest/v1/rpc/analyses_used_today`, {
    method: "POST",
    headers: auth(b.token),
    body: "{}",
  });
  const value = await res.json();
  assert(res.status === 200 && value === 0, "quota RPC reports only the caller's usage", String(value));
}

// Cleanup
await fetch(`${URL}/rest/v1/resumes?id=eq.${resumeId}`, {
  method: "DELETE",
  headers: auth(a.token),
});

console.log(`\n${failures === 0 ? "RLS GATE PASSED" : `RLS GATE FAILED — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);
