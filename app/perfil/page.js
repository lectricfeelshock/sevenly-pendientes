"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChevronRight, Eye, EyeOff, LogOut, Download } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import BottomNav from "@/components/BottomNav";
import LoadingScreen from "@/components/LoadingScreen";
import TeamPanel from "@/components/TeamPanel";
import FaqBubble from "@/components/FaqBubble";
import OnlineBanner from "@/components/OnlineBanner";
import { usePresence } from "@/lib/presence";
import { downloadActivityPdf } from "@/lib/logPdf";

function activityMsg(n) {
  if (!n) return "Aún no finalizas pendientes hoy.";
  if (n <= 2) return "Vas bien.";
  if (n <= 5) return "¡Bien hecho, buen ritmo!";
  return "Ha estado pesado hoy — tómate un respiro.";
}

export default function PerfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(null); // "name" | "jobTitle" | "accounts" | "username" | "phone" | "email" | "password" | null
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState([]);
  const [accounts, setAccounts] = useState([]); // CHANGES.md #24: todas las cuentas que existen
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [showTeam, setShowTeam] = useState(false);
  const { onlineIds, joinQueue, dequeueJoin } = usePresence(profile); // CHANGES.md #28
  const [view, setView] = useState("finalizados"); // "finalizados" | "entregados" — el rectángulo de arriba alterna entre ambos
  const [delivered, setDelivered] = useState([]); // entregados en los últimos 7 días: { title, at }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase.from("finalized_log").select("*").eq("user_id", profile.id).order("finalized_at", { ascending: false }).limit(100);
      setLog(data || []);
    })();
  }, [profile?.id]);

  // Entregados de la semana: un conteo por pendiente, con la ÚLTIMA vez que
  // llegó a Entregado (delivered_at se sobrescribe en cada entrega). Si el
  // pendiente regresó a No iniciado / En progreso, no cuenta hasta que se
  // vuelva a entregar. Incluye los del finalized_log cuyo pendiente ya se
  // borró (auto-finalizado a los 7 días). Las subtareas que entregó el
  // solicitante porque se vencieron (delivered_by_requester), igual que
  // los pendientes, no cuentan.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: tsk } = await supabase.from("tasks").select("title, status, delivered_at").eq("assigned_to_id", profile.id).eq("delivered_by_requester", false).gte("delivered_at", since);
      const { data: lg } = await supabase.from("finalized_log").select("task_title, delivered_at").eq("user_id", profile.id).gte("delivered_at", since).order("delivered_at", { ascending: false });
      const { data: sub } = await supabase.from("subtasks").select("title, status, delivered_at").eq("assigned_to_id", profile.id).eq("delivered_by_requester", false).gte("delivered_at", since);
      const isDone = (x) => x.status === "Entregado" || x.status === "Finalizado";
      const liveTitles = new Set((tsk || []).map((t) => t.title)); // el pendiente sigue existiendo: manda su estado actual
      const rows = [];
      for (const t of tsk || []) if (isDone(t)) rows.push({ title: t.title, at: t.delivered_at });
      for (const x of sub || []) if (isDone(x)) rows.push({ title: x.title, at: x.delivered_at });
      const loggedTitles = new Set();
      for (const l of lg || []) {
        if (liveTitles.has(l.task_title) || loggedTitles.has(l.task_title)) continue;
        loggedTitles.add(l.task_title);
        rows.push({ title: l.task_title, at: l.delivered_at });
      }
      rows.sort((a, b) => new Date(b.at) - new Date(a.at));
      setDelivered(rows);
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const [{ data: accs }, { data: profs }, { data: tsks }] = await Promise.all([
        supabase.from("accounts").select("*").order("name"),
        supabase.from("profiles").select("*"),
        supabase.from("tasks").select("id, assigned_to_id, status, title, category, deadline"),
      ]);
      setAccounts(accs || []);
      setTeamProfiles(profs || []);
      setTeamTasks(tsks || []);
    })();
  }, [profile?.id]);

  const startEdit = (field) => { setEditing(field); setError(""); setInfo(""); };
  const cancelEdit = () => { setEditing(null); setError(""); };
  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ready || !profile) {
    return <LoadingScreen />;
  }

  const initial = (profile.name || "?").trim().charAt(0).toUpperCase();

  // CHANGES.md #4e: un pendiente finalizado cuenta con la fecha en que se
  // ENTREGÓ, no la que se finalizó.
  const days = Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
    const iso = dt.toISOString().slice(0, 10);
    const count = log.filter((l) => (l.delivered_at || l.finalized_at).slice(0, 10) === iso).length;
    return { iso, label: dt.toLocaleDateString("es-MX", { weekday: "short" }), count, isToday: i === 6 };
  });
  const todayCount = days[days.length - 1].count;

  const showDelivered = view === "entregados";
  const chartDays = showDelivered
    ? days.map((d) => ({ ...d, count: delivered.filter((r) => r.at.slice(0, 10) === d.iso).length }))
    : days;
  const maxDayCount = Math.max(1, ...chartDays.map((d) => d.count));

  const downloadLog = () => {
    const safe = profile.name.replace(/[^a-z0-9]/gi, "_");
    if (showDelivered) {
      downloadActivityPdf({
        name: profile.name, kind: "entregados", subtitle: "Últimos 7 días",
        rows: delivered, filename: `entregados_${safe}.pdf`,
      });
    } else {
      downloadActivityPdf({
        name: profile.name, kind: "finalizados", subtitle: `Total histórico: ${log.length}`,
        rows: log.map((l) => ({ title: l.task_title, at: l.delivered_at || l.finalized_at })), filename: `finalizados_${safe}.pdf`,
      });
    }
  };

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans pb-28 md:pb-10 md:pl-[248px]">
      <div className="px-5 pt-4 md:hidden">
        <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: C.inkSoft }}>TERREGAL</div>
      </div>

      <div className="max-w-lg mx-auto md:pt-10">
        <div className="flex flex-col items-center gap-3 px-5 pt-6 text-center">
          <div
            style={{ width: 104, height: 104, borderRadius: R.pill, background: C.ink, color: C.paper, fontFamily: FONT_SERIF, fontSize: 40, fontWeight: 500, boxShadow: SH.float }}
            className="flex items-center justify-center flex-shrink-0"
          >{initial}</div>
          <div className="flex flex-col gap-1 min-w-0">
            <div style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: 500, lineHeight: 1.1 }} className="truncate">{profile.username || profile.name}</div>
            <div style={{ fontSize: 13, color: C.inkSoft }} className="truncate">{profile.email}</div>
          </div>
        </div>

        <div className="px-5 mt-7 flex flex-col gap-3">
          <ProfileRow label="Nombre" value={profile.name} editing={editing === "name"}
            onEdit={() => startEdit("name")} onCancel={cancelEdit}>
            <NameField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="Puesto" value={profile.job_title || "Sin configurar"} editing={editing === "jobTitle"}
            onEdit={() => startEdit("jobTitle")} onCancel={cancelEdit}>
            <JobTitleField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="Cuentas" value={(profile.account_ids || []).map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean).join(", ") || "Sin configurar"} editing={editing === "accounts"}
            onEdit={() => startEdit("accounts")} onCancel={cancelEdit}>
            <AccountsField profile={profile} setProfile={setProfile} accounts={accounts} setAccounts={setAccounts} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="Usuario" value={profile.username || "Sin configurar"} editing={editing === "username"}
            onEdit={() => startEdit("username")} onCancel={cancelEdit}>
            <UsernameField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="WhatsApp" value={profile.phone || "Sin configurar"} editing={editing === "phone"}
            onEdit={() => startEdit("phone")} onCancel={cancelEdit}>
            <PhoneField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="Correo" value={profile.email} editing={editing === "email"}
            onEdit={() => startEdit("email")} onCancel={cancelEdit}>
            <EmailField setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          <ProfileRow label="Contraseña" value="••••••••" editing={editing === "password"}
            onEdit={() => startEdit("password")} onCancel={cancelEdit}>
            <PasswordField setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
          </ProfileRow>

          {error && <div className="text-xs" style={{ color: C.urgent }}>{error}</div>}
          {info && <div className="text-xs" style={{ color: C.signal }}>{info}</div>}

          <div style={{ background: C.panel, borderRadius: R.xl, boxShadow: SH.card }} className="p-[18px] flex flex-col gap-4 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold tracking-[0.11em]" style={{ color: C.inkSoft }}>MI ACTIVIDAD</span>
              <span className="text-[12.5px] font-semibold" style={{ color: C.inkSoft }}>Últimos 7 días</span>
            </div>
            <button type="button" onClick={() => setView(showDelivered ? "finalizados" : "entregados")}
              style={{ background: C.signalSoft, color: C.signal, borderRadius: R.md }} className="px-3.5 py-3 text-[13.5px] leading-snug text-left w-full">
              {showDelivered
                ? <>Esta semana: <strong>{delivered.length}</strong> entregado(s).</>
                : <>Hoy: <strong>{todayCount}</strong> finalizado(s). {activityMsg(todayCount)}</>}
            </button>
            <div className="flex items-end gap-2.5 h-16">
              {chartDays.map((d) => (
                <div key={d.iso} className="flex-1 flex flex-col items-center gap-1.5">
                  <div style={{ width: "100%", height: Math.max(8, (d.count / maxDayCount) * 42), borderRadius: 7, background: d.count > 0 ? "#CFE3DA" : "#EDEAE3" }} />
                  <span className="text-[10.5px] capitalize" style={{ color: C.gray, fontWeight: d.isToday ? 700 : 400 }}>{d.isToday ? "hoy" : d.label}</span>
                </div>
              ))}
            </div>
            <button onClick={downloadLog} disabled={(showDelivered ? delivered : log).length === 0}
              style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.pill }}
              className="h-10 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              <Download size={14} /> Descargar mi lista de {showDelivered ? "entregados" : "finalizados"}
            </button>
          </div>

          <button
            onClick={logout}
            style={{ background: C.panel, color: C.urgentInk, borderRadius: R.xl, boxShadow: SH.soft }}
            className="h-[52px] flex items-center justify-center gap-2 text-[14.5px] font-semibold mt-3"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </div>

      <BottomNav active="perfil" profile={profile} onEquipo={() => setShowTeam(true)} />
      <FaqBubble profile={profile} onDismiss={(iso) => setProfile((p) => ({ ...p, faq_bubble_dismissed_at: iso }))} />

      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={teamProfiles.filter((p) => p.role !== "admin")} tasks={teamTasks} onlineIds={onlineIds} />}
      <OnlineBanner queue={joinQueue} onDequeue={dequeueJoin} />
    </div>
  );
}

function ProfileRow({ label, value, editing, onEdit, onCancel, children }) {
  return (
    <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="px-4">
      {!editing ? (
        <button onClick={onEdit} className="w-full flex items-center justify-between gap-3 py-[15px] text-left">
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="text-[11.5px] font-semibold tracking-[0.06em]" style={{ color: C.gray }}>{label.toUpperCase()}</div>
            <div className="text-[15px] font-semibold truncate" style={{ color: value.startsWith("Sin configurar") ? C.inkFaint : C.ink, fontWeight: value.startsWith("Sin configurar") ? 400 : 600 }}>{value}</div>
          </div>
          <ChevronRight size={18} style={{ color: "#C3C0B8" }} className="flex-shrink-0" />
        </button>
      ) : (
        <div className="py-4">
          <div className="text-[11.5px] font-semibold tracking-[0.06em] mb-2" style={{ color: C.gray }}>{label.toUpperCase()}</div>
          {children}
        </div>
      )}
    </div>
  );
}

function FieldActions({ onSave, onCancel, saving, saveLabel = "Guardar" }) {
  return (
    <div className="flex gap-2 mt-2.5">
      <button onClick={onCancel} style={{ color: C.inkSoft }} className="px-3.5 py-2 text-xs font-medium">Cancelar</button>
      <button onClick={onSave} disabled={saving} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="px-4 py-2 text-xs font-semibold disabled:opacity-60">
        {saving ? "Guardando..." : saveLabel}
      </button>
    </div>
  );
}

const fieldInputCls = "w-full h-11 rounded-[12px] px-3.5 text-sm outline-none";
const fieldInputStyle = { background: C.paper, color: C.ink };

function NameField({ profile, setProfile, setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState(profile.name || "");
  const save = async () => {
    if (!val.trim()) { setError("El nombre no puede quedar vacío."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.from("profiles").update({ name: val.trim() }).eq("id", profile.id);
    setSaving(false);
    if (error) { setError("No se pudo guardar."); return; }
    setProfile((p) => ({ ...p, name: val.trim() }));
    setInfo("Nombre actualizado.");
    setEditing(null);
  };
  return (
    <div>
      <input value={val} onChange={(e) => setVal(e.target.value)} style={fieldInputStyle} className={fieldInputCls} />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

function JobTitleField({ profile, setProfile, setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState(profile.job_title || "");
  const save = async () => {
    if (!val.trim()) { setError("El puesto no puede quedar vacío."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.from("profiles").update({ job_title: val.trim() }).eq("id", profile.id);
    setSaving(false);
    if (error) { setError("No se pudo guardar."); return; }
    setProfile((p) => ({ ...p, job_title: val.trim() }));
    setInfo("Puesto actualizado.");
    setEditing(null);
  };
  return (
    <div>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Ej. Editor de video" style={fieldInputStyle} className={fieldInputCls} />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

// CHANGES.md #24: igual que al entrar por primera vez, pero aquí se puede
// volver a abrir cuando quieras para agregarte más cuentas (o quitarte
// alguna) — "Otras" agrega una cuenta nueva disponible para todos.
function AccountsField({ profile, setProfile, accounts, setAccounts, setInfo, setError, setEditing, saving, setSaving }) {
  const [selected, setSelected] = useState(profile.account_ids || []);
  const [showOther, setShowOther] = useState(false);
  const [otherName, setOtherName] = useState("");
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
        const { data: refreshed } = await supabase.from("accounts").select("*").order("name");
        setAccounts(refreshed || []);
        const found = (refreshed || []).find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (found) setSelected((prev) => [...prev, found.id]);
      }
    }
    setOtherName("");
    setShowOther(false);
  };

  const save = async () => {
    if (selected.length === 0) { setError("Elige al menos una cuenta."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.from("profiles").update({ account_ids: selected }).eq("id", profile.id);
    setSaving(false);
    if (error) { setError("No se pudo guardar."); return; }
    setProfile((p) => ({ ...p, account_ids: selected }));
    setInfo("Cuentas actualizadas.");
    setEditing(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {accounts.map((a) => {
          const active = selected.includes(a.id);
          return (
            <button key={a.id} type="button" onClick={() => toggle(a.id)}
              style={{ background: active ? C.ink : C.subtle, color: active ? C.paper : C.inkMedium, fontWeight: active ? 700 : 500 }}
              className="h-9 px-3.5 rounded-full text-[13px]">{a.name}</button>
          );
        })}
        <button type="button" onClick={() => setShowOther((v) => !v)}
          style={{ background: showOther ? C.ink : "transparent", color: showOther ? C.paper : C.inkSoft, boxShadow: showOther ? "none" : `inset 0 0 0 1.5px ${C.hairline}` }}
          className="h-9 px-3.5 rounded-full text-[13px] font-medium">+ Otras</button>
      </div>
      {showOther && (
        <div className="flex gap-2 mt-2">
          <input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }}
            placeholder="Nombre de la cuenta"
            autoFocus
            style={fieldInputStyle}
            className={fieldInputCls + " flex-1"}
          />
          <button type="button" onClick={addOther} style={{ background: C.ink, color: C.paper, borderRadius: R.md }} className="px-4 text-sm font-semibold">Ok</button>
        </div>
      )}
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

function UsernameField({ profile, setProfile, setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState(profile.username || "");
  const save = async () => {
    const clean = val.trim().toLowerCase().replace(/\s+/g, "");
    setSaving(true); setError("");
    const { error } = await supabase.from("profiles").update({ username: clean || null }).eq("id", profile.id);
    setSaving(false);
    if (error) {
      setError(error.code === "23505" ? "Ese usuario ya está en uso, elige otro." : "No se pudo guardar.");
      return;
    }
    setProfile((p) => ({ ...p, username: clean || null }));
    setInfo("Usuario actualizado. Úsalo junto con tu contraseña para entrar sin escribir tu correo.");
    setEditing(null);
  };
  return (
    <div>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="ej. fernando" style={fieldInputStyle} className={fieldInputCls} />
      <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Sin espacios ni acentos. Debe ser único en el equipo.</p>
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

function PhoneField({ profile, setProfile, setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState(profile.phone || "");
  const save = async () => {
    setSaving(true); setError("");
    const { error } = await supabase.from("profiles").update({ phone: val.trim() }).eq("id", profile.id);
    setSaving(false);
    if (error) { setError("No se pudo guardar."); return; }
    setProfile((p) => ({ ...p, phone: val.trim() }));
    setInfo("WhatsApp actualizado.");
    setEditing(null);
  };
  return (
    <div>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="con lada, ej. 8711234567" style={fieldInputStyle} className={fieldInputCls} />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

function EmailField({ setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState("");
  const save = async () => {
    if (!val.trim() || !val.includes("@")) { setError("Escribe un correo válido."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.auth.updateUser(
      { email: val.trim() },
      { emailRedirectTo: `${window.location.origin}/perfil` }
    );
    setSaving(false);
    if (error) { setError(error.message || "No se pudo actualizar el correo."); return; }
    setInfo("Te enviamos un correo de confirmación a la dirección nueva. Sigue usando tu correo actual para iniciar sesión hasta que confirmes el cambio.");
    setEditing(null);
  };
  return (
    <div>
      <input type="email" value={val} onChange={(e) => setVal(e.target.value)} placeholder="nuevo@correo.com" style={fieldInputStyle} className={fieldInputCls} />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} saveLabel="Enviar confirmación" />
    </div>
  );
}

function PasswordField({ setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const save = async () => {
    if (val.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (val !== confirm) { setError("Las contraseñas no coinciden."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.auth.updateUser({ password: val });
    setSaving(false);
    if (error) { setError(error.message || "No se pudo actualizar la contraseña."); return; }
    setInfo("Contraseña actualizada.");
    setEditing(null);
  };
  return (
    <div>
      <div className="relative mb-2">
        <input type={show ? "text" : "password"} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Nueva contraseña" style={fieldInputStyle} className={fieldInputCls + " pr-9"} />
        <button type="button" onClick={() => setShow((v) => !v)} style={{ color: C.inkSoft }} className="absolute right-2.5 top-1/2 -translate-y-1/2" tabIndex={-1}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirmar contraseña" style={fieldInputStyle} className={fieldInputCls} />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}
