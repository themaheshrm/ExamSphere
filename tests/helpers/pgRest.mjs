/**
 * Minimal PostgREST-compatible layer over a LOCAL PostgreSQL, for tests only.
 *
 * Every request runs in its own transaction as the caller's database role
 * (anon / authenticated / service_role) with `request.jwt.claims` set, so the
 * real migrations, RLS policies, SECURITY DEFINER functions and triggers are
 * exercised exactly as Supabase would. Supports the subset ExamSphere uses:
 *   POST /rest/v1/rpc/<fn>            (named args; scalar, composite and set-returning)
 *   GET  /rest/v1/<table|view>        select, filters (eq neq gt gte lt lte like ilike is in), order, limit, offset
 *   POST /rest/v1/<table>             insert / upsert (on_conflict + Prefer resolution=merge-duplicates)
 *   PATCH, DELETE /rest/v1/<table>    with filters
 * Never point this at a real project.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name) => {
  if (!IDENT.test(name)) throw Object.assign(new Error(`Invalid identifier: ${name}`), { status: 400, pgCode: 'PGRST100' });
  return `"${name}"`;
};

function httpStatus(code) {
  if (code === '42501') return 403;
  if (code === 'P0002' || code === '42883' || code === '42P01') return 404;
  if (code === '23505') return 409;
  if (code === 'PGRST116') return 406;
  return 400;
}

function parseFilters(url) {
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  const out = [];
  for (const [col, raw] of url.searchParams) {
    if (reserved.has(col)) continue;
    const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s);
    if (!m) throw Object.assign(new Error(`Unsupported filter ${col}=${raw}`), { status: 400, pgCode: 'PGRST100' });
    out.push({ col, negate: Boolean(m[1]), op: m[2], value: m[3] });
  }
  return out;
}

function whereClause(filters, params) {
  const parts = filters.map(({ col, negate, op, value }) => {
    const c = ident(col);
    let sql;
    if (op === 'is') {
      const v = value.toLowerCase();
      if (!['null', 'true', 'false'].includes(v)) throw Object.assign(new Error('Bad is filter'), { status: 400 });
      sql = `${c} IS ${v.toUpperCase()}`;
    } else if (op === 'in') {
      const items = value.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter((s) => s !== '');
      if (!items.length) return 'false';
      params.push(items);
      sql = `${c}::text = ANY ($${params.length}::text[])`;
    } else {
      const map = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };
      params.push(op === 'like' || op === 'ilike' ? value.replace(/\*/g, '%') : value);
      sql = op === 'like' || op === 'ilike' ? `${c}::text ${map[op]} $${params.length}` : `${c} ${map[op]} $${params.length}`;
    }
    return negate ? `NOT (${sql})` : sql;
  });
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
}

function selectList(raw) {
  if (!raw || raw === '*') return '*';
  return raw.split(',').map((c) => c.trim()).filter(Boolean).map(ident).join(', ');
}

function orderClause(raw) {
  if (!raw) return '';
  return ` ORDER BY ${raw.split(',').map((part) => {
    const [col, dir, nulls] = part.split('.');
    return `${ident(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}${nulls === 'nullsfirst' ? ' NULLS FIRST' : nulls === 'nullslast' ? ' NULLS LAST' : ''}`;
  }).join(', ')}`;
}

export function createPgRest(pool) {
  const fnCache = new Map();

  async function describeFunction(client, name) {
    if (fnCache.has(name)) return fnCache.get(name);
    const { rows } = await client.query(
      `SELECT p.proname, p.proretset, p.prorettype::regtype::text AS rettype, p.proargnames,
              ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) t) AS argtypes, p.pronargs
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1`, [name]);
    const fn = rows[0] || null;
    fnCache.set(name, fn);
    return fn;
  }

  async function run(role, claims, work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || { role })]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function rpc(client, name, args) {
    const fn = await describeFunction(client, name);
    if (!fn) throw Object.assign(new Error(`Could not find the function public.${name} in the schema cache`), { status: 404, pgCode: 'PGRST202' });
    const names = (fn.proargnames || []).slice(0, fn.pronargs);
    const params = [];
    const sqlArgs = [];
    for (const [key, value] of Object.entries(args || {})) {
      const i = names.indexOf(key);
      if (i === -1) throw Object.assign(new Error(`Could not find the function public.${name}(${Object.keys(args).join(', ')}) in the schema cache`), { status: 404, pgCode: 'PGRST202' });
      const type = fn.argtypes[i];
      params.push(value === null || value === undefined ? null : /^jsonb?$/.test(type) ? JSON.stringify(value) : Array.isArray(value) ? value : String(value));
      sqlArgs.push(`${ident(key)} => $${params.length}::${type}`);
    }
    const call = `public.${ident(name)}(${sqlArgs.join(', ')})`;
    if (fn.proretset) {
      const { rows } = await client.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS r FROM ${call} t`, params);
      return rows[0].r;
    }
    const { rows } = await client.query(`SELECT to_jsonb(${call}) AS r`, params);
    return fn.rettype === 'void' ? null : rows[0].r;
  }

  /** Returns { status, headers, body } for a /rest/v1 request. */
  async function handle({ method, url, body, headers, role, claims }) {
    const accept = headers.accept || '';
    const prefer = headers.prefer || '';
    const wantsObject = /vnd\.pgrst\.object/.test(accept);
    const path = url.pathname.replace(/^\/rest\/v1\//, '');
    const shape = (rows, status = 200) => {
      if (!wantsObject) return { status, body: rows };
      if (!Array.isArray(rows) || rows.length !== 1) {
        return { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${Array.isArray(rows) ? rows.length : 0} rows`, hint: null } };
      }
      return { status, body: rows[0] };
    };
    try {
      return await run(role, claims, async (client) => {
        const rpcMatch = path.match(/^rpc\/([a-z_][a-z0-9_]*)$/);
        if (rpcMatch) {
          const result = await rpc(client, rpcMatch[1], method === 'GET' ? Object.fromEntries(url.searchParams) : body);
          if (wantsObject && Array.isArray(result)) return shape(result);
          return { status: 200, body: result };
        }
        const table = ident(path);
        const params = [];
        const filters = parseFilters(url);
        if (method === 'GET' || method === 'HEAD') {
          const where = whereClause(filters, params);
          const limit = url.searchParams.has('limit') ? ` LIMIT ${Number(url.searchParams.get('limit')) | 0}` : '';
          const offset = url.searchParams.has('offset') ? ` OFFSET ${Number(url.searchParams.get('offset')) | 0}` : '';
          const sql = `SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS r FROM (SELECT ${selectList(url.searchParams.get('select'))} FROM public.${table}${where}${orderClause(url.searchParams.get('order'))}${limit}${offset}) t`;
          const { rows } = await client.query(sql, params);
          const out = shape(rows[0].r);
          if (/count=exact/.test(prefer)) {
            const { rows: c } = await client.query(`SELECT count(*)::int AS n FROM public.${table}${whereClause(filters, [])}`, params.slice(0, params.length));
            out.headers = { 'content-range': `0-${Math.max(0, rows[0].r.length - 1)}/${c[0].n}` };
          }
          return out;
        }
        const returning = /return=representation/.test(prefer) ? ' RETURNING *' : ' RETURNING 1';
        const wrap = async (sql, values) => {
          const { rows } = await client.query(`WITH w AS (${sql}${returning}) SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb) AS r FROM w`, values);
          return /return=representation/.test(prefer) ? shape(rows[0].r, method === 'POST' ? 201 : 200) : { status: method === 'POST' ? 201 : 204, body: undefined };
        };
        if (method === 'POST') {
          const rowsIn = Array.isArray(body) ? body : [body];
          const cols = [...new Set(rowsIn.flatMap((r) => Object.keys(r)))];
          const colList = cols.map(ident).join(', ');
          params.push(JSON.stringify(rowsIn));
          let sql = `INSERT INTO public.${table} (${colList}) SELECT ${colList} FROM jsonb_populate_recordset(NULL::public.${table}, $1::jsonb)`;
          const conflict = url.searchParams.get('on_conflict');
          if (conflict) {
            const target = conflict.split(',').map(ident).join(', ');
            const updates = cols.filter((c) => !conflict.split(',').includes(c)).map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
            sql += /resolution=ignore-duplicates/.test(prefer) || !updates.length ? ` ON CONFLICT (${target}) DO NOTHING` : ` ON CONFLICT (${target}) DO UPDATE SET ${updates.join(', ')}`;
          }
          return wrap(sql, params);
        }
        if (method === 'PATCH') {
          const cols = Object.keys(body || {});
          if (!cols.length) return { status: 204, body: undefined };
          const colList = cols.map(ident).join(', ');
          params.push(JSON.stringify(body));
          const where = whereClause(filters, params);
          return wrap(`UPDATE public.${table} SET (${colList}) = (SELECT ${colList} FROM jsonb_populate_record(NULL::public.${table}, $1::jsonb))${where}`, params);
        }
        if (method === 'DELETE') {
          return wrap(`DELETE FROM public.${table}${whereClause(filters, params)}`, params);
        }
        return { status: 405, body: { message: 'Method not allowed' } };
      });
    } catch (error) {
      const code = error.pgCode || error.code || 'P0001';
      return {
        status: error.status || httpStatus(code),
        body: { code, message: error.message, details: error.detail || null, hint: error.hint || null },
      };
    }
  }

  return { handle };
}
