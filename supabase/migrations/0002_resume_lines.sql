-- Resume version chaining
--
-- A "resume line" groups successive versions of the same resume so the app can
-- show "ATS 61 -> 78 since your last version". Without this, every upload is an
-- island and there is nothing to come back for.
--
-- Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- resume_lines — one row per resume the user is iterating on
-- ---------------------------------------------------------------------------
create table if not exists public.resume_lines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

create index if not exists resume_lines_user_created_idx
  on public.resume_lines (user_id, created_at desc);

alter table public.resume_lines enable row level security;

create policy "resume_lines_select_own" on public.resume_lines
  for select using (auth.uid() = user_id);

create policy "resume_lines_insert_own" on public.resume_lines
  for insert with check (auth.uid() = user_id);

create policy "resume_lines_update_own" on public.resume_lines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "resume_lines_delete_own" on public.resume_lines
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Link resumes into lines.
--
-- `version` is per-line and assigned on insert. Nullable line_id keeps existing
-- rows valid; anything uploaded before this migration stays unchained.
-- ---------------------------------------------------------------------------
alter table public.resumes
  add column if not exists line_id uuid references public.resume_lines on delete set null,
  add column if not exists version int;

create index if not exists resumes_line_version_idx
  on public.resumes (line_id, version desc);

-- Delta against the previous version, computed at analysis time and stored on
-- the row. Persisted rather than derived on read so it still reflects what the
-- previous version actually scored even if that review is later deleted.
alter table public.reviews
  add column if not exists score_delta jsonb;

-- ---------------------------------------------------------------------------
-- Assign the next version number within a line.
--
-- Runs as the caller (no SECURITY DEFINER) so RLS still applies — a user can
-- only ever count their own rows.
-- ---------------------------------------------------------------------------
create or replace function public.next_resume_version(p_line_id uuid)
returns int
language sql
stable
as $$
  select coalesce(max(version), 0) + 1
  from public.resumes
  where line_id = p_line_id;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: give every existing resume its own single-version line, so the
-- history page renders uniformly rather than special-casing older rows.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  new_line_id uuid;
begin
  for r in
    select id, user_id, file_name
    from public.resumes
    where line_id is null
    order by created_at
  loop
    insert into public.resume_lines (user_id, label)
    values (r.user_id, regexp_replace(r.file_name, '\.pdf$', '', 'i'))
    returning id into new_line_id;

    update public.resumes
    set line_id = new_line_id, version = 1
    where id = r.id;
  end loop;
end $$;
