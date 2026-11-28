-- =====================================================================
-- OC HSE Audit, update 4 (28 Nov 2026): approver role and approval rules
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs update 3. Safe to run again. Flash Audit is not touched.
--
--   1. New role: approver. An approver works like an administrator on
--      audits, NCRs, the plan and projects, but can't add users or
--      change settings.
--   2. Only an administrator or an approver can approve an audit.
--   3. Nobody approves an audit they were on (lead auditor or team).
--   4. Only an administrator or an approver records that the report
--      was sent to the project.
--   5. A refused save sends the server copy back to the device.
-- =====================================================================

-- 1. The new role
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.ha_members'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.ha_members drop constraint %I', c);
  end loop;
end $$;
alter table public.ha_members add constraint ha_members_role_check
  check (role in ('admin', 'approver', 'auditor', 'viewer'));

-- Was this person on the audit? Lead auditor, team list, or the names
-- written on the audit.
create or replace function public.ha_on_audit(a jsonb, m public.ha_members)
returns boolean
language sql immutable set search_path = public as $$
  select a is not null and m.id is not null and (
    coalesce(a ->> 'lead_id', '') = m.id
    or (jsonb_typeof(a -> 'team_ids') = 'array' and (a -> 'team_ids') ? m.id)
    or (jsonb_typeof(a -> 'auditors') = 'array' and trim(coalesce(m.name, '')) <> '' and exists (
          select 1 from jsonb_array_elements(a -> 'auditors') x
          where jsonb_typeof(x) = 'object' and lower(trim(coalesce(x ->> 'name', ''))) = lower(trim(m.name))))
  );
$$;
revoke all on function public.ha_on_audit(jsonb, public.ha_members) from public, anon;

-- 2. Saving, with the approval rules
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
  why text;
  old_data jsonb;
  t_upd timestamptz;
  free_keys text[] := array['sent', 'history', 'updated_at', 'dirty', 'server_ts'];
begin
  if r is null or r = 'viewer' then
    raise exception 'Your account can''t save changes in the audit system.';
  end if;
  if jsonb_typeof(docs) is distinct from 'array' or jsonb_array_length(docs) > 500 then
    raise exception 'Send at most 500 records at a time.';
  end if;
  select * into me from public.ha_me();
  for d in select * from jsonb_array_elements(docs) loop
    k := d ->> 'kind';
    why := null;
    old_data := null;
    if jsonb_typeof(d) is distinct from 'object' then why := 'not a record';
    elsif coalesce(d ->> 'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$' then why := 'bad id';
    elsif k is null or k not in ('audit', 'ncr', 'good', 'plan', 'project', 'member', 'settings', 'log', 'link') then why := 'bad type';
    elsif coalesce(d ->> 'module', '') not in ('', 'full', 'lifting') then why := 'bad audit type';
    elsif octet_length(d::text) > 1500000 then why := 'too large';
    elsif k in ('member', 'settings') and r <> 'admin' then why := 'administrator only';
    elsif k = 'project' and r not in ('admin', 'approver') then why := 'administrator or approver only';
    elsif k = 'member' and coalesce(d ->> 'role', 'auditor') not in ('admin', 'approver', 'auditor', 'viewer') then why := 'bad role';
    end if;
    if why is null then
      select t.data into old_data from public.ha_docs t where t.id = d ->> 'id';
      if old_data is not null and old_data ->> 'kind' is distinct from k then
        why := 'type change';
      elsif k = 'audit' and r <> 'admin' and old_data is not null and old_data ->> 'status' = 'approved'
            and (old_data - free_keys) is distinct from (d - free_keys) then
        why := 'approved audit is locked';
      elsif k = 'audit' and d ->> 'status' = 'approved' and old_data ->> 'status' is distinct from 'approved' then
        if r not in ('admin', 'approver') then
          why := 'only an administrator or approver can approve';
        elsif public.ha_on_audit(d, me) or public.ha_on_audit(old_data, me) then
          why := 'nobody approves an audit they were on';
        end if;
      elsif k = 'audit' and r not in ('admin', 'approver')
            and coalesce(old_data -> 'sent', 'null'::jsonb) is distinct from coalesce(d -> 'sent', 'null'::jsonb) then
        why := 'only an administrator or approver records the report as sent';
      end if;
    end if;
    if why is not null then
      -- the device gets the server copy back at its next refresh
      update public.ha_docs set server_ts = clock_timestamp() where id = d ->> 'id';
      insert into public.ha_trail (doc_id, kind, module, audit_id, data, pushed_by)
      values (left(coalesce(d ->> 'id', '?'), 100), 'refused', null, null,
              jsonb_build_object('reason', why, 'kind', left(coalesce(k, ''), 20)), who);
      continue;
    end if;
    -- no dates in the future
    begin
      t_upd := (d ->> 'updated_at')::timestamptz;
    exception when others then
      t_upd := null;
    end;
    t_upd := least(coalesce(t_upd, now()), clock_timestamp() + interval '5 minutes');
    d := jsonb_set(d, '{updated_at}', to_jsonb(to_char(t_upd at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    insert into public.ha_docs as t (id, kind, module, data, deleted, updated_at, updated_by, server_ts)
    values (d ->> 'id', k, nullif(d ->> 'module', ''), d, coalesce((d ->> 'deleted')::boolean, false), t_upd, me.id, clock_timestamp())
    on conflict (id) do update
      set data = excluded.data, kind = excluded.kind, module = excluded.module, deleted = excluded.deleted,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by, server_ts = clock_timestamp()
      where t.updated_at <= excluded.updated_at;
    get diagnostics n = row_count;
    if n > 0 then
      perform public.ha_keep(d, who);
    end if;
    if k = 'member' and coalesce(d ->> 'email', '') <> '' and n > 0 then
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

-- 3. Approvers get the project links and add photos, like auditors.
drop policy if exists ha_docs_read on public.ha_docs;
create policy ha_docs_read on public.ha_docs for select to authenticated
  using ((select public.ha_role()) is not null
         and (kind <> 'link' or (select public.ha_role()) in ('admin', 'approver', 'auditor')));
drop policy if exists ha_photos_add on storage.objects;
create policy ha_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos' and name ~ '^ph-[A-Za-z0-9-]+\.jpg$'
              and (select public.ha_role()) in ('admin', 'approver', 'auditor'));

notify pgrst, 'reload schema';
