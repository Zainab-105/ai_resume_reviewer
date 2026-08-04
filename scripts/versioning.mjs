/**
 * Version chaining gate.
 *
 * Uploads v1, analyses it, uploads an edited v2, analyses that, and asserts
 * the second upload was recognised as the next version of the same resume line
 * with a delta against the first. Then uploads a different person's resume and
 * asserts it does NOT join that line.
 *
 * Costs two Gemini analyses. Point at a deployment with E2E_BASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "scripts", "fixtures");

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const stamp = String(process.hrtime.bigint()).slice(-10);
const email = `ver.${stamp}@gmail.com`;
const password = "Test-Password-123!";

let failures = 0;
function check(ok, label, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures += 1;
}

const jar = new Map();
function storeCookies(res) {
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" || cookie.includes("Max-Age=0")) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function site(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  storeCookies(res);
  return res;
}

let accessToken;

async function signUpAndIn() {
  await fetch(`${SUPA}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed: ${JSON.stringify(body).slice(0, 200)}`);
  accessToken = body.access_token;

  const ref = SUPA.match(/https:\/\/([a-z0-9]+)\.supabase/)[1];
  const session = {
    access_token: body.access_token,
    token_type: "bearer",
    expires_in: body.expires_in,
    expires_at: body.expires_at,
    refresh_token: body.refresh_token,
    user: body.user,
  };
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunk = 3180;
  if (encoded.length <= chunk) {
    jar.set(`sb-${ref}-auth-token`, encodeURIComponent(encoded));
  } else {
    for (let i = 0, part = 0; i < encoded.length; i += chunk, part += 1) {
      jar.set(`sb-${ref}-auth-token.${part}`, encodeURIComponent(encoded.slice(i, i + chunk)));
    }
  }
}

async function upload(fixture, fileName) {
  const form = new FormData();
  form.set("file", new File([fs.readFileSync(path.join(FIXTURES, fixture))], fileName, {
    type: "application/pdf",
  }));
  const res = await site("/api/upload", { method: "POST", body: form });
  return res.json();
}

async function analyze(resumeId) {
  const res = await site("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId }),
  });
  return { status: res.status, body: await res.json() };
}

async function readReview(reviewId) {
  const res = await fetch(`${SUPA}/rest/v1/reviews?id=eq.${reviewId}&select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` },
  });
  const [row] = await res.json();
  return row;
}

await signUpAndIn();
console.log(`Signed in as ${email}\n`);

console.log("1. First upload starts a new resume line");
const v1 = await upload("sample-resume.pdf", "Jane-Doe-Resume.pdf");
check(Boolean(v1.resumeId), "v1 uploaded", JSON.stringify(v1).slice(0, 200));
check(v1.version === 1, "assigned version 1", String(v1.version));
check(Boolean(v1.lineId), "given a resume line");
check(v1.continuesLine === null, "does not continue anything");

console.log("\n2. Analyse v1 (real Gemini call)");
const a1 = await analyze(v1.resumeId);
check(a1.status === 200, "analysis succeeded", JSON.stringify(a1.body).slice(0, 200));
const review1 = a1.body.reviewId ? await readReview(a1.body.reviewId) : null;
check(review1?.score_delta === null, "no delta on a first version", JSON.stringify(review1?.score_delta));

console.log("\n3. An edited version is recognised as v2 of the same line");
const v2 = await upload("sample-resume-v2.pdf", "Jane-Doe-Resume-v2.pdf");
check(v2.lineId === v1.lineId, "joined the same line", `${v2.lineId} vs ${v1.lineId}`);
check(v2.version === 2, "assigned version 2", String(v2.version));
check(Boolean(v2.continuesLine), "reported as continuing an existing resume");
check(
  (v2.continuesLine?.similarity ?? 0) > 0.55,
  "similarity above the threshold",
  String(v2.continuesLine?.similarity?.toFixed(3)),
);

console.log("\n4. Analysing v2 produces a delta against v1");
const a2 = await analyze(v2.resumeId);
check(a2.status === 200, "analysis succeeded", JSON.stringify(a2.body).slice(0, 200));

const review2 = a2.body.reviewId ? await readReview(a2.body.reviewId) : null;
check(Boolean(review2?.score_delta), "delta stored on the review", JSON.stringify(review2?.score_delta));
check(review2?.score_delta?.previousVersion === 1, "delta points at version 1");
check(
  review2?.score_delta?.previousReviewId === a1.body.reviewId,
  "delta links the previous review",
);

if (review1 && review2?.score_delta) {
  const expectedAts = review2.ats_score - review1.ats_score;
  check(review2.score_delta.ats === expectedAts, "ATS delta is arithmetically correct", `${review2.score_delta.ats} vs ${expectedAts}`);
  const expectedOverall = review2.overall_score - review1.overall_score;
  check(
    review2.score_delta.overall === expectedOverall,
    "overall delta is arithmetically correct",
    `${review2.score_delta.overall} vs ${expectedOverall}`,
  );

  console.log("\n  --- progress ---");
  console.log(`  v1: overall ${review1.overall_score}, ATS ${review1.ats_score}`);
  console.log(`  v2: overall ${review2.overall_score}, ATS ${review2.ats_score}`);
  const d = review2.score_delta;
  console.log(`  delta: overall ${d.overall > 0 ? "+" : ""}${d.overall}, ATS ${d.ats > 0 ? "+" : ""}${d.ats}`);
}

console.log("\n5. A different resume does NOT join the line");
const other = await upload("scanned-resume.pdf", "Jane-Doe-Resume.pdf");
// The scanned fixture is rejected before line matching, which is itself the
// point: a document with no text can never be merged into someone's history.
check(
  other.reason === "no-text-layer",
  "an unreadable file is rejected rather than chained",
  JSON.stringify(other).slice(0, 150),
);

console.log("\n6. The review page renders the delta");
const page = await site(`/dashboard/reviews/${a2.body.reviewId}`);
const html = await page.text();
check(page.status === 200, "review page returns 200", String(page.status));
// React splits interpolated values into their own text nodes, so assert on the
// static strings around them rather than on rendered numbers.
check(html.includes("vs. version"), "renders the version comparison banner");
check(html.includes("See the previous version"), "links back to the previous version");
check(html.includes("Progress across"), "renders the version progress chart");
check(html.includes("Scores by resume version"), "chart has an accessible table");

console.log(`\n${failures === 0 ? "VERSIONING GATE PASSED" : `VERSIONING GATE FAILED — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);
