"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChevronRight, Eye, EyeOff, LogOut, Download } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import BottomNav from "@/components/BottomNav";

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
  const [editing, setEditing] = useState(null); // "name" | "username" | "phone" | "email" | "password" | null
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState([]);

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

  const startEdit = (field) => { setEditing(field); setError(""); setInfo(""); };
  const cancelEdit = () => { setEditing(null); setError(""); };
  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (!ready || !profile) {
    return <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex items-center justify-center"><p style={{ color: C.inkSoft }} className="text-sm">Cargando...</p></div>;
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
  const maxDayCount = Math.max(1, ...days.map((d) => d.count));

  const downloadLog = () => {
    const lines = [
      `Pendientes finalizados por ${profile.name}`, `Total histórico: ${log.length}`, "",
      ...log.map((l) => `[${new Date(l.delivered_at || l.finalized_at).toLocaleString("es-MX")}] ${l.task_title}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `finalizados_${profile.name.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click(); URL.revokeObjectURL(url);
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

          <button
            onClick={logout}
            style={{ background: C.panel, color: C.urgentInk, borderRadius: R.xl, boxShadow: SH.soft }}
            className="h-[52px] flex items-center justify-center gap-2 text-[14.5px] font-semibold mt-1"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>

          <div style={{ background: C.panel, borderRadius: R.xl, boxShadow: SH.card }} className="p-[18px] flex flex-col gap-4 mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold tracking-[0.11em]" style={{ color: C.inkSoft }}>MI ACTIVIDAD</span>
              <span className="text-[12.5px] font-semibold" style={{ color: C.inkSoft }}>Últimos 7 días</span>
            </div>
            <div style={{ background: C.signalSoft, color: C.signal, borderRadius: R.md }} className="px-3.5 py-3 text-[13.5px] leading-snug">
              Hoy: <strong>{todayCount}</strong> finalizado(s). {activityMsg(todayCount)}
            </div>
            <div className="flex items-end gap-2.5 h-16">
              {days.map((d) => (
                <div key={d.iso} className="flex-1 flex flex-col items-center gap-1.5">
                  <div style={{ width: "100%", height: Math.max(8, (d.count / maxDayCount) * 42), borderRadius: 7, background: d.count > 0 ? "#CFE3DA" : "#EDEAE3" }} />
                  <span className="text-[10.5px] capitalize" style={{ color: C.gray, fontWeight: d.isToday ? 700 : 400 }}>{d.isToday ? "hoy" : d.label}</span>
                </div>
              ))}
            </div>
            <button onClick={downloadLog} disabled={log.length === 0}
              style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.pill }}
              className="h-10 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              <Download size={14} /> Descargar mi lista de finalizados
            </button>
          </div>
        </div>
      </div>

      <BottomNav active="perfil" profile={profile} />
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
