-- =====================================================================
-- OC HSE Audit, update 4 (28 Nov 2026): approver role, approval rules, Flash Audit
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
--   6. Flash Audit is the third audit type, with the same rules. The old
--      Flash tables (audits, findings, ...) are not touched or used.
--   7. Projects see NCRs (link page and reminder e-mails) only after the
--      audit is approved.
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
    elsif coalesce(d ->> 'module', '') not in ('', 'full', 'lifting', 'flash') then why := 'bad audit type';
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


-- 7. Projects see an audit's NCRs only after it is approved. The approver
--    sends the report and the link; before that the NCRs can still change.
--    (Same functions as update 2, with "approved" in place of "sent for
--    approval or approved".)
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
                    and a.data ->> 'status' = 'approved')
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
        and a.data ->> 'status' = 'approved'
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
  if a is null or a ->> 'status' is distinct from 'approved' then
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
                        and a.data ->> 'status' = 'approved'), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('module', d.module, 'project_id', d.data ->> 'project_id',
                                                           'year', (d.data ->> 'year')::int, 'month', (d.data ->> 'month')::int,
                                                           'lead_id', d.data ->> 'lead_id', 'audit_id', d.data ->> 'audit_id'))
                       from public.ha_docs d where d.kind = 'plan' and not d.deleted
                         and (d.data ->> 'year') || '-' || lpad(d.data ->> 'month', 2, '0') = month_key), '[]'::jsonb));
end;
$$;

notify pgrst, 'reload schema';
