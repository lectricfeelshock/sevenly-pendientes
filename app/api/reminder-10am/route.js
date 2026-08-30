import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

const TITLE = "¿Pudiste revisarlo?";
const MESSAGE = "Tienes un pendiente entregado. Si ya todo ok, finalízalo";

// Vercel Cron llama esto todos los días a las 10 am (hora CDMX, ver
// vercel.json) — CHANGES.md #4b. Le avisa al solicitante (y co-solicitantes)
// de cualquier pendiente que se entregó exactamente ayer y que sigue sin
// finalizarse, haya o no usado el asignado el botón "Avisar al solicitante".
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: tasks, error } = await supabaseAdmin.from("tasks").select("*").eq("status", "Entregado");
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });

  const dueTasks = (tasks || []).filter((t) => t.delivered_at && t.delivered_at.slice(0, 10) === yesterday);

  let sent = 0;
  for (const t of dueTasks) {
    const targetIds = Array.from(new Set([t.requested_by_id, t.responsible_id, ...(t.co_requester_ids || [])].filter(Boolean)));
    for (const userId of targetIds) {
      await supabaseAdmin.from("notifications").insert({ user_id: userId, task_id: t.id, title: TITLE, message: MESSAGE });
      await sendPushToUser(supabaseAdmin, userId, { title: TITLE, body: MESSAGE, url: "/dashboard" });
      sent++;
    }
  }

  return Response.json({ ok: true, sent });
}
