import webpush from "web-push";

// Manda un push a todos los dispositivos suscritos de un usuario. Usado tanto
// por /api/send-push (push disparado desde el cliente vía notify()) como por
// los crons que generan notificaciones del lado del servidor.
export async function sendPushToUser(supabaseAdmin, userId, { title, body, url } = {}) {
  webpush.setVapidDetails(
    "mailto:notificaciones@sevenly.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
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
}
