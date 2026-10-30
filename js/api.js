// Datová vrstva: Supabase (ostrý režim) nebo DEMO (bez backendu, data jen v paměti prohlížeče)
import { DEMO_DATA } from './demo-data.js';

const cfg = window.T4D_CONFIG || {};
export const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || new URLSearchParams(location.search).has('demo');
// ?demo=firma: ukázka pro firmy, rovnou přihlášený ukázkový účastník, bez administrace
export const DEMO_FIRMA = new URLSearchParams(location.search).get('demo') === 'firma';

function err(e) { if (e) throw new Error(e.message || String(e)); }

// ---------- SUPABASE ----------
function supabaseApi() {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
  const email = async () => (await sb.auth.getSession()).data.session?.user?.email?.toLowerCase() || null;

  return {
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    async sendLink(addr) {
      addr = addr.trim().toLowerCase();
      const { data: ok, error } = await sb.rpc('can_login', { p_email: addr }); err(error);
      if (!ok) return; // stejná odpověď jako při úspěchu, ať nejde zjišťovat, kdo je registrovaný
      const redirect = cfg.REDIRECT_URL || location.origin + location.pathname;
      const r = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      err(r.error);
    },
    async verifyCode(addr, code) {
      const { error } = await sb.auth.verifyOtp({ email: addr.trim().toLowerCase(), token: String(code).replace(/\s/g, ''), type: 'email' });
      err(error);
    },
    async signOut() { await sb.auth.signOut(); },
    async isAdmin() {
      const e = await email(); if (!e) return false;
      const { data } = await sb.from('admins').select('email').eq('email', e).maybeSingle();
      return !!data;
    },
    async myRegistrations() {
      const e = await email();
      const { data, error } = await sb.from('participants').select('*, events(*)').eq('email', e)
        .in('status', ['registered', 'confirmed']); err(error);
      return (data || []).filter(p => p.events).sort((a, b) => String(b.events.date).localeCompare(String(a.events.date)));
    },
    async eventBundle(id) {
      const q = t => sb.from(t).select('*').eq('event_id', id);
      const [ev, prog, groups, rooms, rounds, slots, team] = await Promise.all([
        sb.from('events').select('*').eq('id', id).single(),
        q('program_items').order('sort'), q('groups').order('group_no'), q('rooms').order('room_no'),
        q('rounds').order('round_no'), q('rotation_slots'), q('event_team').order('sort'),
      ]);
      [ev, prog, groups, rooms, rounds, slots].forEach(r => err(r.error));
      return { event: ev.data, program: prog.data, groups: groups.data, rooms: rooms.data, rounds: rounds.data, slots: slots.data, team: team.error ? [] : team.data };
    },
    async updateMyProfile(eventId, patch) {
      const { data, error } = await sb.rpc('update_my_profile', { p_event: eventId, p: patch }); err(error); return data;
    },
    async directory(eventId) {
      const { data, error } = await sb.rpc('event_directory', { p_event: eventId }); err(error); return data || [];
    },
    // ---- admin ----
    async listEvents() {
      const { data, error } = await sb.from('events').select('*').order('date', { ascending: false }); err(error); return data;
    },
    async saveEvent(ev) {
      const { id, created_at, ...rest } = ev;
      const r = id ? await sb.from('events').update(rest).eq('id', id).select().single()
                   : await sb.from('events').insert(rest).select().single();
      err(r.error); return r.data;
    },
    async deleteEvent(id) { err((await sb.from('events').delete().eq('id', id)).error); },
    async saveProgram(eventId, items) { err((await sb.rpc('admin_save_program', { p_event: eventId, items })).error); },
    async saveRotation(eventId, s) { err((await sb.rpc('admin_save_rotation', { p_event: eventId, s })).error); },
    async listParticipants(eventId) {
      const { data, error } = await sb.from('participants').select('*').eq('event_id', eventId).order('company'); err(error); return data;
    },
    async upsertParticipants(rows) {
      const { error } = await sb.from('participants').upsert(rows, { onConflict: 'event_id,email' }); err(error);
    },
    async updateParticipant(id, patch) {
      const { error } = await sb.from('participants').update(patch).eq('id', id); err(error);
    },
    async updateParticipants(list) { // [{id, ...patch}]
      for (const { id, ...p } of list) await this.updateParticipant(id, p);
    },
    async deleteParticipant(id) { err((await sb.from('participants').delete().eq('id', id)).error); },
    async saveTeam(eventId, list) {
      err((await sb.from('event_team').delete().eq('event_id', eventId)).error);
      if (list.length) err((await sb.from('event_team').insert(list.map((t, i) => ({ ...t, id: undefined, event_id: eventId, sort: i })))).error);
    },
    async confirmAllRegistered(eventId) {
      err((await sb.from('participants').update({ status: 'confirmed' }).eq('event_id', eventId).eq('status', 'registered')).error);
    },
    // ---- matchmaking ----
    async mmList(eventId) { const { data, error } = await sb.rpc('mm_list', { p_event: eventId }); err(error); return data || []; },
    async mmRequest(to, message) { const { data, error } = await sb.rpc('mm_request', { p_to: to, p_message: message || null }); err(error); return data; },
    async mmRespond(connId, accept) { err((await sb.rpc('mm_respond', { p_conn: connId, p_accept: accept })).error); },
    async mmContacts(eventId) { const { data, error } = await sb.rpc('mm_contacts', { p_event: eventId }); err(error); return data || []; },
    async mmScan(token) { const { data, error } = await sb.rpc('mm_scan', { p_token: token }); err(error); return data; },
    async connectionCount(eventId) {
      const { count, error } = await sb.from('connections').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'accepted');
      err(error); return count || 0;
    },
  };
}

// ---------- DEMO ----------
function demoApi() {
  const db = structuredClone(DEMO_DATA);
  let session = DEMO_FIRMA ? { user: { email: 'ucastnik@demo.cz' } } : null; const subs = [];
  const uid = () => crypto.randomUUID();
  const me = () => session?.user?.email;
  const fire = () => subs.forEach(cb => cb(session));
  const byEvent = (t, id) => db[t].filter(r => r.event_id === id);
  return {
    async session() { return session; },
    onAuth(cb) { subs.push(cb); },
    async sendLink(addr) {
      addr = addr.trim().toLowerCase();
      if (DEMO_FIRMA) addr = 'ucastnik@demo.cz';
      const ok = db.admins.includes(addr) || db.participants.some(p => p.email === addr && ['registered', 'confirmed'].includes(p.status));
      if (ok) { session = { user: { email: addr } }; setTimeout(fire, 300); } // v demu se rovnou přihlásí
    },
    async verifyCode() {},
    async signOut() { session = null; fire(); },
    async isAdmin() { return !DEMO_FIRMA && db.admins.includes(me()); },
    async myRegistrations() {
      return db.participants.filter(p => p.email === me() && ['registered', 'confirmed'].includes(p.status))
        .map(p => ({ ...p, events: db.events.find(e => e.id === p.event_id) })).filter(p => p.events);
    },
    async eventBundle(id) {
      const sort = k => (a, b) => (a[k] ?? 0) - (b[k] ?? 0);
      return {
        event: db.events.find(e => e.id === id),
        program: byEvent('program_items', id).sort(sort('sort')),
        groups: byEvent('groups', id).sort(sort('group_no')), rooms: byEvent('rooms', id).sort(sort('room_no')),
        rounds: byEvent('rounds', id).sort(sort('round_no')), slots: byEvent('rotation_slots', id),
        team: byEvent('event_team', id).sort(sort('sort')),
      };
    },
    async updateMyProfile(eventId, patch) {
      const p = db.participants.find(x => x.event_id === eventId && x.email === me());
      for (const k of ['full_name', 'position', 'phone', 'web', 'description', 'sector', 'reasons', 'in_matchmaking']) if (k in patch) p[k] = patch[k];
      return p;
    },
    async directory(eventId) {
      const ev = db.events.find(e => e.id === eventId); if (!ev?.directory_enabled) return [];
      return byEvent('participants', eventId).filter(p => p.status === 'confirmed')
        .map(({ company, sector, description, web, group_no, kind }) => ({ company, sector, description, web, group_no, kind }));
    },
    async listEvents() { return [...db.events]; },
    async saveEvent(ev) {
      if (ev.id) { Object.assign(db.events.find(e => e.id === ev.id), ev); return ev; }
      const n = { ...ev, id: uid() }; db.events.push(n); return n;
    },
    async deleteEvent(id) { for (const t of ['events']) db[t] = db[t].filter(r => r.id !== id); },
    async saveProgram(eventId, items) {
      db.program_items = db.program_items.filter(r => r.event_id !== eventId)
        .concat(items.filter(i => i.title).map((i, n) => ({ ...i, id: uid(), event_id: eventId, sort: n })));
    },
    async saveRotation(eventId, s) {
      for (const t of ['groups', 'rooms', 'rounds']) db[t] = db[t].filter(r => r.event_id !== eventId).concat(s[t].map(r => ({ ...r, event_id: eventId })));
      db.rotation_slots = db.rotation_slots.filter(r => r.event_id !== eventId).concat(s.slots.map(r => ({ ...r, event_id: eventId })));
    },
    async listParticipants(eventId) { return byEvent('participants', eventId).map(p => ({ ...p })); },
    async upsertParticipants(rows) {
      for (const r of rows) {
        const ex = db.participants.find(p => p.event_id === r.event_id && p.email === r.email);
        ex ? Object.assign(ex, r) : db.participants.push({ status: 'registered', kind: 'civil', ...r, id: uid() });
      }
    },
    async updateParticipant(id, patch) { Object.assign(db.participants.find(p => p.id === id), patch); },
    async updateParticipants(list) { for (const { id, ...p } of list) await this.updateParticipant(id, p); },
    async deleteParticipant(id) { db.participants = db.participants.filter(p => p.id !== id); },
    async saveTeam(eventId, list) { db.event_team = db.event_team.filter(t => t.event_id !== eventId).concat(list.map((t, i) => ({ ...t, event_id: eventId, sort: i }))); },
    async confirmAllRegistered(eventId) { byEvent('participants', eventId).filter(p => p.status === 'registered').forEach(p => p.status = 'confirmed'); },
    // ---- matchmaking (demo) ----
    _me(eventId) { return db.participants.find(p => p.event_id === eventId && p.email === me()); },
    _conn(a, b) { return db.connections.find(c => (c.from_id === a && c.to_id === b) || (c.from_id === b && c.to_id === a)); },
    async mmList(eventId) {
      const m = this._me(eventId); const ev = db.events.find(e => e.id === eventId); if (!m || !ev?.directory_enabled) return [];
      return byEvent('participants', eventId).filter(p => p.id !== m.id && p.status === 'confirmed' && p.in_matchmaking !== false).map(p => {
        const c = this._conn(m.id, p.id);
        const st = !c ? 'none' : c.status === 'accepted' ? 'connected' : c.status === 'declined' ? 'declined' : c.from_id === m.id ? 'sent' : 'received';
        const { email, phone, ...pub } = p; return { ...pub, conn_id: c?.id || null, conn_status: st };
      });
    },
    async mmRequest(to, message) {
      const t = db.participants.find(p => p.id === to); const m = this._me(t.event_id); const c = this._conn(m.id, to);
      if (c && c.from_id === to && c.status === 'pending') { c.status = 'accepted'; return 'connected'; }
      if (!c) db.connections.push({ id: uid(), event_id: t.event_id, from_id: m.id, to_id: to, status: 'pending', source: 'request', message: message || null, created_at: new Date().toISOString() });
      return 'sent';
    },
    async mmRespond(connId, accept) { const c = db.connections.find(x => x.id === connId); c.status = accept ? 'accepted' : 'declined'; },
    async mmContacts(eventId) {
      const m = this._me(eventId); if (!m) return [];
      return db.connections.filter(c => c.event_id === eventId && (c.from_id === m.id || c.to_id === m.id)).map(c => {
        const o = db.participants.find(p => p.id === (c.from_id === m.id ? c.to_id : c.from_id)); const ok = c.status === 'accepted';
        return { conn_id: c.id, direction: c.from_id === m.id ? 'out' : 'in', status: c.status, source: c.source, message: c.message, created_at: c.created_at,
          id: o.id, company: o.company, full_name: o.full_name, position: o.position, sector: o.sector, web: o.web, group_no: o.group_no,
          email: ok ? o.email : null, phone: ok ? o.phone : null };
      });
    },
    async mmScan(token) {
      const o = db.participants.find(p => p.card_token === token); if (!o) throw new Error('not_found');
      const m = this._me(o.event_id); if (!m) throw new Error('not_participant');
      if (m.id !== o.id) { const c = this._conn(m.id, o.id); if (c) c.status = 'accepted'; else db.connections.push({ id: uid(), event_id: o.event_id, from_id: m.id, to_id: o.id, status: 'accepted', source: 'qr', created_at: new Date().toISOString() }); }
      const ev = db.events.find(e => e.id === o.event_id);
      return { self: m.id === o.id, event_id: o.event_id, event_name: ev.name, event_date: ev.date, company: o.company, full_name: o.full_name, position: o.position, email: o.email, phone: o.phone, web: o.web };
    },
    async connectionCount(eventId) { return db.connections.filter(c => c.event_id === eventId && c.status === 'accepted').length; },
  };
}

export const api = DEMO ? demoApi() : supabaseApi();
