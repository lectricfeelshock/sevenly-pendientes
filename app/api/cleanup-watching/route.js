import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Respaldo por si un Gerente cierra la pestaña sin que el navegador alcance
// a avisar — borra registros de "viendo a alguien" de más de 10 minutos.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("watching").delete().lt("updated_at", staleBefore);
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });
  return Response.json({ ok: true });
}
