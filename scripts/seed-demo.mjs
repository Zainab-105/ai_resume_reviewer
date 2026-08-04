/**
 * Seeds a demo account with two resume versions and a job target, so the
 * screenshots show a populated app rather than empty states.
 * Prints the credentials for the screenshot script to reuse.
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

const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `demo.${stamp}@gmail.com`;
const password = "Demo-Password-123!";

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

await fetch(`${SUPA}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, data: { full_name: "Jane Doe" } }),
});

const tokenRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const auth = await tokenRes.json();
if (!auth.access_token) throw new Error(`sign-in failed: ${JSON.stringify(auth).slice(0, 200)}`);

const ref = SUPA.match(/https:\/\/([a-z0-9]+)\.supabase/)[1];
const session = {
  access_token: auth.access_token,
  token_type: "bearer",
  expires_in: auth.expires_in,
  expires_at: auth.expires_at,
  refresh_token: auth.refresh_token,
  user: auth.user,
};
const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const chunk = 3180;
const cookies = [];
if (encoded.length <= chunk) {
  cookies.push([`sb-${ref}-auth-token`, encodeURIComponent(encoded)]);
} else {
  for (let i = 0, p = 0; i < encoded.length; i += chunk, p += 1) {
    cookies.push([`sb-${ref}-auth-token.${p}`, encodeURIComponent(encoded.slice(i, i + chunk))]);
  }
}
for (const [k, v] of cookies) jar.set(k, v);

const JD = `Senior Backend Engineer

Requirements:
- Strong TypeScript and Node.js experience
- Kubernetes and Docker in production
- PostgreSQL or similar relational databases
- Terraform for infrastructure as code

Nice to have:
- GraphQL experience
- Machine learning exposure`;

async function uploadAndAnalyze(fixture, fileName, withJd) {
  const form = new FormData();
  form.set("file", new File([fs.readFileSync(path.join(FIXTURES, fixture))], fileName, {
    type: "application/pdf",
  }));
  if (withJd) {
    form.set("job_description", JD);
    form.set("job_title", "Senior Backend Engineer");
  }

  const up = await site("/api/upload", { method: "POST", body: form });
  const uploaded = await up.json();
  if (!uploaded.resumeId) throw new Error(`upload failed: ${JSON.stringify(uploaded).slice(0, 200)}`);

  const an = await site("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resumeId: uploaded.resumeId,
      jobTargetId: uploaded.jobTargetId,
      targetRole: "Senior Backend Engineer",
      seniority: "senior",
    }),
  });
  const analyzed = await an.json();
  if (!analyzed.reviewId) throw new Error(`analyze failed: ${JSON.stringify(analyzed).slice(0, 200)}`);

  console.error(`  ${fileName} -> v${uploaded.version}, review ${analyzed.reviewId}`);
  return analyzed.reviewId;
}

console.error("Seeding demo account...");
const review1 = await uploadAndAnalyze("sample-resume.pdf", "Jane-Doe-Resume.pdf", true);
const review2 = await uploadAndAnalyze("sample-resume-v2.pdf", "Jane-Doe-Resume-v2.pdf", true);

// stdout is machine-readable for the screenshot script.
console.log(JSON.stringify({ email, password, cookies, review1, review2 }));
