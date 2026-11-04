"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Trash2, HelpCircle, MessageCircleQuestion } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import BottomNav from "@/components/BottomNav";
import LoadingScreen from "@/components/LoadingScreen";
import { FAQ_ITEMS } from "@/lib/faq";

function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// CHANGES.md #29: sección de admin (menú lateral) con las dudas que manda
// la gente desde el modal de FAQ (?) — guardadas en `faq_submissions` — y
// una vista de las preguntas ya activas ahí (fijas en lib/faq.js, todavía
// sin editor: para cambiarlas hay que tocar código).
export default function FaqAdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data?.role !== "admin") { router.replace("/dashboard"); return; }
      setProfile(data);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data } = await supabase.from("faq_submissions").select("*").order("created_at", { ascending: false });
      setSubmissions(data || []);
    })();
  }, [ready]);

  const removeSubmission = async (id) => {
    setSubmissions((s) => s.filter((x) => x.id !== id));
    await supabase.from("faq_submissions").delete().eq("id", id);
  };

  if (!ready) return <LoadingScreen />;

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans pb-28 md:pb-10 md:pl-[248px]">
      <div className="px-5 pt-4 md:hidden">
        <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: C.inkSoft }}>TERREGAL</div>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-3 md:pt-10 pb-10">
        <h1 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 500 }}>FAQ</h1>
        <p className="text-[13.5px] mt-1.5" style={{ color: C.inkSoft }}>Dudas que manda el equipo desde la ventana de ayuda, y las preguntas que ya están activas ahí.</p>

        <div className="mt-7">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircleQuestion size={16} style={{ color: C.signal }} />
            <span className="text-[11.5px] font-bold tracking-[0.1em] uppercase" style={{ color: C.inkMedium }}>Dudas enviadas</span>
            <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: R.pill, background: C.subtle, color: C.inkMedium, fontSize: 11, fontWeight: 700 }} className="flex items-center justify-center">{submissions.length}</span>
          </div>
          {submissions.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nadie ha mandado dudas todavía.</p>}
          <div className="flex flex-col gap-2.5">
            {submissions.map((s) => (
              <div key={s.id} style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="p-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: C.ink }}>{s.question}</p>
                  <p className="text-[11.5px] mt-1.5" style={{ color: C.inkSoft }}>{s.user_name} · {fmtDateTime(s.created_at)}</p>
                </div>
                <button onClick={() => removeSubmission(s.id)} title="Ya la revisé" style={{ color: C.inkSoft }} className="flex-shrink-0 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-9">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={16} style={{ color: C.signal }} />
            <span className="text-[11.5px] font-bold tracking-[0.1em] uppercase" style={{ color: C.inkMedium }}>Preguntas activas en (?)</span>
            <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: R.pill, background: C.subtle, color: C.inkMedium, fontSize: 11, fontWeight: 700 }} className="flex items-center justify-center">{FAQ_ITEMS.length}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="p-3.5">
                <p className="text-sm font-semibold" style={{ color: C.ink }}>{item.q}</p>
                <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: C.inkMedium }}>{item.a}</p>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] mt-3" style={{ color: C.inkFaint }}>Todavía no hay editor para esto — para cambiar estas preguntas hay que tocar código (lib/faq.js).</p>
        </div>
      </div>

      <BottomNav active="faq" profile={profile} />
    </div>
  );
}
