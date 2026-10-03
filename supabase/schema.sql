-- =====================================================================
--  Orascom HSE Flash Audit System — database schema
--  Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run
--  Safe to re-run: it drops and recreates functions/policies, keeps data.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  location      text not null default '',
  pm            text not null default '',
  client        text not null default '',
  active        boolean not null default true,
  login_user_id uuid unique references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('admin', 'project')),
  project_id   uuid references public.projects(id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now(),
  constraint profiles_project_role check ((role = 'project') = (project_id is not null))
);

create table if not exists public.audits (
  id              uuid primary key default gen_random_uuid(),
  ref             bigint generated always as identity,
  project_id      uuid not null references public.projects(id) on delete cascade,
  audit_date      date not null default current_date,
  audit_type      text not null default 'project' check (audit_type in ('project', 'corporate')),
  source          text not null default 'form' check (source in ('form', 'excel')),
  auditor         text not null default '',
  pm              text not null default '',
  poc             numeric,
  manpower        integer,
  areas           text not null default '',
  scope           text not null default '',
  conclusion      text not null default '',
  checks          jsonb not null default '{}'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'submitted')),
  file_name       text not null default '',
  created_by      uuid default auth.uid(),
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.findings (
  id                   uuid primary key default gen_random_uuid(),
  ref                  bigint generated always as identity,
  audit_id             uuid not null references public.audits(id) on delete cascade,
  project_id           uuid not null references public.projects(id) on delete cascade,
  seq                  integer not null default 1,
  item_id              text not null default '',
  topic                text not null default 'GEN',
  area                 text not null default '',
  observation          text not null default '',
  risk                 text not null default 'Med' check (risk in ('High', 'Med', 'Low')),
  root_cause           text not null default '',
  immediate_action     text not null default '',
  interim_control      text not null default '',
  action_plan          text not null default '',
  owner                text not null default '',
  target_date          date,
  fixed_on_spot        boolean not null default false,
  needs_support        boolean not null default false,
  support_title        text not null default '',
  status               text not null default 'open' check (status in ('open', 'pending', 'closed')),
  closure_note         text not null default '',
  closure_submitted_at timestamptz,
  closure_submitted_by text not null default '',
  closed_at            timestamptz,
  closed_by            text not null default '',
  created_by_name      text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.finding_photos (
  id              uuid primary key default gen_random_uuid(),
  finding_id      uuid not null references public.findings(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  kind            text not null check (kind in ('violation', 'closure')),
  path            text not null unique,
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);

create table if not exists public.finding_comments (
  id          uuid primary key default gen_random_uuid(),
  finding_id  uuid not null references public.findings(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid default auth.uid(),
  author_name text not null default '',
  author_role text not null default 'project',
  kind        text not null default 'comment' check (kind in ('comment', 'submitted', 'approved', 'rejected', 'reopened', 'closed')),
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists audits_project_idx    on public.audits (project_id, audit_date desc);
create index if not exists findings_project_idx  on public.findings (project_id, status);
create index if not exists findings_audit_idx    on public.findings (audit_id, seq);
create index if not exists photos_finding_idx    on public.finding_photos (finding_id);
create index if not exists comments_finding_idx  on public.finding_comments (finding_id, created_at);

-- ---------- Who is calling ---------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_project() returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.profiles where user_id = auth.uid() and role = 'project';
$$;

-- Privileged = administration users, the service key, the SQL editor, and the
-- workflow functions below (they run as the table owner). Must stay SECURITY INVOKER.
create or replace function public.is_privileged() returns boolean
language sql stable set search_path = public as $$
  select current_user not in ('authenticated', 'anon') or public.is_admin();
$$;

create or replace function public.can_access(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (p is not null and p = public.my_project());
$$;

create or replace function public.can_access_folder(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (folder is not null and folder = public.my_project()::text);
$$;

-- Projects listed on the login screen (no secrets: id, code, name only)
create or replace function public.login_projects()
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = public as $$
  select id, code, name from public.projects
  where active and login_user_id is not null
  order by name;
$$;

-- Who am I (role, project, names) — one call after sign-in
create or replace function public.whoami()
returns table (role text, project_id uuid, project_name text, project_code text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.role, p.project_id, pr.name, pr.code, p.display_name
  from public.profiles p left join public.projects pr on pr.id = p.project_id
  where p.user_id = auth.uid();
$$;

-- ---------- Guards (business rules) -------------------------------------

create or replace function public.tg_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.tg_audit_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_privileged() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    new.audit_type := 'project';
    new.created_by := auth.uid();
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'submitted' then
      raise exception 'This audit is submitted. Only the administration can change it.';
    end if;
    if new.project_id <> old.project_id then
      raise exception 'An audit cannot be moved to another project.';
    end if;
    new.audit_type := old.audit_type;
    return new;
  else
    if old.status = 'submitted' then
      raise exception 'This audit is submitted. Only the administration can delete it.';
    end if;
    return old;
  end if;
end $$;

create or replace function public.tg_finding_guard() returns trigger
language plpgsql set search_path = public as $$
declare a_status text; a_project uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select status, project_id into a_status, a_project from public.audits where id = new.audit_id;
    if a_project is null then raise exception 'Audit not found.'; end if;
    new.project_id := a_project;
  end if;
  if public.is_privileged() then
    if tg_op <> 'DELETE' and new.status = 'closed' and new.closed_at is null then new.closed_at := now(); end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if a_status = 'submitted' then raise exception 'This audit is submitted. Findings can no longer be added.'; end if;
    if new.status <> 'open' then
      new.status := 'pending';
      new.closure_submitted_at := now();
      new.closure_submitted_by := new.created_by_name;
    end if;
    new.closed_at := null; new.closed_by := '';
    return new;
  elsif tg_op = 'UPDATE' then
    if a_status = 'submitted' then
      raise exception 'This audit is submitted. Use "Submit closure" to close the finding.';
    end if;
    if new.status = 'closed' and old.status <> 'closed' then new.status := 'pending'; end if;
    new.closed_at := old.closed_at; new.closed_by := old.closed_by;
    return new;
  else
    select status into a_status from public.audits where id = old.audit_id;
    if a_status = 'submitted' then raise exception 'This audit is submitted. Only the administration can delete findings.'; end if;
    return old;
  end if;
end $$;

create or replace function public.tg_photo_guard() returns trigger
language plpgsql set search_path = public as $$
declare f_status text; f_project uuid; a_status text; r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select f.status, f.project_id, a.status into f_status, f_project, a_status
  from public.findings f join public.audits a on a.id = f.audit_id where f.id = r.finding_id;
  if tg_op = 'INSERT' then
    if f_project is null then raise exception 'Finding not found.'; end if;
    new.project_id := f_project;
  end if;
  if not public.is_privileged() and f_project is not null then
    if r.kind = 'violation' and a_status = 'submitted' then
      raise exception 'Violation photos are locked once the audit is submitted.';
    end if;
    if r.kind = 'closure' and f_status = 'closed' then
      raise exception 'This finding is closed. Ask the administration to reopen it.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.tg_comment_fill() returns trigger
language plpgsql set search_path = public as $$
declare f_project uuid;
begin
  select project_id into f_project from public.findings where id = new.finding_id;
  if f_project is null then raise exception 'Finding not found.'; end if;
  new.project_id := f_project;
  if current_user in ('authenticated', 'anon') then
    new.author_id := auth.uid();
    new.author_role := case when public.is_admin() then 'admin' else 'project' end;
    if not public.is_admin() then new.kind := 'comment'; end if;
  end if;
  return new;
end $$;

drop trigger if exists audits_touch on public.audits;
create trigger audits_touch before update on public.audits for each row execute function public.tg_touch();
drop trigger if exists findings_touch on public.findings;
create trigger findings_touch before update on public.findings for each row execute function public.tg_touch();
drop trigger if exists audits_guard on public.audits;
create trigger audits_guard before insert or update or delete on public.audits for each row execute function public.tg_audit_guard();
drop trigger if exists findings_guard on public.findings;
create trigger findings_guard before insert or update or delete on public.findings for each row execute function public.tg_finding_guard();
drop trigger if exists photos_guard on public.finding_photos;
create trigger photos_guard before insert or delete on public.finding_photos for each row execute function public.tg_photo_guard();
drop trigger if exists comments_fill on public.finding_comments;
create trigger comments_fill before insert on public.finding_comments for each row execute function public.tg_comment_fill();

-- ---------- Closure workflow -------------------------------------------

-- Project (or admin) submits a closure for review
create or replace function public.submit_closure(p_finding uuid, p_note text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select * into f from public.findings where id = p_finding;
  if f.id is null or not public.can_access(f.project_id) then raise exception 'Finding not found.'; end if;
  if f.status = 'closed' then raise exception 'This finding is already closed.'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Describe the action taken to close the finding.'; end if;
  update public.findings set status = 'pending', closure_note = p_note,
    closure_submitted_at = now(), closure_submitted_by = coalesce(p_by, '')
  where id = p_finding;
  insert into public.finding_comments (finding_id, author_id, author_name, author_role, kind, body)
  values (p_finding, auth.uid(), coalesce(p_by, ''), case when public.is_admin() then 'admin' else 'project' end, 'submitted', p_note);
end $$;

-- Administration approves or rejects a submitted closure
create or replace function public.review_closure(p_finding uuid, p_approve boolean, p_comment text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not public.is_admin() then raise exception 'Only the administration can review closures.'; end if;
  select * into f from public.findings where id = p_finding;
  if f.id is null then raise exception 'Finding not found.'; end if;
  if p_approve then
    update public.findings set status = 'closed', closed_at = now(), closed_by = coalesce(p_by, '') where id = p_finding;
  else
    if coalesce(btrim(p_comment), '') = '' then raise exception 'Write the reason for returning the closure.'; end if;
    update public.findings set status = 'open', closed_at = null, closed_by = '' where id = p_finding;
  end if;
  insert into public.finding_comments (finding_id, author_id, author_name, author_role, kind, body)
  values (p_finding, auth.uid(), coalesce(p_by, ''), 'admin', case when p_approve then 'approved' else 'rejected' end, coalesce(p_comment, ''));
end $$;

-- Administration closes directly, or reopens a closed finding
create or replace function public.set_finding_status(p_finding uuid, p_status text, p_comment text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the administration can do this.'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Unknown status.'; end if;
  update public.findings set status = p_status,
    closed_at = case when p_status = 'closed' then now() else null end,
    closed_by = case when p_status = 'closed' then coalesce(p_by, '') else '' end
  where id = p_finding;
  insert into public.finding_comments (finding_id, author_id, author_name, author_role, kind, body)
  values (p_finding, auth.uid(), coalesce(p_by, ''), 'admin', case when p_status = 'closed' then 'closed' else 'reopened' end, coalesce(p_comment, ''));
end $$;

-- ---------- Row level security -----------------------------------------

alter table public.projects         enable row level security;
alter table public.profiles         enable row level security;
alter table public.audits           enable row level security;
alter table public.findings         enable row level security;
alter table public.finding_photos   enable row level security;
alter table public.finding_comments enable row level security;

drop policy if exists projects_read  on public.projects;
drop policy if exists projects_admin on public.projects;
create policy projects_read  on public.projects for select to authenticated using (public.is_admin() or id = public.my_project());
create policy projects_admin on public.projects for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_read  on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists audits_rw on public.audits;
create policy audits_rw on public.audits for all to authenticated
  using (public.can_access(project_id)) with check (public.can_access(project_id));

drop policy if exists findings_rw on public.findings;
create policy findings_rw on public.findings for all to authenticated
  using (public.can_access(project_id)) with check (public.can_access(project_id));

drop policy if exists photos_read   on public.finding_photos;
drop policy if exists photos_insert on public.finding_photos;
drop policy if exists photos_delete on public.finding_photos;
create policy photos_read   on public.finding_photos for select to authenticated using (public.can_access(project_id));
create policy photos_insert on public.finding_photos for insert to authenticated with check (public.can_access(project_id));
create policy photos_delete on public.finding_photos for delete to authenticated using (public.can_access(project_id));

drop policy if exists comments_read   on public.finding_comments;
drop policy if exists comments_insert on public.finding_comments;
drop policy if exists comments_delete on public.finding_comments;
create policy comments_read   on public.finding_comments for select to authenticated using (public.can_access(project_id));
create policy comments_insert on public.finding_comments for insert to authenticated with check (public.can_access(project_id));
create policy comments_delete on public.finding_comments for delete to authenticated using (public.is_admin());

-- ---------- Grants -------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.projects, public.profiles, public.audits, public.findings,
  public.finding_photos, public.finding_comments to authenticated;
grant execute on function public.login_projects() to anon, authenticated;
grant execute on function public.whoami(), public.submit_closure(uuid, text, text),
  public.review_closure(uuid, boolean, text, text), public.set_finding_status(uuid, text, text, text),
  public.is_admin(), public.my_project(), public.can_access(uuid), public.can_access_folder(text),
  public.is_privileged() to authenticated;

-- ---------- Photo storage ------------------------------------------------

insert into storage.buckets (id, name, public)
values ('audit-photos', 'audit-photos', false)
on conflict (id) do nothing;

drop policy if exists "hse photos read"   on storage.objects;
drop policy if exists "hse photos insert" on storage.objects;
drop policy if exists "hse photos update" on storage.objects;
drop policy if exists "hse photos delete" on storage.objects;
create policy "hse photos read" on storage.objects for select to authenticated
  using (bucket_id = 'audit-photos' and public.can_access_folder((storage.foldername(name))[1]));
create policy "hse photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos' and public.can_access_folder((storage.foldername(name))[1]));
create policy "hse photos update" on storage.objects for update to authenticated
  using (bucket_id = 'audit-photos' and public.can_access_folder((storage.foldername(name))[1]));
create policy "hse photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'audit-photos' and public.can_access_folder((storage.foldername(name))[1]));

-- ---------- First administrator -----------------------------------------
-- After creating your own user in Authentication → Users, run (with your e-mail):
--   insert into public.profiles (user_id, role, display_name)
--   select id, 'admin', 'Your Name' from auth.users where email = 'you@example.com';
