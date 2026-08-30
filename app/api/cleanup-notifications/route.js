import { createClient } from "@supabase/supabase-js";

const POPUP_BUCKET_MARKER = "/storage/v1/object/public/popups/";

// Vercel Cron llama este endpoint una vez al día (ver vercel.json). Hace dos
// limpiezas para no gastar más de un cron job:
//
// 1. Notificaciones: borra las leídas de más de 1 día, y cualquiera (leída o
//    no) de más de 30 días, para que la campanita nunca se llene.
// 2. Pop ups (CHANGES.md #3): un pop up en "Historial" (ya salió, con
//    scheduled_date pasado) se borra por completo — fila y archivo del
//    bucket "popups" si tenía — a los 3 días de haber salido. Los que están
//    en borrador ("Nuevos", sin scheduled_date todavía) nunca se tocan aquí.
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

  const popupCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: expiredPopups, error: e3 } = await supabaseAdmin
    .from("popups")
    .select("id, image_url")
    .not("scheduled_date", "is", null)
    .lt("scheduled_date", popupCutoff);

  let popupsDeleted = 0;
  let e4 = null, e5 = null;
  if (!e3 && expiredPopups?.length) {
    const ownFiles = expiredPopups
      .filter((p) => p.image_url && p.image_url.includes(POPUP_BUCKET_MARKER))
      .map((p) => decodeURIComponent(p.image_url.split(POPUP_BUCKET_MARKER)[1]));
    if (ownFiles.length > 0) {
      ({ error: e4 } = await supabaseAdmin.storage.from("popups").remove(ownFiles));
    }
    if (!e4) {
      ({ error: e5 } = await supabaseAdmin.from("popups").delete().in("id", expiredPopups.map((p) => p.id)));
      if (!e5) popupsDeleted = expiredPopups.length;
    }
  }

  const error = e1 || e2 || e3 || e4 || e5;
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });
  return Response.json({ ok: true, popupsDeleted });
}
