import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

const TITLE = "¿Pudiste revisarlo?";

// CHANGES.md #4b — el disparador principal de este recordatorio es del lado
// del cliente (ver el useEffect correspondiente en app/dashboard/page.js):
// corre en cualquier sesión con el dashboard abierto y por eso en la
// práctica llega muy cerca de las 24h exactas desde que se entregó. Este
// cron corre una vez al día como respaldo, por si nadie tuvo la app abierta
// en esas 24h — usa la misma condición y la misma bandera
// "delivery_reminder_sent" para nunca duplicar el aviso.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tasks, error } = await supabaseAdmin.from("tasks").select("*")
    .eq("status", "Entregado")
    .eq("delivery_reminder_sent", false)
    .lte("delivered_at", dayAgo);
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });

  const candidates = tasks || [];
  if (candidates.length === 0) return Response.json({ ok: true, sent: 0 });

  const byRequester = new Map();
  for (const t of candidates) {
    const targetIds = Array.from(new Set([t.requested_by_id, t.responsible_id, ...(t.co_requester_ids || [])].filter(Boolean)));
    for (const userId of targetIds) {
      if (!byRequester.has(userId)) byRequester.set(userId, []);
      byRequester.get(userId).push(t);
    }
  }

  let sent = 0;
  for (const [userId, list] of byRequester.entries()) {
    if (list.length > 2) {
      const message = `Tienes ${list.length} pendientes entregados sin finalizar`;
      await supabaseAdmin.from("notifications").insert({ user_id: userId, task_id: null, title: TITLE, message, target: "requests:Entregado" });
      await sendPushToUser(supabaseAdmin, userId, { title: TITLE, body: message, url: "/dashboard" });
      sent++;
    } else {
      const message = "Tienes un pendiente entregado. Si ya todo ok, finalízalo";
      for (const t of list) {
        await supabaseAdmin.from("notifications").insert({ user_id: userId, task_id: t.id, title: TITLE, message });
        await sendPushToUser(supabaseAdmin, userId, { title: TITLE, body: message, url: "/dashboard" });
        sent++;
      }
    }
  }

  await supabaseAdmin.from("tasks").update({ delivery_reminder_sent: true }).in("id", candidates.map((t) => t.id));

  return Response.json({ ok: true, sent });
}
