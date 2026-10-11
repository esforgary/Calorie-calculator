-- Kall: run once in the SQL Editor of your existing Supabase project.
-- This script only creates/updates objects named kall_*; existing app tables are untouched.
begin;

create table if not exists public.kall_diaries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint kall_diaries_json_object check (jsonb_typeof(data) = 'object' and data ? 'version' and data ->> 'version' = '1'),
  constraint kall_diaries_size_limit check (octet_length(data::text) <= 4000000)
);

comment on table public.kall_diaries is 'Personal Kall diary: one JSON snapshot per authenticated account; maximum 4 MB.';

-- The server owns the revision. Clients update WHERE revision = the last read version,
-- so simultaneous/offline edits cannot silently overwrite a newer snapshot.
create or replace function public.kall_stamp_diary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kall_diaries_stamp on public.kall_diaries;
create trigger kall_diaries_stamp
before insert or update on public.kall_diaries
for each row execute function public.kall_stamp_diary();

alter table public.kall_diaries enable row level security;

drop policy if exists kall_diary_read_own on public.kall_diaries;
create policy kall_diary_read_own on public.kall_diaries
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists kall_diary_insert_own on public.kall_diaries;
create policy kall_diary_insert_own on public.kall_diaries
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists kall_diary_update_own on public.kall_diaries;
create policy kall_diary_update_own on public.kall_diaries
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- No anonymous access; the browser cannot set revision, updated_at or change ownership.
revoke all on table public.kall_diaries from anon, authenticated;
grant select on table public.kall_diaries to authenticated;
grant insert (user_id, data) on public.kall_diaries to authenticated;
grant update (data) on public.kall_diaries to authenticated;
revoke all on function public.kall_stamp_diary() from public;

commit;
