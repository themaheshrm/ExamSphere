import { supabase } from '../supabase.js';

/**
 * Thin, uniform access to Supabase for the examination engine.
 * All authorisation is enforced by the database (RLS + SECURITY DEFINER RPCs);
 * this layer only shapes errors and retries safe operations.
 */
export class ApiError extends Error {
  constructor(message, { code = null, status = null, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const NETWORK = /Failed to fetch|NetworkError|fetch failed|ECONNREFUSED|Load failed|network/i;

export function toApiError(error, fallback = 'The request could not be completed.') {
  if (error instanceof ApiError) return error;
  const message = String(error?.message || '');
  if (NETWORK.test(message) || error?.name === 'TypeError') {
    return new ApiError('Connection problem. Check your network and try again.', { code: 'NETWORK', retryable: true });
  }
  if (error?.code === 'PGRST301' || /JWT expired|invalid JWT/i.test(message)) {
    return new ApiError('Your session has expired. Sign in again.', { code: 'SESSION', status: 401 });
  }
  return new ApiError(message || fallback, { code: error?.code || null, status: error?.status || null });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn` (returning {data, error}); retries network failures for idempotent calls. */
async function execute(fn, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let result;
    try {
      result = await fn();
    } catch (error) {
      result = { data: null, error };
    }
    if (!result.error) return result.data;
    const apiError = toApiError(result.error);
    if (!apiError.retryable || attempt >= retries) throw apiError;
    await wait(400 * 2 ** attempt);
  }
}

/** Call a Postgres function. `idempotent` enables network retries. */
export function rpc(name, args = {}, { idempotent = false } = {}) {
  return execute(() => supabase.rpc(name, args), { retries: idempotent ? 2 : 0 });
}

/** Read rows from a table or (security_invoker) view; `build` refines the query. */
export function select(table, columns = '*', build = (q) => q) {
  return execute(() => build(supabase.from(table).select(columns)), { retries: 2 });
}

export function insert(table, row, columns = '*') {
  return execute(() => supabase.from(table).insert(row).select(columns).single());
}

export function update(table, patch, build, columns = '*') {
  return execute(() => build(supabase.from(table).update(patch)).select(columns));
}

export { supabase };
