-- Pega este archivo completo en Supabase: SQL Editor > New query > Run.
-- Crea un único espacio de trabajo compartido y privado para la boda.

create table if not exists public.wedding_workspace (
  id text primary key check (id = 'boda-2027'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create schema if not exists private;

alter table public.wedding_workspace enable row level security;
revoke all on table public.wedding_workspace from anon, authenticated;
grant select, insert, update on table public.wedding_workspace to authenticated;

create or replace function private.is_wedding_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt() ->> 'email') in (
    'antonioidon@hotmail.com',
    'zuleikasarai.03@gmail.com'
  );
$$;

revoke execute on function private.is_wedding_member() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_wedding_member() to authenticated;

drop policy if exists "Wedding members can read" on public.wedding_workspace;
drop policy if exists "Wedding members can create" on public.wedding_workspace;
drop policy if exists "Wedding members can update" on public.wedding_workspace;

create policy "Wedding members can read"
on public.wedding_workspace for select to authenticated
using ((select private.is_wedding_member()));

create policy "Wedding members can create"
on public.wedding_workspace for insert to authenticated
with check ((select private.is_wedding_member()));

create policy "Wedding members can update"
on public.wedding_workspace for update to authenticated
using ((select private.is_wedding_member()))
with check ((select private.is_wedding_member()));
