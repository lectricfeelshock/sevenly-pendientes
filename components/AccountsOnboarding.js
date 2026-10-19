"use client";
import { useState, useEffect } from "react";
import { Plus, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { C, R, SH } from "@/lib/theme";

// CHANGES.md #24: onboarding de "cuentas" (cliente/marca) + puesto.
// Bloqueante — aparece antes del dashboard a usuarios nuevos y, una sola
// vez, a los que ya estaban registrados desde antes de que esto existiera
// (se gatea en app/dashboard/page.js por profile.account_ids/job_title
// vacíos). No se puede cerrar ni saltar hasta terminarlo.
export default function AccountsOnboarding({ profile, onDone }) {
  const [step, setStep] = useState("accounts"); // "accounts" | "job"
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(profile.account_ids || []);
  const [showOther, setShowOther] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [jobTitle, setJobTitle] = useState(profile.job_title || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("accounts").select("*").order("name");
      setAccounts(data || []);
    })();
  }, []);

  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addOther = async () => {
    const name = otherName.trim();
    if (!name) return;
    const existing = accounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setSelected((prev) => prev.includes(existing.id) ? prev : [...prev, existing.id]);
    } else {
      const { data, error: insErr } = await supabase.from("accounts").insert({ name }).select().single();
      if (!insErr && data) {
        setAccounts((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setSelected((prev) => [...prev, data.id]);
      } else {
        // Carrera con otra persona agregando la misma cuenta casi a la vez
        // — la recargamos y la seleccionamos en vez de fallar.
        const { data: refreshed } = await supabase.from("accounts").select("*").order("name");
        setAccounts(refreshed || []);
        const found = (refreshed || []).find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (found) setSelected((prev) => [...prev, found.id]);
      }
    }
    setOtherName("");
    setShowOther(false);
  };

  const confirmAccounts = () => {
    if (selected.length === 0) { setError("Elige al menos una cuenta."); return; }
    setError("");
    setStep("job");
  };

  const finish = async () => {
    const title = jobTitle.trim();
    if (!title) { setError("Escribe tu puesto."); return; }
    setSaving(true);
    setError("");
    const { data, error: updErr } = await supabase.from("profiles")
      .update({ account_ids: selected, job_title: title })
      .eq("id", profile.id)
      .select()
      .single();
    setSaving(false);
    if (updErr) { setError("No se pudo guardar — intenta de nuevo."); return; }
    onDone(data);
  };

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex items-center justify-center p-6 font-sans">
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm p-6 flex flex-col gap-4">
        {step === "accounts" ? (
          <>
            <div>
              <h1 style={{ color: C.ink }} className="text-xl font-bold">¿En qué cuenta estás?</h1>
              <p style={{ color: C.inkSoft }} className="text-sm mt-1">Elige todas las cuentas a las que pertenezcas.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => {
                const active = selected.includes(a.id);
                return (
                  <button key={a.id} type="button" onClick={() => toggle(a.id)}
                    style={{ background: active ? C.ink : C.subtle, color: active ? C.paper : C.inkMedium, fontWeight: active ? 700 : 500 }}
                    className="h-9 px-3.5 rounded-full text-[13px] flex items-center gap-1.5">
                    {active && <Check size={13} />} {a.name}
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowOther((v) => !v)}
                style={{ background: showOther ? C.ink : "transparent", color: showOther ? C.paper : C.inkSoft, boxShadow: showOther ? "none" : `inset 0 0 0 1.5px ${C.hairline}` }}
                className="h-9 px-3.5 rounded-full text-[13px] font-medium flex items-center gap-1"><Plus size={13} /> Otras</button>
            </div>
            {showOther && (
              <div className="flex gap-2">
                <input
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }}
                  placeholder="Nombre de la cuenta"
                  autoFocus
                  style={{ background: C.paper, borderRadius: R.md }}
                  className="flex-1 px-3.5 py-2.5 text-sm outline-none"
                />
                <button type="button" onClick={addOther} style={{ background: C.ink, color: C.paper, borderRadius: R.md }} className="px-4 text-sm font-semibold">Ok</button>
              </div>
            )}
            {error && <p className="text-xs" style={{ color: C.urgent }}>{error}</p>}
            <button
              onClick={confirmAccounts}
              style={{ background: C.ink, color: C.paper, borderRadius: R.md, boxShadow: "0 8px 18px rgba(27,30,36,0.20)" }}
              className="h-[52px] text-[15.5px] font-semibold mt-1"
            >
              Son todas
            </button>
          </>
        ) : (
          <>
            <div>
              <h1 style={{ color: C.ink }} className="text-xl font-bold">¿Cuál es tu puesto?</h1>
              <p style={{ color: C.inkSoft }} className="text-sm mt-1">Escribe tu puesto dentro del equipo.</p>
            </div>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(); } }}
              placeholder="Ej. Editor de video"
              autoFocus
              style={{ background: C.paper, borderRadius: R.md }}
              className="w-full px-3.5 py-2.5 text-sm outline-none"
            />
            {error && <p className="text-xs" style={{ color: C.urgent }}>{error}</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={() => setStep("accounts")} style={{ color: C.inkSoft }} className="px-4 text-sm font-semibold flex items-center gap-1"><X size={14} /> Atrás</button>
              <button
                onClick={finish}
                disabled={saving}
                style={{ background: C.ink, color: C.paper, borderRadius: R.md, boxShadow: "0 8px 18px rgba(27,30,36,0.20)" }}
                className="flex-1 h-[52px] text-[15.5px] font-semibold disabled:opacity-60"
              >
                {saving ? "Un momento..." : "Ok"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
