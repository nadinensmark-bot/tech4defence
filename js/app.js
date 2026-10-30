import { api, DEMO } from './api.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// jednopísmenné předložky a spojky nenechávat na konci řádku
const nb = s => esc(s).replace(/(^|[\s(])([aikosuvzAIKOSUVZ]) /g, '$1$2 ');
const tm = t => (t ? String(t).slice(0, 5) : '');
const span = (a, b) => (a || b ? `${tm(a)}${b ? ' až ' + tm(b) : ''}` : '');
const dateCz = d => (d ? new Date(d + 'T12:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const textOn = hex => { // černý nebo bílý text podle jasu barvy
  const h = (hex || '#999').replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#0B1530' : '#fff';
};
const toast = (msg, ms = 2600) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms); };
const STATUS = { registered: 'Registrovaný', confirmed: 'Potvrzený', declined: 'Odmítnutý', cancelled: 'Zrušil účast' };
const KIND = { civil: 'Civilní firma', defence: 'Zbrojař', organizer: 'Organizátor' };

let state = { session: null, admin: false };

// ---------- LOADER (Hubík na koni) ----------
function loader(text = 'Hubík sedlá koně…') {
  if (app.querySelector('header.top')) { app.querySelector('main')?.classList.add('busy'); return; }
  app.innerHTML = `<div class="loader"><video src="assets/hubik-kun.mp4" poster="assets/hubik-kun.jpg" autoplay muted loop playsinline></video><p>${esc(text)}</p></div>`;
}

// ---------- HLAVIČKA ----------
function header() {
  const email = state.session?.user?.email;
  return `${DEMO ? `<div class="demo-bar">DEMO režim bez backendu: data se neukládají. Přihlaste se jako <b>ucastnik@demo.cz</b> nebo <b>admin@demo.cz</b>.</div>` : ''}
  <header class="top"><div class="wrap">
    <a class="logos" href="#/"><img src="assets/logo-cobrand-white.png" alt="Defence Hub CzechInvest"><img class="diana" src="assets/part-of-diana-white.png" alt="part of NATO DIANA"></a>
    <span class="spacer"></span>
    ${email ? `<span class="who">${esc(email)}</span>
      ${state.admin ? `<a class="btn small" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.35)" href="${location.hash.startsWith('#/admin') ? '#/' : '#/admin'}">${location.hash.startsWith('#/admin') ? '<span class="long">Pohled účastníka</span><span class="short">Účastník</span>' : '<span class="long">Administrace</span><span class="short">Admin</span>'}</a>` : ''}
      <button class="small" id="logout">Odhlásit</button>` : ''}
  </div></header>`;
}
function bindHeader() { $('#logout')?.addEventListener('click', async () => { await api.signOut(); location.hash = '#/'; }); }
function page(inner) { app.innerHTML = header() + inner; bindHeader(); }

// ---------- PŘIHLÁŠENÍ ----------
function viewLogin(scanNote = false) {
  page(`<main><div class="wrap"><div class="login card">
    <h1>TECH4DEFENCE</h1>
    ${scanNote ? `<div class="notice" style="margin-bottom:12px">Naskenovali jste vizitku účastníka. Po přihlášení si s ním vyměníte kontakt.</div>` : ''}
    <p class="muted">Přihlaste se e-mailem, který jste uvedli v${' '}registračním formuláři. Pošleme vám odkaz, heslo není potřeba.</p>
    <form id="lf"><label><span>E-mail</span><input type="email" name="email" required autocomplete="email" placeholder="jmeno@firma.cz"></label>
    <button type="submit">Poslat přihlašovací odkaz</button></form>
    <div id="lmsg" style="margin-top:14px"></div>
  </div></div></main>`);
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      await api.sendLink(e.target.email.value);
      $('#lmsg').innerHTML = DEMO ? `<div class="notice">V demu vás rovnou přihlásíme (pokud e-mail v ukázkových datech existuje).</div>`
        : `<div class="notice">Pokud je e-mail mezi registrovanými, přijde vám během chvilky odkaz. Zkontrolujte i${' '}spam. Nepřišel? Použijte e-mail z${' '}registrace, případně kontaktujte organizátory.</div>`;
    } catch (er) { $('#lmsg').innerHTML = `<div class="notice err">Odkaz se nepodařilo odeslat: ${esc(er.message)}</div>`; }
    btn.disabled = false;
  });
}

// ---------- ÚČASTNÍK ----------
async function viewHome() {
  loader();
  const regs = await api.myRegistrations();
  if (regs.length === 1) { location.replace('#/e/' + regs[0].event_id); return; }
  page(`<main><div class="wrap">
    <h1>Moje akce</h1>
    ${regs.length ? `<div class="grid g2">${regs.map(r => `<a class="card" style="text-decoration:none;color:inherit" href="#/e/${r.event_id}">
        <h2>${nb(r.events.name)}</h2><p class="muted">${esc(dateCz(r.events.date))} · ${esc(r.events.city || '')}</p>
        <span class="mono">${esc(STATUS[r.status])}</span></a>`).join('')}</div>`
      : `<div class="card"><p>Pod tímto e-mailem zatím nemáte žádnou registraci${state.admin ? '. Jako admin pokračujte do <a href="#/admin">administrace</a>.' : '. Pokud jste se registrovali jiným e-mailem, odhlaste se a použijte ten.'}</p></div>`}
  </div></main>`);
}

function hero(ev, compact = false) {
  return `<section class="hero ${compact ? 'compact' : ''}"><div class="wrap">
    <h1>${nb(ev.name)}</h1>${ev.subtitle ? `<p class="sub">${nb(ev.subtitle)}</p>` : ''}
    <div class="meta"><span>${esc(dateCz(ev.date))}</span><span>${esc(span(ev.time_from, ev.time_to))}</span><span>${nb(ev.venue || '')}</span></div>
  </div></section>`;
}

function myRotation(b, me) {
  const g = b.groups.find(x => x.group_no === me.group_no);
  const room = n => b.rooms.find(r => r.room_no === n);
  const grp = n => b.groups.find(x => x.group_no === n);
  const chip = n => { const x = grp(n); return `<span class="chip ${n === me.group_no ? 'me' : ''}"><i class="dot" style="background:${esc(x?.color_hex)}"></i>Skupina ${n}${x ? ' · ' + esc(x.color_name) : ''}</span>`; };
  let html = '';
  if (me.kind === 'civil') {
    if (!g) html += `<div class="card"><h2>Vaše skupina</h2><p>Skupinu vám přidělíme před akcí. Na prezenci dostanete jmenovku s${' '}číslem a barvou skupiny.</p></div>`;
    else {
      html += `<div class="badge" style="background:${esc(g.color_hex)};color:${textOn(g.color_hex)}"><span class="num">${g.group_no}</span><span class="txt"><b>Skupina ${g.group_no} · ${esc(g.color_name)}</b>Tuto barvu najdete na své jmenovce.</span></div>`;
      const rows = b.rounds.map(r => {
        const s = b.slots.find(x => x.round_no === r.round_no && (x.group_nos || []).includes(g.group_no));
        if (!s) return `<div class="round"><div class="rn">${r.round_no}.<small>KOLO</small></div><div class="muted">V tomto kole nemáte přidělenou místnost.</div></div>`;
        const rm = room(s.room_no);
        return `<div class="round"><div class="rn">${r.round_no}.<small>${esc(span(r.starts, r.ends) || 'KOLO')}</small></div><div>
          <div class="room">${esc(rm?.name || 'Místnost ' + s.room_no)}</div>${rm?.location_hint ? `<div class="muted">${nb(rm.location_hint)}</div>` : ''}
          ${s.lead ? `<div class="lead">U${' '}stolu: <b>${esc(s.lead)}</b></div>` : ''}
          <div>${(s.group_nos || []).map(chip).join('')}</div></div></div>`;
      }).join('');
      html += `<div class="card" style="margin-top:16px"><h2>Vaše točení</h2>${rows || '<p class="muted">Rozpis zatím není připravený.</p>'}</div>`;
    }
  }
  html += matrix(b, me.kind === 'civil' ? me.group_no : null);
  return html;
}

function matrix(b, hlGroup) {
  if (!b.slots.length) return '';
  const grp = n => b.groups.find(x => x.group_no === n);
  return `<div class="card"><h2>Celý rozpis</h2><p class="muted">V${' '}místnostech se točí účastníci i${' '}zbrojaři.</p><div class="tablewrap"><table class="matrix">
    <tr><th></th>${b.rounds.map(r => `<th>${r.round_no}. kolo ${esc(span(r.starts, r.ends))}</th>`).join('')}</tr>
    ${b.rooms.map(rm => `<tr><th>${esc(rm.name)}</th>${b.rounds.map(r => {
      const s = b.slots.find(x => x.round_no === r.round_no && x.room_no === rm.room_no);
      const hl = hlGroup && s?.group_nos?.includes(hlGroup);
      return `<td class="${hl ? 'hl' : ''}">${s ? `<div><b>${esc(s.lead || '')}</b></div>${(s.group_nos || []).map(n => `<span class="chip"><i class="dot" style="background:${esc(grp(n)?.color_hex)}"></i>${n}</span>`).join('')}` : ''}</td>`;
    }).join('')}</tr>`).join('')}
  </table></div>
  <div class="matrix-m">${b.rounds.map(r => `<div class="mround"><h3>${r.round_no}. kolo <span class="muted">${esc(span(r.starts, r.ends))}</span></h3>
    ${b.rooms.map(rm => { const s = b.slots.find(x => x.round_no === r.round_no && x.room_no === rm.room_no); if (!s) return '';
      const hl = hlGroup && s.group_nos?.includes(hlGroup);
      return `<div class="mslot ${hl ? 'hl' : ''}"><div><b>${esc(rm.name)}</b><div class="muted">${esc(s.lead || '')}</div></div><div class="mchips">${(s.group_nos || []).map(n => `<span class="chip"><i class="dot" style="background:${esc(grp(n)?.color_hex)}"></i>${n}</span>`).join('')}</div></div>`; }).join('')}</div>`).join('')}</div></div>`;
}

function initials(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
function teamHtml(b) {
  if (!b.team?.length) return '';
  const ev = { name: b.event.name, date: b.event.date };
  return `<div class="card"><h2>Organizační tým</h2><p class="muted">Kdyby cokoli, ozvěte se kterémukoli z${'\u00a0'}nás.</p>
    <div class="team">${b.team.map(t => { const c = { full_name: t.full_name, company: 'CzechInvest', position: t.role, email: t.email, phone: t.phone };
      return `<div class="member">${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<span class="ph">${esc(initials(t.full_name))}</span>`}
        <div class="mi"><b>${esc(t.full_name)}</b><div class="muted">${nb(t.role || '')}</div>
        <div class="mc">${t.phone ? `<a href="tel:${esc(String(t.phone).replace(/\s/g, ''))}">${esc(t.phone)}</a>` : ''}${t.email ? `<a href="mailto:${esc(t.email)}">${esc(t.email)}</a>` : ''}</div>
        <button class="small ghost" data-vcf='${esc(JSON.stringify({ c, ev }))}'>Uložit do telefonu</button></div></div>`; }).join('')}</div></div>`;
}

function programHtml(b) {
  const ev = b.event;
  return `<div class="card">${b.program.map(p => `<div class="prog"><div class="t">${esc(span(p.starts, p.ends))}</div><div><b>${nb(p.title)}</b>${p.detail ? `<div class="muted">${nb(p.detail)}</div>` : ''}</div></div>`).join('') || '<p class="muted">Program doplníme.</p>'}</div>
  <div class="grid g2">
    <div class="card"><h3>Místo konání</h3><p>${nb(ev.venue || '')}<br>${esc(ev.address || '')}</p>
      ${ev.address ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://mapy.cz/zakladni?q=${encodeURIComponent(ev.address)}">Otevřít v${' '}Mapy.cz</a>` : ''}</div>
    <div class="card"><h3>O akci</h3>${ev.organizers ? `<p>${nb('Pořádají ' + ev.organizers + '.')}</p>` : ''}${ev.description ? `<p class="muted">${nb(ev.description)}</p>` : ''}
      ${ev.contact_email ? `<p>Dotazy: <a href="mailto:${esc(ev.contact_email)}">${esc(ev.contact_email)}</a></p>` : ''}</div>
  </div>${teamHtml(b)}`;
}

function profileHtml(me) {
  const f = (k, l, type = 'text') => `<label><span>${l}</span><input name="${k}" type="${type}" value="${esc(me[k])}"></label>`;
  return `<form class="card" id="pf"><h2>Můj profil</h2>
    <p class="muted">E-mail: ${esc(me.email)} · Firma: <b>${esc(me.company)}</b>${me.ico ? ' · IČO ' + esc(me.ico) : ''}. Firmu a${' '}e-mail mění organizátoři.</p>
    <div class="grid g2">${f('full_name', 'Jméno a příjmení')}${f('position', 'Pracovní pozice')}${f('phone', 'Mobil', 'tel')}${f('web', 'Web')}</div>
    ${f('sector', 'Sektor firmy')}
    <label><span>Medailonek firmy (čím může být přínosná pro obranný průmysl)</span><textarea name="description" rows="5">${esc(me.description)}</textarea></label>
    <label><span>Proč se účastním</span><textarea name="reasons" rows="3">${esc(me.reasons)}</textarea></label>
    <label class="check"><input type="checkbox" name="in_matchmaking" ${me.in_matchmaking !== false ? 'checked' : ''}> Zobrazit mou firmu v${'\u00a0'}matchmakingu (telefon a${'\u00a0'}e-mail uvidí jen ti, se kterými se propojíte)</label>
    <button type="submit">Uložit profil</button></form>`;
}

const ICON = {
  toceni: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  matchmaking: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4"/>',
  kontakty: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  program: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

async function viewEvent(id, tab = 'toceni') {
  loader();
  const regs = await api.myRegistrations();
  const me = regs.find(r => r.event_id === id);
  if (!me) { location.hash = '#/'; return; }
  const b = await api.eventBundle(id);
  const tabs = [['toceni', 'Moje točení', 'Točení']];
  if (b.event.directory_enabled) tabs.push(['matchmaking', 'Matchmaking', 'Firmy']);
  tabs.push(['kontakty', 'Kontakty', 'Kontakty'], ['program', 'Program', 'Program'], ['profil', 'Profil', 'Profil']);
  if (!tabs.some(t => t[0] === tab)) tab = 'toceni';
  let body = '', after = null;
  if (tab === 'program') body = programHtml(b);
  else if (tab === 'profil') body = profileHtml(me);
  else if (tab === 'matchmaking' && b.event.directory_enabled) ({ html: body, after } = await mmView(b, me, id));
  else if (tab === 'kontakty') ({ html: body, after } = await contactsView(b, me, id));
  else body = myRotation(b, me);
  page(hero(b.event, tab !== 'toceni' && tab !== 'program') + `<main class="evmain"><div class="wrap">
    ${me.status === 'registered' ? `<div class="notice warn" style="margin-bottom:16px">Vaše registrace čeká na potvrzení organizátorů. O${' '}potvrzení vás budeme informovat e-mailem.</div>` : ''}
    <nav class="tabs evtabs">${tabs.map(([k, l, sh]) => `<a href="#/e/${id}/${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${svg(k)}<span class="long">${l}</span><span class="short">${sh}</span></a>`).join('')}</nav>${body}</div></main>`);
  window.scrollTo(0, 0);
  if (after) await after();
  if (tab === 'program') bindVcf();
  $('#pf')?.addEventListener('submit', async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); fd.in_matchmaking = !!fd.in_matchmaking;
    try { await api.updateMyProfile(id, fd); toast('Profil uložen'); } catch (er) { toast('Chyba: ' + er.message, 5000); }
  });
}

// ---------- MATCHMAKING A KONTAKTY ----------
const appUrl = () => location.origin + location.pathname;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function vcard(c, ev) {
  const e = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const parts = String(c.full_name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || ''; const last = parts.join(' ');
  const web = c.web ? (/^https?:/i.test(c.web) ? c.web : 'https://' + c.web) : '';
  const note = ev ? `Potkali jsme se na ${ev.name || ev.event_name || 'TECH4DEFENCE'}${(ev.date || ev.event_date) ? ', ' + new Date((ev.date || ev.event_date) + 'T12:00').toLocaleDateString('cs-CZ') : ''}` : '';
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(last)};${e(first)};;;`, `FN:${e(c.full_name || c.company)}`,
    c.company && `ORG:${e(c.company)}`, c.position && `TITLE:${e(c.position)}`,
    c.phone && `TEL;TYPE=CELL:${String(c.phone).replace(/[^\d+]/g, '')}`, c.email && `EMAIL;TYPE=WORK:${c.email}`,
    web && `URL:${web}`, note && `NOTE:${e(note)}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}
function saveVcf(text, name) {
  const file = (name || 'kontakt').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').slice(0, 60) + '.vcf';
  if (isIOS()) { location.href = 'data:text/vcard;charset=utf-8,' + encodeURIComponent(text); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/vcard;charset=utf-8' }));
  a.download = file; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function loadQR() {
  if (window.qrcode) return window.qrcode;
  await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = ok; sc.onerror = ko; document.head.append(sc); });
  return window.qrcode;
}

function contactCard(c, ev, extra = '') {
  return `<div class="card contact"><h3>${esc(c.full_name || c.company)}</h3>
    <div class="muted">${esc([c.position, c.company].filter(Boolean).join(' · '))}</div>
    <div class="cinfo">${c.phone ? `<a href="tel:${esc(String(c.phone).replace(/\s/g, ''))}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.web ? `<a target="_blank" rel="noopener" href="${esc(/^https?:/i.test(c.web) ? c.web : 'https://' + c.web)}">${esc(c.web)}</a>` : ''}</div>
    <div class="row"><button data-vcf='${esc(JSON.stringify({ c, ev }))}'>Uložit do telefonu</button>${extra}</div></div>`;
}
function bindVcf() {
  app.querySelectorAll('[data-vcf]').forEach(b => b.onclick = () => { const { c, ev } = JSON.parse(b.dataset.vcf); saveVcf(vcard(c, ev), c.full_name || c.company); });
}

function reasonsChips(r) { return String(r || '').split(';').map(x => x.trim().replace(/\.$/, '')).filter(Boolean); }

async function mmView(b, me, id) {
  const [list, contacts] = await Promise.all([api.mmList(id), api.mmContacts(id)]);
  const st = { q: '', sector: '', reason: '' };
  const incoming = contacts.filter(c => c.direction === 'in' && c.status === 'pending');
  const byId = Object.fromEntries(contacts.map(c => [c.id, c]));
  const sectors = [...new Set(list.map(p => p.sector).filter(Boolean))].sort((a, c) => a.localeCompare(c, 'cs'));
  const reasons = [...new Set(list.flatMap(p => reasonsChips(p.reasons)))];
  const ev = { name: b.event.name, date: b.event.date };
  const draw = () => {
    const q = st.q.toLowerCase();
    const shown = list.filter(p => (!q || [p.company, p.full_name, p.description, p.sector].join(' ').toLowerCase().includes(q))
      && (!st.sector || p.sector === st.sector) && (!st.reason || reasonsChips(p.reasons).includes(st.reason)));
    const grp = n => b.groups.find(x => x.group_no === n);
    const action = p => {
      if (p.conn_status === 'connected') { const c = byId[p.id]; return c?.email || c?.phone ? `<button data-vcf='${esc(JSON.stringify({ c, ev }))}'>Uložit do telefonu</button><span class="ok">✓ Kontakt vyměněn</span>` : '<span class="ok">✓ Kontakt vyměněn</span>'; }
      if (p.conn_status === 'sent') return '<span class="muted">Žádost odeslána, čeká na odpověď</span>';
      if (p.conn_status === 'received') return `<button data-acc="${p.conn_id}">Přijmout žádost</button>`;
      if (p.conn_status === 'declined') return '<span class="muted">Bez propojení</span>';
      return `<button class="ghost" data-req="${p.id}">Chci se spojit</button>`;
    };
    document.getElementById('mmbody').innerHTML = `
      ${incoming.length ? `<div class="card hl"><h3>Žádosti o${'\u00a0'}kontakt (${incoming.length})</h3>${incoming.map(c => `<div class="req"><div><b>${esc(c.full_name)}</b> · ${esc(c.company)}${c.message ? `<div class="muted">„${esc(c.message)}“</div>` : ''}</div>
        <div class="row"><button class="small" data-acc="${c.conn_id}">Přijmout</button><button class="small ghost" data-dec="${c.conn_id}">Odmítnout</button></div></div>`).join('')}</div>` : ''}
      <div class="card"><div class="filters">
        <input id="mq" placeholder="Hledat firmu, obor, medailonek…" value="${esc(st.q)}">
        <select id="ms"><option value="">Všechny sektory</option>${sectors.map(s => `<option ${s === st.sector ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </div><div class="row" style="margin-top:10px">${reasons.map(r => `<button class="chipbtn ${r === st.reason ? 'on' : ''}" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <p class="muted" style="margin:10px 0 0">${shown.length} z${'\u00a0'}${list.length} firem. Kontakt (telefon, e-mail) uvidíte až po přijetí žádosti nebo výměně přes QR vizitku.</p></div>
      <div class="grid g2">${shown.map(p => { const g = grp(p.group_no);
        return `<div class="card firm"><h3>${esc(p.company)}</h3>
          <div class="muted">${esc([p.full_name, p.position].filter(Boolean).join(' · '))}</div>
          <div class="row" style="margin:8px 0">${g ? `<span class="chip"><i class="dot" style="background:${esc(g.color_hex)}"></i>Skupina ${g.group_no}</span>` : ''}${p.kind !== 'civil' ? `<span class="chip">${esc(KIND[p.kind])}</span>` : ''}${p.sector ? `<span class="chip">${esc(p.sector)}</span>` : ''}</div>
          ${p.description ? `<p class="desc">${nb(p.description)}</p>` : ''}
          ${reasonsChips(p.reasons).length ? `<div class="reasons">${reasonsChips(p.reasons).map(r => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
          <div class="row" style="margin-top:12px">${action(p)}</div></div>`; }).join('') || '<p class="muted">Nic nenalezeno.</p>'}</div>`;
    const mq = document.getElementById('mq'); mq.oninput = () => { st.q = mq.value; draw(); const n = document.getElementById('mq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    document.getElementById('ms').onchange = e => { st.sector = e.target.value; draw(); };
    app.querySelectorAll('[data-reason]').forEach(x => x.onclick = () => { st.reason = st.reason === x.dataset.reason ? '' : x.dataset.reason; draw(); });
    app.querySelectorAll('[data-req]').forEach(x => x.onclick = async () => {
      const msg = prompt('Krátká zpráva k žádosti (nepovinné), např. co hledáte nebo kdy se potkat:');
      if (msg === null) return;
      try { const r = await api.mmRequest(x.dataset.req, msg); toast(r === 'connected' ? 'Propojeno, kontakt najdete v záložce Kontakty' : 'Žádost odeslána'); viewEvent(id, 'matchmaking'); }
      catch (er) { toast('Chyba: ' + er.message, 5000); }
    });
    app.querySelectorAll('[data-acc]').forEach(x => x.onclick = async () => { await api.mmRespond(x.dataset.acc, true); toast('Propojeno'); viewEvent(id, 'matchmaking'); });
    app.querySelectorAll('[data-dec]').forEach(x => x.onclick = async () => { await api.mmRespond(x.dataset.dec, false); viewEvent(id, 'matchmaking'); });
    bindVcf();
  };
  return { html: '<div id="mmbody"></div>', after: draw };
}

async function contactsView(b, me, id) {
  const contacts = await api.mmContacts(id);
  const ev = { name: b.event.name, date: b.event.date };
  const ok = contacts.filter(c => c.status === 'accepted');
  const incoming = contacts.filter(c => c.direction === 'in' && c.status === 'pending');
  const sent = contacts.filter(c => c.direction === 'out' && c.status === 'pending');
  const link = appUrl() + '#/k/' + me.card_token;
  const html = `<div class="grid g2">
    <div class="card vizitka"><h2>Moje vizitka</h2><div id="qr" class="qr"></div>
      <p class="muted">Ukažte kód. Druhý účastník ho naskenuje fotoaparátem telefonu a${'\u00a0'}vyměníte si kontakty (on dostane váš, vy jeho).</p>
      <div class="row"><button class="ghost small" id="cpl">Kopírovat odkaz</button><a class="btn ghost small" href="#/e/${id}/profil">Upravit, co sdílím</a></div></div>
    <div class="card"><h2>Kontakty z${'\u00a0'}akce <span class="muted">(${ok.length})</span></h2>
      ${ok.length ? `<p class="muted">Uložte si je jedním klepnutím do telefonu.</p>${ok.length > 1 ? '<button id="allvcf" class="ghost">Stáhnout všechny (.vcf)</button>' : ''}` : '<p class="muted">Zatím žádné. Naskenujte vizitku jiného účastníka nebo pošlete žádost v${"\u00a0"}Matchmakingu.</p>'}
      ${incoming.length ? `<h3 style="margin-top:18px">Čekají na vás (${incoming.length})</h3>${incoming.map(c => `<div class="req"><div><b>${esc(c.full_name)}</b> · ${esc(c.company)}${c.message ? `<div class="muted">„${esc(c.message)}“</div>` : ''}</div><div class="row"><button class="small" data-acc="${c.conn_id}">Přijmout</button><button class="small ghost" data-dec="${c.conn_id}">Odmítnout</button></div></div>`).join('')}` : ''}
      ${sent.length ? `<h3 style="margin-top:18px">Odeslané žádosti</h3>${sent.map(c => `<div class="muted">${esc(c.company)} (${esc(c.full_name)})</div>`).join('')}` : ''}
    </div></div>
    <div class="grid g2">${ok.map(c => contactCard(c, ev, c.source === 'qr' ? '<span class="muted">přes QR</span>' : '')).join('')}</div>${teamHtml(b)}`;
  const after = async () => {
    try { const qrcode = await loadQR(); const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    catch { document.getElementById('qr').innerHTML = `<p class="muted">QR kód se nenačetl. Odkaz: ${esc(link)}</p>`; }
    document.getElementById('cpl').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Odkaz zkopírován'); } catch { prompt('Zkopírujte odkaz:', link); } };
    const all = document.getElementById('allvcf'); if (all) all.onclick = () => saveVcf(ok.map(c => vcard(c, ev)).join('\r\n'), 'kontakty-' + b.event.slug);
    app.querySelectorAll('[data-acc]').forEach(x => x.onclick = async () => { await api.mmRespond(x.dataset.acc, true); toast('Propojeno'); viewEvent(id, 'kontakty'); });
    app.querySelectorAll('[data-dec]').forEach(x => x.onclick = async () => { await api.mmRespond(x.dataset.dec, false); viewEvent(id, 'kontakty'); });
    bindVcf();
  };
  return { html, after };
}

const PENDING = 't4d_pending_card';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

async function viewScan(token) {
  loader('Hubík nese vizitku…');
  try {
    const c = await api.mmScan(token);
    if (c.self) { page(`<main><div class="wrap"><div class="card"><h2>To je vaše vizitka</h2><p>Ukažte ji ostatním, ať si ji naskenují.</p><a class="btn" href="#/e/${c.event_id}/kontakty">Zpět na moje kontakty</a></div></div></main>`); return; }
    page(`<main><div class="wrap" style="max-width:560px">
      <div class="notice" style="margin-bottom:16px">Kontakty jste si vyměnili. ${esc(c.full_name || '')} uvidí váš kontakt ve své appce.</div>
      ${contactCard(c, { name: c.event_name, date: c.event_date })}
      <a class="btn ghost" href="#/e/${c.event_id}/kontakty">Moje kontakty</a></div></main>`);
    bindVcf();
  } catch (er) {
    const m = /not_participant/.test(er.message) ? 'Tahle vizitka patří k akci, na které nejste registrovaní pod tímto e-mailem.' : /not_found/.test(er.message) ? 'Vizitka neexistuje nebo už neplatí.' : er.message;
    page(`<main><div class="wrap"><div class="notice err">${esc(m)}</div><p><a href="#/">Zpět</a></p></div></main>`);
  }
}

// ---------- ADMIN ----------
async function viewAdmin() {
  loader();
  const evs = await api.listEvents();
  page(`<main><div class="wrap">
    <div class="row" style="justify-content:space-between"><h1>Administrace akcí</h1><button id="newev">Nová akce</button></div>
    <div class="grid g2">${evs.map(e => `<a class="card" style="text-decoration:none;color:inherit" href="#/admin/${e.id}">
      <h2>${nb(e.name)}</h2><p class="muted">${esc(dateCz(e.date))} · ${esc(e.city || '')}</p>
      <span class="mono">${e.is_published ? 'ZVEŘEJNĚNO' : 'SKRYTO'}</span></a>`).join('')}</div>
  </div></main>`);
  $('#newev').onclick = async () => {
    const n = await api.saveEvent({ slug: 'akce-' + Date.now().toString(36), name: 'TECH4DEFENCE | Nové město', is_published: false });
    location.hash = '#/admin/' + n.id + '/info';
  };
}

const adminTabs = [['ucastnici', 'Účastníci'], ['toceni', 'Točení'], ['program', 'Program'], ['tym', 'Tým'], ['info', 'Info o akci'], ['jmenovky', 'Jmenovky']];

async function viewAdminEvent(id, tab = 'ucastnici') {
  loader();
  const b = await api.eventBundle(id);
  const nav = `<div class="row noprint" style="justify-content:space-between"><div><a href="#/admin" class="muted">← Všechny akce</a><h1 style="margin-top:6px">${nb(b.event.name)}</h1></div></div>
    <nav class="tabs">${adminTabs.map(([k, l]) => `<a href="#/admin/${id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
  const wrap = h => page(`<main><div class="wrap">${nav}${h}</div></main>`);
  if (tab === 'info') return adminInfo(b, wrap);
  if (tab === 'program') return adminProgram(b, wrap);
  if (tab === 'toceni') return adminRotation(b, wrap);
  if (tab === 'tym') return adminTeam(b, wrap);
  const ps = await api.listParticipants(id);
  if (tab === 'jmenovky') return adminTags(b, ps, wrap);
  return adminParticipants(b, ps, wrap);
}

function adminInfo(b, wrap) {
  const ev = b.event;
  const f = (k, l, type = 'text') => `<label><span>${l}</span><input name="${k}" type="${type}" value="${esc(type === 'time' ? tm(ev[k]) : ev[k])}"></label>`;
  wrap(`<form class="card" id="ef"><div class="grid g2">${f('name', 'Název')}${f('subtitle', 'Podtitul')}${f('city', 'Město')}${f('slug', 'Krátký kód (slug)')}
    ${f('date', 'Datum', 'date')}<div class="grid g2" style="gap:10px">${f('time_from', 'Od', 'time')}${f('time_to', 'Do', 'time')}</div>
    ${f('venue', 'Místo')}${f('address', 'Adresa')}${f('contact_email', 'Kontaktní e-mail pro účastníky', 'email')}</div>
    <label><span>Pořadatelé</span><textarea name="organizers" rows="2">${esc(ev.organizers)}</textarea></label>
    <label><span>Popis pro účastníky</span><textarea name="description" rows="3">${esc(ev.description)}</textarea></label>
    <label class="check"><input type="checkbox" name="is_published" ${ev.is_published ? 'checked' : ''}> Akce je zveřejněná (účastníci ji po přihlášení vidí)</label>
    <label class="check"><input type="checkbox" name="directory_enabled" ${ev.directory_enabled ? 'checked' : ''}> Matchmaking: účastníci vidí medailonky ostatních potvrzených firem a${'\u00a0'}můžou si posílat žádosti o${'\u00a0'}kontakt</label>
    <div class="row"><button type="submit">Uložit</button><button type="button" class="danger" id="delev">Smazat akci</button></div></form>`);
  $('#ef').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target); const o = { id: ev.id };
    for (const k of ['name', 'subtitle', 'city', 'slug', 'date', 'time_from', 'time_to', 'venue', 'address', 'contact_email', 'organizers', 'description']) o[k] = fd.get(k) || null;
    o.is_published = !!fd.get('is_published'); o.directory_enabled = !!fd.get('directory_enabled');
    try { await api.saveEvent(o); toast('Uloženo'); } catch (er) { toast('Chyba: ' + er.message, 5000); }
  });
  $('#delev').onclick = async () => {
    if (prompt('Smazání je nevratné a smaže i účastníky. Pro potvrzení napište SMAZAT') !== 'SMAZAT') return;
    await api.deleteEvent(ev.id); location.hash = '#/admin';
  };
}

function adminProgram(b, wrap) {
  let items = b.program.map(p => ({ starts: tm(p.starts), ends: tm(p.ends), title: p.title, detail: p.detail || '' }));
  const draw = () => {
    wrap(`<div class="card"><div class="tablewrap"><table><tr><th>Od</th><th>Do</th><th>Název</th><th>Detail</th><th></th></tr>
      ${items.map((p, i) => `<tr><td><input type="time" data-i="${i}" data-k="starts" value="${p.starts}"></td><td><input type="time" data-i="${i}" data-k="ends" value="${p.ends}"></td>
        <td><input data-i="${i}" data-k="title" value="${esc(p.title)}"></td><td><input data-i="${i}" data-k="detail" value="${esc(p.detail)}"></td>
        <td><button class="small danger" data-del="${i}">×</button></td></tr>`).join('')}</table></div>
      <div class="row" style="margin-top:12px"><button class="ghost" id="add">Přidat bod</button><button id="save">Uložit program</button></div></div>`);
    app.querySelectorAll('input[data-i]').forEach(inp => inp.oninput = () => { items[inp.dataset.i][inp.dataset.k] = inp.value; });
    app.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { items.splice(+x.dataset.del, 1); draw(); });
    $('#add').onclick = () => { items.push({ starts: '', ends: '', title: '', detail: '' }); draw(); };
    $('#save').onclick = async () => { try { await api.saveProgram(b.event.id, items); toast('Program uložen'); } catch (er) { toast('Chyba: ' + er.message, 5000); } };
  };
  draw();
}

function resizePhoto(file) {
  return new Promise((ok, ko) => { const img = new Image(); img.onload = () => {
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 160;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
    URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = ko; img.src = URL.createObjectURL(file); });
}
function adminTeam(b, wrap) {
  let list = (b.team || []).map(t => ({ full_name: t.full_name, role: t.role || '', email: t.email || '', phone: t.phone || '', photo: t.photo || null }));
  const draw = () => {
    wrap(`<div class="card"><h2>Organizační tým</h2><p class="muted">Účastníci tým uvidí v${'\u00a0'}záložce Program a${'\u00a0'}v${'\u00a0'}Kontaktech, včetně tlačítka pro uložení do telefonu.</p>
      ${list.map((t, i) => `<div class="tedit">${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<span class="ph">${esc(initials(t.full_name))}</span>`}
        <div class="grid g2" style="flex:1;gap:8px">
          <input data-i="${i}" data-k="full_name" value="${esc(t.full_name)}" placeholder="Jméno">
          <input data-i="${i}" data-k="role" value="${esc(t.role)}" placeholder="Role na akci">
          <input data-i="${i}" data-k="phone" value="${esc(t.phone)}" placeholder="Telefon">
          <input data-i="${i}" data-k="email" value="${esc(t.email)}" placeholder="E-mail">
        </div>
        <div class="row" style="flex-direction:column;align-items:stretch"><label class="btn ghost small" style="margin:0">Fotka<input type="file" accept="image/*" data-photo="${i}" hidden></label>
          <button class="small ghost" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button class="small danger" data-del="${i}">×</button></div></div>`).join('')}
      <div class="row" style="margin-top:12px"><button class="ghost" id="tadd">+ Přidat člena</button><button id="tsave">Uložit tým</button></div></div>`);
    app.querySelectorAll('input[data-i]').forEach(x => x.oninput = () => { list[x.dataset.i][x.dataset.k] = x.value; });
    app.querySelectorAll('[data-photo]').forEach(x => x.onchange = async () => { if (x.files[0]) { list[x.dataset.photo].photo = await resizePhoto(x.files[0]); draw(); } });
    app.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { list.splice(+x.dataset.del, 1); draw(); });
    app.querySelectorAll('[data-up]').forEach(x => x.onclick = () => { const i = +x.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); });
    $('#tadd').onclick = () => { list.push({ full_name: '', role: '', email: '', phone: '', photo: null }); draw(); };
    $('#tsave').onclick = async () => { try { await api.saveTeam(b.event.id, list.filter(t => t.full_name.trim())); toast('Tým uložen'); } catch (er) { toast('Chyba: ' + er.message, 5000); } };
  };
  draw();
}

// Kontrola rozpisu: každá skupina v každém kole právě jednou, ke každému stolu zbrojařů právě jednou
export function checkRotation(s) {
  const warn = []; const leads = [...new Set(s.slots.map(x => x.lead).filter(Boolean))];
  for (const r of s.rounds) {
    const inRound = s.slots.filter(x => x.round_no === r.round_no).flatMap(x => x.group_nos);
    for (const g of s.groups) {
      const c = inRound.filter(n => n === g.group_no).length;
      if (c === 0) warn.push(`${r.round_no}. kolo: skupina ${g.group_no} nemá místnost`);
      if (c > 1) warn.push(`${r.round_no}. kolo: skupina ${g.group_no} je ve více místnostech`);
    }
    const ls = s.slots.filter(x => x.round_no === r.round_no && x.lead).map(x => x.lead);
    if (new Set(ls).size !== ls.length) warn.push(`${r.round_no}. kolo: stejný stůl zbrojařů ve dvou místnostech`);
  }
  for (const g of s.groups) {
    const seen = s.slots.filter(x => x.group_nos.includes(g.group_no)).map(x => x.lead).filter(Boolean);
    const dup = seen.filter((l, i) => seen.indexOf(l) !== i);
    if (dup.length) warn.push(`Skupina ${g.group_no} se ke stolu „${dup[0]}“ dostane víckrát`);
    const miss = leads.filter(l => !seen.includes(l));
    if (miss.length && s.rounds.length >= leads.length) warn.push(`Skupina ${g.group_no} se nedostane ke stolu: ${miss.join(' / ')}`);
  }
  return warn;
}

function adminRotation(b, wrap) {
  const s = {
    groups: b.groups.map(g => ({ ...g })), rooms: b.rooms.map(r => ({ ...r })),
    rounds: b.rounds.map(r => ({ round_no: r.round_no, starts: tm(r.starts), ends: tm(r.ends) })),
    slots: b.slots.map(x => ({ round_no: x.round_no, room_no: x.room_no, lead: x.lead || '', group_nos: [...(x.group_nos || [])] })),
  };
  const PALETTE = [['šedá', '#999999'], ['červená', '#E53935'], ['fialová', '#8E44AD'], ['modrá', '#00B0F0'], ['zelená', '#00B050'], ['žlutá', '#FFD600'], ['oranžová', '#FB8C00'], ['růžová', '#EC407A']];
  const slot = (r, m) => { let x = s.slots.find(y => y.round_no === r && y.room_no === m); if (!x) { x = { round_no: r, room_no: m, lead: '', group_nos: [] }; s.slots.push(x); } return x; };
  const renumber = () => {
    s.groups.forEach((g, i) => g.group_no = i + 1); s.rooms.forEach((r, i) => r.room_no = i + 1); s.rounds.forEach((r, i) => r.round_no = i + 1);
    s.slots = s.slots.filter(x => x.round_no <= s.rounds.length && x.room_no <= s.rooms.length);
    s.slots.forEach(x => x.group_nos = x.group_nos.filter(n => n <= s.groups.length));
  };
  const draw = () => {
    const warn = checkRotation(s);
    wrap(`<div class="grid g3">
      <div class="card"><h3>Barevné skupiny</h3>${s.groups.map((g, i) => `<div class="row" style="margin-bottom:8px"><b style="width:22px">${g.group_no}</b>
        <input type="color" data-g="${i}" data-k="color_hex" value="${esc(g.color_hex)}" style="width:44px;padding:2px">
        <input data-g="${i}" data-k="color_name" value="${esc(g.color_name)}" style="flex:1"></div>`).join('')}
        <div class="row"><button class="ghost small" id="gadd">+ skupina</button>${s.groups.length ? '<button class="ghost small" id="gdel">− poslední</button>' : ''}</div></div>
      <div class="card"><h3>Místnosti</h3>${s.rooms.map((r, i) => `<label><span>Místnost ${r.room_no}</span><input data-m="${i}" data-k="name" value="${esc(r.name)}"><input data-m="${i}" data-k="location_hint" value="${esc(r.location_hint || '')}" placeholder="kde ji najdou (patro, číslo dveří)" style="margin-top:4px"></label>`).join('')}
        <div class="row"><button class="ghost small" id="madd">+ místnost</button>${s.rooms.length ? '<button class="ghost small" id="mdel">− poslední</button>' : ''}</div></div>
      <div class="card"><h3>Kola a časy</h3>${s.rounds.map((r, i) => `<div class="row" style="margin-bottom:8px"><b style="width:52px">${r.round_no}. kolo</b>
        <input type="time" data-r="${i}" data-k="starts" value="${r.starts}" style="width:110px"><input type="time" data-r="${i}" data-k="ends" value="${r.ends}" style="width:110px"></div>`).join('')}
        <div class="row"><button class="ghost small" id="radd">+ kolo</button>${s.rounds.length ? '<button class="ghost small" id="rdel">− poslední</button>' : ''}</div></div>
    </div>
    <div class="card"><h2>Rozpis točení</h2><p class="muted">Do každého políčka napište stůl zbrojařů a${' '}zaškrtněte skupiny, které tam v${' '}daném kole sedí.</p>
      <div class="tablewrap"><table class="matrix"><tr><th></th>${s.rounds.map(r => `<th>${r.round_no}. kolo</th>`).join('')}</tr>
      ${s.rooms.map(m => `<tr><th>${esc(m.name)}</th>${s.rounds.map(r => { const x = slot(r.round_no, m.room_no);
        return `<td><input data-sr="${r.round_no}" data-sm="${m.room_no}" value="${esc(x.lead)}" placeholder="Stůl zbrojařů">
          <div style="margin-top:6px">${s.groups.map(g => `<label class="chip" style="cursor:pointer"><input type="checkbox" style="width:auto" data-cr="${r.round_no}" data-cm="${m.room_no}" data-cg="${g.group_no}" ${x.group_nos.includes(g.group_no) ? 'checked' : ''}><i class="dot" style="background:${esc(g.color_hex)}"></i>${g.group_no}</label>`).join('')}</div></td>`; }).join('')}</tr>`).join('')}
      </table></div>
      <div style="margin:14px 0">${warn.length ? `<ul class="warnlist">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : `<p class="oklist">✓ Každá skupina je v${' '}každém kole jednou a${' '}dostane se ke všem stolům zbrojařů.</p>`}</div>
      <div class="row"><button id="save">Uložit rozpis</button><select id="copyfrom" style="width:auto"><option value="">Zkopírovat strukturu z jiné akce…</option></select></div></div>`);
    app.querySelectorAll('[data-g]').forEach(i => i.oninput = () => { s.groups[i.dataset.g][i.dataset.k] = i.value; if (i.type === 'color') draw(); });
    app.querySelectorAll('[data-m]').forEach(i => i.oninput = () => { s.rooms[i.dataset.m][i.dataset.k] = i.value; });
    app.querySelectorAll('[data-r]').forEach(i => i.oninput = () => { s.rounds[i.dataset.r][i.dataset.k] = i.value; });
    app.querySelectorAll('[data-sr]').forEach(i => i.onchange = () => { slot(+i.dataset.sr, +i.dataset.sm).lead = i.value; draw(); });
    app.querySelectorAll('[data-cr]').forEach(i => i.onchange = () => {
      const x = slot(+i.dataset.cr, +i.dataset.cm), g = +i.dataset.cg;
      x.group_nos = i.checked ? [...x.group_nos, g].sort((a, b) => a - b) : x.group_nos.filter(n => n !== g); draw();
    });
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = () => { fn(); renumber(); draw(); }; };
    on('#gadd', () => { const p = PALETTE[s.groups.length % PALETTE.length]; s.groups.push({ group_no: 0, color_name: p[0], color_hex: p[1] }); });
    on('#gdel', () => s.groups.pop());
    on('#madd', () => s.rooms.push({ room_no: 0, name: 'Zasedačka ' + (s.rooms.length + 1), location_hint: '' }));
    on('#mdel', () => s.rooms.pop());
    on('#radd', () => s.rounds.push({ round_no: 0, starts: '', ends: '' }));
    on('#rdel', () => s.rounds.pop());
    $('#save').onclick = async () => {
      const payload = { ...s, slots: s.slots.filter(x => x.lead || x.group_nos.length) };
      try { await api.saveRotation(b.event.id, payload); toast(warn.length ? 'Uloženo, ale rozpis má upozornění' : 'Rozpis uložen'); } catch (er) { toast('Chyba: ' + er.message, 5000); }
    };
    api.listEvents().then(evs => { const sel = $('#copyfrom'); if (!sel) return;
      evs.filter(e => e.id !== b.event.id).forEach(e => sel.add(new Option(e.name + ' (' + (e.date || '') + ')', e.id)));
      sel.onchange = async () => { if (!sel.value) return; const o = await api.eventBundle(sel.value);
        s.groups = o.groups.map(g => ({ ...g })); s.rooms = o.rooms.map(r => ({ ...r }));
        s.rounds = o.rounds.map(r => ({ round_no: r.round_no, starts: tm(r.starts), ends: tm(r.ends) }));
        s.slots = o.slots.map(x => ({ round_no: x.round_no, room_no: x.room_no, lead: x.lead || '', group_nos: [...x.group_nos] }));
        toast('Zkopírováno, nezapomeňte uložit'); draw(); };
    });
  };
  draw();
}

// Import z MS Forms (Formulář zájmu o akci …xlsx) nebo CSV
const norm = h => String(h || '').replace(/ /g, ' ').trim().toLowerCase();
export function mapFormRow(row) {
  const get = (...keys) => { for (const k of Object.keys(row)) { const n = norm(k); if (keys.some(t => (t.endsWith('*') ? n.startsWith(t.slice(0, -1)) : n === t))) { const v = row[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } } return null; };
  const mail = [get('email'), get('e-mail', 'e-mailová adresa')].find(v => v && /@/.test(v));
  return {
    email: mail ? mail.toLowerCase() : null,
    full_name: get('jméno a příjmení účastníka', 'jméno a příjmení', 'účastník'),
    company: get('název firmy', 'firma', 'společnost'),
    ico: get('ičo firmy', 'ičo', 'ič'),
    position: get('pracovní pozice', 'pozice', 'funkce'),
    phone: get('mobil', 'telefon'),
    web: get('web'),
    description: get('výstižný*', 'medailonek', 'popis firmy'),
    sector: get('sektor vaší firmy', 'sektor'),
    reasons: (get('proč se účastním*') || '').split(';').map(x => x.trim()).filter(Boolean).join('; ') || null,
    form_id: get('id', 'id přihlášky'),
    group_no: (String(get('skupina') || '').match(/\d+/) || [null])[0] ? +String(get('skupina')).match(/\d+/)[0] : null,
  };
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = ko; document.head.append(sc); });
  return window.XLSX;
}

export function autoAssign(ps, groups, all = false) {
  const civil = ps.filter(p => p.kind === 'civil' && p.status === 'confirmed');
  const todo = all ? civil : civil.filter(p => !p.group_no);
  const count = Object.fromEntries(groups.map(g => [g.group_no, 0]));
  if (!all) civil.filter(p => p.group_no && p.group_no in count).forEach(p => count[p.group_no]++);
  // seřadit podle sektoru, aby se obory rozprostřely do všech skupin
  todo.sort((a, b) => String(a.sector || '').localeCompare(String(b.sector || ''), 'cs'));
  const out = [];
  for (const p of todo) {
    const g = +Object.entries(count).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
    count[g]++; out.push({ id: p.id, group_no: g });
  }
  return out;
}

function adminParticipants(b, ps, wrap) {
  const id = b.event.id;
  let filter = '';
  const cnt = st => ps.filter(p => p.status === st).length;
  const grpCount = n => ps.filter(p => p.group_no === n && p.status === 'confirmed').length;
  const draw = () => {
    const q = filter.toLowerCase();
    const list = ps.filter(p => !q || [p.company, p.full_name, p.email, p.sector].join(' ').toLowerCase().includes(q));
    wrap(`<div class="grid g3">
      <div class="card"><div class="stat">${ps.length}</div><div class="muted">celkem · ${cnt('confirmed')} potvrzených · ${cnt('registered')} čeká</div></div>
      <div class="card"><div class="stat">${ps.filter(p => p.checked_in_at).length}</div><div class="muted">prošlo prezencí · <span id="conncount">…</span> vyměněných kontaktů</div></div>
      <div class="card"><div class="row">${b.groups.map(g => `<span class="chip"><i class="dot" style="background:${esc(g.color_hex)}"></i>${g.group_no}: ${grpCount(g.group_no)}</span>`).join('') || '<span class="muted">Skupiny nejsou nastavené (záložka Točení)</span>'}</div></div>
    </div>
    <div class="card"><h3>Import registrací</h3><p class="muted">Nahrajte export z${' '}MS Forms (Formulář zájmu o${' '}akci …xlsx) nebo CSV. Soubor s${'\u00a0'}rozdělením do skupin (sloupce „Skupina“ a „ID přihlášky“) se spáruje podle ID. Existující účastníky (podle e-mailu) jen aktualizuje, stav ani skupinu nepřepíše.</p>
      <div class="row"><input type="file" id="file" accept=".xlsx,.xls,.csv" style="width:auto"></div><div id="imp"></div></div>
    <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px">
      <input id="q" placeholder="Hledat firmu, jméno, e-mail…" value="${esc(filter)}" style="max-width:320px">
      <div class="row"><button class="ghost small" id="auto">Rozdělit do skupin (jen bez skupiny)</button><button class="ghost small" id="autoall">Přerozdělit všechny</button>
      ${cnt('registered') ? `<button class="ghost small" id="confall">Potvrdit všech ${cnt('registered')} čekajících</button>` : ''}<button class="ghost small" id="csv">Export CSV</button><button class="ghost small" id="addp">+ Přidat ručně</button></div></div>
      <div class="tablewrap"><table class="ptable"><tr><th>Firma</th><th>Účastník</th><th>Sektor</th><th>Typ</th><th>Stav</th><th>Skupina</th><th>Prezence</th><th></th></tr>
      ${list.map(p => `<tr><td><b>${esc(p.company)}</b><div class="muted">${esc(p.ico || '')}</div></td>
        <td>${esc(p.full_name)}<div class="muted">${esc(p.email)}</div></td><td class="hide-m">${esc(p.sector || '')}</td>
        <td data-l="Typ"><select data-p="${p.id}" data-k="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td data-l="Stav"><select data-p="${p.id}" data-k="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td data-l="Skupina"><select data-p="${p.id}" data-k="group_no"><option value="">bez skupiny</option>${b.groups.map(g => `<option value="${g.group_no}" ${p.group_no === g.group_no ? 'selected' : ''}>${g.group_no} ${esc(g.color_name)}</option>`).join('')}</select></td>
        <td data-l="Prezence"><label class="ci"><input type="checkbox" data-ci="${p.id}" ${p.checked_in_at ? 'checked' : ''}><span>${p.checked_in_at ? 'Dorazil' : 'Nedorazil'}</span></label></td>
        <td class="del"><button class="small danger" data-del="${p.id}" aria-label="Smazat">×</button></td></tr>`).join('')}</table></div></div>`);
    api.connectionCount(id).then(n => { const el = $('#conncount'); if (el) el.textContent = n; }).catch(() => {});
    const qi = $('#q'); qi.oninput = () => { filter = qi.value; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    app.querySelectorAll('select[data-p]').forEach(sel => sel.onchange = async () => {
      const p = ps.find(x => x.id === sel.dataset.p); const k = sel.dataset.k; const v = k === 'group_no' ? (sel.value ? +sel.value : null) : sel.value;
      try { await api.updateParticipant(p.id, { [k]: v }); p[k] = v; toast('Uloženo'); draw(); } catch (er) { toast('Chyba: ' + er.message, 5000); }
    });
    app.querySelectorAll('[data-ci]').forEach(c => c.onchange = async () => {
      const p = ps.find(x => x.id === c.dataset.ci); const v = c.checked ? new Date().toISOString() : null;
      await api.updateParticipant(p.id, { checked_in_at: v }); p.checked_in_at = v; draw();
    });
    app.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => {
      const p = ps.find(y => y.id === x.dataset.del); if (!confirm(`Smazat ${p.company} (${p.email})?`)) return;
      await api.deleteParticipant(p.id); ps = ps.filter(y => y.id !== p.id); draw();
    });
    const assign = async all => {
      if (!b.groups.length) return toast('Nejdřív nastavte skupiny v záložce Točení');
      if (all && !confirm('Přerozdělit všechny potvrzené civilní firmy? Stávající skupiny se přepíšou.')) return;
      const ch = autoAssign(ps, b.groups, all); if (!ch.length) return toast('Nikdo bez skupiny (počítají se jen potvrzené civilní firmy)');
      await api.updateParticipants(ch); ch.forEach(c => ps.find(p => p.id === c.id).group_no = c.group_no); toast(`Rozděleno: ${ch.length}`); draw();
    };
    $('#auto').onclick = () => assign(false); $('#autoall').onclick = () => assign(true);
    $('#csv').onclick = () => downloadCsv(b, ps);
    const ca = $('#confall'); if (ca) ca.onclick = async () => {
      if (!confirm(`Potvrdit účast všem ${cnt('registered')} čekajícím registracím?`)) return;
      await api.confirmAllRegistered(id); ps = await api.listParticipants(id); toast('Potvrzeno'); draw();
    };
    $('#addp').onclick = async () => {
      const email = prompt('E-mail účastníka'); if (!email || !/@/.test(email)) return;
      const company = prompt('Firma') || ''; const full_name = prompt('Jméno a příjmení') || '';
      const kind = confirm('Je to zbrojař (vede diskuzní stůl)? OK = ano, Zrušit = civilní firma') ? 'defence' : 'civil';
      await api.upsertParticipants([{ event_id: id, email: email.trim().toLowerCase(), company, full_name, kind, status: 'confirmed' }]);
      ps = await api.listParticipants(id); draw();
    };
    $('#file').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const XLSX = await loadXLSX(); const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map(mapFormRow);
      // Soubor s rozdělením do skupin (bez e-mailů): párovat podle ID přihlášky z formuláře
      if (!rows.some(r => r.email) && rows.some(r => r.form_id && r.group_no)) {
        const byForm = new Map(ps.map(p => [String(p.form_id), p]));
        const hits = rows.filter(r => r.form_id && r.group_no && byForm.has(String(r.form_id)));
        const miss = rows.filter(r => r.form_id && r.group_no && !byForm.has(String(r.form_id)));
        $('#imp').innerHTML = `<div class="notice" style="margin-top:10px">Rozdělení do skupin: ${hits.length} účastníků spárováno podle ID přihlášky${miss.length ? `, ${miss.length} bez shody (ID ${miss.map(r => r.form_id).join(', ')}: nejdřív importujte aktuální export z${'\u00a0'}Forms)` : ''}.</div>
          <div class="row" style="margin-top:10px"><button id="doimp">Nastavit skupiny</button></div>`;
        $('#doimp').onclick = async () => {
          try {
            const ch = hits.map(r => ({ id: byForm.get(String(r.form_id)).id, group_no: r.group_no }));
            await api.updateParticipants(ch); ps = await api.listParticipants(id); toast(`Skupiny nastaveny: ${ch.length}`); draw();
          } catch (er) { toast('Chyba: ' + er.message, 6000); }
        };
        return;
      }
      rows.forEach(r => delete r.group_no); // běžný import z Forms skupiny nepřepisuje
      const bad = rows.filter(r => !r.email); const map = new Map();
      rows.filter(r => r.email).forEach(r => map.set(r.email, r)); // duplicita ve formuláři: platí poslední odpověď
      const good = [...map.values()]; const known = new Set(ps.map(p => p.email));
      $('#imp').innerHTML = `<div class="notice" style="margin-top:10px">Nalezeno ${good.length} registrací: ${good.filter(r => !known.has(r.email)).length} nových, ${good.filter(r => known.has(r.email)).length} k${' '}aktualizaci${bad.length ? `, ${bad.length} řádků bez platného e-mailu přeskočím` : ''}${rows.length - bad.length - good.length ? `, ${rows.length - bad.length - good.length} duplicit` : ''}.</div>
        <div class="row" style="margin-top:10px"><button id="doimp">Importovat</button></div>`;
      $('#doimp').onclick = async () => {
        try {
          await api.upsertParticipants(good.map(r => { const o = { event_id: id }; for (const [k, v] of Object.entries(r)) if (v != null) o[k] = v; return o; }));
          ps = await api.listParticipants(id); toast(`Importováno ${good.length}`); draw();
        } catch (er) { toast('Chyba importu: ' + er.message, 6000); }
      };
    };
  };
  draw();
}

function downloadCsv(b, ps) {
  const g = n => b.groups.find(x => x.group_no === n);
  const cols = ['company', 'ico', 'full_name', 'position', 'email', 'phone', 'web', 'sector', 'kind', 'status', 'group_no', 'barva', 'checked_in_at', 'reasons', 'description'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(';')].concat(ps.map(p => cols.map(c => q(c === 'barva' ? g(p.group_no)?.color_name : c === 'kind' ? KIND[p.kind] : c === 'status' ? STATUS[p.status] : p[c])).join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = `ucastnici-${b.event.slug}.csv`; a.click();
}

function adminTags(b, ps, wrap) {
  const list = ps.filter(p => p.status === 'confirmed').sort((x, y) => (x.group_no ?? 99) - (y.group_no ?? 99) || String(x.company).localeCompare(String(y.company), 'cs'));
  const g = n => b.groups.find(x => x.group_no === n);
  wrap(`<div class="row noprint" style="margin-bottom:16px"><button onclick="print()">Tisknout jmenovky</button><span class="muted">${list.length} potvrzených · A4, 8 na stránku. V${' '}tisku zapněte „Grafika pozadí“.</span></div>
    <div class="tags">${list.map(p => { const x = g(p.group_no); const bg = p.kind === 'civil' ? (x?.color_hex || '#13234E') : '#13234E';
      const lab = p.kind === 'civil' ? (x ? `Skupina ${x.group_no}` : '') : KIND[p.kind];
      return `<div class="tag"><div class="band" style="background:${esc(bg)};color:${textOn(bg)}"><span>${esc(lab)}</span><span>${p.kind === 'civil' && x ? esc(x.color_name) : ''}</span></div>
        <div class="body"><div class="n">${esc(p.full_name)}</div><div class="c">${esc(p.company)}</div></div><div class="ev">${esc(b.event.name)}</div></div>`; }).join('')}</div>`);
}

// ---------- ROUTER ----------
async function route() {
  try {
    state.session = await api.session();
    const scan = location.hash.match(/^#\/k\/([\w-]+)/);
    if (!state.session) { if (scan) store.set(PENDING, scan[1]); return viewLogin(!!(scan || store.get(PENDING))); }
    if (scan) { store.set(PENDING, null); return viewScan(scan[1]); }
    const pend = store.get(PENDING); if (pend) { store.set(PENDING, null); location.replace('#/k/' + pend); return; }
    state.admin = await api.isAdmin();
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'admin') {
      if (!state.admin) { location.hash = '#/'; return; }
      return parts[1] ? viewAdminEvent(parts[1], parts[2]) : viewAdmin();
    }
    if (parts[0] === 'e' && parts[1]) return viewEvent(parts[1], parts[2]);
    if (state.admin && !parts.length) {
      const regs = await api.myRegistrations(); if (!regs.length) { location.replace('#/admin'); return; }
    }
    return viewHome();
  } catch (er) {
    console.error(er);
    page(`<main><div class="wrap"><div class="notice err">Něco se pokazilo: ${esc(er.message)}</div><p><a href="#/">Zpět</a></p></div></main>`);
  }
}

api.onAuth(() => route());
window.addEventListener('hashchange', route);
if (location.search.includes('error_description')) {
  const m = new URLSearchParams(location.search).get('error_description');
  history.replaceState(null, '', location.pathname); setTimeout(() => toast('Odkaz už neplatí, pošlete si nový. (' + m + ')', 6000), 300);
}
route();
