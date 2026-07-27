-- AI Resume Reviewer — initial schema
-- Run in the Supabase SQL editor, or via `supabase db push`.
--
-- SECURITY MODEL
--   Resume text is PII. Every table below has RLS enabled and every policy is
--   scoped to `auth.uid() = user_id`. The `resumes` storage bucket is private;
--   objects are only reachable through short-lived signed URLs, and the storage
--   policies require the object path to begin with the caller's own user id.

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  daily_quota int  not null default 5,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- resumes — one row per uploaded file
-- ---------------------------------------------------------------------------
create table if not exists public.resumes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  file_name      text not null,
  storage_path   text not null,
  file_size      int  not null,
  page_count     int,
  word_count     int,
  extracted_text text,
  created_at     timestamptz not null default now()
);

create index if not exists resumes_user_created_idx
  on public.resumes (user_id, created_at desc);

alter table public.resumes enable row level security;

create policy "resumes_select_own" on public.resumes
  for select using (auth.uid() = user_id);

create policy "resumes_insert_own" on public.resumes
  for insert with check (auth.uid() = user_id);

create policy "resumes_update_own" on public.resumes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "resumes_delete_own" on public.resumes
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- job_targets — optional pasted job description
-- ---------------------------------------------------------------------------
create table if not exists public.job_targets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text,
  company    text,
  raw_text   text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_targets_user_created_idx
  on public.job_targets (user_id, created_at desc);

alter table public.job_targets enable row level security;

create policy "job_targets_select_own" on public.job_targets
  for select using (auth.uid() = user_id);

create policy "job_targets_insert_own" on public.job_targets
  for insert with check (auth.uid() = user_id);

create policy "job_targets_update_own" on public.job_targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "job_targets_delete_own" on public.job_targets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- reviews — one AI analysis run
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  resume_id      uuid not null references public.resumes on delete cascade,
  job_target_id  uuid references public.job_targets on delete set null,
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'complete', 'failed')),
  target_role    text,
  seniority      text,
  overall_score  int check (overall_score between 0 and 100),
  ats_score      int check (ats_score between 0 and 100),
  sub_scores     jsonb,
  ats_breakdown  jsonb,
  strengths      jsonb,
  weaknesses     jsonb,
  suggestions    jsonb,
  red_flags      jsonb,
  keyword_match  jsonb,
  model          text,
  prompt_version text,
  tokens_in      int,
  tokens_out     int,
  latency_ms     int,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);

alter table public.reviews enable row level security;

create policy "reviews_select_own" on public.reviews
  for select using (auth.uid() = user_id);

create policy "reviews_insert_own" on public.reviews
  for insert with check (auth.uid() = user_id);

create policy "reviews_update_own" on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reviews_delete_own" on public.reviews
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- usage_events — quota enforcement + analytics
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events_select_own" on public.usage_events
  for select using (auth.uid() = user_id);

create policy "usage_events_insert_own" on public.usage_events
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Quota check — counts analyses in the trailing 24h for the calling user.
-- SECURITY DEFINER so it can read usage_events regardless of RLS, but it only
-- ever reports on auth.uid(); it cannot be pointed at another user.
-- ---------------------------------------------------------------------------
create or replace function public.analyses_used_today()
returns int
language sql
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.usage_events
  where user_id = auth.uid()
    and kind = 'analysis'
    and created_at > now() - interval '1 day';
$$;

-- ---------------------------------------------------------------------------
-- Private storage bucket for resume PDFs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = 5242880,
      allowed_mime_types = array['application/pdf'];

-- Object paths are `{user_id}/{resume_id}.pdf`. Requiring the first path
-- segment to equal the caller's uid keeps users inside their own folder.
drop policy if exists "resumes_storage_select_own" on storage.objects;
create policy "resumes_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_storage_insert_own" on storage.objects;
create policy "resumes_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_storage_delete_own" on storage.objects;
create policy "resumes_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
