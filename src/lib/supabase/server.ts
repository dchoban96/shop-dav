import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase lato server con la sessione dell'utente (chiave anon + cookie).
 * Da usare nei Server Component e nelle Server Action: le policy RLS si applicano.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chiamato da un Server Component: i cookie si aggiornano nel proxy.
          }
        },
      },
    },
  );
}

export function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return v;
}
