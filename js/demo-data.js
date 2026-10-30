// Ukázková data pro DEMO režim (vymyšlené firmy, žádní skuteční účastníci). Struktura akce = Pardubice 2026.
const E = 'demo-pardubice';
const sectors = ['Strojírenství', 'Elektronika', 'Software / hardware', 'Kovoobrábění', 'Zpracování plastů'];
const names = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta', 'Éta', 'Théta', 'Ióta', 'Kappa', 'Lambda', 'Mí',
  'Ný', 'Ksí', 'Omikron', 'Pí', 'Ró', 'Sigma'];

const participants = names.map((n, i) => ({
  id: 'p' + i, event_id: E, email: i === 0 ? 'ucastnik@demo.cz' : `firma${i}@demo.cz`,
  full_name: i === 0 ? 'Jana Ukázková' : `Kontakt ${n}`, company: `Firma ${n} s.r.o. (demo)`, ico: '',
  position: 'Obchodní ředitel', phone: '', web: '', sector: sectors[i % sectors.length],
  description: 'Ukázkový medailonek firmy: zakázková výroba dílů a komponent.',
  reasons: ['Chci se stát subdodavatelem dílů či komponent.', 'Nabízím konstrukční, vývojové kapacity.', 'Jde mi zatím o orientační networking. Mapuji si možnosti.', 'Chci se stát dodavatelem technologií či zařízení.'][i % 4], kind: 'civil',
  status: i < 15 ? 'confirmed' : 'registered', group_no: i < 15 ? (i % 6) + 1 : null, checked_in_at: null,
  phone: `+420 600 000 ${String(100 + i)}`, web: `firma-${i}.example.cz`, card_token: 'demo' + i, in_matchmaking: true,
}));
// ukázkové propojení: Firma Gama žádá o kontakt, s Firmou Delta už je kontakt vyměněný přes QR
const connections = [
  { id: 'c1', event_id: E, from_id: 'p2', to_id: 'p0', status: 'pending', source: 'request', message: 'Dobrý den, hledáme subdodavatele obrábění, rádi bychom se na akci potkali.', created_at: '2026-11-05T10:00:00Z' },
  { id: 'c2', event_id: E, from_id: 'p0', to_id: 'p3', status: 'accepted', source: 'qr', message: null, created_at: '2026-11-05T11:00:00Z' },
];

export const DEMO_DATA = {
  admins: ['admin@demo.cz'],
  events: [{
    id: E, slug: 'pardubice-2026', name: 'TECH4DEFENCE | Pardubice', subtitle: 'Networking výrobních firem s obranným průmyslem',
    city: 'Pardubice', date: '2026-11-11', time_from: '13:00', time_to: '16:30',
    venue: 'Fakulta elektrotechniky a informatiky, Univerzita Pardubice', address: 'náměstí Čs. legií 565, 530 02 Pardubice',
    organizers: 'CzechInvest, Univerzita Pardubice a Pardubický podnikatelský inkubátor P-PINK pod patronátem Asociace obranného a bezpečnostního průmyslu ČR',
    description: 'Akce je určena zejména výrobcům elektroniky, strojírenským, kovovýrobním, nástrojářským a plastikářským firmám a vývojářům softwaru. Každá firma může vyslat pouze jednu osobu.',
    contact_email: '', is_published: true, directory_enabled: true,
  }],
  program_items: [
    { id: 'a', event_id: E, sort: 0, starts: '13:00', ends: '13:20', title: 'Zahájení akce', detail: 'Petr Doležel (děkan FEI UPCE), Ladislav Řoutil (děkan DFJP UPCE), Jiří Janků (ředitel P-PINK), Jan Homola (ředitel Defence Consulting s.r.o.), Leoš Mauer (ředitel Defence Hub CzechInvest)' },
    { id: 'b', event_id: E, sort: 1, starts: '13:20', ends: '16:00', title: 'Diskuzní bloky s firmami z oborů', detail: 'Radiolokace a radary · Energetické materiály a munice · Obranné technologie' },
    { id: 'c', event_id: E, sort: 2, starts: '16:00', ends: '16:30', title: 'Závěr a volná diskuze', detail: null },
  ],
  groups: [
    [1, 'šedá', '#999999'], [2, 'červená', '#E53935'], [3, 'fialová', '#8E44AD'],
    [4, 'modrá', '#00B0F0'], [5, 'zelená', '#00B050'], [6, 'žlutá', '#FFD600'],
  ].map(([group_no, color_name, color_hex]) => ({ event_id: E, group_no, color_name, color_hex })),
  rooms: [1, 2, 3].map(n => ({ event_id: E, room_no: n, name: 'Zasedačka ' + n, location_hint: null })),
  rounds: [1, 2, 3].map(n => ({ event_id: E, round_no: n, starts: n === 1 ? '13:20' : null, ends: null })),
  rotation_slots: [
    [1, 1, 'Explosia, ERA, STV Technology', [1, 2]], [1, 2, 'Nitrocellulose, Spolana', [3, 4]], [1, 3, 'ELDIS, STV Group', [5, 6]],
    [2, 1, 'Nitrocellulose, Spolana', [2, 5]], [2, 2, 'ELDIS, STV Group', [3, 1]], [2, 3, 'Explosia, ERA, STV Technology', [4, 6]],
    [3, 1, 'ELDIS, STV Group', [4, 2]], [3, 2, 'Explosia, ERA, STV Technology', [3, 5]], [3, 3, 'Nitrocellulose, Spolana', [1, 6]],
  ].map(([round_no, room_no, lead, group_nos]) => ({ event_id: E, round_no, room_no, lead, group_nos })),
  participants,
  connections,
};
