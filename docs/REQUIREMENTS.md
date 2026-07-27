# AI Resume Reviewer — Requirements Document

**Version:** 1.0
**Date:** 2026-07-27
**Status:** Draft for build

---

## 1. Product Summary

A web app where a job seeker uploads a resume (PDF), optionally pastes a target job description, and receives an AI-generated review: an overall score, an ATS-compatibility score, strengths, weaknesses, and concrete rewrite suggestions. Every review is stored so the user can revisit history, compare versions, and track improvement over time.

### 1.1 Target Users

| Persona | Need | Success signal |
|---|---|---|
| Active job seeker | Fast, honest feedback before applying | Uploads, reads review, edits resume, re-uploads |
| Career switcher | Understand gaps vs. a target role | Uses job-description targeting |
| Student / new grad | Doesn't know ATS rules exist | ATS score + keyword gaps |
| Recruiter / coach (stretch) | Screen or coach on multiple resumes | Bulk / compare features |

### 1.2 Non-Goals (v1)

- No resume *builder* / editor — we review, we don't author.
- No job board integration or auto-apply.
- No DOCX in MVP (post-MVP, see §7).
- No team/org accounts or billing in MVP.

---

## 2. Tech Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.12** (App Router) | Already scaffolded. Turbopack is default — no `--turbopack` flag. |
| Runtime | Node.js **20.9+** | Hard minimum for Next 16. |
| Language | TypeScript **5.1+**, `strict: true` | Already set. |
| UI | React **19.2.4**, Tailwind CSS **v4** | v4 uses `@import "tailwindcss"` + `@theme` — no `tailwind.config.js`. |
| Components | shadcn/ui + Radix | Add on Day 1. |
| DB / Auth / Storage | **Supabase** (Postgres + Auth + Storage) | Row Level Security on every table. |
| AI | **Gemini 2.5 Flash** primary, Claude Sonnet 5 fallback | Structured JSON output required. |
| PDF text | `unpdf` (serverless-safe) | Avoids `pdf-parse` Node-native issues under Turbopack. |
| Hosting | **Vercel** | Node runtime for AI + PDF routes. |
| Validation | **Zod** | Shared schemas: form input, AI output, API contracts. |

### 2.1 Next.js 16 Constraints That Change How We Build

These are breaking vs. older Next tutorials. **All of these are load-bearing for this project.**

1. **`middleware.ts` is deprecated → use `proxy.ts`.** File goes at project root, exports a function named `proxy`. `edge` runtime is NOT supported in `proxy`; it always runs `nodejs`. Supabase session refresh lives here.
2. **Async Request APIs are mandatory.** `cookies()`, `headers()`, `draftMode()` must be awaited. `params` and `searchParams` are Promises in `page.tsx`, `layout.tsx`, and `route.ts`. Synchronous access is fully removed in v16.
   ```ts
   const cookieStore = await cookies()
   export default async function Page(props: PageProps<'/reviews/[id]'>) {
     const { id } = await props.params
   }
   ```
3. **Run `npx next typegen`** to get `PageProps<'/route'>`, `LayoutProps`, `RouteContext` global helpers. Use them instead of hand-written prop types.
4. **`revalidateTag` requires a second `cacheLife` argument** — `revalidateTag('reviews', 'max')`. Single-arg form is a TypeScript error.
5. **`updateTag(tag)`** is the Server-Action-only API for read-your-writes. After creating a review, use `updateTag` (user sees it instantly), not `revalidateTag` (stale-while-revalidate).
6. **Route Handlers are not cached by default.** Good — our API routes are all dynamic. Don't add `force-static`.
7. **Turbopack is the default builder.** Any dependency that injects a webpack config will fail `next build`. This is why we pick `unpdf` over `pdf-parse`.
8. `cacheLife` / `cacheTag` are stable — drop the `unstable_` prefix.
9. PPR is now the `cacheComponents: true` config flag; the `experimental_ppr` segment option is removed. **We leave `cacheComponents` off in v1** — the app is user-specific and dynamic.

---

## 3. Functional Requirements

### 3.1 Authentication (FR-AUTH)

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-1 | Email + password sign-up with email confirmation | MVP |
| FR-AUTH-2 | Google OAuth sign-in | MVP |
| FR-AUTH-3 | Magic-link (passwordless) sign-in | Should |
| FR-AUTH-4 | Password reset flow | MVP |
| FR-AUTH-5 | Session refreshed on every request via `proxy.ts` | MVP |
| FR-AUTH-6 | `/dashboard/**` redirects unauthenticated users to `/login?next=<path>` | MVP |
| FR-AUTH-7 | Sign-out clears session and redirects to `/` | MVP |
| FR-AUTH-8 | Delete-account removes all rows + storage objects (GDPR) | Should |

### 3.2 Upload & Extraction (FR-UP)

| ID | Requirement | Priority |
|---|---|---|
| FR-UP-1 | Drag-and-drop + click-to-browse PDF upload | MVP |
| FR-UP-2 | Client-side validation: `application/pdf`, ≤ 5 MB, 1 file | MVP |
| FR-UP-3 | Server re-validates MIME by magic bytes (`%PDF-`), never trust client | MVP |
| FR-UP-4 | Store original in Supabase Storage at `resumes/{user_id}/{resume_id}.pdf`, private bucket | MVP |
| FR-UP-5 | Extract text server-side; persist raw text + page count + word count | MVP |
| FR-UP-6 | If extracted text < 100 chars → reject as "image-only / scanned PDF", explain, do not bill an AI call | MVP |
| FR-UP-7 | Upload progress indicator + cancel | Should |
| FR-UP-8 | DOCX support via `mammoth` | Post-MVP |
| FR-UP-9 | Paste-resume-as-text fallback (no file) | Should |

### 3.3 AI Analysis (FR-AI)

| ID | Requirement | Priority |
|---|---|---|
| FR-AI-1 | Overall score 0–100 with a one-line rationale | MVP |
| FR-AI-2 | ATS score 0–100 with per-check breakdown (see §3.3.1) | MVP |
| FR-AI-3 | 3–6 strengths, each with a quote from the resume as evidence | MVP |
| FR-AI-4 | 3–6 weaknesses, each tagged `critical` \| `major` \| `minor` | MVP |
| FR-AI-5 | 5–10 suggestions, each as `{ section, before, after, why }` — actionable rewrites, not platitudes | MVP |
| FR-AI-6 | Sub-scores: Impact, Clarity, Formatting, Skills Coverage, Experience Relevance | MVP |
| FR-AI-7 | AI output validated against a Zod schema; on parse failure retry once, then fail cleanly | MVP |
| FR-AI-8 | Streaming — render sections as they arrive, not one 20s spinner | Should |
| FR-AI-9 | Persist `model`, `prompt_version`, `tokens_in/out`, `latency_ms` per review | MVP |
| FR-AI-10 | Provider fallback: on Gemini 5xx/timeout, retry once then switch to Claude | Should |
| FR-AI-11 | Never send resume text to a provider that trains on it — document the setting in README | MVP |

#### 3.3.1 ATS Score Rubric (deterministic, computed in code — NOT by the LLM)

The LLM is unreliable at counting. Compute these in TypeScript from the extracted text, then hand the results to the LLM as context.

| Check | Weight | Pass condition |
|---|---|---|
| Parsable text layer | 20 | Extracted chars ≥ 400 |
| Contact block | 10 | Email + phone regex both hit |
| Standard section headings | 15 | ≥ 3 of: Experience, Education, Skills, Projects, Summary |
| No tables / multi-column artifacts | 10 | Heuristic: no run of ≥ 3 lines with ≥ 4 whitespace-separated columns |
| Date formats consistent | 10 | ≥ 80% of detected dates match one format |
| Bullet usage | 10 | ≥ 5 bullet-leading lines |
| Quantified achievements | 15 | ≥ 3 bullets containing a number or `%` |
| File hygiene | 10 | ≤ 2 pages, filename has no spaces/special chars |

Score = weighted sum. LLM may *comment* on these; it may not *set* them.

### 3.4 Job Description Targeting (FR-JD)

| ID | Requirement | Priority |
|---|---|---|
| FR-JD-1 | Optional textarea to paste a job description (≤ 10k chars) | MVP |
| FR-JD-2 | Extract required + preferred keywords from the JD | MVP |
| FR-JD-3 | Keyword match table: keyword, present yes/no, where found | MVP |
| FR-JD-4 | Match percentage + prioritized list of missing keywords | MVP |
| FR-JD-5 | Suggestions become JD-aware when a JD is supplied | MVP |
| FR-JD-6 | Save JDs as reusable named targets | Post-MVP |

> Moved into MVP from your "nice-to-have" list. This is the single highest-value differentiator — a generic resume score is a commodity; "you match 62% of this job" is not.

### 3.5 History & Versioning (FR-HIST)

| ID | Requirement | Priority |
|---|---|---|
| FR-HIST-1 | List all past reviews: date, filename, overall score, ATS score, JD name | MVP |
| FR-HIST-2 | Open any past review at a permalink `/dashboard/reviews/[id]` | MVP |
| FR-HIST-3 | Delete a review (cascades to storage object) | MVP |
| FR-HIST-4 | Re-run analysis on a stored resume without re-upload | Should |
| FR-HIST-5 | Group uploads into a "resume line" so v1/v2/v3 chain together | Post-MVP |
| FR-HIST-6 | Score-over-time sparkline per resume line | Post-MVP |

### 3.6 Compare (FR-CMP)

| ID | Requirement | Priority |
|---|---|---|
| FR-CMP-1 | Select two reviews → side-by-side score diff | Post-MVP |
| FR-CMP-2 | Show which weaknesses were resolved vs. introduced | Post-MVP |
| FR-CMP-3 | "What changed" text diff of the two resumes | Post-MVP |

### 3.7 Export (FR-EXP)

| ID | Requirement | Priority |
|---|---|---|
| FR-EXP-1 | Download review as a branded PDF (`@react-pdf/renderer`) | Post-MVP |
| FR-EXP-2 | Copy review as Markdown | Should |
| FR-EXP-3 | Public read-only share link with a revocable token | Post-MVP |

### 3.8 Rate Limiting & Abuse (FR-RL)

| ID | Requirement | Priority |
|---|---|---|
| FR-RL-1 | Free tier: 5 analyses / user / day, enforced server-side in Postgres | MVP |
| FR-RL-2 | IP-level throttle on unauthenticated routes (Upstash Redis) | Should |
| FR-RL-3 | Clear "you have N of 5 left today" in the UI | MVP |
| FR-RL-4 | Reject resume text > 30k chars (prompt-cost bomb) | MVP |

---

## 4. Data Model (Supabase / Postgres)

RLS is **enabled on every table**, and every policy is `auth.uid() = user_id`. Storage bucket `resumes` is private; access is via signed URLs only.

```sql
-- profiles: 1:1 with auth.users
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  daily_quota  int  not null default 5,
  created_at   timestamptz not null default now()
);

-- resumes: one row per uploaded file
create table resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  file_size     int  not null,
  page_count    int,
  word_count    int,
  extracted_text text,
  created_at    timestamptz not null default now()
);

-- job_targets: optional pasted JD
create table job_targets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text,
  company    text,
  raw_text   text not null,
  created_at timestamptz not null default now()
);

-- reviews: one AI analysis run
create table reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  resume_id      uuid not null references resumes on delete cascade,
  job_target_id  uuid references job_targets on delete set null,
  status         text not null default 'pending',  -- pending|processing|complete|failed
  overall_score  int,
  ats_score      int,
  sub_scores     jsonb,   -- {impact, clarity, formatting, skills, relevance}
  strengths      jsonb,
  weaknesses     jsonb,
  suggestions    jsonb,
  keyword_match  jsonb,   -- null when no job_target
  model          text,
  prompt_version text,
  tokens_in      int,
  tokens_out     int,
  latency_ms     int,
  error_message  text,
  created_at     timestamptz not null default now()
);

-- usage_events: quota + analytics
create table usage_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null,          -- 'analysis'
  created_at timestamptz not null default now()
);
create index on usage_events (user_id, created_at desc);
```

Quota check is a single query — `count(*) from usage_events where user_id = $1 and created_at > now() - interval '1 day'` — done inside the same transaction that inserts the review. Never trust a client-side counter.

---

## 5. Architecture & Key Routes

```
app/
  (marketing)/page.tsx                  landing
  (auth)/login/page.tsx
  (auth)/signup/page.tsx
  (auth)/callback/route.ts              OAuth code exchange
  (dashboard)/dashboard/page.tsx        upload + recent reviews
  (dashboard)/dashboard/reviews/page.tsx        history list
  (dashboard)/dashboard/reviews/[id]/page.tsx   single review
  api/upload/route.ts                   POST — store file, extract text
  api/analyze/route.ts                  POST — quota, ATS calc, LLM, persist
  api/reviews/[id]/route.ts             GET / DELETE
proxy.ts                                session refresh + route guard  (NOT middleware.ts)
lib/
  supabase/server.ts                    createServerClient, awaits cookies()
  supabase/client.ts                    browser client
  ai/provider.ts                        Gemini primary, Claude fallback
  ai/prompt.ts                          versioned prompt template
  ai/schema.ts                          Zod schema for LLM output
  resume/extract.ts                     unpdf text extraction
  resume/ats.ts                         deterministic ATS rubric
  resume/keywords.ts                    JD keyword extraction + matching
```

**Analysis flow:** client POSTs to `/api/analyze` → check quota → load extracted text → compute ATS score in code → build prompt (resume + ATS facts + optional JD) → call LLM with structured output → validate with Zod (1 retry) → insert `reviews` row + `usage_events` row → return review id → client navigates to permalink.

Long analyses run inside the route handler with `export const maxDuration = 60` on Vercel. If p95 latency exceeds that, move to a background job (post-MVP).

---

## 6. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Landing LCP < 2.0s; analysis p95 < 25s end-to-end |
| Accessibility | WCAG 2.1 AA: keyboard-navigable upload, labeled inputs, visible focus, 4.5:1 contrast, `aria-live` on analysis status |
| Responsive | Fully usable at 360px width; results tables scroll horizontally, page body never does |
| Security | RLS on all tables; private storage bucket; signed URLs ≤ 60s; API keys server-only (never `NEXT_PUBLIC_`); server-side MIME + size checks; CSP headers |
| Privacy | Resume text is PII. Delete-account purges rows + objects. State the data-retention policy on the landing page. |
| Error handling | Every failure path has a human-readable message. `error.tsx` per route group. Never surface a raw stack trace. |
| Observability | Structured server logs for every AI call (model, tokens, latency, outcome). Vercel Analytics on. |
| Theming | Light + dark, respecting `prefers-color-scheme` |

---

## 7. Feature Additions Beyond Your Original List

Ranked by (user value ÷ build effort). The first three are the ones that make this look like a product rather than a tutorial.

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| 1 | **Deterministic ATS rubric** (§3.3.1) | An LLM-invented "ATS score" is a number with no meaning. A published rubric is defensible, reproducible, and explains *itself*. Biggest credibility win available. | S |
| 2 | **Suggestions as before/after rewrites** | "Add more metrics" is useless. `"Managed the team"` → `"Led 6 engineers, cut deploy time 40%"` is the whole product. | S |
| 3 | **JD keyword match %** (promoted to MVP) | Turns a generic score into a decision: apply or fix first. | M |
| 4 | **Evidence quotes on every finding** | Each strength/weakness cites the resume line it came from. Kills hallucinated feedback and builds trust instantly. | S |
| 5 | **Score-delta on re-upload** | "ATS 61 → 78 since your last version." Creates the retention loop your app otherwise lacks. | M |
| 6 | **Role & seniority selector** | Grading a new-grad resume against staff-engineer expectations is just wrong. One dropdown, much better output. | S |
| 7 | **Section-by-section navigator** | Anchor links Summary/Experience/Skills/Education with a per-section score. Makes a long review skimmable. | M |
| 8 | **Red-flag detector** | Employment gaps > 6 months, no dates, pronoun inconsistency, third person, unprofessional email, dead links. Rule-based, cheap. | S |
| 9 | **Readability & jargon meter** | Flesch score + buzzword density ("synergy", "rockstar", "results-driven"). Fast, visual, shareable. | S |
| 10 | **Cover-letter draft from resume + JD** | One extra prompt, doubles perceived product scope. | S |
| 11 | **Interview questions from resume** | "Based on your resume, expect these 8 questions." Very high perceived value per token. | S |
| 12 | **LinkedIn headline + About generator** | Same input, adjacent output. Sharable → organic growth. | S |
| 13 | **Anonymous demo mode** | Try one sample resume with no signup. Removes the auth wall that kills portfolio-app conversion. | M |
| 14 | **Shareable public report link** | Revocable token. Recruiters and mentors can view without an account; every share is a referral. | M |
| 15 | **Prompt versioning + eval set** | Store `prompt_version` per review; keep 10 fixture resumes with expected score ranges. Lets you change prompts without silently regressing. | M |
| 16 | **PDF export of the report** (`@react-pdf/renderer`) | Your original nice-to-have. Real, but lower leverage than 1–6. | M |
| 17 | **Bulk upload / recruiter mode** | Score N resumes against one JD, ranked table. Clear paid-tier wedge. | L |
| 18 | **Stripe paid tier** | Free 5/day, Pro unlimited + compare + export. Only if you want it to be a business. | L |

**Recommendation:** fold #1, #2, #4, #6, #8 into the 5-day MVP — all Small, all directly upgrade output quality. Ship #3 in MVP as planned. Do #5, #9, #11, #13 in the week-2 sprint.

---

## 8. Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only — never expose
GOOGLE_GENERATIVE_AI_API_KEY=   # server only
ANTHROPIC_API_KEY=              # server only, fallback provider
NEXT_PUBLIC_SITE_URL=           # OAuth redirect base
```

Rule: any key without the `NEXT_PUBLIC_` prefix must never be imported into a Client Component. Enforce by keeping all provider calls inside `lib/ai/` and importing that only from route handlers and Server Actions.

---

## 9. Acceptance Criteria (MVP "done")

1. A new user signs up with Google, uploads a 2-page PDF, and sees a complete review in under 25 seconds.
2. The review shows an overall score, an ATS score with its rubric breakdown, ≥ 3 strengths with quotes, ≥ 3 tagged weaknesses, and ≥ 5 before/after suggestions.
3. Pasting a job description produces a keyword table and a match percentage.
4. Reloading the review permalink shows identical persisted data.
5. Signing in as a second user cannot read the first user's reviews (RLS verified by a direct API attempt, not just the UI).
6. A scanned image-only PDF is rejected with a clear message and consumes no AI quota.
7. A 6th analysis in 24 hours is refused with a quota message.
8. The dashboard is fully usable at 360px width.
9. `npm run build` passes with zero TypeScript and zero ESLint errors.
10. Deployed on Vercel with a working custom URL and a README containing screenshots.

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| PDF lib breaks under Turbopack (default in Next 16) | Blocks Day 2 | Use `unpdf` (serverless-native). Spike it in the first hour of Day 2. Fallback: `--webpack` build flag. |
| LLM returns malformed JSON | Broken reviews | Structured output mode + Zod validate + 1 retry + typed failure state |
| Analysis exceeds Vercel function timeout | 504s | `maxDuration = 60`; cap resume at 30k chars; stream partials |
| Supabase RLS misconfigured | **Resume PII leak** | Write RLS policies before any UI. Test cross-user access explicitly (AC #5). |
| API cost runaway | Bill shock | Hard server-side daily quota + input length cap + token logging from day one |
| Scanned/image PDFs | Confusing empty reviews | Detect < 100 chars, reject early with a helpful message |
| Scope creep from §7 | Miss 5-day target | §7 items 5+ are explicitly week-2. MVP scope is frozen at §9. |
