// OM14c — fetch wrapper that forwards the caller's Supabase session.
//
// The browser keeps its session in localStorage (supabase-js default), which
// a Next route handler cannot read. Route handlers therefore expect the access
// token in an Authorization header; this is the single place that attaches it,
// so no call site has to remember.
//
// Anonymous callers just get a plain fetch — routes that tolerate anonymous
// access keep working, and the ones that don't answer 401 on their own.

import { supabase } from './supabaseClient';

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
