import { createClient } from "@supabase/supabase-js";

// En qué día del mes cae la N-ésima ocurrencia de un día de la semana
// dentro de un mes dado (ej. "el primer jueves"). Si ese mes no llega a
// tener esa N-ésima ocurrencia (el "5º jueves" no siempre existe), regresa
// la última ocurrencia de ese día de la semana en el mes — así nunca se
// salta un mes completo por un mes corto.
function nthWeekdayDateInMonth(year, monthIndex, weekday, occurrence) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
  if (day <= daysInMonth) return day;
  const diffToLast = (new Date(year, monthIndex + 1, 0).getDay() - weekday + 7) % 7;
  return daysInMonth - diffToLast;
}

// La próxima fecha (estrictamente después de `after`) que cae en ese día
// de la semana.
function nextWeeklyDateAfter(after, weekday) {
  const d = new Date(after);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== weekday);
  return d;
}

// La próxima fecha (estrictamente después de `after`) que sea la
// N-ésima ocurrencia de ese día de la semana en su mes. Busca hacia
// adelante mes por mes (tope de 14 meses, de sobra para alcanzar) — así
// también sirve para "ponerse al día" si una plantilla llevara más de un
// mes sin generar nada.
function nextMonthlyDateAfter(after, weekday, occurrence) {
  let probeYear = after.getFullYear(), probeMonth = after.getMonth();
  for (let i = 0; i < 14; i++) {
    const day = nthWeekdayDateInMonth(probeYear, probeMonth, weekday, occurrence);
    const candidate = new Date(probeYear, probeMonth, day);
    if (candidate > after) return candidate;
    probeMonth += 1;
    if (probeMonth > 11) { probeMonth = 0; probeYear += 1; }
  }
  return null;
}

// Vercel Cron llama esto una vez al día (ver vercel.json).
// Un pendiente de frecuencia siempre tiene, de antemano, la SIGUIENTE
// ocurrencia ya creada (current_task_id) con su propio Día programado —
// así se ve en "Programados" antes de publicarse, igual que un pendiente
// programado sin repetición. En cuanto ese Día programado llega (o ya
// pasó, por si el cron se saltó algún día), esta ruta genera la ocurrencia
// DESPUÉS de esa, con el deadline general y los de cada subtarea
// recalculados como el mismo conteo de días desde el nuevo Día programado.
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
  const todayISO = now.toISOString().slice(0, 10);
  const todayDate = new Date(todayISO + "T00:00:00");

  const { data: templates, error: tErr } = await supabaseAdmin
    .from("recurring_templates")
    .select("*, current_task:tasks!current_task_id(request_date)")
    .eq("active", true);

  if (tErr) return Response.json({ ok: false, error: String(tErr) }, { status: 500 });
  if (!templates || templates.length === 0) return Response.json({ ok: true, created: 0 });

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id,name");
  const nameOf = (id) => (profiles || []).find((p) => p.id === id)?.name || "";

  let created = 0;
  for (const tpl of templates) {
    if (tpl.last_generated_on === todayISO) continue; // ya se generó hoy — no duplicar

    // Solo genera la siguiente ocurrencia cuando la actual ya se publicó
    // (su Día programado es hoy o ya pasó) — si sigue en el futuro, no hay
    // nada que hacer todavía. Si no hay tarjeta actual (se borró con
    // "Borrar", sin detener la recurrencia, o es una plantilla nueva sin
    // current_task_id todavía) se trata como si ya tocara, y se genera la
    // siguiente ocurrencia a partir de hoy — así nunca se corta la cadena.
    const currentRequestDate = tpl.current_task?.request_date || null;
    if (currentRequestDate && currentRequestDate > todayISO) continue;

    const nextDate = tpl.frequency_type === "monthly"
      ? nextMonthlyDateAfter(todayDate, tpl.weekday, tpl.month_occurrence || 1)
      : nextWeeklyDateAfter(todayDate, tpl.weekday);
    if (!nextDate) continue;
    const nextDateISO = nextDate.toISOString().slice(0, 10);

    const deadline = new Date(nextDate);
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
      request_date: nextDateISO,
      recurring_template_id: tpl.id,
    }).select().single();

    if (insErr || !newTask) continue;
    created += 1;

    for (const spec of tpl.subtask_specs || []) {
      if (!spec.title) continue;
      const subDeadline = new Date(nextDate);
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

    // Esta pasa a ser la tarjeta "viva" — la que se ve en Mis solicitudes >
    // Programados hasta que a ella también le toque publicarse.
    await supabaseAdmin.from("recurring_templates").update({
      last_generated_on: todayISO, current_task_id: newTask.id,
    }).eq("id", tpl.id);
  }

  return Response.json({ ok: true, created });
}
