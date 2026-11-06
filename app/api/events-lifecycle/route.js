import { createClient } from "@supabase/supabase-js";

// CHANGES.md #35: Eventos — corre una vez al día (ver vercel.json):
//
// 1. Recordatorios automáticos a todo el Equipo de trabajo: 4 días antes,
//    1 día antes y el mismo día del evento (una sola vez cada uno, vía las
//    banderas reminder_4d_sent / reminder_1d_sent / reminder_sameday_sent).
// 2. Pasando la fecha y hora sin finalizar, un aviso único "¿Se concretó?"
//    a todo el equipo (reminder postevent_reminder_sent).
// 3. Auto-borrado: 1 hora después de finalizado, o si pasó 1+ día de su
//    fecha sin finalizarse. Como este cron corre una vez al día, el borrado
//    "a la hora" puede tardar hasta la siguiente pasada del cron, no es
//    instantáneo.
//
// Los eventos no cuentan como pendientes vencidos, strikes, finalizados ni
// entregados — viven en su propia tabla, aparte de "tasks".

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = ((+h + 11) % 12) + 1;
  return `${hh}:${m} ${+h < 12 ? "am" : "pm"}`;
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

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const in1Day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in4Days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: events } = await supabaseAdmin.from("events").select("*");
  const all = events || [];

  let remindersSent = 0, postRemindersSent = 0, autoDeleted = 0;

  for (const e of all) {
    if (e.finalized_at) continue;
    const patch = {};
    const notifyAll = async (message, title) => {
      for (const id of e.team_member_ids || []) {
        await supabaseAdmin.from("notifications").insert({ user_id: id, event_id: e.id, message, title });
      }
    };

    if (e.event_date === in4Days && !e.reminder_4d_sent) {
      await notifyAll(`Tienes "${e.title}" en 4 días (${fmtDate(e.event_date)} · ${fmtTime(e.start_time)}).`, "Evento próximo");
      patch.reminder_4d_sent = true; remindersSent++;
    }
    if (e.event_date === in1Day && !e.reminder_1d_sent) {
      await notifyAll(`Tienes "${e.title}" mañana (${fmtDate(e.event_date)} · ${fmtTime(e.start_time)}).`, "Evento próximo");
      patch.reminder_1d_sent = true; remindersSent++;
    }
    if (e.event_date === todayISO && !e.reminder_sameday_sent) {
      await notifyAll(`Hoy tienes "${e.title}" (${fmtTime(e.start_time)}).`, "Evento hoy");
      patch.reminder_sameday_sent = true; remindersSent++;
    }

    // Ya pasó la fecha y hora sin finalizarse: un solo aviso de "¿se concretó?".
    const start = new Date(`${e.event_date}T${(e.start_time || "00:00:00").slice(0, 8)}`);
    const end = e.end_time ? new Date(`${e.event_date}T${e.end_time.slice(0, 8)}`) : start;
    if (now > end && !e.postevent_reminder_sent) {
      await notifyAll(`¿Se concretó "${e.title}"? Finaliza este evento.`, "¿Ya pasó?");
      patch.postevent_reminder_sent = true; postRemindersSent++;
    }

    if (Object.keys(patch).length) await supabaseAdmin.from("events").update(patch).eq("id", e.id);
  }

  // Auto-borrado: finalizados hace 1+ hora.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: doneStale } = await supabaseAdmin.from("events").select("id").not("finalized_at", "is", null).lte("finalized_at", oneHourAgo);
  const doneIds = (doneStale || []).map((e) => e.id);
  if (doneIds.length) { await supabaseAdmin.from("events").delete().in("id", doneIds); autoDeleted += doneIds.length; }

  // Auto-borrado: se pasó 1+ día de su fecha sin finalizarse.
  const oneDayAgoDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: overdueStale } = await supabaseAdmin.from("events").select("id").is("finalized_at", null).lte("event_date", oneDayAgoDate);
  const overdueIds = (overdueStale || []).map((e) => e.id);
  if (overdueIds.length) { await supabaseAdmin.from("events").delete().in("id", overdueIds); autoDeleted += overdueIds.length; }

  return Response.json({ ok: true, remindersSent, postRemindersSent, autoDeleted });
}
