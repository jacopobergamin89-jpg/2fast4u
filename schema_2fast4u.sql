-- ============================================================
--  2FAST4U — Schema utente (Supabase / Postgres)
--  Eseguire una sola volta nel SQL Editor di Supabase.
--  Modello: il SERVER è autoritativo su crediti e collezione
--  (scrive con la service_role key). Il client legge solo i
--  propri dati. I mazzi li gestisce il client (validati a partita).
-- ============================================================

-- ========== PROFILI ==========
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text        not null default 'Pilota',
  credits     integer     not null default 10000,           -- crediti di partenza (da tarare)
  settings    jsonb       not null default '{"audio":true,"notifiche":true,"animazioni_ridotte":false}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ognuno legge solo il proprio profilo; i crediti li scrive solo il server (service role)
create policy "profili_leggi_proprio" on public.profiles
  for select using (auth.uid() = id);

-- crea automaticamente il profilo alla registrazione, con i crediti di partenza
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Pilota'));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== COLLEZIONE (carte + piloti posseduti, con copie e preferiti) ==========
create table if not exists public.collection (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  item_type   text        not null check (item_type in ('card','pilot')),
  item_name   text        not null,                          -- nome carta/pilota (identificatore lato motore)
  count       integer     not null default 0 check (count >= 0),  -- numero di copie (doppioni)
  is_favorite boolean     not null default false,            -- stellina preferiti
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_type, item_name)
);
alter table public.collection enable row level security;

-- ognuno legge solo la propria collezione; la scrittura (apertura buste, preferiti) è solo lato server
create policy "collezione_leggi_propria" on public.collection
  for select using (auth.uid() = user_id);

create index if not exists collection_user_idx on public.collection (user_id);

-- ========== MAZZI ==========
create table if not exists public.decks (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  gang        text,
  pilot       text,                                          -- nome pilota o null
  cards       jsonb       not null default '[]'::jsonb,      -- [{"name":"...","count":2}, ...]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.decks enable row level security;

-- ognuno gestisce (CRUD) solo i propri mazzi; la validità (possiede le carte) si controlla a partita lato server
create policy "mazzi_gestisci_propri" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists decks_user_idx on public.decks (user_id);

-- ============================================================
--  Fine schema. Account cancellabile: tutto va in cascata su
--  delete dell'utente auth (requisito GDPR coperto a livello dati).
-- ============================================================
