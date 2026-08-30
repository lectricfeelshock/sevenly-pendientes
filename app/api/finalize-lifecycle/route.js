import { createClient } from "@supabase/supabase-js";

// CHANGES.md #4 (c, d, f) — corre una vez al día (ver vercel.json):
//
// 1. Auto-finaliza pendientes "Entregado" hace 7+ días sin que el
//    solicitante los finalice.
// 2. Borra pendientes "Finalizado" hace 4+ días (manual o auto-finalizado).
// 3. Revisa los pop ups de recordatorio que ya arma este mismo cron
//    (auto_generated) y que aún no salen: si el solicitante ya finalizó
//    todos los pendientes que traían, los cancela (los borra, incluso del
//    apartado de Popups del admin); si finalizó solo algunos, actualiza la
//    lista.
// 4. Programa nuevos pop ups de recordatorio: a los pendientes "Entregado"
//    sin finalizar que hoy cumplen 2 días hábiles desde que se entregaron
//    (y que todavía no tienen un recordatorio programado) se les arma un pop
//    up con scheduled_date = 4 días hábiles desde que se entregaron, para
//    que el admin lo pueda revisar/editar en "Programados" antes de que le
//    salga al solicitante.

const POPUP_TASK_LIMIT = 10;
const REMINDER_TITLE = "¿Ya los pudiste revisar?";
const REMINDER_DESCRIPTION = "Tienes estos pendientes sin finalizar, Recuerda que finalizarlos ayuda a llevar el control del progreso de tu equipo de trabajo.";
// Todos los campos aplicables — PopupTaskBreakdown ya filtra según el tipo de
// pendiente (colaborativo/individual, con o sin subtareas, entregado o no).
const REMINDER_FIELDS = [
  "assignee", "team", "description", "status", "generalStatus",
  "requestedDate", "deadline", "deliveredDate", "subtasksList", "finalize",
];

function isWeekend(d) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
// Fecha (YYYY-MM-DD) que resulta de sumarle n días hábiles (lun-vie) a startISODate.
function addBusinessDays(startISODate, n) {
  const d = new Date(startISODate + "T00:00:00Z");
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) added++;
  }
  return d.toISOString().slice(0, 10);
}

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const nowIso = new Date().toISOString();
  const todayISO = nowIso.slice(0, 10);

  // 1) Auto-finalizado a los 7 días de entregado.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: overdue } = await supabaseAdmin.from("tasks").select("*").eq("status", "Entregado").lte("delivered_at", sevenDaysAgo);
  let autoFinalized = 0;
  for (const t of overdue || []) {
    await supabaseAdmin.from("tasks").update({ status: "Finalizado", finalized_at: nowIso, finalize_reminder_popup_id: null }).eq("id", t.id);
    await supabaseAdmin.from("task_history").insert({ task_id: t.id, text: "Auto-finalizado a los 7 días de entregado sin que el solicitante lo finalizara" });
    const isDelayed = !t.delivered_at || t.delivered_at.slice(0, 10) !== todayISO;
    await supabaseAdmin.from("finalized_log").insert({ user_id: t.assigned_to_id || t.requested_by_id, task_title: t.title, delivered_at: t.delivered_at, is_delayed: isDelayed });
    autoFinalized++;
  }

  // 2) Auto-eliminado a los 4 días de finalizado.
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleFinalized } = await supabaseAdmin.from("tasks").select("id").eq("status", "Finalizado").lte("finalized_at", fourDaysAgo);
  const staleIds = (staleFinalized || []).map((t) => t.id);
  if (staleIds.length) await supabaseAdmin.from("tasks").delete().in("id", staleIds);

  // 3) Cancelar/actualizar recordatorios ya programados que no han salido.
  const { data: pendingPopups } = await supabaseAdmin.from("popups").select("*").eq("auto_generated", true).gte("scheduled_date", todayISO);
  let cancelled = 0;
  for (const p of pendingPopups || []) {
    const relatedIds = (p.related_tasks || []).map((e) => e.id);
    if (relatedIds.length === 0) { await supabaseAdmin.from("popups").delete().eq("id", p.id); cancelled++; continue; }
    const { data: stillOpen } = await supabaseAdmin.from("tasks").select("id").in("id", relatedIds).eq("status", "Entregado");
    const stillIds = new Set((stillOpen || []).map((t) => t.id));
    if (stillIds.size === 0) {
      await supabaseAdmin.from("popups").delete().eq("id", p.id);
      await supabaseAdmin.from("tasks").update({ finalize_reminder_popup_id: null }).in("id", relatedIds);
      cancelled++;
    } else if (stillIds.size !== relatedIds.length) {
      const filtered = (p.related_tasks || []).filter((e) => stillIds.has(e.id));
      await supabaseAdmin.from("popups").update({ related_tasks: filtered }).eq("id", p.id);
      const droppedIds = relatedIds.filter((id) => !stillIds.has(id));
      await supabaseAdmin.from("tasks").update({ finalize_reminder_popup_id: null }).in("id", droppedIds);
    }
  }

  // 4) Programar nuevos recordatorios (2 días hábiles antes de la marca de 4).
  const { data: candidates } = await supabaseAdmin.from("tasks").select("*").eq("status", "Entregado").is("finalize_reminder_popup_id", null).not("delivered_at", "is", null);
  const groups = new Map();
  for (const t of candidates || []) {
    const deliveredDate = t.delivered_at.slice(0, 10);
    const createDate = addBusinessDays(deliveredDate, 2);
    if (createDate > todayISO) continue; // aún no le toca — se revisa de nuevo mañana
    const fireDate = addBusinessDays(deliveredDate, 4);
    const effectiveFireDate = fireDate < todayISO ? todayISO : fireDate; // por si el cron se saltó algún día
    const targetIds = Array.from(new Set([t.requested_by_id, t.responsible_id, ...(t.co_requester_ids || [])].filter(Boolean)));
    if (targetIds.length === 0) continue;
    const key = `${targetIds.slice().sort().join(",")}|${effectiveFireDate}`;
    if (!groups.has(key)) groups.set(key, { targetIds, fireDate: effectiveFireDate, tasks: [] });
    groups.get(key).tasks.push(t);
  }
  let scheduled = 0;
  for (const { targetIds, fireDate, tasks } of groups.values()) {
    const limited = tasks.slice(0, POPUP_TASK_LIMIT);
    const { data: created } = await supabaseAdmin.from("popups").insert({
      title: REMINDER_TITLE, description: REMINDER_DESCRIPTION,
      scheduled_date: fireDate, target_user_ids: targetIds, auto_generated: true,
      related_tasks: limited.map((t) => ({ id: t.id, fields: REMINDER_FIELDS })),
    }).select().single();
    if (created) {
      await supabaseAdmin.from("tasks").update({ finalize_reminder_popup_id: created.id }).in("id", limited.map((t) => t.id));
      scheduled++;
    }
  }

  return Response.json({ ok: true, autoFinalized, autoDeleted: staleIds.length, cancelled, scheduled });
}
