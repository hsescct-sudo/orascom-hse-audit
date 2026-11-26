-- =====================================================================
-- OC HSE Audit, update 2 (26 Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs audit-schema.sql to be run before (it was).
--
-- Adds:
--   1. Sign-ins for auditors, made by the administrator from the app.
--   2. Project links: the project sends NCR evidence without signing in.
--   3. A history and signature record on the server that can't be changed.
--   4. Data for the e-mail reminders.
--
-- It only adds or replaces ha_* objects and two photo rules.
-- Flash Audit tables are not touched. Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sign-ins
-- ---------------------------------------------------------------------
alter table public.ha_members add column if not exists must_change boolean not null default false;

create or replace function public.ha_me()
returns setof public.ha_members
language sql stable security definer set search_path = public as $$
  select * from public.ha_members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and active
  limit 1;
$$;

-- The administrator makes or resets a sign-in for a person on the list.
-- A sign-in that already exists from somewhere else (for example Flash
-- Audit) is never changed here. The person must set a new password at
-- the first sign-in.
create or replace function public.ha_admin_set_login(p_email text, p_password text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  uid uuid;
  ours boolean;
begin
  if public.ha_role() is distinct from 'admin' then
    raise exception 'Only an administrator can make sign-ins.';
  end if;
  if not exists (select 1 from public.ha_members where lower(email) = e) then
    raise exception 'Add this person under Auditors and users first.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'The password needs at least 8 characters.';
  end if;
  select u.id, coalesce((u.raw_app_meta_data ->> 'ha_created')::boolean, false)
    into uid, ours
    from auth.users u where lower(u.email) = e limit 1;
  if uid is not null and not ours then
    return 'exists';
  end if;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
            crypt(p_password, gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'ha_created', true),
            '{}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid, uid::text, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
            'email', now(), now(), now());
    update public.ha_members set must_change = true where lower(email) = e;
    return 'created';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = uid;
  update public.ha_members set must_change = true where lower(email) = e;
  return 'reset';
end;
$$;

-- The person has set their own password.
create or replace function public.ha_password_set()
returns void
language sql security definer set search_path = public as $$
  update public.ha_members set must_change = false
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- For the administrator: who has a sign-in and when they last used it.
create or replace function public.ha_login_status()
returns table (email text, has_login boolean, made_here boolean, must_change boolean, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.ha_role() is distinct from 'admin' then
    raise exception 'Only an administrator can see this.';
  end if;
  return query
    select m.email, u.id is not null, coalesce((u.raw_app_meta_data ->> 'ha_created')::boolean, false),
           m.must_change, u.last_sign_in_at
    from public.ha_members m
    left join auth.users u on lower(u.email) = lower(m.email);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Record that can't be changed: history and signatures
-- ---------------------------------------------------------------------
create table if not exists public.ha_trail (
  seq       bigint generated always as identity primary key,
  doc_id    text not null,
  kind      text not null,
  module    text,
  audit_id  text,
  data      jsonb not null,
  pushed_by text,
  pushed_at timestamptz not null default clock_timestamp()
);
create index if not exists ha_trail_audit on public.ha_trail (audit_id, seq);
create index if not exists ha_trail_doc on public.ha_trail (doc_id, seq);

create table if not exists public.ha_signatures (
  seq        bigint generated always as identity primary key,
  doc_id     text not null,
  slot       text not null,
  name       text,
  sign_date  text,
  img_sha256 text not null,
  img        text not null,
  pushed_by  text,
  pushed_at  timestamptz not null default clock_timestamp(),
  unique (doc_id, slot, img_sha256)
);

create or replace function public.ha_no_change()
returns trigger language plpgsql as $$
begin
  raise exception 'This record can''t be changed or deleted.';
end;
$$;
drop trigger if exists ha_trail_lock on public.ha_trail;
create trigger ha_trail_lock before update or delete on public.ha_trail
  for each row execute function public.ha_no_change();
drop trigger if exists ha_trail_lock_all on public.ha_trail;
create trigger ha_trail_lock_all before truncate on public.ha_trail
  for each statement execute function public.ha_no_change();
drop trigger if exists ha_sig_lock on public.ha_signatures;
create trigger ha_sig_lock before update or delete on public.ha_signatures
  for each row execute function public.ha_no_change();
drop trigger if exists ha_sig_lock_all on public.ha_signatures;
create trigger ha_sig_lock_all before truncate on public.ha_signatures
  for each statement execute function public.ha_no_change();

alter table public.ha_trail enable row level security;
alter table public.ha_signatures enable row level security;
revoke all on public.ha_trail from anon, authenticated;
revoke all on public.ha_signatures from anon, authenticated;
grant select on public.ha_trail to authenticated;
grant select on public.ha_signatures to authenticated;
drop policy if exists ha_trail_read on public.ha_trail;
create policy ha_trail_read on public.ha_trail for select to authenticated using ((select public.ha_role()) is not null);
drop policy if exists ha_sig_read on public.ha_signatures;
create policy ha_sig_read on public.ha_signatures for select to authenticated using ((select public.ha_role()) is not null);

-- Saves the server copy of one record. Called by ha_push and the project link.
create or replace function public.ha_keep(d jsonb, who text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := d ->> 'kind';
  s record;
begin
  if k = 'log' then
    insert into public.ha_trail (doc_id, kind, module, audit_id, data, pushed_by)
    values (d ->> 'id', k, d ->> 'module', d ->> 'audit_id', d, who);
  elsif k in ('audit', 'ncr') then
    insert into public.ha_trail (doc_id, kind, module, audit_id, data, pushed_by)
    values (d ->> 'id', k, d ->> 'module', case when k = 'audit' then d ->> 'id' else d ->> 'audit_id' end,
            jsonb_build_object('ref', d -> 'ref', 'status', d -> 'status', 'deleted', coalesce(d -> 'deleted', 'false'::jsonb),
                               'updated_at', d -> 'updated_at', 'sha256', encode(digest((d - 'sigs')::text, 'sha256'), 'hex')),
            who);
    if jsonb_typeof(d -> 'sigs') = 'object' then
      for s in select key, value from jsonb_each(d -> 'sigs') loop
        if jsonb_typeof(s.value) = 'object' and coalesce(s.value ->> 'img', '') <> '' then
          insert into public.ha_signatures (doc_id, slot, name, sign_date, img_sha256, img, pushed_by)
          values (d ->> 'id', s.key, s.value ->> 'name', s.value ->> 'date',
                  encode(digest(s.value ->> 'img', 'sha256'), 'hex'), s.value ->> 'img', who)
          on conflict (doc_id, slot, img_sha256) do nothing;
        end if;
      end loop;
    end if;
  end if;
end;
$$;
revoke all on function public.ha_keep(jsonb, text) from public, anon, authenticated;

-- Server history of one audit (latest copy of each change line).
create or replace function public.ha_history(p_audit_id text)
returns table (doc_id text, data jsonb, pushed_by text, pushed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.ha_role() is null then raise exception 'Sign in first.'; end if;
  return query
    select distinct on (t.doc_id) t.doc_id, t.data, t.pushed_by, t.pushed_at
    from public.ha_trail t
    where t.kind = 'log' and t.audit_id = p_audit_id
    order by t.doc_id, t.seq desc;
end;
$$;

-- Signatures kept on the server for one NCR or audit.
create or replace function public.ha_sigs(p_doc_id text)
returns table (slot text, name text, sign_date text, img_sha256 text, pushed_by text, pushed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.ha_role() is null then raise exception 'Sign in first.'; end if;
  return query
    select s.slot, s.name, s.sign_date, s.img_sha256, s.pushed_by, s.pushed_at
    from public.ha_signatures s where s.doc_id = p_doc_id order by s.seq;
end;
$$;

-- ---------------------------------------------------------------------
-- Saving from the devices (replaces the old ha_push).
-- Same rules as before, plus: project links can be made by admins and
-- auditors, and every saved audit, NCR, change line and signature also
-- goes to the record that can't be changed.
-- ---------------------------------------------------------------------
create or replace function public.ha_push(docs jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  r text := public.ha_role();
  me public.ha_members;
  who text := lower(coalesce(auth.jwt() ->> 'email', ''));
  d jsonb;
  k text;
  n int;
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
    get diagnostics n = row_count;
    if n > 0 then
      perform public.ha_keep(d, who);
    end if;
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

-- Viewers don't get the project links.
drop policy if exists ha_docs_read on public.ha_docs;
create policy ha_docs_read on public.ha_docs for select to authenticated
  using ((select public.ha_role()) is not null and (kind <> 'link' or (select public.ha_role()) in ('admin', 'auditor')));

-- ---------------------------------------------------------------------
-- 3. Project links (no sign-in). The link holds a long random code.
-- The project sees its NCRs of one audit type and sends evidence.
-- ---------------------------------------------------------------------
create index if not exists ha_docs_link_token on public.ha_docs ((data ->> 'token')) where kind = 'link';

create or replace function public.ha_link_ok(p_token text)
returns boolean
language sql stable security definer set search_path = public as $$
  select length(coalesce(p_token, '')) >= 24 and exists (
    select 1 from public.ha_docs
    where kind = 'link' and not deleted and data ->> 'token' = p_token
      and not coalesce((data ->> 'revoked')::boolean, false));
$$;

-- A photo of an NCR that the project can see through its link.
create or replace function public.ha_photo_shared(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  with x as (select regexp_replace(coalesce(p_name, ''), '\.jpg$', '') as pid)
  select exists (
    select 1 from public.ha_docs n, x
    where n.kind = 'ncr' and not n.deleted
      and ((n.data -> 'photos') ? x.pid or (n.data -> 'ca_photos') ? x.pid)
      and exists (select 1 from public.ha_docs a
                  where a.id = n.data ->> 'audit_id' and a.kind = 'audit' and not a.deleted
                    and a.data ->> 'status' in ('submitted', 'approved'))
      and exists (select 1 from public.ha_docs l
                  where l.kind = 'link' and not l.deleted and not coalesce((l.data ->> 'revoked')::boolean, false)
                    and l.module = n.module and l.data ->> 'project_id' = n.data ->> 'project_id'));
$$;

create or replace function public.ha_link_open(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.ha_docs;
  p jsonb;
begin
  if not public.ha_link_ok(p_token) then
    raise exception 'This link is not valid or was turned off. Ask Corporate HSE for a new link.';
  end if;
  select * into l from public.ha_docs where kind = 'link' and not deleted and data ->> 'token' = p_token limit 1;
  select data into p from public.ha_docs where id = l.data ->> 'project_id' and kind = 'project';
  return jsonb_build_object(
    'module', l.module,
    'project', jsonb_build_object('name', p ->> 'name', 'code', p ->> 'code', 'city', p ->> 'city', 'country', p ->> 'country'),
    'ncrs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', n.id, 'ref', n.data ->> 'ref', 'date', n.data ->> 'date', 'audit_ref', a.data ->> 'ref',
          'severity', n.data ->> 'severity', 'classification', n.data ->> 'classification',
          'description', n.data ->> 'description', 'location', n.data ->> 'location',
          'action_required', n.data ->> 'action_required', 'due_date', n.data ->> 'due_date',
          'status', n.data ->> 'status', 'return_reason', n.data ->> 'return_reason',
          'responsible_name', n.data ->> 'responsible_name', 'responsible_position', n.data ->> 'responsible_position',
          'repeated', coalesce((n.data ->> 'repeated')::boolean, false),
          'photos', coalesce(n.data -> 'photos', '[]'::jsonb), 'ca_text', n.data ->> 'ca_text',
          'ca_date', n.data ->> 'ca_date', 'ca_photos', coalesce(n.data -> 'ca_photos', '[]'::jsonb),
          'received_at', n.data ->> 'received_at', 'closed_at', n.data ->> 'closed_at')
        order by (n.data ->> 'status') <> 'Open', n.data ->> 'due_date', n.data ->> 'ref')
      from public.ha_docs n
      join public.ha_docs a on a.id = n.data ->> 'audit_id' and a.kind = 'audit' and not a.deleted
      where n.kind = 'ncr' and not n.deleted and n.module = l.module
        and n.data ->> 'project_id' = l.data ->> 'project_id'
        and a.data ->> 'status' in ('submitted', 'approved')
        and (n.data ->> 'status' in ('Open', 'Review')
             or (n.data ->> 'status' = 'Closed' and coalesce(n.data ->> 'closed_at', n.data ->> 'ca_date', '') >= to_char(now() - interval '60 days', 'YYYY-MM-DD')))
    ), '[]'::jsonb));
end;
$$;

create or replace function public.ha_link_submit(p_token text, p_ncr_id text, p_text text, p_date text,
                                                 p_photos jsonb, p_name text, p_position text, p_sig text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l public.ha_docs;
  n public.ha_docs;
  a jsonb;
  t timestamptz := clock_timestamp();
  iso text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  today text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD');
  nm text := left(trim(coalesce(p_name, '')), 80);
  pos text := left(trim(coalesce(p_position, '')), 80);
  ph text;
  newdata jsonb;
  logd jsonb;
  log_id text := 'log-' || gen_random_uuid()::text;
  missing int := 0;
begin
  if not public.ha_link_ok(p_token) then
    raise exception 'This link is not valid or was turned off. Ask Corporate HSE for a new link.';
  end if;
  select * into l from public.ha_docs where kind = 'link' and not deleted and data ->> 'token' = p_token limit 1;
  select * into n from public.ha_docs where id = p_ncr_id and kind = 'ncr' and not deleted for update;
  if n.id is null or n.module is distinct from l.module or n.data ->> 'project_id' is distinct from l.data ->> 'project_id' then
    raise exception 'This NCR is not on this link.';
  end if;
  select data into a from public.ha_docs where id = n.data ->> 'audit_id' and kind = 'audit' and not deleted;
  if a is null or a ->> 'status' not in ('submitted', 'approved') then
    raise exception 'This NCR is not open for evidence yet.';
  end if;
  if coalesce(n.data ->> 'status', '') <> 'Open' then
    raise exception 'This NCR is already with the auditor or closed. Reload the page.';
  end if;
  if length(trim(coalesce(p_text, ''))) < 5 then raise exception 'Write what was done to correct it.'; end if;
  if length(p_text) > 4000 then raise exception 'The text is too long. Keep it under 4000 characters.'; end if;
  if nm = '' then raise exception 'Write your name.'; end if;
  if p_date is not null and p_date <> '' and p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'The date is not valid.'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) < 1 then
    raise exception 'Add at least one photo of the evidence.';
  end if;
  if jsonb_array_length(p_photos) > 10 then raise exception 'Up to 10 photos at a time.'; end if;
  for ph in select jsonb_array_elements_text(p_photos) loop
    if ph !~ ('^lnk/' || p_token || '/ph-[A-Za-z0-9-]+$') then
      raise exception 'A photo was not accepted. Add it again.';
    end if;
    begin
      if not exists (select 1 from storage.objects o where o.bucket_id = 'audit-photos' and o.name = ph || '.jpg') then
        missing := missing + 1;
      end if;
    exception when others then null;  -- photo check is extra; never block on it
    end;
  end loop;
  if missing > 0 then raise exception 'A photo did not finish uploading. Check the internet and send again.'; end if;
  if coalesce(p_sig, '') <> '' and (left(p_sig, 22) <> 'data:image/png;base64,' or length(p_sig) > 300000) then
    raise exception 'The signature was not accepted. Sign again.';
  end if;

  newdata := n.data || jsonb_build_object(
    'ca_text', trim(p_text),
    'ca_date', coalesce(nullif(p_date, ''), today),
    'ca_photos', coalesce(n.data -> 'ca_photos', '[]'::jsonb) || p_photos,
    'status', 'Review', 'received_at', iso, 'received_by', 'Project: ' || nm,
    'submitted_by', jsonb_build_object('name', nm, 'position', pos, 'via', 'link', 'at', iso),
    'return_reason', '', 'updated_at', iso);
  if coalesce(p_sig, '') <> '' then
    newdata := jsonb_set(newdata, '{sigs}', coalesce(newdata -> 'sigs', '{}'::jsonb) ||
      jsonb_build_object('responsible', jsonb_build_object('name', nm, 'date', today, 'img', p_sig, 'at', iso, 'by', 'Project: ' || nm)));
  end if;
  update public.ha_docs set data = newdata, updated_at = t, updated_by = 'link:' || l.id, server_ts = clock_timestamp()
   where id = n.id;

  logd := jsonb_build_object('id', log_id, 'kind', 'log', 'module', n.module, 'audit_id', n.data ->> 'audit_id',
    'project_id', n.data ->> 'project_id', 'target', n.id, 'target_kind', 'ncr', 'target_ref', n.data ->> 'ref',
    'action', 'Evidence sent', 'by', 'Project: ' || nm || case when pos <> '' then ' (' || pos || ')' else '' end,
    'changes', jsonb_build_array('status: Open → Review', 'Corrective action: ' || left(trim(p_text), 60),
                                 'Evidence photos: +' || jsonb_array_length(p_photos)) ||
               case when coalesce(p_sig, '') <> '' then jsonb_build_array('Signature responsible: signed') else '[]'::jsonb end,
    'at', iso, 'created_at', iso, 'updated_at', iso);
  insert into public.ha_docs (id, kind, module, data, deleted, updated_at, updated_by)
  values (log_id, 'log', n.module, logd, false, t, 'link:' || l.id);
  perform public.ha_keep(logd, 'link: ' || nm);
  perform public.ha_keep(newdata, 'link: ' || nm);
  return jsonb_build_object('ok', true, 'status', 'Review');
end;
$$;

-- Photo rules for the project link. Photos from a link go under lnk/<code>/.
drop policy if exists ha_photos_link_add on storage.objects;
create policy ha_photos_link_add on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'audit-photos'
              and name ~ '^lnk/[A-Za-z0-9_-]{24,}/ph-[A-Za-z0-9-]+\.jpg$'
              and public.ha_link_ok(split_part(name, '/', 2)));
drop policy if exists ha_photos_link_read on storage.objects;
create policy ha_photos_link_read on storage.objects for select to anon
  using (bucket_id = 'audit-photos' and public.ha_photo_shared(name));

-- ---------------------------------------------------------------------
-- 4. E-mail reminders. A daily job (GitHub) asks for this data with a
-- secret key. Only the hash of the key is kept here.
-- ---------------------------------------------------------------------
create table if not exists public.ha_secrets (
  name       text primary key,
  hash       text not null,
  updated_at timestamptz not null default now()
);
alter table public.ha_secrets enable row level security;
revoke all on public.ha_secrets from anon, authenticated;

-- The administrator makes the key in the app (Settings, E-mail reminders).
-- The key is shown once and goes into GitHub as REMINDER_KEY. A new key
-- replaces the old one.
create or replace function public.ha_new_reminder_key()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := translate(encode(gen_random_bytes(30), 'base64'), '+/=', '-_');
begin
  if public.ha_role() is distinct from 'admin' then
    raise exception 'Only an administrator can make the reminder key.';
  end if;
  insert into public.ha_secrets (name, hash) values ('reminders', encode(digest(k, 'sha256'), 'hex'))
  on conflict (name) do update set hash = excluded.hash, updated_at = now();
  return k;
end;
$$;

create or replace function public.ha_reminders(p_key text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  ok boolean;
  month_key text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM');
begin
  select encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') = s.hash into ok
    from public.ha_secrets s where s.name = 'reminders';
  if not coalesce(ok, false) then
    raise exception 'Not allowed.';
  end if;
  return jsonb_build_object(
    'today', to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD'),
    'weekday', extract(dow from now() at time zone 'Asia/Riyadh')::int,
    'settings', coalesce((select data from public.ha_docs where id = 'settings' and not deleted), '{}'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'email', m.email, 'role', m.role))
                         from public.ha_members m where m.active), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.data ->> 'code', 'name', d.data ->> 'name',
                                                              'emails', coalesce(d.data ->> 'contact_emails', '')))
                          from public.ha_docs d where d.kind = 'project' and not d.deleted), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('project_id', d.data ->> 'project_id', 'module', d.module, 'token', d.data ->> 'token'))
                       from public.ha_docs d where d.kind = 'link' and not d.deleted and not coalesce((d.data ->> 'revoked')::boolean, false)), '[]'::jsonb),
    'audits', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'ref', d.data ->> 'ref', 'module', d.module,
                                                            'project_id', d.data ->> 'project_id', 'date', d.data ->> 'date',
                                                            'status', d.data ->> 'status', 'lead_id', d.data ->> 'lead_id',
                                                            'sent_date', d.data #>> '{sent,date}'))
                        from public.ha_docs d where d.kind = 'audit' and not d.deleted), '[]'::jsonb),
    'ncrs', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'ref', n.data ->> 'ref', 'module', n.module,
                                                          'project_id', n.data ->> 'project_id', 'audit_id', n.data ->> 'audit_id',
                                                          'severity', n.data ->> 'severity', 'description', left(n.data ->> 'description', 160),
                                                          'due_date', n.data ->> 'due_date', 'status', n.data ->> 'status',
                                                          'received_at', n.data ->> 'received_at',
                                                          'responsible_name', n.data ->> 'responsible_name',
                                                          'responsible_email', n.data ->> 'responsible_email'))
                      from public.ha_docs n
                      join public.ha_docs a on a.id = n.data ->> 'audit_id' and a.kind = 'audit' and not a.deleted
                      where n.kind = 'ncr' and not n.deleted and n.data ->> 'status' in ('Open', 'Review')
                        and a.data ->> 'status' in ('submitted', 'approved')), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('module', d.module, 'project_id', d.data ->> 'project_id',
                                                           'year', (d.data ->> 'year')::int, 'month', (d.data ->> 'month')::int,
                                                           'lead_id', d.data ->> 'lead_id', 'audit_id', d.data ->> 'audit_id'))
                       from public.ha_docs d where d.kind = 'plan' and not d.deleted
                         and (d.data ->> 'year') || '-' || lpad(d.data ->> 'month', 2, '0') = month_key), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------
revoke all on function public.ha_admin_set_login(text, text) from public, anon;
grant execute on function public.ha_admin_set_login(text, text) to authenticated;
revoke all on function public.ha_password_set() from public, anon;
grant execute on function public.ha_password_set() to authenticated;
revoke all on function public.ha_login_status() from public, anon;
grant execute on function public.ha_login_status() to authenticated;
revoke all on function public.ha_history(text) from public, anon;
grant execute on function public.ha_history(text) to authenticated;
revoke all on function public.ha_sigs(text) from public, anon;
grant execute on function public.ha_sigs(text) to authenticated;
revoke all on function public.ha_push(jsonb) from public, anon;
grant execute on function public.ha_push(jsonb) to authenticated;
grant execute on function public.ha_me() to authenticated;
revoke all on function public.ha_no_change() from public, anon, authenticated;
revoke all on function public.ha_new_reminder_key() from public, anon;
grant execute on function public.ha_new_reminder_key() to authenticated;
-- the project link and the reminder job work without a sign-in
grant execute on function public.ha_link_ok(text) to anon, authenticated;
grant execute on function public.ha_photo_shared(text) to anon, authenticated;
grant execute on function public.ha_link_open(text) to anon, authenticated;
grant execute on function public.ha_link_submit(text, text, text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.ha_reminders(text) to anon, authenticated;

-- Load the new functions now.
notify pgrst, 'reload schema';
