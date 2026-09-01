import { createClient } from "@supabase/supabase-js";

// En qué día del mes cae la N-ésima ocurrencia de un día de la semana
// (ej. "el primer jueves"). Si ese mes no llega a tener esa N-ésima
// ocurrencia (el "5º jueves" no siempre existe), regresa la última
// ocurrencia de ese día de la semana en el mes — así nunca se salta un
// mes completo por un mes corto.
function nthWeekdayDateInMonth(year, monthIndex, weekday, occurrence) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
  if (day <= daysInMonth) return day;
  const diffToLast = (new Date(year, monthIndex + 1, 0).getDay() - weekday + 7) % 7;
  return daysInMonth - diffToLast;
}

// Vercel Cron llama esto una vez al día (ver vercel.json).
// Por cada plantilla de "Pendiente programado" activa cuyo día de la
// semana (semanal) o cuya ocurrencia del mes (mensual) sea hoy, genera un
// pendiente nuevo — con el deadline general y los de cada subtarea
// recalculados como el mismo conteo de días desde el día programado
// original, aplicado a la fecha de solicitud de hoy.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  const weekday = now.getDay(); // 0=domingo ... 6=sábado
  const todayISO = now.toISOString().slice(0, 10);
  const year = now.getFullYear(), monthIndex = now.getMonth(), todayDay = now.getDate();

  const { data: templates, error: tErr } = await supabaseAdmin
    .from("recurring_templates")
    .select("*")
    .eq("weekday", weekday)
    .eq("active", true);

  if (tErr) return Response.json({ ok: false, error: String(tErr) }, { status: 500 });
  if (!templates || templates.length === 0) return Response.json({ ok: true, created: 0 });

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id,name");
  const nameOf = (id) => (profiles || []).find((p) => p.id === id)?.name || "";

  let created = 0;
  for (const tpl of templates) {
    if (tpl.last_generated_on === todayISO) continue; // ya se generó hoy — no duplicar

    if (tpl.frequency_type === "monthly") {
      const expectedDay = nthWeekdayDateInMonth(year, monthIndex, weekday, tpl.month_occurrence || 1);
      if (expectedDay !== todayDay) continue;
    }
    // 'weekly' ya quedó filtrado arriba por .eq("weekday", weekday) — se
    // dispara todas las semanas sin necesidad de revisar nada más.

    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + tpl.deadline_offset_days);
    const deadlineISO = deadline.toISOString().slice(0, 10);
    const isColaborativo = tpl.task_type === "colaborativo";
    const assignee = !isColaborativo ? profiles.find((p) => p.id === tpl.assigned_to_id) : null;

    const { data: newTask, error: insErr } = await supabaseAdmin.from("tasks").insert({
      title: tpl.title, description: tpl.description, category: tpl.category,
      task_type: tpl.task_type || "individual",
      requested_by: nameOf(tpl.requested_by_id), requested_by_id: tpl.requested_by_id,
      co_requester_ids: tpl.co_requester_ids || [],
      co_requester_names: (tpl.co_requester_ids || []).map(nameOf),
      assigned_to_id: isColaborativo ? null : (tpl.assigned_to_id || null),
      assigned_to_name: assignee ? assignee.name : "",
      team_member_ids: isColaborativo ? (tpl.team_member_ids || []) : [],
      deadline: deadlineISO, urgency: tpl.urgency || "Media",
      request_date: todayISO,
      recurring_template_id: tpl.id,
    }).select().single();

    if (insErr || !newTask) continue;
    created += 1;

    for (const spec of tpl.subtask_specs || []) {
      if (!spec.title) continue;
      const subDeadline = new Date(now);
      subDeadline.setDate(subDeadline.getDate() + (spec.offset_days ?? 0));
      const subAssigneeId = spec.assigned_to_id || (isColaborativo ? null : tpl.assigned_to_id);
      const subAssignee = profiles.find((p) => p.id === subAssigneeId);
      await supabaseAdmin.from("subtasks").insert({
        task_id: newTask.id, title: spec.title, description: spec.description || "",
        assigned_to_id: subAssigneeId || null,
        assigned_to_name: subAssignee ? subAssignee.name : "",
        deadline: subDeadline.toISOString().slice(0, 10),
      });
    }

    // Esta es ahora la tarjeta "viva" de la plantilla — la que se muestra
    // en Mis solicitudes > Programados, sin acumular las anteriores.
    await supabaseAdmin.from("recurring_templates").update({
      last_generated_on: todayISO, current_task_id: newTask.id,
    }).eq("id", tpl.id);
  }

  return Response.json({ ok: true, created });
}
