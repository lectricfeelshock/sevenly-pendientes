import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // La sesión se guarda en localStorage y se renueva sola en segundo
    // plano, para que no se cierre por inactividad ni al reabrir la app.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
