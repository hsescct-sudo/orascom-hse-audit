-- =====================================================================
-- OC HSE Audit, update 3 (27 Nov 2026): security hardening after review
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs update 2. Safe to run again. Flash Audit is not touched.
--
--   1. Every saved record is checked on the server: id, type, size, role.
--   2. An approved audit can only be changed by an administrator
--      (auditors can still record that the report was sent).
--   3. Dates in the future are cut to now, so one device can't block
--      other people's changes.
--   4. Refused saves are written to the record that can't be changed.
--   5. Photos: audit users see and add only audit photos, not Flash photos.
-- =====================================================================

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
    if jsonb_typeof(d) is distinct from 'object' then why := 'not a record';
    elsif coalesce(d ->> 'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$' then why := 'bad id';
    elsif k is null or k not in ('audit', 'ncr', 'good', 'plan', 'project', 'member', 'settings', 'log', 'link') then why := 'bad type';
    elsif coalesce(d ->> 'module', '') not in ('', 'full', 'lifting') then why := 'bad audit type';
    elsif octet_length(d::text) > 1500000 then why := 'too large';
    elsif k in ('project', 'member', 'settings') and r <> 'admin' then why := 'administrator only';
    elsif k = 'member' and coalesce(d ->> 'role', 'auditor') not in ('admin', 'auditor', 'viewer') then why := 'bad role';
    end if;
    if why is null then
      select t.data into old_data from public.ha_docs t where t.id = d ->> 'id';
      if old_data is not null and old_data ->> 'kind' is distinct from k then
        why := 'type change';
      elsif r <> 'admin' and old_data is not null and k = 'audit' and old_data ->> 'status' = 'approved'
            and (old_data - free_keys) is distinct from (d - free_keys) then
        why := 'approved audit is locked';
      end if;
    end if;
    if why is not null then
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

-- People without a sign-in don't need these.
revoke execute on function public.ha_role() from public, anon;
revoke execute on function public.ha_me() from public, anon;
grant execute on function public.ha_role() to authenticated;
grant execute on function public.ha_me() to authenticated;
-- ha_role is used by the photo rules of signed-in users only; the project link
-- photo rules use ha_link_ok and ha_photo_shared, which stay open.

-- Photos. The bucket "audit-photos" is shared with Flash Audit: Flash keeps
-- its photos in project folders, the audit system keeps them at the top
-- (ph-....jpg) and under lnk/ (project links). Audit users now see and add
-- only audit photos, not Flash photos. Flash rules are not changed.
drop policy if exists ha_photos_read on storage.objects;
create policy ha_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'audit-photos' and (name ~ '^ph-[A-Za-z0-9-]+\.jpg$' or name like 'lnk/%')
         and (select public.ha_role()) is not null);
drop policy if exists ha_photos_add on storage.objects;
create policy ha_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos' and name ~ '^ph-[A-Za-z0-9-]+\.jpg$'
              and (select public.ha_role()) in ('admin', 'auditor'));

notify pgrst, 'reload schema';
