-- SIS Collaterals · Creative Library
-- Shared, editable record of the team's creatives. Run once in the Supabase
-- SQL editor (or `supabase db push`). Safe to re-run.
--
-- Access model: team members sign in with a one-time email link. Only
-- addresses listed in public.team_members can read or write anything.
-- Nothing in the app deletes creatives, versions or files.

-- ---------------------------------------------------------------- team ----
create table if not exists public.team_members (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
-- Members can see the list; only the database owner (SQL editor) changes it.
drop policy if exists "team members read team" on public.team_members;
create policy "team members read team" on public.team_members for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

create or replace function public.is_team_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ----------------------------------------------------------- creatives ----
create table if not exists public.creatives (
  id text primary key,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default lower(auth.jwt() ->> 'email'),
  updated_by text default lower(auth.jwt() ->> 'email'),
  output text not null check (output in ('instagram', 'website-banner', 'website-listing')),
  template text,
  headline text not null default '',
  event_date text not null default '',
  event_day text not null default '',
  city text not null default '',
  venue text not null default '',
  thumbnail_path text,
  -- The complete editable creative (model/project.ts → Project). Never an image.
  project jsonb not null
);
create index if not exists creatives_updated_at on public.creatives (updated_at desc);

create table if not exists public.creative_versions (
  creative_id text not null references public.creatives (id),
  version integer not null,
  saved_at timestamptz not null,
  saved_by text,
  thumbnail_path text,
  project jsonb not null,
  primary key (creative_id, version)
);

alter table public.creatives enable row level security;
alter table public.creative_versions enable row level security;

drop policy if exists "team reads creatives" on public.creatives;
create policy "team reads creatives" on public.creatives for select to authenticated using (public.is_team_member());
drop policy if exists "team adds creatives" on public.creatives;
create policy "team adds creatives" on public.creatives for insert to authenticated with check (public.is_team_member());
-- No update/delete policies: changes go through save_creative_changes (below), which keeps history.

drop policy if exists "team reads versions" on public.creative_versions;
create policy "team reads versions" on public.creative_versions for select to authenticated using (public.is_team_member());

-- Save changes: archive the current version, then replace it, only if nobody
-- else saved in between (optimistic concurrency). Returns the updated row, or
-- no row on a version conflict.
create or replace function public.save_creative_changes(p_id text, p_expected_version integer, p_project jsonb, p_fields jsonb)
  returns setof public.creatives
  language plpgsql security definer set search_path = public as $$
declare
  cur public.creatives;
  who text := lower(auth.jwt() ->> 'email');
begin
  if not public.is_team_member() then
    raise exception 'not-authorised' using errcode = '42501';
  end if;
  select * into cur from public.creatives where id = p_id for update;
  if not found then
    raise exception 'not-found';
  end if;
  if cur.version <> p_expected_version then
    return; -- conflict: nothing changes
  end if;
  insert into public.creative_versions (creative_id, version, saved_at, saved_by, thumbnail_path, project)
    values (cur.id, cur.version, cur.updated_at, cur.updated_by, cur.thumbnail_path, cur.project)
    on conflict do nothing;
  return query
    update public.creatives set
      version = cur.version + 1,
      updated_at = now(),
      updated_by = who,
      project = p_project,
      output = p_fields ->> 'output',
      template = p_fields ->> 'template',
      headline = coalesce(p_fields ->> 'headline', ''),
      event_date = coalesce(p_fields ->> 'event_date', ''),
      event_day = coalesce(p_fields ->> 'event_day', ''),
      city = coalesce(p_fields ->> 'city', ''),
      venue = coalesce(p_fields ->> 'venue', ''),
      thumbnail_path = coalesce(p_fields ->> 'thumbnail_path', cur.thumbnail_path)
    where id = p_id
    returning *;
end;
$$;
revoke all on function public.save_creative_changes(text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.save_creative_changes(text, integer, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------- storage ----
-- Private bucket. Uploaded photos/logos live at blobs/<sha256> (one copy per
-- file for the whole team); previews at thumbs/<creative id>/<time>.jpg.
insert into storage.buckets (id, name, public)
  values ('creative-assets', 'creative-assets', false)
  on conflict (id) do nothing;

drop policy if exists "team reads assets" on storage.objects;
create policy "team reads assets" on storage.objects for select to authenticated
  using (bucket_id = 'creative-assets' and public.is_team_member());
drop policy if exists "team adds assets" on storage.objects;
create policy "team adds assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'creative-assets' and public.is_team_member());
-- No update/delete policies: shared files are never replaced or removed by the app.
