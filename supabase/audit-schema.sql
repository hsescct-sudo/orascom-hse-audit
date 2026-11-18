-- =====================================================================
-- OC HSE Audit (HSE Audit F-HSE-078 + Lifting F-HSE-0175)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It only ADDS new tables (ha_*) and a photo bucket. The Flash Audit
-- tables are not touched.
--
-- Before running: put your own sign-in e-mail in the line marked  <-- 1
-- =====================================================================

-- People who can use the audit system. Role: admin / auditor / viewer.
create table if not exists public.ha_members (
  id         text primary key,
  email      text unique not null,
  name       text not null,
  role       text not null check (role in ('admin', 'auditor', 'viewer')),
  position   text default '',
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Every record of the system (projects, plan, audits, NCRs, good practice,
-- settings) as one JSON document. Phones keep a copy and sync changes.
create table if not exists public.ha_docs (
  id         text primary key,
  kind       text not null,
  module     text,
  data       jsonb not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null,           -- when the change was made (device time)
  updated_by text,
  server_ts  timestamptz not null default clock_timestamp()  -- when the server got it
);
create index if not exists ha_docs_server_ts on public.ha_docs (server_ts);
create index if not exists ha_docs_kind on public.ha_docs (kind, module);

-- Who is signed in
create or replace function public.ha_me()
returns setof public.ha_members
language sql stable security definer set search_path = public as $$
  select * from public.ha_members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and active
  limit 1;
$$;
create or replace function public.ha_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.ha_me();
$$;

alter table public.ha_members enable row level security;
alter table public.ha_docs enable row level security;
drop policy if exists ha_members_read on public.ha_members;
create policy ha_members_read on public.ha_members for select to authenticated using (public.ha_role() is not null);
drop policy if exists ha_docs_read on public.ha_docs;
create policy ha_docs_read on public.ha_docs for select to authenticated using (public.ha_role() is not null);
revoke insert, update, delete on public.ha_docs from anon, authenticated;
revoke insert, update, delete on public.ha_members from anon, authenticated;
revoke all on public.ha_docs from anon;
revoke all on public.ha_members from anon;

-- Save changes from a device. The newest change wins. Only admins change
-- projects, people and settings. Viewers can't change anything.
create or replace function public.ha_push(docs jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  r text := public.ha_role();
  me public.ha_members;
  d jsonb;
  k text;
begin
  if r is null or r = 'viewer' then
    raise exception 'Your account can''t save changes in the audit system.';
  end if;
  select * into me from public.ha_me();
  for d in select * from jsonb_array_elements(docs) loop
    k := d ->> 'kind';
    if k in ('project', 'member', 'settings') and r <> 'admin' then
      continue;
    end if;
    insert into public.ha_docs as t (id, kind, module, data, deleted, updated_at, updated_by, server_ts)
    values (d ->> 'id', k, d ->> 'module', d, coalesce((d ->> 'deleted')::boolean, false),
            coalesce((d ->> 'updated_at')::timestamptz, now()), me.id, clock_timestamp())
    on conflict (id) do update
      set data = excluded.data, kind = excluded.kind, module = excluded.module, deleted = excluded.deleted,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by, server_ts = clock_timestamp()
      where t.updated_at <= excluded.updated_at;
    -- people records also control who can sign in
    if k = 'member' and coalesce(d ->> 'email', '') <> '' then
      insert into public.ha_members as m (id, email, name, role, position, active, updated_at)
      values (d ->> 'id', lower(d ->> 'email'), coalesce(d ->> 'name', ''), coalesce(d ->> 'role', 'auditor'),
              coalesce(d ->> 'position', ''), coalesce((d ->> 'active')::boolean, true) and not coalesce((d ->> 'deleted')::boolean, false), now())
      on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role,
        position = excluded.position, active = excluded.active, updated_at = now();
    end if;
  end loop;
  return clock_timestamp();
end;
$$;
revoke all on function public.ha_push(jsonb) from public, anon;
grant execute on function public.ha_push(jsonb) to authenticated;
grant execute on function public.ha_me() to authenticated;
grant execute on function public.ha_role() to authenticated;

-- Photos: private bucket, members can read, auditors and admins can add.
insert into storage.buckets (id, name, public) values ('audit-photos', 'audit-photos', false)
on conflict (id) do nothing;
drop policy if exists ha_photos_read on storage.objects;
create policy ha_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'audit-photos' and public.ha_role() is not null);
drop policy if exists ha_photos_add on storage.objects;
create policy ha_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos' and public.ha_role() in ('admin', 'auditor'));

-- The first administrator. Use the e-mail you sign in with.            <-- 1
insert into public.ha_members (id, email, name, role, position)
values ('mem-admin', lower('YOUR-EMAIL@orascom.com'), 'Corporate HSE', 'admin', 'Corporate HSE Manager')
on conflict (id) do nothing;
insert into public.ha_docs (id, kind, data, updated_at)
select m.id, 'member', jsonb_build_object('id', m.id, 'kind', 'member', 'name', m.name, 'email', m.email, 'role', m.role,
       'position', m.position, 'active', true, 'updated_at', now(), 'created_at', now()), now()
from public.ha_members m where m.id = 'mem-admin'
on conflict (id) do nothing;
