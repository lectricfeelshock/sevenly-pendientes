import { createClient } from "@supabase/supabase-js";

// Vercel Cron llama este endpoint una vez al día (ver vercel.json).
// Borra notificaciones leídas de más de 1 día, y cualquier notificación
// (leída o no) de más de 30 días, para que la campanita nunca se llene.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  // El cliente se crea aquí adentro (no a nivel de módulo) para que el build
  // de Next.js no truene si estas variables de entorno no están disponibles
  // durante la recolección de datos de página.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: e1 } = await supabaseAdmin.from("notifications").delete().eq("read", true).lt("created_at", oneDayAgo);
  const { error: e2 } = await supabaseAdmin.from("notifications").delete().lt("created_at", thirtyDaysAgo);

  if (e1 || e2) return Response.json({ ok: false, error: String(e1 || e2) }, { status: 500 });
  return Response.json({ ok: true });
}
