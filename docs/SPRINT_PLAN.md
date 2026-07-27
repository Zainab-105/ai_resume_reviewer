# AI Resume Reviewer — Sprint Plan

**Sprint length:** 5 days (MVP) + 5 days (Sprint 2, optional)
**Start:** 2026-07-27
**Companion doc:** [REQUIREMENTS.md](REQUIREMENTS.md)

Estimates assume ~7 focused hours/day. Each day ends with a **demoable** state and a commit. If a day runs long, cut the item marked `[stretch]` — never cut the item marked `[gate]`.

---

## Pre-Flight (30 min, do before Day 1)

- [ ] Confirm Node ≥ 20.9 (`node -v`) — Next 16 hard requirement, Node 18 is unsupported
- [ ] Create Supabase project, copy URL + anon key + service role key
- [ ] Create Google AI Studio API key
- [ ] Create `.env.local` from §8 of REQUIREMENTS.md; confirm `.env*` is gitignored
- [ ] `git checkout -b feat/mvp`

---

## Day 1 — Foundation, Auth, Schema

**Goal:** A logged-in user reaches an empty dashboard; a logged-out user cannot.

### 1.1 Project setup (1.5h)
- [ ] Install deps:
      `npm i @supabase/supabase-js @supabase/ssr zod unpdf @google/generative-ai`
      `npm i -D @types/node`
- [ ] `npx shadcn@latest init`; add `button card input textarea badge progress skeleton dialog dropdown-menu sonner tabs`
- [ ] Tailwind v4: theme tokens live in `app/globals.css` under `@theme` — **there is no `tailwind.config.js`**. Define brand colors, radii, dark-mode vars there.
- [ ] `npx next typegen` — generates `PageProps<'/route'>`, `LayoutProps`, `RouteContext` globals. Use these everywhere instead of hand-written prop types.
- [ ] Verify `npm run build` is green on the untouched scaffold **before** writing app code. Turbopack is the default builder in Next 16; if a dep injects a webpack config the build fails. Catch that now, not on Day 5.

### 1.2 Supabase schema + RLS (2h) `[gate]`
- [ ] Run the SQL from REQUIREMENTS.md §4 in the Supabase SQL editor
- [ ] `alter table X enable row level security` on all five tables
- [ ] Policies: `using (auth.uid() = user_id)` for select/insert/update/delete on each
- [ ] Create private storage bucket `resumes` + storage policy scoped to `{user_id}/` prefix
- [ ] Trigger: insert into `profiles` on `auth.users` insert
- [ ] **Verify RLS with two real users via the REST API, not the UI.** This is the gate. A leaked resume is the one bug that actually matters.

### 1.3 Auth wiring (2.5h)
- [ ] `lib/supabase/server.ts` — `createServerClient` from `@supabase/ssr`.
      ⚠️ `cookies()` is **async** in Next 16 — `const cookieStore = await cookies()`. Synchronous access was removed; it is not a warning, it throws.
- [ ] `lib/supabase/client.ts` — browser client
- [ ] **`proxy.ts` at project root** — NOT `middleware.ts`. That convention is deprecated in Next 16. Export a function named `proxy`. Runtime is always `nodejs` and cannot be configured to `edge`.
      ```ts
      // proxy.ts
      import { type NextRequest } from 'next/server'
      export async function proxy(request: NextRequest) { /* refresh session, guard routes */ }
      export const config = {
        matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)'],
      }
      ```
      Without a matcher, `proxy` runs on every request including static assets — that will block your CSS.
- [ ] Pages: `/login`, `/signup`, `/auth/callback/route.ts` (OAuth code exchange), password reset
- [ ] Guard `/dashboard/**` → redirect to `/login?next=<path>`
- [ ] Sign-out server action

### 1.4 Shell (1h)
- [ ] Root layout: nav with auth state, theme toggle, `<Toaster />`
- [ ] `app/(dashboard)/dashboard/page.tsx` — empty state
- [ ] `error.tsx` + `loading.tsx` per route group

**Day 1 demo:** sign up with Google → land on dashboard → sign out → `/dashboard` bounces to `/login`.

---

## Day 2 — Upload & Text Extraction

**Goal:** Upload a PDF, see its extracted text and stats persisted.

### 2.1 PDF extraction spike (1h) `[gate — do this first]`
- [ ] Prove `unpdf` extracts text in a route handler under Turbopack **before** building any UI. If it fails, you learn now, not at 6pm.
      ```ts
      import { extractText, getDocumentProxy } from 'unpdf'
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text, totalPages } = await extractText(pdf, { mergePages: true })
      ```
- [ ] Escape hatch if it fails: `next build --webpack` opts out of Turbopack.

### 2.2 Upload UI (2h)
- [ ] Dropzone: drag-drop + click, PDF-only, ≤5MB, single file
- [ ] Client validation with inline errors; upload progress; cancel
- [ ] Keyboard-accessible (real `<input type="file">` under the styled surface, not a div with a click handler)

### 2.3 Upload route (2.5h)
- [ ] `app/api/upload/route.ts` — POST, `FormData`
- [ ] Server-side re-validation: size, and MIME by magic bytes (`%PDF-`). Never trust the client's `Content-Type`.
- [ ] Upload to storage `resumes/{user_id}/{resume_id}.pdf`
- [ ] Extract text; compute page count + word count
- [ ] **If text < 100 chars → 422 "scanned/image-only PDF"**, delete the object, consume no quota
- [ ] Insert `resumes` row; return id
- [ ] Route handlers are uncached by default in Next 16 — correct for us, don't add `force-static`

### 2.4 Job description input (1h)
- [ ] Textarea, ≤10k chars, live counter, optional
- [ ] Persist to `job_targets` alongside the upload

### 2.5 Wire-up (0.5h)
- [ ] Dashboard shows uploaded resume card: filename, pages, words, extract preview

**Day 2 demo:** drop a PDF → row in `resumes` with real extracted text → scanned PDF rejected with a clear message.

---

## Day 3 — AI Analysis Engine

**Goal:** Upload produces a full, persisted, schema-valid review.

### 3.1 Deterministic ATS scorer (1.5h) `[do before the LLM]`
- [ ] `lib/resume/ats.ts` — implement the 8-check rubric from REQUIREMENTS.md §3.3.1 in pure TypeScript
- [ ] Unit-test each check with fixture strings
- [ ] This is computed in code and passed *into* the prompt as fact. The LLM comments on it; it never sets it. LLMs cannot count reliably, and a hallucinated ATS number is worse than no number.

### 3.2 Zod output schema (0.5h)
- [ ] `lib/ai/schema.ts` — `overall_score`, `sub_scores`, `strengths[{text, evidence}]`, `weaknesses[{text, severity, evidence}]`, `suggestions[{section, before, after, why}]`, `keyword_match`
- [ ] Every strength/weakness carries an `evidence` quote from the resume. Non-negotiable — it's what kills hallucinated feedback.

### 3.3 Provider layer (1.5h)
- [ ] `lib/ai/provider.ts` — Gemini 2.5 Flash with JSON mode + response schema
- [ ] `lib/ai/prompt.ts` — versioned template (`PROMPT_VERSION = 'v1'`), inputs: resume text, ATS facts, target role + seniority, optional JD
- [ ] Retry once on invalid JSON; on second failure return a typed error, not garbage
- [ ] `[stretch]` Claude Sonnet 5 fallback on Gemini 5xx

### 3.4 Keyword matching (1h)
- [ ] `lib/resume/keywords.ts` — extract JD requirements, match against resume, return `{keyword, present, location}[]` + match %
- [ ] Normalize: case, plurals, common aliases (`JS`/`JavaScript`, `K8s`/`Kubernetes`)

### 3.5 Analyze route (2h)
- [ ] `app/api/analyze/route.ts`, `export const maxDuration = 60`
- [ ] Order: auth → **quota check in Postgres** → load text → cap at 30k chars → ATS score → prompt → LLM → Zod validate → insert `reviews` + `usage_events` **in one transaction** → return id
- [ ] Persist `model`, `prompt_version`, `tokens_in/out`, `latency_ms`
- [ ] Structured log per call

### 3.6 Red-flag detector (0.5h)
- [ ] Rule-based: gaps > 6 months, missing dates, first/third person mix, unprofessional email, dead links. Cheap, no tokens, high perceived value.

**Day 3 demo:** upload + JD → complete review JSON in the DB with real scores, quoted evidence, and a keyword table.

---

## Day 4 — Results UI, History, Responsive

**Goal:** The review looks like a product.

### 4.1 Review page (3h)
- [ ] `app/(dashboard)/dashboard/reviews/[id]/page.tsx`
      ⚠️ `params` is a **Promise** in Next 16: `const { id } = await props.params`. Use the generated `PageProps<'/dashboard/reviews/[id]'>` type.
- [ ] Score hero: overall + ATS as radial gauges, sub-score bars
- [ ] ATS breakdown: each of the 8 checks pass/fail with its explanation
- [ ] Strengths / Weaknesses cards, severity-colored, each showing its evidence quote
- [ ] Suggestions as before → after diff cards with copy-to-clipboard
- [ ] Keyword match table with a missing-keywords callout
- [ ] Colors must not be the only signal — pair every severity color with an icon or label (WCAG)

### 4.2 History (1.5h)
- [ ] `/dashboard/reviews` — table: date, filename, overall, ATS, JD, actions
- [ ] Delete with confirm (cascades to storage object)
- [ ] Empty state with a CTA
- [ ] After creating a review use **`updateTag(...)`** in the server action, not `revalidateTag`. `updateTag` gives read-your-writes so the user sees their new review immediately. If you do use `revalidateTag`, Next 16 **requires** a second cacheLife arg: `revalidateTag('reviews', 'max')` — the one-arg form is a TS error.

### 4.3 Analysis progress UX (1h)
- [ ] Multi-stage indicator: Uploading → Extracting → Analyzing → Done
- [ ] Skeletons, `aria-live="polite"` on status
- [ ] Quota badge: "3 of 5 analyses left today"
- [ ] `[stretch]` stream sections as they arrive

### 4.4 Responsive + polish (1.5h)
- [ ] Test at 360 / 768 / 1024 / 1440
- [ ] Tables scroll inside `overflow-x: auto` — **the page body never scrolls horizontally**
- [ ] Dark mode verified on every page
- [ ] Full keyboard pass; visible focus rings
- [ ] Landing page: hero, 3 features, sample screenshot, CTA

**Day 4 demo:** full flow on a phone-width viewport, light and dark.

---

## Day 5 — Harden, Deploy, Document

**Goal:** Live URL, README a stranger can follow.

### 5.1 Security & error pass (2h) `[gate]`
- [ ] **Re-verify cross-user RLS by direct API call as user B against user A's review id.** Must 404/403.
- [ ] Confirm no `SUPABASE_SERVICE_ROLE_KEY` / AI key reachable from any Client Component (`grep -r` the client bundle)
- [ ] Storage signed URLs expire ≤ 60s
- [ ] Every failure path shows a human message: bad file, huge file, scanned PDF, quota hit, LLM failure, network drop
- [ ] Security headers + CSP in `next.config.ts`
- [ ] `npm run build` and `npm run lint` — **zero errors**, not "just warnings"

### 5.2 Deploy (1.5h)
- [ ] Push to GitHub; import to Vercel
- [ ] All env vars set in Vercel (server keys unprefixed)
- [ ] Supabase Auth redirect URLs updated to the production domain — this is the #1 first-deploy breakage
- [ ] Smoke-test the entire flow on production, in an incognito window
- [ ] Vercel Analytics on

### 5.3 README + screenshots (2h)
- [ ] Hero screenshot, one-line pitch, live demo link
- [ ] Feature list, tech stack with reasons
- [ ] **Publish the ATS rubric table** — it's the credibility centerpiece; hiding it makes the score look invented
- [ ] Architecture diagram (mermaid)
- [ ] Local setup: prerequisites, env vars, SQL migration, run
- [ ] Data & privacy statement — you're handling PII
- [ ] Roadmap (link the Sprint 2 items below)
- [ ] 4–6 screenshots: landing, upload, review, keyword match, history, mobile

### 5.4 Buffer (1.5h)
- [ ] Slack for whatever broke. Something will.

**Day 5 demo:** public URL, stranger signs up and gets a review.

---

## Sprint 2 (next 5 days) — Retention & Differentiation

Ordered by value ÷ effort. Ship in this order.

| Day | Items |
|---|---|
| 6 | Score-delta on re-upload + resume version chaining (FR-HIST-5/6) — the retention loop |
| 7 | Compare two reviews side-by-side (FR-CMP-1/2/3) |
| 8 | PDF export of the report (`@react-pdf/renderer`) + Markdown copy |
| 9 | Anonymous demo mode (sample resume, no signup) + public share link |
| 10 | Interview-questions generator, cover-letter draft, readability/jargon meter |

Also in Sprint 2: prompt eval harness — 10 fixture resumes with expected score ranges, run before every prompt change. Without it you will silently regress output quality the first time you "improve" the prompt.

---

## Next.js 16 Gotcha Checklist

Pin this. Every one of these differs from pre-16 tutorials and will bite mid-sprint.

| # | Gotcha | Correct form |
|---|---|---|
| 1 | `middleware.ts` deprecated | `proxy.ts` at root, export `proxy`. Node runtime only, no `edge`. |
| 2 | `cookies()` / `headers()` sync access removed | `const c = await cookies()` |
| 3 | `params` / `searchParams` are Promises | `const { id } = await props.params` |
| 4 | Hand-written page prop types | `npx next typegen` → `PageProps<'/path'>` |
| 5 | `revalidateTag('x')` is now a TS error | `revalidateTag('x', 'max')` — or `updateTag('x')` in a Server Action |
| 6 | Turbopack is default; webpack configs fail the build | Pick serverless-safe deps; `--webpack` is the escape hatch |
| 7 | `proxy` with no `matcher` runs on static assets too | Always set a negative matcher |
| 8 | `unstable_cacheLife` / `unstable_cacheTag` | Now stable — drop the prefix |
| 9 | `experimental_ppr` segment option removed | `cacheComponents: true` — we leave it **off** in v1 |
| 10 | Route Handlers uncached by default | Correct for us; do not add `force-static` |
| 11 | Node 18 unsupported | Node ≥ 20.9, TypeScript ≥ 5.1 |
| 12 | Tailwind v4 has no JS config | Theme tokens in `app/globals.css` via `@theme` |

---

## Definition of Done (per feature)

1. Works on desktop + 360px mobile
2. Light + dark mode
3. Keyboard accessible, visible focus, labeled inputs
4. Loading + empty + error states all exist
5. Server-side validated, RLS-protected
6. `npm run build` and `npm run lint` clean
7. Committed with a conventional-commit message
