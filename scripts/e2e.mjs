/**
 * End-to-end: sign up -> upload PDF -> analyze (real Gemini call) -> read the
 * persisted review. Drives the real Next.js routes over HTTP, with a cookie
 * jar, so the proxy/session path is exercised too.
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

const BASE = "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const stamp = String(process.hrtime.bigint()).slice(-10);
const email = `e2e.${stamp}@gmail.com`;
const password = "Test-Password-123!";

let failures = 0;
function check(ok, label, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures += 1;
}

// --- cookie jar -------------------------------------------------------------
const jar = new Map();
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" || cookie.includes("Max-Age=0")) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function site(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });
  storeCookies(res);
  return res;
}

console.log("1. Sign up a fresh user");
{
  const res = await fetch(`${SUPA}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  check(res.ok, "signup succeeded", JSON.stringify(body).slice(0, 200));
  if (!res.ok) process.exit(1);
}

console.log("\n2. Sign in through the app's own server action path");
{
  // Obtain tokens directly, then plant them as the SSR cookie the app reads.
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  check(Boolean(body.access_token), "obtained a session");

  const ref = SUPA.match(/https:\/\/([a-z0-9]+)\.supabase/)[1];
  const session = {
    access_token: body.access_token,
    token_type: "bearer",
    expires_in: body.expires_in,
    expires_at: body.expires_at,
    refresh_token: body.refresh_token,
    user: body.user,
  };
  // @supabase/ssr stores the session as a base64url-prefixed cookie.
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunkSize = 3180;
  if (encoded.length <= chunkSize) {
    jar.set(`sb-${ref}-auth-token`, encodeURIComponent(encoded));
  } else {
    for (let i = 0, part = 0; i < encoded.length; i += chunkSize, part += 1) {
      jar.set(`sb-${ref}-auth-token.${part}`, encodeURIComponent(encoded.slice(i, i + chunkSize)));
    }
  }
}

console.log("\n3. Dashboard is reachable while signed in");
{
  const res = await site("/dashboard");
  check(res.status === 200, "GET /dashboard returns 200", `got ${res.status}`);
}

console.log("\n4. Upload a real PDF");
let resumeId, jobTargetId;
{
  const pdf = fs.readFileSync(path.join(FIXTURES, "sample-resume.pdf"));
  const form = new FormData();
  form.set("file", new File([pdf], "Jane-Doe-Resume.pdf", { type: "application/pdf" }));
  form.set(
    "job_description",
    `Senior Backend Engineer

Requirements:
- Strong TypeScript experience
- Kubernetes and Docker in production
- PostgreSQL
- Terraform

Nice to have:
- GraphQL`,
  );
  form.set("job_title", "Senior Backend Engineer");

  const res = await site("/api/upload", { method: "POST", body: form });
  const body = await res.json();
  check(res.status === 200, "POST /api/upload returns 200", JSON.stringify(body).slice(0, 250));
  check(Boolean(body.resumeId), "a resume id came back");
  check(body.pageCount === 1, "page count extracted", String(body.pageCount));
  check(body.wordCount > 50, "word count extracted", String(body.wordCount));
  check(Boolean(body.jobTargetId), "job description stored");
  resumeId = body.resumeId;
  jobTargetId = body.jobTargetId;
}

console.log("\n5. Scanned PDF is rejected before any AI spend");
{
  const scanned = fs.readFileSync(path.join(FIXTURES, "scanned-resume.pdf"));
  const form = new FormData();
  form.set("file", new File([scanned], "scan.pdf", { type: "application/pdf" }));
  const res = await site("/api/upload", { method: "POST", body: form });
  const body = await res.json();
  check(res.status === 422, "scanned PDF returns 422", `got ${res.status}`);
  check(body.reason === "no-text-layer", "reason is no-text-layer", String(body.reason));
}

console.log("\n6. Non-PDF disguised with a PDF content-type is rejected");
{
  const form = new FormData();
  form.set("file", new File([Buffer.from("not a pdf at all")], "fake.pdf", { type: "application/pdf" }));
  const res = await site("/api/upload", { method: "POST", body: form });
  const body = await res.json();
  check(res.status === 400 && body.reason === "not-a-pdf", "magic-byte check rejects it", `${res.status} ${body.reason}`);
}

console.log("\n7. Analyze — real Gemini call (this takes ~15-25s)");
let reviewId;
{
  const started = Date.now();
  const res = await site("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId, jobTargetId, targetRole: "Backend Engineer", seniority: "senior" }),
  });
  const body = await res.json();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  check(res.status === 200, `POST /api/analyze returns 200 (${seconds}s)`, JSON.stringify(body).slice(0, 400));
  check(Boolean(body.reviewId), "a review id came back");
  reviewId = body.reviewId;
}

if (!reviewId) {
  console.log(`\n${failures} failure(s) — stopping before review checks.`);
  process.exit(1);
}

console.log("\n8. The persisted review is complete and well-formed");
{
  const res = await fetch(
    `${SUPA}/rest/v1/reviews?id=eq.${reviewId}&select=*`,
    {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${JSON.parse(Buffer.from(decodeURIComponent([...jar].find(([k]) => k.includes("auth-token"))[1]).replace(/^base64-/, ""), "base64url").toString()).access_token}`,
      },
    },
  );
  const [review] = await res.json();

  check(Boolean(review), "review row is readable by its owner");
  if (review) {
    check(review.status === "complete", "status is complete", review.status);
    check(review.overall_score >= 0 && review.overall_score <= 100, "overall score in range", String(review.overall_score));
    check(review.ats_score >= 0 && review.ats_score <= 100, "ATS score in range", String(review.ats_score));
    check(Array.isArray(review.ats_breakdown) && review.ats_breakdown.length === 8, "all 8 ATS checks stored", String(review.ats_breakdown?.length));
    check(Array.isArray(review.strengths) && review.strengths.length >= 3, "at least 3 strengths", String(review.strengths?.length));
    check(Array.isArray(review.weaknesses) && review.weaknesses.length >= 3, "at least 3 weaknesses", String(review.weaknesses?.length));
    check(Array.isArray(review.suggestions) && review.suggestions.length >= 5, "at least 5 suggestions", String(review.suggestions?.length));
    check(review.strengths?.every((s) => s.evidence?.length > 0), "every strength quotes evidence");
    check(review.suggestions?.every((s) => s.before && s.after), "every suggestion has before AND after");
    check(Boolean(review.keyword_match), "keyword match stored");
    check(typeof review.keyword_match?.matchPercent === "number", "match percent computed", String(review.keyword_match?.matchPercent));
    check(review.tokens_in > 0 && review.tokens_out > 0, "token usage recorded", `${review.tokens_in}/${review.tokens_out}`);
    check(/^gemini-/.test(review.model ?? ""), "model recorded", review.model);
    check(review.prompt_version === "v1", "prompt version recorded", review.prompt_version);

    console.log("\n  --- sample output ---");
    console.log(`  overall ${review.overall_score} | ATS ${review.ats_score} | match ${review.keyword_match?.matchPercent}%`);
    console.log(`  latency ${review.latency_ms}ms | tokens in ${review.tokens_in} out ${review.tokens_out}`);
    console.log(`  strength : ${review.strengths?.[0]?.text}`);
    console.log(`     quote : "${review.strengths?.[0]?.evidence}"`);
    console.log(`  weakness : [${review.weaknesses?.[0]?.severity}] ${review.weaknesses?.[0]?.text}`);
    console.log(`  rewrite  : "${review.suggestions?.[0]?.before}"`);
    console.log(`        -> : "${review.suggestions?.[0]?.after}"`);
    console.log(`  missing keywords: ${review.keyword_match?.missingRequired?.slice(0, 8).join(", ")}`);
  }
}

console.log("\n9. The review page renders");
{
  const res = await site(`/dashboard/reviews/${reviewId}`);
  const html = await res.text();
  check(res.status === 200, "review page returns 200", `got ${res.status}`);
  check(html.includes("ATS breakdown"), "ATS breakdown section rendered");
  check(html.includes("Suggested rewrites"), "suggestions section rendered");
  check(html.includes("Job match"), "keyword match section rendered");
}

console.log("\n10. Quota was consumed exactly once");
{
  // Assert against the RPC, not the rendered HTML — React splits `{remaining}`
  // and the surrounding text into separate nodes with comment markers between.
  const token = JSON.parse(
    Buffer.from(
      decodeURIComponent([...jar].find(([k]) => k.includes("auth-token"))[1]).replace(/^base64-/, ""),
      "base64url",
    ).toString(),
  ).access_token;

  const res = await fetch(`${SUPA}/rest/v1/rpc/analyses_used_today`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const used = await res.json();
  check(used === 1, "exactly one analysis counted against quota", `got ${used}`);

  const page = await site("/dashboard");
  const html = await page.text();
  check(html.includes("analyses left today"), "dashboard renders the quota badge");
}

console.log(`\n${failures === 0 ? "END-TO-END PASSED" : `END-TO-END FAILED — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);
