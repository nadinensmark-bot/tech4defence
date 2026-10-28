-- TECH4DEFENCE: databázové schéma pro Supabase
-- Spustit celé v Supabase → SQL Editor → New query → Run.
-- Skript jde pustit opakovaně (create if not exists / create or replace).

create extension if not exists pgcrypto;

-- ============ TABULKY ============

create table if not exists public.admins (
  email text primary key check (email = lower(email))
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  subtitle text,
  city text,
  date date,
  time_from time,
  time_to time,
  venue text,
  address text,
  organizers text,
  description text,
  contact_email text,
  is_published boolean not null default false,
  directory_enabled boolean not null default false, -- účastníci vidí medailonky ostatních firem
  created_at timestamptz not null default now()
);

create table if not exists public.program_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sort int not null default 0,
  starts time,
  ends time,
  title text not null,
  detail text
);

-- Barevné skupiny civilních firem (jmenovky)
create table if not exists public.groups (
  event_id uuid not null references public.events(id) on delete cascade,
  group_no int not null,
  color_name text not null,
  color_hex text not null default '#999999',
  primary key (event_id, group_no)
);

create table if not exists public.rooms (
  event_id uuid not null references public.events(id) on delete cascade,
  room_no int not null,
  name text not null,
  location_hint text,
  primary key (event_id, room_no)
);

create table if not exists public.rounds (
  event_id uuid not null references public.events(id) on delete cascade,
  round_no int not null,
  starts time,
  ends time,
  primary key (event_id, round_no)
);

-- Jedno políčko rozpisu: v kole X v místnosti Y sedí stůl zbrojařů (lead) a skupiny group_nos
create table if not exists public.rotation_slots (
  event_id uuid not null references public.events(id) on delete cascade,
  round_no int not null,
  room_no int not null,
  lead text,
  group_nos int[] not null default '{}',
  primary key (event_id, round_no, room_no)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text,
  company text,
  ico text,
  position text,
  phone text,
  web text,
  description text,
  sector text,
  reasons text,
  kind text not null default 'civil' check (kind in ('civil','defence','organizer')),
  status text not null default 'registered' check (status in ('registered','confirmed','declined','cancelled')),
  group_no int,
  checked_in_at timestamptz,
  form_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email)
);
create index if not exists participants_email_idx on public.participants(email);

-- ============ POMOCNÉ FUNKCE ============

create or replace function public.jwt_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = public.jwt_email())
$$;

create or replace function public.is_participant(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants
    where event_id = p_event and email = public.jwt_email()
      and status in ('registered','confirmed')
  )
$$;

-- Smí se e-mail přihlásit? (volá se před odesláním magic linku, aby nevznikaly účty pro cizí e-maily)
create or replace function public.can_login(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = lower(trim(p_email)))
      or exists (select 1 from public.participants
                 where email = lower(trim(p_email)) and status in ('registered','confirmed'))
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists participants_touch on public.participants;
create trigger participants_touch before update on public.participants
  for each row execute function public.touch_updated_at();

-- Účastník si upravuje jen vybraná pole svého profilu (skupinu, stav ani e-mail měnit nesmí)
create or replace function public.update_my_profile(p_event uuid, p jsonb) returns public.participants
language plpgsql security definer set search_path = public as $$
declare r public.participants;
begin
  update public.participants set
    full_name   = coalesce(p->>'full_name', full_name),
    position    = coalesce(p->>'position', position),
    phone       = coalesce(p->>'phone', phone),
    web         = coalesce(p->>'web', web),
    description = coalesce(p->>'description', description),
    sector      = coalesce(p->>'sector', sector),
    reasons     = coalesce(p->>'reasons', reasons)
  where event_id = p_event and email = public.jwt_email()
  returning * into r;
  if r.id is null then raise exception 'not_a_participant'; end if;
  return r;
end $$;

-- Medailonky firem na akci (jen když to admin u akce zapne a jen pro účastníky té akce)
create or replace function public.event_directory(p_event uuid)
returns table (company text, sector text, description text, web text, group_no int, kind text)
language sql stable security definer set search_path = public as $$
  select p.company, p.sector, p.description, p.web, p.group_no, p.kind
  from public.participants p
  join public.events e on e.id = p.event_id
  where p.event_id = p_event
    and p.status = 'confirmed'
    and e.directory_enabled
    and (public.is_participant(p_event) or public.is_admin())
  order by p.group_no nulls last, p.company
$$;

-- Admin: uložení programu najednou (nahradí stávající)
create or replace function public.admin_save_program(p_event uuid, items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.program_items where event_id = p_event;
  insert into public.program_items(event_id, sort, starts, ends, title, detail)
  select p_event, (ord - 1)::int, nullif(x->>'starts','')::time, nullif(x->>'ends','')::time,
         x->>'title', nullif(x->>'detail','')
  from jsonb_array_elements(items) with ordinality as t(x, ord)
  where coalesce(x->>'title','') <> '';
end $$;

-- Admin: uložení skupin, místností, kol a rozpisu točení najednou
create or replace function public.admin_save_rotation(p_event uuid, s jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.rotation_slots where event_id = p_event;
  delete from public.groups where event_id = p_event;
  delete from public.rooms where event_id = p_event;
  delete from public.rounds where event_id = p_event;
  insert into public.groups(event_id, group_no, color_name, color_hex)
    select p_event, (x->>'group_no')::int, x->>'color_name', coalesce(x->>'color_hex','#999999')
    from jsonb_array_elements(coalesce(s->'groups','[]')) x;
  insert into public.rooms(event_id, room_no, name, location_hint)
    select p_event, (x->>'room_no')::int, x->>'name', nullif(x->>'location_hint','')
    from jsonb_array_elements(coalesce(s->'rooms','[]')) x;
  insert into public.rounds(event_id, round_no, starts, ends)
    select p_event, (x->>'round_no')::int, nullif(x->>'starts','')::time, nullif(x->>'ends','')::time
    from jsonb_array_elements(coalesce(s->'rounds','[]')) x;
  insert into public.rotation_slots(event_id, round_no, room_no, lead, group_nos)
    select p_event, (x->>'round_no')::int, (x->>'room_no')::int, nullif(x->>'lead',''),
           coalesce(array(select jsonb_array_elements_text(x->'group_nos')::int), '{}')
    from jsonb_array_elements(coalesce(s->'slots','[]')) x;
end $$;

-- ============ RLS ============

alter table public.admins          enable row level security;
alter table public.events          enable row level security;
alter table public.program_items   enable row level security;
alter table public.groups          enable row level security;
alter table public.rooms           enable row level security;
alter table public.rounds          enable row level security;
alter table public.rotation_slots  enable row level security;
alter table public.participants    enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated
  using (email = public.jwt_email() or public.is_admin());

-- Akce a program: zveřejněné vidí kdokoli přihlášený, admin vše
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using ((is_published and public.is_participant(id)) or public.is_admin());
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists program_read on public.program_items;
create policy program_read on public.program_items for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());
drop policy if exists rounds_read on public.rounds;
create policy rounds_read on public.rounds for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());
drop policy if exists slots_read on public.rotation_slots;
create policy slots_read on public.rotation_slots for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());

-- Účastníci: každý vidí jen sebe, admin vše a jen admin zapisuje
drop policy if exists participants_self on public.participants;
create policy participants_self on public.participants for select to authenticated
  using (email = public.jwt_email() or public.is_admin());
drop policy if exists participants_admin on public.participants;
create policy participants_admin on public.participants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Práva rolí
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on function public.admin_save_program(uuid, jsonb) from public, anon;
revoke all on function public.admin_save_rotation(uuid, jsonb) from public, anon;
revoke all on function public.update_my_profile(uuid, jsonb) from public, anon;
revoke all on function public.event_directory(uuid) from public, anon;
grant execute on function public.admin_save_program(uuid, jsonb) to authenticated;
grant execute on function public.admin_save_rotation(uuid, jsonb) to authenticated;
grant execute on function public.update_my_profile(uuid, jsonb) to authenticated;
grant execute on function public.event_directory(uuid) to authenticated;
grant execute on function public.can_login(text) to anon, authenticated;
