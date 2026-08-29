import { createClient } from "@supabase/supabase-js";

const BUCKET_MARKER = "/storage/v1/object/public/popups/";

// Vercel Cron llama este endpoint una vez al día (ver vercel.json).
// Los pop ups solo se muestran el día exacto de "scheduled_date" (ver
// app/dashboard/page.js), así que días después ya nadie los va a ver.
// Se da un margen de 3 días (por si alguien no abre la app justo ese
// día) y luego se borra el archivo del bucket "popups" (imagen/gif/
// video subido) para no dejar storage ocupado con archivos que ya no
// tienen uso. La fila del pop up se conserva (queda el título/
// descripción como historial), solo se limpia el archivo.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: expired, error: selErr } = await supabaseAdmin
    .from("popups")
    .select("id, image_url")
    .lt("scheduled_date", cutoff)
    .not("image_url", "is", null);

  if (selErr) return Response.json({ ok: false, error: selErr.message }, { status: 500 });

  const ownFiles = (expired || [])
    .filter((p) => p.image_url.includes(BUCKET_MARKER))
    .map((p) => ({ id: p.id, path: decodeURIComponent(p.image_url.split(BUCKET_MARKER)[1]) }));

  if (ownFiles.length === 0) return Response.json({ ok: true, cleaned: 0 });

  const { error: rmErr } = await supabaseAdmin.storage.from("popups").remove(ownFiles.map((f) => f.path));
  if (rmErr) return Response.json({ ok: false, error: rmErr.message }, { status: 500 });

  const { error: updErr } = await supabaseAdmin.from("popups").update({ image_url: null }).in("id", ownFiles.map((f) => f.id));
  if (updErr) return Response.json({ ok: false, error: updErr.message }, { status: 500 });

  return Response.json({ ok: true, cleaned: ownFiles.length });
}
