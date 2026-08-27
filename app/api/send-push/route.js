import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    webpush.setVapidDetails(
      "mailto:notificaciones@sevenly.app",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId, title, body, url } = await req.json();
    if (!userId) return Response.json({ ok: false, error: "Falta userId" }, { status: 400 });

    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*").eq("user_id", userId);

    await Promise.all(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: title || "Sevenly", body: body || "", url: url || "/dashboard" })
          );
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      })
    );

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
