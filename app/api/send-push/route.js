import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

export async function POST(req) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId, title, body, url } = await req.json();
    if (!userId) return Response.json({ ok: false, error: "Falta userId" }, { status: 400 });

    await sendPushToUser(supabaseAdmin, userId, { title, body, url });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
