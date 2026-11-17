-- ── TEAM JOB TRACKER ────────────────────────────────────────
-- Any approved staff member can log a job for any position (hr_employees) or
-- staff login. Work moves Open → In progress → Submitted for review, and only
-- people listed in job_closers can Close it or Send it back. Every status
-- change, comment, reassignment and due-date change is kept in job_events.
--
-- Status changes go only through job_set_status(); a trigger blocks direct
-- status writes so the review rule can't be bypassed from the client.

-- Who can close / send back jobs. Kept apart from profiles because users can
-- edit their own profile row.
create table if not exists public.job_closers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now()
);

create or replace function public.job_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved);
$$;

create or replace function public.job_is_closer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.job_is_staff()
     and exists (select 1 from public.job_closers where user_id = auth.uid());
$$;

create table if not exists public.jobs (
  id                   uuid default gen_random_uuid() primary key,
  number               bigint generated always as identity,
  title                text not null check (length(trim(title)) > 0),
  details              text,
  done_means           text,
  assignee_employee_id uuid references public.hr_employees(id) on delete set null,
  assignee_user_id     uuid references auth.users(id) on delete set null,
  priority             text not null default 'normal'
                         check (priority in ('low','normal','high','urgent')),
  due_date             date,
  status               text not null default 'open'
                         check (status in ('open','in_progress','submitted','sent_back','closed','cancelled')),
  created_by           uuid references auth.users(id) default auth.uid(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  submitted_at         timestamptz,
  closed_at            timestamptz,
  closed_by            uuid references auth.users(id)
);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_emp_idx on public.jobs(assignee_employee_id);
create index if not exists jobs_user_idx on public.jobs(assignee_user_id);

create table if not exists public.job_events (
  id          uuid default gen_random_uuid() primary key,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  kind        text not null check (kind in ('created','status','comment','change')),
  from_status text,
  to_status   text,
  body        text,
  by_user     uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now()
);
create index if not exists job_events_job_idx on public.job_events(job_id, created_at);

-- ── Guards ──────────────────────────────────────────────────
create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.created_by := auth.uid();
    new.submitted_at := null; new.closed_at := null; new.closed_by := null;
    return new;
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('hg.job_rpc', true), '') <> '1' then
    raise exception 'Use job_set_status to change a job''s status';
  end if;
  if coalesce(current_setting('hg.job_rpc', true), '') <> '1' then
    new.submitted_at := old.submitted_at;
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  -- Closed jobs are frozen except for closers.
  if old.status in ('closed','cancelled') and not public.job_is_closer() then
    raise exception 'This job is closed';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard before insert or update on public.jobs
  for each row execute function public.jobs_guard();

-- Log creation, reassignment and due-date moves so nothing shifts silently.
create or replace function public.jobs_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.job_events(job_id, kind, to_status) values (new.id, 'created', 'open');
    return new;
  end if;
  if new.due_date is distinct from old.due_date then
    msg := msg || 'Due date ' || coalesce(to_char(old.due_date,'DD Mon YYYY'),'none')
               || ' → ' || coalesce(to_char(new.due_date,'DD Mon YYYY'),'none') || '. ';
  end if;
  if new.assignee_employee_id is distinct from old.assignee_employee_id
     or new.assignee_user_id is distinct from old.assignee_user_id then
    msg := msg || 'Reassigned. ';
  end if;
  if new.title is distinct from old.title or new.done_means is distinct from old.done_means then
    msg := msg || 'Job description edited. ';
  end if;
  if new.priority is distinct from old.priority then
    msg := msg || 'Priority ' || old.priority || ' → ' || new.priority || '. ';
  end if;
  if msg <> '' then
    insert into public.job_events(job_id, kind, body) values (new.id, 'change', trim(msg));
  end if;
  return new;
end $$;

drop trigger if exists jobs_log on public.jobs;
create trigger jobs_log after insert or update on public.jobs
  for each row execute function public.jobs_log();

-- ── Status changes ──────────────────────────────────────────
create or replace function public.job_set_status(p_job uuid, p_status text, p_note text default null)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare j public.jobs; prev text; closer boolean := public.job_is_closer(); note text := nullif(trim(coalesce(p_note,'')), '');
begin
  if not public.job_is_staff() then raise exception 'Not allowed'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status = p_status then return j; end if;
  prev := j.status;

  if p_status in ('closed','sent_back','cancelled') or j.status in ('closed','cancelled') then
    if not closer then raise exception 'Only an approved closer can do that'; end if;
  elsif p_status = 'submitted' then
    if j.status not in ('open','in_progress','sent_back') then raise exception 'Cannot submit from %', j.status; end if;
    if note is null then raise exception 'Say what was done when submitting for review'; end if;
  elsif p_status in ('open','in_progress') then
    null;  -- start / pause / withdraw a submission
  else
    raise exception 'Unknown status %', p_status;
  end if;
  if p_status = 'sent_back' and note is null then
    raise exception 'Give a reason when sending a job back';
  end if;

  perform set_config('hg.job_rpc', '1', true);
  update public.jobs set
    status = p_status,
    submitted_at = case when p_status = 'submitted' then now() else submitted_at end,
    closed_at = case when p_status in ('closed','cancelled') then now() else null end,
    closed_by = case when p_status in ('closed','cancelled') then auth.uid() else null end
  where id = p_job returning * into j;
  perform set_config('hg.job_rpc', '', true);

  insert into public.job_events(job_id, kind, from_status, to_status, body)
  values (p_job, 'status', prev, p_status, note);
  return j;
end $$;

-- People a job can be assigned to: HR positions plus logins not linked to one.
create or replace function public.job_people()
returns table(employee_id uuid, user_id uuid, name text, has_login boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, coalesce(nullif(e.name,''), e.role), e.user_id is not null
    from public.hr_employees e
   where e.active and public.job_is_staff()
  union all
  select null, p.id, coalesce(nullif(p.full_name,''), p.email), true
    from public.profiles p
   where p.approved and public.job_is_staff()
     and not exists (select 1 from public.hr_employees e where e.active and e.user_id = p.id)
  order by 3;
$$;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.job_closers enable row level security;

drop policy if exists "Staff read jobs" on public.jobs;
drop policy if exists "Staff add jobs" on public.jobs;
drop policy if exists "Staff edit jobs" on public.jobs;
drop policy if exists "Closers delete jobs" on public.jobs;
create policy "Staff read jobs"  on public.jobs for select to authenticated using (public.job_is_staff());
create policy "Staff add jobs"   on public.jobs for insert to authenticated with check (public.job_is_staff());
create policy "Staff edit jobs"  on public.jobs for update to authenticated using (public.job_is_staff()) with check (public.job_is_staff());
create policy "Closers delete jobs" on public.jobs for delete to authenticated using (public.job_is_closer());

drop policy if exists "Staff read job events" on public.job_events;
drop policy if exists "Staff comment on jobs" on public.job_events;
create policy "Staff read job events" on public.job_events for select to authenticated using (public.job_is_staff());
create policy "Staff comment on jobs" on public.job_events for insert to authenticated
  with check (public.job_is_staff() and kind = 'comment' and by_user = auth.uid());

drop policy if exists "Staff read closers" on public.job_closers;
drop policy if exists "Closers manage closers" on public.job_closers;
create policy "Staff read closers" on public.job_closers for select to authenticated using (public.job_is_staff());
create policy "Closers manage closers" on public.job_closers for all to authenticated
  using (public.job_is_closer()) with check (public.job_is_closer());

revoke all on function public.job_set_status(uuid, text, text) from public, anon;
revoke all on function public.job_people() from public, anon;
revoke all on function public.job_is_staff() from public, anon;
revoke all on function public.job_is_closer() from public, anon;
grant execute on function public.job_set_status(uuid, text, text) to authenticated;
grant execute on function public.job_people() to authenticated;
grant execute on function public.job_is_staff() to authenticated;
grant execute on function public.job_is_closer() to authenticated;

-- ── Initial setup ───────────────────────────────────────────
-- The gallery owner is the only closer to start with.
insert into public.job_closers(user_id, added_by)
select id, id from public.profiles where email = 'info@hourglassgallery.com'
on conflict do nothing;

-- Link Chidalu's login to her position so "My jobs" finds her work.
update public.hr_employees e set user_id = p.id
  from public.profiles p
 where p.email = 'chidalu@hourglassgallery.com'
   and e.name = 'Assistant Gallery Manager' and e.user_id is null;
