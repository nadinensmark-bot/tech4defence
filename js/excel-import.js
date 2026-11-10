// Import a export „sešitu akce“ v Excelu: účastníci (vč. medailonků), barevné skupiny, místnosti, kola a rozpis točení.
// Čisté funkce bez DOM, aby šly testovat. Formát = T4D_Pardubice_rozdeleni_skupin.xlsx (listy „Rozdělení do skupin“
// a „Rotace po kolech“) a export z appky (listy „Účastníci“, „Rotace po kolech“, „Skupiny“).

export const COLORS = {
  'šedá': '#999999', 'červená': '#E53935', 'fialová': '#8E44AD', 'modrá': '#00B0F0', 'zelená': '#00B050',
  'žlutá': '#FFD600', 'oranžová': '#FB8C00', 'růžová': '#EC407A', 'černá': '#222222', 'bílá': '#FFFFFF',
  'hnědá': '#8D6E63', 'tyrkysová': '#00BFA5', 'tmavě modrá': '#1E3A8A', 'světle modrá': '#81D4FA',
  'tmavě zelená': '#2E7D32', 'světle zelená': '#9CCC65', 'béžová': '#D7CCC8', 'zlatá': '#C9A227', 'stříbrná': '#BDBDBD',
};
const KIND_IN = { 'civilni firma': 'civil', civil: 'civil', firma: 'civil', zbrojar: 'defence', defence: 'defence', organizator: 'organizer', organizer: 'organizer' };
const STATUS_IN = { registrovany: 'registered', registered: 'registered', ceka: 'registered', potvrzeny: 'confirmed', confirmed: 'confirmed',
  odmitnuty: 'declined', declined: 'declined', 'zrusil ucast': 'cancelled', zruseno: 'cancelled', zrusil: 'cancelled', cancelled: 'cancelled' };
export const KIND_OUT = { civil: 'Civilní firma', defence: 'Zbrojař', organizer: 'Organizátor' };
export const STATUS_OUT = { registered: 'Registrovaný', confirmed: 'Potvrzený', declined: 'Odmítnutý', cancelled: 'Zrušil účast' };

const str = v => (v == null ? '' : String(v).replace(/ /g, ' ').trim());
export const fold = s => str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
// název firmy bez právní formy a interpunkce (párování „Foxconn“ = „Foxconn CZ s.r.o.“ řeší až prefix níže)
export const normCompany = s => fold(s).replace(/,?\s*(spol\.?\s*s\s*r\.?\s*o\.?|s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|akciova spolecnost|druzstvo|se|sicav)\b\.?/g, ' ')
  .replace(/[.,()"„“'–-]/g, ' ').replace(/\s+/g, ' ').trim();
const normName = s => fold(s).replace(/\b(ing|mgr|bc|phd|prof|doc|mba|rndr|judr|mudr)\b\.?/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => { const m = str(s).match(/\d+/); return m ? +m[0] : null; };
const timeOf = s => { const m = str(s).match(/(\d{1,2})[:.](\d{2})/g); return (m || []).map(x => x.replace('.', ':').padStart(5, '0')); };
const hexOk = s => /^#?[0-9a-f]{6}$/i.test(str(s)) ? '#' + str(s).replace('#', '').toUpperCase() : null;

function sheetRows(XLSX, ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }); }

// najde řádek s hlavičkou (do 6. řádku), vrátí index sloupců podle pravidel
function findHeader(rows, test) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) if (test(rows[i].map(fold))) return i;
  return -1;
}

const COLS = {
  group: h => h === 'skupina' || h === 'skupina c' || h === 'c skupiny' || h === 'cislo skupiny',
  color: h => h === 'barva' || h === 'barva skupiny',
  hex: h => h === 'hex' || h === 'barva hex' || h === 'barva (hex)',
  form_id: h => h === 'id prihlasky' || h === 'id',
  full_name: h => h === 'jmeno a prijmeni' || h === 'jmeno' || h === 'ucastnik' || h === 'jmeno a prijmeni ucastnika',
  company: h => h === 'firma' || h === 'nazev firmy' || h === 'spolecnost' || h === 'organizace' || h === 'firma / organizace',
  position: h => h === 'pozice' || h === 'pracovni pozice' || h === 'funkce',
  email: h => h === 'e-mail' || h === 'email' || h === 'e-mailova adresa',
  phone: h => h === 'telefon' || h === 'mobil',
  web: h => h === 'web',
  sector: h => h === 'sektor' || h === 'sektor dle formulare' || h === 'obor',
  description: h => h === 'medailonek' || h === 'popis firmy' || h === 'popis',
  kind: h => h === 'typ' || h === 'typ ucastnika',
  status: h => h === 'stav',
};

// ---------- PARSOVÁNÍ SEŠITU ----------
export function parseWorkbook(XLSX, wb) {
  const out = { people: [], groups: new Map(), rooms: [], rounds: new Map(), leads: [], slotGroups: [], personRooms: [], sheets: [], warnings: [] };
  const roomNo = name => { const n = str(name); if (!n) return null; let i = out.rooms.findIndex(r => fold(r) === fold(n)); if (i < 0) { out.rooms.push(n); i = out.rooms.length - 1; } return i + 1; };
  const round = (no, hdr) => { const t = timeOf(hdr); const r = out.rounds.get(no) || { round_no: no }; if (t[0]) r.starts = t[0]; if (t[1]) r.ends = t[1]; out.rounds.set(no, r); };
  const colorToNo = new Map();
  const addGroup = (no, name, hex) => {
    if (!no) return; const g = out.groups.get(no) || { group_no: no };
    if (str(name)) g.color_name = str(name).toLowerCase(); if (hexOk(hex)) g.color_hex = hexOk(hex);
    out.groups.set(no, g); if (g.color_name) colorToNo.set(fold(g.color_name), no);
  };
  const groupsIn = cell => { // „Skupina 1, Skupina 2“ / „1, 2“ / „šedá, červená“
    return str(cell).split(/[,;+/&]| a /).map(x => x.trim()).filter(Boolean).map(x => num(x) ?? colorToNo.get(fold(x)) ?? null).filter(x => x != null);
  };

  for (const name of wb.SheetNames) {
    const rows = sheetRows(XLSX, wb.Sheets[name]).filter(r => r.some(c => str(c)));
    if (!rows.length) continue;

    // 1) rozpis točení: první sloupec „Místnost“, další „1. kolo (13:20)“
    const rh = findHeader(rows, h => /^(mistnost|mistnosti|stul)/.test(h[0] || '') && h.slice(1).some(x => /kolo/.test(x)));
    if (rh >= 0) {
      const hdr = rows[rh]; const cols = hdr.map((h, i) => ({ i, no: /kolo/.test(fold(h)) ? num(h) : null, h })).filter(c => c.no);
      cols.forEach(c => round(c.no, c.h));
      rows.slice(rh + 1).forEach(r => {
        const label = str(r[0]); if (!label) return;
        const m = label.match(/^(.*?)\s*[–—-]\s*([^–—-]+)$/); const room = m ? m[1] : label; const what = fold(m ? m[2] : 'skupiny');
        if (/pocet|osob/.test(what)) return;
        const no = roomNo(room);
        cols.forEach(c => {
          const v = str(r[c.i]); if (!v) return;
          if (/lid|stul|zbroj|lead/.test(what)) out.leads.push({ round_no: c.no, room_no: no, lead: v });
          else out.slotGroups.push({ round_no: c.no, room_no: no, cell: v });
        });
      });
      out.sheets.push(`${name}: rozpis točení`);
      continue;
    }

    // 2) seznam lidí nebo přehled skupin
    const ph = findHeader(rows, h => h.some(COLS.company) || h.some(COLS.email) || h.some(COLS.full_name) || (h.some(COLS.group) && h.some(COLS.color)));
    if (ph < 0) continue;
    const hdr = rows[ph].map(fold);
    const idx = Object.fromEntries(Object.entries(COLS).map(([k, t]) => [k, hdr.findIndex(t)]));
    const kola = hdr.map((h, i) => ({ i, no: /^kolo\s*\d+|^\d+\.?\s*kolo/.test(h) ? num(h) : null, h: rows[ph][i] })).filter(c => c.no);
    const hasPeople = idx.company >= 0 || idx.email >= 0 || idx.full_name >= 0;
    let n = 0;
    rows.slice(ph + 1).forEach((r, ri) => {
      const get = k => (idx[k] >= 0 ? str(r[idx[k]]) : '');
      const g = num(get('group')); if (/^celkem/i.test(get('group'))) return;
      addGroup(g, get('color'), get('hex'));
      if (!hasPeople) return;
      const p = { row: ph + ri + 2, sheet: name };
      for (const k of ['form_id', 'full_name', 'company', 'position', 'email', 'phone', 'web', 'sector', 'description']) { const v = get(k); if (v) p[k] = v; }
      if (p.email) { p.email = p.email.toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) { out.warnings.push(`${name}, řádek ${p.row}: neplatný e-mail „${p.email}“`); delete p.email; } }
      if (p.form_id) p.form_id = String(num(p.form_id) ?? p.form_id);
      if (g) p.group_no = g;
      const k = KIND_IN[fold(get('kind'))]; if (k) p.kind = k; else if (get('kind')) out.warnings.push(`${name}, řádek ${p.row}: neznámý typ „${get('kind')}“`);
      const s = STATUS_IN[fold(get('status'))]; if (s) p.status = s; else if (get('status')) out.warnings.push(`${name}, řádek ${p.row}: neznámý stav „${get('status')}“`);
      if (!p.email && !p.form_id && !p.company && !p.full_name) return;
      out.people.push(p); n++;
      if (g) kola.forEach(c => { const v = str(r[c.i]); if (v) { round(c.no, c.h); out.personRooms.push({ group_no: g, round_no: c.no, room: v }); } });
    });
    out.sheets.push(hasPeople ? `${name}: ${n} účastníků` : `${name}: skupiny`);
  }

  // skupiny v rozpisu: přepočet buněk až teď, kdy známe barvy
  const slots = new Map(); const key = (r, m) => r + ':' + m;
  const slot = (r, m) => { const k = key(r, m); if (!slots.has(k)) slots.set(k, { round_no: r, room_no: m, lead: '', group_nos: [] }); return slots.get(k); };
  out.leads.forEach(l => { slot(l.round_no, l.room_no).lead = l.lead; });
  out.slotGroups.forEach(x => { const s = slot(x.round_no, x.room_no); const gs = groupsIn(x.cell);
    if (!gs.length) out.warnings.push(`Rozpis: „${x.cell}“ (${x.round_no}. kolo) nepoznám jako skupiny`);
    s.group_nos = [...new Set([...s.group_nos, ...gs])].sort((a, b) => a - b); });
  // když rozpis skupiny neobsahuje, dopočítat je ze sloupců „Kolo 1…“ u účastníků
  if (!out.slotGroups.length && out.personRooms.length) {
    const seen = new Map();
    out.personRooms.forEach(x => { const k = x.group_no + ':' + x.round_no; const no = roomNo(x.room);
      if (seen.has(k) && seen.get(k) !== no) { out.warnings.push(`Skupina ${x.group_no} má v ${x.round_no}. kole u různých lidí různé místnosti`); return; }
      seen.set(k, no); const s = slot(x.round_no, no); if (!s.group_nos.includes(x.group_no)) s.group_nos = [...s.group_nos, x.group_no].sort((a, b) => a - b); });
  }
  out.slots = [...slots.values()];
  out.groups = [...out.groups.values()].sort((a, b) => a.group_no - b.group_no);
  out.rounds = [...out.rounds.values()].sort((a, b) => a.round_no - b.round_no);
  out.hasRotation = out.slots.length > 0;
  return out;
}

// ---------- PLÁN ZMĚN PROTI APLIKACI ----------
// b = eventBundle, ps = účastníci akce v appce
export function planImport(parsed, b, ps) {
  const plan = { updates: [], creates: [], emailFixes: [], unmatched: [], missing: [], rotation: null, warnings: [...parsed.warnings] };
  const byEmail = new Map(ps.map(p => [p.email, p]));
  const byForm = new Map(ps.filter(p => p.form_id).map(p => [String(p.form_id), p]));
  const byCompName = p => {
    const c = normCompany(p.company), n = normName(p.full_name);
    let c1 = ps.filter(x => c && normCompany(x.company) === c);
    if (!c1.length && c) c1 = ps.filter(x => { const y = normCompany(x.company); return y && (y.startsWith(c + ' ') || c.startsWith(y + ' ')); });
    if (!n) return c1.length === 1 ? c1[0] : null;
    const both = c1.filter(x => normName(x.full_name) === n); if (both.length === 1) return both[0];
    // jiné jméno u stejné firmy = jiný člověk (např. druhý zástupce), ne přejmenování
    if (c1.length === 1 && !c1[0].full_name) return c1[0];
    if (!c1.length) { const byN = ps.filter(x => normName(x.full_name) === n); if (byN.length === 1) return byN[0]; }
    return null;
  };
  const used = new Set();
  const FIELDS = ['full_name', 'company', 'position', 'phone', 'web', 'sector', 'description', 'group_no', 'kind', 'status', 'form_id'];
  for (const r of parsed.people) {
    let m = null, how = '';
    if (r.email && byEmail.has(r.email)) { m = byEmail.get(r.email); how = 'e-mail'; }
    else if (r.form_id && byForm.has(r.form_id)) { m = byForm.get(r.form_id); how = 'ID přihlášky'; }
    else { m = byCompName(r); how = 'firma a jméno'; }
    if (m && used.has(m.id)) { if (FIELDS.some(k => !['full_name', 'company', 'form_id'].includes(k) && r[k] != null)) plan.warnings.push(`${r.sheet}, řádek ${r.row}: ${r.company || ''} ${r.full_name || ''} se páruje na stejného účastníka jako jiný řádek, přeskakuji`); continue; }
    if (m) {
      used.add(m.id);
      const patch = {};
      for (const k of FIELDS) if (r[k] != null && r[k] !== '' && String(r[k]) !== String(m[k] ?? '')) patch[k] = r[k];
      if (Object.keys(patch).length) plan.updates.push({ id: m.id, p: m, patch, how });
      if (r.email && r.email !== m.email) plan.emailFixes.push({ id: m.id, p: m, from: m.email, to: r.email, taken: byEmail.has(r.email) });
    } else if (r.email) {
      const o = { email: r.email, status: 'confirmed', kind: 'civil' };
      for (const k of FIELDS) if (r[k] != null && r[k] !== '') o[k] = r[k];
      plan.creates.push(o);
    } else plan.unmatched.push(r);
  }
  // kdo je v appce, ale v souboru chybí (jen když soubor je seznam lidí s e-maily)
  if (parsed.people.some(r => r.email)) plan.missing = ps.filter(p => !used.has(p.id) && ['registered', 'confirmed'].includes(p.status) && p.kind === 'civil');

  // rotace a barvy: spojit se stávajícím stavem (časy kol a nápovědy místností zůstanou, když je soubor nemá)
  if (parsed.groups.length || parsed.hasRotation) {
    const curG = new Map(b.groups.map(g => [g.group_no, g]));
    const groups = parsed.groups.length ? parsed.groups.map(g => {
      const old = curG.get(g.group_no); const name = g.color_name || old?.color_name || `skupina ${g.group_no}`;
      return { group_no: g.group_no, color_name: name, color_hex: g.color_hex || (old && old.color_name === name ? old.color_hex : COLORS[name]) || old?.color_hex || '#999999' };
    }) : b.groups.map(g => ({ ...g }));
    let rooms = b.rooms.map(r => ({ ...r })), rounds = b.rounds.map(r => ({ round_no: r.round_no, starts: (r.starts || '').slice(0, 5), ends: (r.ends || '').slice(0, 5) }));
    let slots = b.slots.map(x => ({ round_no: x.round_no, room_no: x.room_no, lead: x.lead || '', group_nos: [...(x.group_nos || [])] }));
    if (parsed.hasRotation) {
      rooms = parsed.rooms.map((n, i) => { const old = b.rooms.find(r => fold(r.name) === fold(n)); return { room_no: i + 1, name: n, location_hint: old?.location_hint || '' }; });
      const maxR = Math.max(...parsed.slots.map(s => s.round_no), ...parsed.rounds.map(r => r.round_no));
      rounds = Array.from({ length: maxR }, (_, i) => { const no = i + 1; const f = parsed.rounds.find(r => r.round_no === no) || {}; const old = b.rounds.find(r => r.round_no === no) || {};
        return { round_no: no, starts: f.starts || (old.starts || '').slice(0, 5), ends: f.ends || (old.ends || '').slice(0, 5) }; });
      // lídry ze souboru; když je soubor nemá, nechat stávající u stejné místnosti a kola
      slots = parsed.slots.map(s => { const old = b.slots.find(x => x.round_no === s.round_no && fold(b.rooms.find(r => r.room_no === x.room_no)?.name) === fold(rooms[s.room_no - 1]?.name));
        return { ...s, lead: s.lead || (parsed.leads.length ? '' : old?.lead || '') }; });
    }
    const known = new Set(groups.map(g => g.group_no));
    slots.forEach(s => s.group_nos.filter(n => !known.has(n)).forEach(n => plan.warnings.push(`Rozpis používá skupinu ${n}, která v souboru nemá barvu`)));
    plan.rotation = { groups, rooms, rounds, slots };
    plan.rotationDiff = rotationDiff(b, plan.rotation);
  }
  return plan;
}

function rotationDiff(b, s) {
  const d = [];
  const gOld = b.groups.map(g => `${g.group_no} ${g.color_name}`).join(', '), gNew = s.groups.map(g => `${g.group_no} ${g.color_name}`).join(', ');
  if (gOld !== gNew) d.push(`Skupiny: ${gOld || 'žádné'} → ${gNew}`);
  const rOld = b.rooms.map(r => r.name).join(', '), rNew = s.rooms.map(r => r.name).join(', ');
  if (rOld !== rNew) d.push(`Místnosti: ${rOld || 'žádné'} → ${rNew}`);
  const tOld = b.rounds.map(r => `${r.round_no}. ${(r.starts || '').slice(0, 5)}`).join(', '), tNew = s.rounds.map(r => `${r.round_no}. ${r.starts}`).join(', ');
  if (tOld !== tNew) d.push(`Kola: ${tOld || 'žádná'} → ${tNew}`);
  const cell = (slots, rooms, r, m) => { const x = slots.find(y => y.round_no === r && rooms.find(z => z.room_no === y.room_no)?.name === m); return x ? `${x.lead || '–'} [${[...x.group_nos].sort((a, b) => a - b).join(',')}]` : ''; };
  for (const r of s.rounds) for (const m of s.rooms) {
    const a = cell(b.slots, b.rooms, r.round_no, m.name), c = cell(s.slots, s.rooms, r.round_no, m.name);
    if (a !== c) d.push(`${r.round_no}. kolo, ${m.name}: ${a || 'prázdné'} → ${c || 'prázdné'}`);
  }
  return d;
}

// ---------- EXPORT (stejný formát jde nahrát zpět) ----------
export function buildWorkbook(XLSX, b, ps) {
  const g = n => b.groups.find(x => x.group_no === n);
  const room = no => b.rooms.find(r => r.room_no === no)?.name || '';
  const roomOf = (gno, rno) => room(b.slots.find(s => s.round_no === rno && s.group_nos.includes(gno))?.room_no);
  const kola = b.rounds.map(r => `Kolo ${r.round_no}`);
  const people = [...ps].sort((x, y) => (x.group_no ?? 99) - (y.group_no ?? 99) || String(x.company).localeCompare(String(y.company), 'cs'));
  const p1 = [['Skupina', 'Barva', 'ID přihlášky', 'Typ', 'Stav', 'Firma', 'Jméno a příjmení', 'Pozice', 'E-mail', 'Telefon', 'Web', 'Sektor', 'Medailonek', ...kola]]
    .concat(people.map(p => [p.group_no ? `Skupina ${p.group_no}` : '', g(p.group_no)?.color_name || '', p.form_id || '', KIND_OUT[p.kind] || '', STATUS_OUT[p.status] || '',
      p.company || '', p.full_name || '', p.position || '', p.email, p.phone || '', p.web || '', p.sector || '', p.description || '',
      ...b.rounds.map(r => (p.group_no && p.kind === 'civil' ? roomOf(p.group_no, r.round_no) : ''))]));
  const rot = [['Místnost', ...b.rounds.map(r => `${r.round_no}. kolo${r.starts ? ` (${String(r.starts).slice(0, 5)}${r.ends ? '–' + String(r.ends).slice(0, 5) : ''})` : ''}`)]];
  for (const m of b.rooms) {
    const at = r => b.slots.find(s => s.round_no === r.round_no && s.room_no === m.room_no);
    rot.push([`${m.name} – lídr`, ...b.rounds.map(r => at(r)?.lead || '')]);
    rot.push([`${m.name} – skupiny`, ...b.rounds.map(r => (at(r)?.group_nos || []).map(n => `Skupina ${n}`).join(', '))]);
  }
  const grp = [['Skupina', 'Barva', 'HEX', 'Počet potvrzených']].concat(b.groups.map(x => [`Skupina ${x.group_no}`, x.color_name, x.color_hex,
    ps.filter(p => p.group_no === x.group_no && p.status === 'confirmed').length]));
  const wb = XLSX.utils.book_new();
  const add = (aoa, name, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add(p1, 'Účastníci', [11, 10, 8, 13, 12, 32, 24, 26, 32, 16, 22, 20, 60, ...kola.map(() => 14)]);
  add(rot, 'Rotace po kolech', [26, ...b.rounds.map(() => 34)]);
  add(grp, 'Skupiny', [11, 12, 10, 10]);
  return wb;
}
