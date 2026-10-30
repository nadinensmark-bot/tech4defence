-- TECH4DEFENCE Pardubice 11. 11. 2026: výchozí data akce (podle pozvánky 2.0 a souboru Schema_toceni_ucastniku_2.xlsx)
-- Spustit až po schema.sql. Účastníky NEvkládat sem (repo je veřejné): importují se v adminu z xlsx formuláře.

-- 1) Admini (e-maily, které uvidí administraci). Doplň další členy týmu.
insert into public.admins(email) values
  ('nada.sokolova@czechinvest.gov.cz')
on conflict do nothing;

-- 2) Akce
insert into public.events (slug, name, subtitle, city, date, time_from, time_to, venue, address, organizers, description, is_published)
values (
  'pardubice-2026',
  'TECH4DEFENCE | Pardubice',
  'Networking výrobních firem s obranným průmyslem',
  'Pardubice',
  '2026-11-11', '13:00', '16:30',
  'Fakulta elektrotechniky a informatiky, Univerzita Pardubice',
  'náměstí Čs. legií 565, 530 02 Pardubice',
  'CzechInvest, Univerzita Pardubice a Pardubický podnikatelský inkubátor P-PINK pod patronátem Asociace obranného a bezpečnostního průmyslu ČR',
  'Akce je určena zejména výrobcům elektroniky, strojírenským, kovovýrobním, nástrojářským a plastikářským firmám a vývojářům softwaru. Každá firma může vyslat pouze jednu osobu.',
  true
) on conflict (slug) do nothing;

-- 3) Program, skupiny, místnosti, kola a rozpis
do $$
declare e uuid := (select id from public.events where slug = 'pardubice-2026');
begin
  delete from public.program_items where event_id = e;
  insert into public.program_items(event_id, sort, starts, ends, title, detail) values
    (e, 0, '13:00', '13:20', 'Zahájení akce', 'Petr Doležel (děkan FEI UPCE), Ladislav Řoutil (děkan DFJP UPCE), Jiří Janků (ředitel P-PINK), Jan Homola (ředitel Defence Consulting s.r.o.), Leoš Mauer (ředitel Defence Hub CzechInvest)'),
    (e, 1, '13:20', '16:00', 'Diskuzní bloky s firmami z oborů', 'Radiolokace a radary · Energetické materiály a munice · Obranné technologie'),
    (e, 2, '16:00', '16:30', 'Závěr a volná diskuze', null);

  delete from public.rotation_slots where event_id = e;
  delete from public.groups where event_id = e;
  delete from public.rooms where event_id = e;
  delete from public.rounds where event_id = e;

  insert into public.groups(event_id, group_no, color_name, color_hex) values
    (e, 1, 'šedá',    '#999999'),
    (e, 2, 'červená', '#E53935'),
    (e, 3, 'fialová', '#8E44AD'),
    (e, 4, 'modrá',   '#00B0F0'),
    (e, 5, 'zelená',  '#00B050'),
    (e, 6, 'žlutá',   '#FFD600');

  insert into public.rooms(event_id, room_no, name) values
    (e, 1, 'Zasedačka 1'), (e, 2, 'Zasedačka 2'), (e, 3, 'Zasedačka 3');

  -- Začátek 1. kola 13:20 (T4D_Pardubice_rozdeleni_skupin.xlsx), další časy doplnit v adminu
  insert into public.rounds(event_id, round_no, starts) values (e, 1, '13:20'), (e, 2, null), (e, 3, null);

  insert into public.rotation_slots(event_id, round_no, room_no, lead, group_nos) values
    (e, 1, 1, 'Explosia, ERA, STV Technology', '{1,2}'),
    (e, 1, 2, 'Nitrocellulose, Spolana',       '{3,4}'),
    (e, 1, 3, 'ELDIS, STV Group',    '{5,6}'),
    (e, 2, 1, 'Nitrocellulose, Spolana',       '{2,5}'),
    (e, 2, 2, 'ELDIS, STV Group',    '{3,1}'),
    (e, 2, 3, 'Explosia, ERA, STV Technology', '{4,6}'),
    (e, 3, 1, 'ELDIS, STV Group',    '{4,2}'),
    (e, 3, 2, 'Explosia, ERA, STV Technology', '{3,5}'),
    (e, 3, 3, 'Nitrocellulose, Spolana',       '{1,6}');
  update public.events set directions = '{"from_label": "Hlavní nádraží", "from": [50.03257, 15.75673], "to_label": "FEI UPCE", "to": [50.03326, 15.7675], "path": [[50.03256, 15.75673], [50.03256, 15.75699], [50.03265, 15.7572], [50.03365, 15.76069], [50.03421, 15.76267], [50.03417, 15.7627], [50.03407, 15.76325], [50.03405, 15.76332], [50.03403, 15.76675], [50.03397, 15.76691], [50.03396, 15.76739], [50.03386, 15.76753], [50.03377, 15.76752], [50.03372, 15.76758], [50.03369, 15.76752], [50.03352, 15.76752]], "meters": 870, "minutes": 12, "text": "Z hlavního nádraží pěšky asi 870 m (zhruba 12 minut): rovně po Palackého třídě, pak Nerudovou až na náměstí Čs. legií."}'::jsonb where id = e;
end $$;
