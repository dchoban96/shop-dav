import { createClient } from "@supabase/supabase-js";

/**
 * Client con service role: bypassa RLS. SOLO lato server (import, inviti, job).
 * Mai importarlo da un componente client e mai esporre la chiave.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatorie");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
