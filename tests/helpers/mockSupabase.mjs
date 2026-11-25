/**
 * In-process stand-in for the Supabase Auth Admin API and PostgREST, for the
 * provisioning-script tests. It reproduces the errors the real services return
 * for missing tables (PGRST205) and columns (42703 / PGRST204), so the scripts
 * can be tested against the live-like schema without touching any project.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export function startMockSupabase({ tables, users = [], signupTrigger = true }) {
  const state = { tables: structuredClone(tables), users: structuredClone(users), writes: [] };
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const missingColumn = (res, table, col) => send(res, 400, { code: '42703', message: `column ${table}.${col} does not exist`, details: null, hint: null });
  const unknownBodyColumn = (res, table, col) => send(res, 400, { code: 'PGRST204', message: `Could not find the '${col}' column of '${table}' in the schema cache`, details: null, hint: null });

  const parseFilters = (url) => {
    const filters = [];
    for (const [key, raw] of url.searchParams) {
      if (['select', 'limit', 'order', 'on_conflict', 'offset'].includes(key)) continue;
      const dot = raw.indexOf('.');
      filters.push({ col: key, op: raw.slice(0, dot), val: raw.slice(dot + 1) });
    }
    return filters;
  };
  const matches = (row, f) => {
    const v = row[f.col] == null ? null : String(row[f.col]);
    if (f.op === 'eq') return v === f.val;
    if (f.op === 'neq') return v !== f.val;
    if (f.op === 'ilike') return v !== null && v.toLowerCase() === f.val.replace(/\\(.)/g, '$1').toLowerCase();
    throw new Error(`mock: unsupported operator ${f.op}`);
  };
  const triggerProfile = (user) => {
    const profiles = state.tables.profiles;
    if (!profiles || profiles.rows.some((r) => r.id === user.id)) return;
    const row = { id: user.id, full_name: user.email.split('@')[0], role: 'student' };
    if (profiles.columns.includes('email')) row.email = user.email;
    profiles.rows.push(row);
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://mock');
      const body = raw ? JSON.parse(raw) : null;
      if (req.method !== 'GET' && req.method !== 'HEAD') state.writes.push(`${req.method} ${url.pathname}${url.search}`);

      // ── Auth Admin API ──
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') return send(res, 200, { users: state.users, aud: 'authenticated' });
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
        if (state.users.some((u) => u.email === body.email)) return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
        const user = { id: randomUUID(), email: body.email, app_metadata: body.app_metadata || {}, user_metadata: body.user_metadata || {}, password: body.password };
        state.users.push(user);
        if (signupTrigger) triggerProfile(user);
        return send(res, 200, user);
      }
      const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (m) {
        const user = state.users.find((u) => u.id === m[1]);
        if (!user) return send(res, 404, { msg: 'User not found' });
        if (req.method === 'GET') return send(res, 200, user);
        if (req.method === 'PUT') { Object.assign(user, { app_metadata: body.app_metadata ?? user.app_metadata, password: body.password ?? user.password, rotated: true }); return send(res, 200, user); }
        if (req.method === 'DELETE') {
          state.users = state.users.filter((u) => u.id !== user.id);
          if (state.tables.profiles) state.tables.profiles.rows = state.tables.profiles.rows.filter((r) => r.id !== user.id);
          if (state.tables.subject_admins) state.tables.subject_admins.rows = state.tables.subject_admins.rows.filter((r) => r.admin_id !== user.id);
          return send(res, 200, {});
        }
      }

      // ── PostgREST ──
      const t = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!t) return send(res, 404, { message: `mock: unhandled ${req.method} ${url.pathname}` });
      const name = t[1];
      const table = state.tables[name];
      if (!table) return send(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, details: null, hint: null });
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || '');
      const select = (url.searchParams.get('select') || '*').split(',').filter(Boolean);
      for (const col of select) if (col !== '*' && !table.columns.includes(col)) return missingColumn(res, name, col);
      const filters = parseFilters(url);
      for (const f of filters) if (!table.columns.includes(f.col)) return missingColumn(res, name, f.col);
      const project = (row) => (select.includes('*') ? { ...row } : Object.fromEntries(select.map((c) => [c, row[c] ?? null])));
      const reply = (rows) => {
        if (!wantsObject) return send(res, req.method === 'POST' ? 201 : 200, rows);
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
        return send(res, 200, rows[0]);
      };

      if (req.method === 'GET') {
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
        return reply(table.rows.filter((r) => filters.every((f) => matches(r, f))).slice(0, limit).map(project));
      }
      if (req.method === 'PATCH') {
        for (const col of Object.keys(body)) if (!table.columns.includes(col)) return unknownBodyColumn(res, name, col);
        const hit = table.rows.filter((r) => filters.every((f) => matches(r, f)));
        hit.forEach((r) => Object.assign(r, body));
        return reply(hit.map(project));
      }
      if (req.method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        for (const row of rows) for (const col of Object.keys(row)) if (!table.columns.includes(col)) return unknownBodyColumn(res, name, col);
        const conflict = url.searchParams.get('on_conflict')?.split(',');
        const out = [];
        for (const row of rows) {
          const full = { ...(table.columns.includes('id') && !row.id ? { id: randomUUID() } : {}), ...row };
          const dupe = conflict && table.rows.find((r) => conflict.every((c) => r[c] === full[c]));
          if (dupe) { Object.assign(dupe, full); out.push(dupe); continue; }
          if (name === 'profiles' && table.rows.some((r) => r.id === full.id)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"' });
          table.rows.push(full); out.push(full);
        }
        return reply(out.map(project));
      }
      if (req.method === 'DELETE') {
        table.rows = table.rows.filter((r) => !filters.every((f) => matches(r, f)));
        return send(res, 204);
      }
      return send(res, 405, { message: 'mock: method not allowed' });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/** The live project's profiles layout as far as known: no email / staff_id. */
export const LIVE_PROFILE_COLUMNS = ['id', 'full_name', 'role', 'institution_id', 'usn', 'created_at', 'updated_at'];
/** profiles after migrations 003–005. */
export const FULL_PROFILE_COLUMNS = [...LIVE_PROFILE_COLUMNS, 'email', 'staff_id', 'department_id', 'is_active'];
