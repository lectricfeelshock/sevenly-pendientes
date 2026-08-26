import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vercel Cron llama esto una vez al día (ver vercel.json).
// Por cada plantilla de "pendiente de frecuencia" cuyo día de la semana
// sea hoy, crea un pendiente Individual nuevo con el deadline calculado.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();
  const weekday = now.getDay(); // 0=domingo ... 6=sábado
  const todayISO = now.toISOString().slice(0, 10);

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
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + tpl.deadline_offset_days);
    const { error: insErr } = await supabaseAdmin.from("tasks").insert({
      title: tpl.title,
      description: tpl.description,
      category: tpl.category,
      task_type: "individual",
      requested_by: nameOf(tpl.requested_by_id),
      requested_by_id: tpl.requested_by_id,
      assigned_to_id: tpl.assigned_to_id,
      assigned_to_name: nameOf(tpl.assigned_to_id),
      deadline: deadline.toISOString().slice(0, 10),
      urgency: "Media",
      request_date: todayISO,
      recurring_template_id: tpl.id,
    });
    if (!insErr) created += 1;
  }

  return Response.json({ ok: true, created });
}
