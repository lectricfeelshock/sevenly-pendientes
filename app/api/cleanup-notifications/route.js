import { createClient } from "@supabase/supabase-js";

const POPUP_BUCKET_MARKER = "/storage/v1/object/public/popups/";

// Vercel Cron llama este endpoint una vez al día (ver vercel.json). Hace dos
// limpiezas para no gastar más de un cron job (el plan Hobby de Vercel limita
// cuántos se pueden tener):
//
// 1. Notificaciones: borra las leídas de más de 1 día, y cualquiera (leída o
//    no) de más de 30 días, para que la campanita nunca se llene.
// 2. Pop ups: los pop ups solo se muestran el día exacto de "scheduled_date"
//    (ver app/dashboard/page.js), así que días después ya nadie los va a
//    ver. Con un margen de 3 días (por si alguien no abre la app justo ese
//    día), borra el archivo del bucket "popups" (imagen/gif/video subido)
//    para no dejar storage ocupado con archivos que ya no tienen uso. La
//    fila del pop up se conserva (queda el título/descripción como
//    historial), solo se limpia el archivo.
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
    .lt("scheduled_date", popupCutoff)
    .not("image_url", "is", null);

  let popupsCleaned = 0;
  let e4 = null, e5 = null;
  if (!e3) {
    const ownFiles = (expiredPopups || [])
      .filter((p) => p.image_url.includes(POPUP_BUCKET_MARKER))
      .map((p) => ({ id: p.id, path: decodeURIComponent(p.image_url.split(POPUP_BUCKET_MARKER)[1]) }));
    if (ownFiles.length > 0) {
      ({ error: e4 } = await supabaseAdmin.storage.from("popups").remove(ownFiles.map((f) => f.path)));
      if (!e4) {
        ({ error: e5 } = await supabaseAdmin.from("popups").update({ image_url: null }).in("id", ownFiles.map((f) => f.id)));
        if (!e5) popupsCleaned = ownFiles.length;
      }
    }
  }

  const error = e1 || e2 || e3 || e4 || e5;
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });
  return Response.json({ ok: true, popupsCleaned });
}
