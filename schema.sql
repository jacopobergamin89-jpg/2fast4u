-- ============================================================
-- 2FAST4U — SCHEMA FASE 2 (Supabase)
-- Come eseguirlo: Dashboard Supabase → SQL Editor → New query
--                 incolla tutto → Run. È idempotente (puoi rilanciarlo).
-- ============================================================

-- 1) Profilo giocatore (una riga per utente registrato)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  coins        integer     not null default 4500,
  collection   jsonb       not null default '{}'::jsonb,   -- { "Nome carta": quantità }
  full_unlock  boolean     not null default false,         -- true = questo utente vede TUTTE le carte (prova)
  is_admin     boolean     not null default false,
  updated_at   timestamptz not null default now()
);

-- 2) Elenco email admin (unica fonte, lato database)
create or replace function public.is_admin_email(mail text)
returns boolean language sql immutable as $$
  select lower(coalesce(mail, '')) in (
    'jacopo.bergamin89@gmail.com',
    'service@terapix.eu'
  );
$$;

-- 3) Crea automaticamente il profilo quando un utente si registra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, public.is_admin_email(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) L'utente corrente è admin?
create or replace function public.current_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 5) Row Level Security: ognuno vede/modifica SOLO la propria riga; l'admin tutte
alter table public.profiles enable row level security;

drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles
  for select using ( id = auth.uid() or public.current_is_admin() );

drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles
  for update using ( id = auth.uid() or public.current_is_admin() )
             with check ( id = auth.uid() or public.current_is_admin() );

drop policy if exists p_profiles_insert on public.profiles;
create policy p_profiles_insert on public.profiles
  for insert with check ( id = auth.uid() );

-- 5b) Permessi tabella per il ruolo "authenticated" (le righe restano filtrate da RLS)
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- 6) Un non-admin non può auto-promuoversi admin (ignora il cambio di is_admin)
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.current_is_admin() then
    new.is_admin := old.is_admin;   -- solo l'admin può cambiare is_admin
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============================================================
-- NOTA (indurimento futuro): oggi un giocatore può scrivere i propri
-- "coins" sulla propria riga (fiducia sul client, ok per il prototipo a
-- valuta virtuale). Quando servirà, i gettoni andranno mutati solo via
-- funzioni server-side (RPC) validate, non con update diretti dal client.
-- ============================================================

-- 7) Eliminazione del proprio account (l'utente cancella solo sé stesso)
create or replace function public.delete_own_account()
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
