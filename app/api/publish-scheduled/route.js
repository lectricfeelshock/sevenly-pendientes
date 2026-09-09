import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

// Corre una vez al día (ver vercel.json). Un pendiente "Programado" (Día
// programado en el futuro, guardado en request_date) ya no manda sus
// notificaciones de "te asignaron / te agregaron" desde que se crea —
// espera hasta que de verdad se publica, o sea hasta que request_date
// llega (o ya pasó, por si el cron se saltó algún día). assignment_notified
// evita mandarlas dos veces.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: tasks, error } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("assignment_notified", false)
    .lte("request_date", todayISO);
  if (error) return Response.json({ ok: false, error: String(error) }, { status: 500 });

  const notify = async (userId, taskId, message) => {
    await supabaseAdmin.from("notifications").insert({ user_id: userId, task_id: taskId, message });
    await sendPushToUser(supabaseAdmin, userId, { title: "Sevenly", body: message, url: "/dashboard" });
  };

  let notified = 0;
  for (const t of tasks || []) {
    if (t.assigned_to_id && t.assigned_to_id !== t.requested_by_id) {
      await notify(t.assigned_to_id, t.id, `Te asignaron "${t.title}"`);
    }
    for (const id of t.co_requester_ids || []) {
      if (id !== t.requested_by_id) await notify(id, t.id, `Te agregaron como solicitante del pendiente "${t.title}"`);
    }
    if (t.task_type === "colaborativo") {
      for (const id of t.team_member_ids || []) {
        if (id !== t.requested_by_id) await notify(id, t.id, `Te agregaron al equipo del pendiente colaborativo "${t.title}"`);
      }
    }
    const { data: subs } = await supabaseAdmin.from("subtasks").select("*").eq("task_id", t.id);
    for (const s of subs || []) {
      if (s.assigned_to_id && s.assigned_to_id !== t.requested_by_id) {
        await notify(s.assigned_to_id, t.id, `Te asignaron la subtarea "${s.title}" dentro de "${t.title}"`);
      }
    }
    await supabaseAdmin.from("tasks").update({ assignment_notified: true }).eq("id", t.id);
    notified++;
  }

  return Response.json({ ok: true, notified });
}
