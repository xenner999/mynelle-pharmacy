-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> Run.
create table if not exists public.app_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_kv enable row level security;

-- The app has no Supabase Auth login, so it connects as the "anon" role.
drop policy if exists "app_kv anon read"   on public.app_kv;
drop policy if exists "app_kv anon insert" on public.app_kv;
drop policy if exists "app_kv anon update" on public.app_kv;
drop policy if exists "app_kv anon delete" on public.app_kv;
create policy "app_kv anon read"   on public.app_kv for select to anon using (true);
create policy "app_kv anon insert" on public.app_kv for insert to anon with check (true);
create policy "app_kv anon update" on public.app_kv for update to anon using (true) with check (true);
create policy "app_kv anon delete" on public.app_kv for delete to anon using (true);
