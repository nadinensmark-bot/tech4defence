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

-- ============ MATCHMAKING A VÝMĚNA KONTAKTŮ ============
-- Kontakty (e-mail, telefon) se druhé straně ukážou až po přijaté žádosti nebo po naskenování QR vizitky.

alter table public.participants add column if not exists card_token text unique default replace(gen_random_uuid()::text, '-', '');
alter table public.participants add column if not exists in_matchmaking boolean not null default true;
update public.participants set card_token = replace(gen_random_uuid()::text, '-', '') where card_token is null;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_id uuid not null references public.participants(id) on delete cascade,
  to_id uuid not null references public.participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  source text not null default 'request' check (source in ('request','qr')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.connections enable row level security;
drop policy if exists connections_admin on public.connections;
create policy connections_admin on public.connections for select to authenticated using (public.is_admin());
grant select on public.connections to authenticated;

-- moje ID účastníka na akci
create or replace function public.my_pid(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.participants
  where event_id = p_event and email = public.jwt_email() and status in ('registered','confirmed')
$$;

create or replace function public.mm_enabled(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select directory_enabled from public.events where id = p_event), false)
$$;

-- seznam firem pro matchmaking (bez kontaktů) + stav propojení se mnou
create or replace function public.mm_list(p_event uuid)
returns table (id uuid, company text, full_name text, "position" text, sector text, description text, reasons text,
               web text, group_no int, kind text, conn_id uuid, conn_status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := public.my_pid(p_event);
begin
  if me is null or not public.mm_enabled(p_event) then return; end if;
  return query
  select p.id, p.company, p.full_name, p.position, p.sector, p.description, p.reasons, p.web, p.group_no, p.kind,
         c.id,
         case when c.id is null then 'none'
              when c.status = 'accepted' then 'connected'
              when c.status = 'declined' then 'declined'
              when c.from_id = me then 'sent' else 'received' end
  from public.participants p
  left join lateral (
    select * from public.connections x
    where (x.from_id = me and x.to_id = p.id) or (x.from_id = p.id and x.to_id = me)
    order by (x.status = 'accepted') desc, x.created_at desc limit 1
  ) c on true
  where p.event_id = p_event and p.id <> me and p.status = 'confirmed' and p.in_matchmaking
  order by p.company;
end $$;

-- žádost o kontakt / schůzku; když už mi ten druhý žádost poslal, rovnou se propojíme
create or replace function public.mm_request(p_to uuid, p_message text default null) returns text
language plpgsql security definer set search_path = public as $$
declare ev uuid; me uuid; rev public.connections;
begin
  select event_id into ev from public.participants where id = p_to and status = 'confirmed' and in_matchmaking;
  if ev is null then raise exception 'not_found'; end if;
  me := public.my_pid(ev);
  if me is null or not public.mm_enabled(ev) then raise exception 'forbidden'; end if;
  if me = p_to then raise exception 'self'; end if;
  select * into rev from public.connections where from_id = p_to and to_id = me;
  if rev.id is not null and rev.status <> 'declined' then
    update public.connections set status = 'accepted', responded_at = now() where id = rev.id;
    return 'connected';
  end if;
  insert into public.connections(event_id, from_id, to_id, message)
  values (ev, me, p_to, nullif(left(trim(coalesce(p_message,'')), 500), ''))
  on conflict (from_id, to_id) do nothing;
  return 'sent';
end $$;

create or replace function public.mm_respond(p_conn uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.connections;
begin
  select * into c from public.connections where id = p_conn;
  if c.id is null or c.to_id <> public.my_pid(c.event_id) then raise exception 'forbidden'; end if;
  update public.connections set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_conn;
end $$;

-- moje kontakty a žádosti; e-mail a telefon jen u propojených
create or replace function public.mm_contacts(p_event uuid)
returns table (conn_id uuid, direction text, status text, source text, message text, created_at timestamptz,
               id uuid, company text, full_name text, "position" text, sector text, web text, group_no int,
               email text, phone text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := public.my_pid(p_event);
begin
  if me is null then return; end if;
  return query
  select c.id, case when c.from_id = me then 'out' else 'in' end, c.status, c.source, c.message, c.created_at,
         p.id, p.company, p.full_name, p.position, p.sector, p.web, p.group_no,
         case when c.status = 'accepted' then p.email end,
         case when c.status = 'accepted' then p.phone end
  from public.connections c
  join public.participants p on p.id = case when c.from_id = me then c.to_id else c.from_id end
  where c.event_id = p_event and (c.from_id = me or c.to_id = me)
  order by c.created_at desc;
end $$;

-- naskenování QR vizitky: vzájemná výměna kontaktů, vrací kontakt majitele vizitky
create or replace function public.mm_scan(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.participants; me uuid; ex uuid; ev public.events;
begin
  select * into o from public.participants where card_token = p_token and status in ('registered','confirmed');
  if o.id is null then raise exception 'not_found'; end if;
  me := public.my_pid(o.event_id);
  if me is null then raise exception 'not_participant'; end if;
  select * into ev from public.events where id = o.event_id;
  if me <> o.id then
    select id into ex from public.connections where (from_id = me and to_id = o.id) or (from_id = o.id and to_id = me) limit 1;
    if ex is null then
      insert into public.connections(event_id, from_id, to_id, status, source, responded_at)
      values (o.event_id, me, o.id, 'accepted', 'qr', now());
    else
      update public.connections set status = 'accepted', responded_at = now() where id = ex;
    end if;
  end if;
  return jsonb_build_object('self', me = o.id, 'event_id', o.event_id, 'event_name', ev.name, 'event_date', ev.date,
    'company', o.company, 'full_name', o.full_name, 'position', o.position, 'email', o.email, 'phone', o.phone, 'web', o.web);
end $$;

-- profil: přidat volbu viditelnosti v matchmakingu
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
    reasons     = coalesce(p->>'reasons', reasons),
    in_matchmaking = coalesce((p->>'in_matchmaking')::boolean, in_matchmaking)
  where event_id = p_event and email = public.jwt_email()
  returning * into r;
  if r.id is null then raise exception 'not_a_participant'; end if;
  return r;
end $$;

revoke all on function public.mm_list(uuid) from public, anon;
revoke all on function public.mm_request(uuid, text) from public, anon;
revoke all on function public.mm_respond(uuid, boolean) from public, anon;
revoke all on function public.mm_contacts(uuid) from public, anon;
revoke all on function public.mm_scan(text) from public, anon;
revoke all on function public.my_pid(uuid) from public, anon;
grant execute on function public.mm_list(uuid) to authenticated;
grant execute on function public.mm_request(uuid, text) to authenticated;
grant execute on function public.mm_respond(uuid, boolean) to authenticated;
grant execute on function public.mm_contacts(uuid) to authenticated;
grant execute on function public.mm_scan(text) to authenticated;
grant execute on function public.my_pid(uuid) to authenticated;

-- Anonymní role nesmí na žádnou tabulku (data čte jen přihlášený uživatel přes RLS)
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ============ ORGANIZAČNÍ TÝM AKCE ============
create table if not exists public.event_team (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sort int not null default 0,
  full_name text not null,
  role text,
  email text,
  phone text,
  photo text -- malý JPEG jako data URL (fotky nejsou veřejně na webu, čte je jen přihlášený účastník)
);
alter table public.event_team enable row level security;
drop policy if exists team_read on public.event_team;
create policy team_read on public.event_team for select to authenticated
  using (public.is_participant(event_id) or public.is_admin());
drop policy if exists team_admin on public.event_team;
create policy team_admin on public.event_team for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.event_team to authenticated;
revoke all on public.event_team from anon;

-- Cesta na místo konání (mapa v appce)
alter table public.events add column if not exists directions jsonb;

-- ============ ZBROJAŘI (stoly) ============
-- Zbrojař (kind = 'defence') vidí potvrzené civilní firmy i s kontakty rovnou; kontakt se neukáže, pokud se firma z matchmakingu odhlásila.
create or replace function public.defence_visitors(p_event uuid)
returns table (id uuid, full_name text, company text, "position" text, sector text, description text, reasons text, web text, group_no int, email text, phone text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.company, p.position, p.sector, p.description, p.reasons, p.web, p.group_no,
         case when p.in_matchmaking then p.email end, case when p.in_matchmaking then p.phone end
  from public.participants p
  where p.event_id = p_event and p.kind = 'civil' and p.status = 'confirmed'
    and (public.is_admin() or exists (select 1 from public.participants d where d.event_id = p_event
         and d.email = public.jwt_email() and d.kind = 'defence' and d.status in ('registered','confirmed')))
  order by p.group_no nulls last, p.company
$$;
revoke all on function public.defence_visitors(uuid) from public, anon;
grant execute on function public.defence_visitors(uuid) to authenticated;
