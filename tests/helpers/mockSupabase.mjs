/**
 * In-process stand-in for the Supabase Auth Admin API and PostgREST, for the
 * provisioning-script tests. It reproduces the errors the real services return
 * for missing tables (PGRST205) and columns (42703 / PGRST204), so the scripts
 * can be tested against the live-like schema without touching any project.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * Options for a real-database run (tests/helpers/localSupabase.mjs):
 *   rest  – PostgREST handler (pgRest.mjs) that serves /rest/v1 from PostgreSQL
 *   hooks – { created(user), updated(user), deleted(user) } mirror Auth users into auth.users
 */
export function startMockSupabase({ tables = {}, users = [], signupTrigger = true, port = 0, host = '127.0.0.1', serviceKey = null, functions = {}, rest = null, hooks = {} }) {
  const state = { tables: structuredClone(tables), users: structuredClone(users), writes: [], requests: [], sessions: new Map(), refresh: new Map(), refreshAmr: new Map(), recoveryEmails: [] };
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, x-supabase-api-version',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', ...CORS });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  // GoTrue never returns password material.
  const publicUser = ({ password: _password, rotated: _rotated, ...u }) => ({ aud: 'authenticated', role: 'authenticated', user_metadata: {}, created_at: '2026-01-01T00:00:00Z', ...u });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const issueSession = (user, amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', app_metadata: user.app_metadata || {}, amr, exp })}.mock${randomUUID().slice(0, 8)}`;
    const refresh = randomUUID();
    state.sessions.set(access, user.id); state.refresh.set(refresh, user.id); state.refreshAmr.set(refresh, amr);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(user) };
  };
  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const isAdminCall = (req) => !serviceKey || bearer(req) === serviceKey;
  const isBanned = (u) => Boolean(u.banned_until) && new Date(u.banned_until).getTime() > Date.now();
  const banUntil = (d) => (d === 'none' ? null : d ? new Date(Date.now() + Number.parseInt(d, 10) * 3600 * 1000).toISOString() : undefined);
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
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      state.requests.push({ method: req.method, path: url.pathname, auth: bearer(req) === serviceKey ? 'service' : (bearer(req) ? 'user' : 'none'), body: raw });
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'HEAD' && !url.pathname.startsWith('/auth/v1/token') && !url.pathname.startsWith('/functions/')) state.writes.push(`${req.method} ${url.pathname}${url.search}`);

      // ── Edge Functions (the real handlers, running in this process) ──
      const fn = url.pathname.match(/^\/functions\/v1\/([a-z-]+)$/);
      if (fn) {
        const handler = functions[fn[1]];
        if (!handler) return send(res, 404, { message: `Function ${fn[1]} not found` });
        const request = new Request(`http://mock${url.pathname}`, { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'), body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw });
        Promise.resolve(handler(request)).then(async (response) => {
          const text = await response.text();
          res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...CORS });
          res.end(text);
        }).catch((e) => send(res, 500, { message: `mock function crashed: ${e.message}` }));
        return;
      }

      // ── Auth (user-facing) ──
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const user = state.users.find((u) => u.email === String(body?.email || '').toLowerCase());
        if (!user || user.password !== body?.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (isBanned(user)) return send(res, 400, { error: 'invalid_grant', error_description: 'User is banned', code: 'user_banned', msg: 'User is banned' });
        user.last_sign_in_at = new Date().toISOString();
        return send(res, 200, issueSession(user));
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const user = state.users.find((u) => u.id === state.refresh.get(body?.refresh_token));
        if (!user || isBanned(user)) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        const amr = state.refreshAmr.get(body.refresh_token);
        state.refresh.delete(body.refresh_token);
        return send(res, 200, issueSession(user, amr));
      }
      // Password recovery: records the "email" (link with a recovery session, implicit flow) instead of sending it.
      if (url.pathname === '/auth/v1/recover' && req.method === 'POST') {
        const user = state.users.find((u) => u.email === String(body?.email || '').toLowerCase());
        if (user && !isBanned(user)) {
          const sess = issueSession(user, [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) }]);
          const redirect = url.searchParams.get('redirect_to') || 'http://localhost:5173/';
          state.recoveryEmails.push({ email: user.email, redirect, link: `${redirect}#access_token=${sess.access_token}&expires_at=${sess.expires_at}&expires_in=3600&refresh_token=${sess.refresh_token}&token_type=bearer&type=recovery` });
        }
        return send(res, 200, {});
      }
      if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
        const user = state.users.find((u) => u.id === state.sessions.get(bearer(req)));
        if (!user) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
        if (body?.password) user.password = body.password;
        return send(res, 200, publicUser(user));
      }
      if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
        const user = state.users.find((u) => u.id === state.sessions.get(bearer(req)));
        return user ? send(res, 200, publicUser(user)) : send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
      }
      if (url.pathname === '/auth/v1/logout') { state.sessions.delete(bearer(req)); res.writeHead(204, CORS); return res.end(); }

      // ── Auth Admin API (service role only) ──
      if (url.pathname.startsWith('/auth/v1/admin/') && !isAdminCall(req)) return send(res, 403, { code: 'not_admin', msg: 'User not allowed' });
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') return send(res, 200, { users: state.users.map(publicUser), aud: 'authenticated' });
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
        if (state.users.some((u) => u.email === body.email)) return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
        const user = { id: randomUUID(), email: body.email, app_metadata: body.app_metadata || {}, user_metadata: body.user_metadata || {}, password: body.password, ...(body.ban_duration ? { banned_until: banUntil(body.ban_duration) } : {}) };
        state.users.push(user);
        if (hooks.created) {
          Promise.resolve(hooks.created(user)).then(() => send(res, 200, publicUser(user)))
            .catch((e) => { state.users = state.users.filter((u) => u.id !== user.id); send(res, 500, { msg: `mock: ${e.message}` }); });
          return;
        }
        if (signupTrigger) triggerProfile(user);
        return send(res, 200, publicUser(user));
      }
      const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (m) {
        const user = state.users.find((u) => u.id === m[1]);
        if (!user) return send(res, 404, { msg: 'User not found' });
        if (req.method === 'GET') return send(res, 200, publicUser(user));
        if (req.method === 'PUT') {
          Object.assign(user, { app_metadata: body.app_metadata ?? user.app_metadata, password: body.password ?? user.password, rotated: true });
          if (body.ban_duration !== undefined) user.banned_until = banUntil(body.ban_duration);
          if (hooks.updated) { Promise.resolve(hooks.updated(user)).then(() => send(res, 200, publicUser(user))).catch((e) => send(res, 500, { msg: e.message })); return; }
          return send(res, 200, publicUser(user));
        }
        if (req.method === 'DELETE') {
          state.users = state.users.filter((u) => u.id !== user.id);
          if (state.tables.profiles) state.tables.profiles.rows = state.tables.profiles.rows.filter((r) => r.id !== user.id);
          if (state.tables.subject_admins) state.tables.subject_admins.rows = state.tables.subject_admins.rows.filter((r) => r.admin_id !== user.id);
          if (hooks.deleted) { Promise.resolve(hooks.deleted(user)).then(() => send(res, 200, {})).catch((e) => send(res, 500, { msg: e.message })); return; }
          return send(res, 200, {});
        }
      }

      // ── PostgREST ──
      if (rest && url.pathname.startsWith('/rest/v1/')) {
        const tok = bearer(req);
        const sessionUser = state.users.find((u) => u.id === state.sessions.get(tok));
        let role = 'anon';
        let claims = { role: 'anon' };
        if (serviceKey && tok === serviceKey) { role = 'service_role'; claims = { role: 'service_role' }; }
        else if (sessionUser) {
          role = 'authenticated';
          try { claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url')); } catch { claims = { sub: sessionUser.id, role: 'authenticated' }; }
        }
        rest.handle({ method: req.method, url, body, headers: req.headers, role, claims }).then((out) => {
          res.writeHead(out.status, { 'content-type': 'application/json', ...CORS, ...(out.headers || {}) });
          res.end(out.body === undefined ? '' : JSON.stringify(out.body));
        }).catch((e) => send(res, 500, { message: `mock rest: ${e.message}` }));
        return;
      }
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
    server.listen(port, host, () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) });
    });
  });
}

/** The live project's profiles layout as far as known: no email / staff_id. */
export const LIVE_PROFILE_COLUMNS = ['id', 'full_name', 'role', 'institution_id', 'usn', 'created_at', 'updated_at'];
/** profiles after migrations 003–005. */
export const FULL_PROFILE_COLUMNS = [...LIVE_PROFILE_COLUMNS, 'email', 'staff_id', 'department_id', 'is_active'];
