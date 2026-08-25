"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", urgent: "#B3402B", spine: "#14181F",
};

export default function PerfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(null); // "name" | "username" | "phone" | "email" | "password" | null
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setReady(true);
    })();
  }, [router]);

  const startEdit = (field) => { setEditing(field); setError(""); setInfo(""); };
  const cancelEdit = () => { setEditing(null); setError(""); };

  if (!ready || !profile) {
    return <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex items-center justify-center"><p style={{ color: C.inkSoft }} className="text-sm">Cargando...</p></div>;
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans">
      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-3.5 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} style={{ color: C.inkSoft }}><ArrowLeft size={18} /></button>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.inkSoft }}>Sevenly</div>
          <h1 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-xl leading-tight">Mi perfil</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-3">
        <ProfileRow label="Nombre" value={profile.name} editing={editing === "name"}
          onEdit={() => startEdit("name")} onCancel={cancelEdit}>
          <NameField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
        </ProfileRow>

        <ProfileRow label="Usuario" value={profile.username || "— no configurado —"} editing={editing === "username"}
          onEdit={() => startEdit("username")} onCancel={cancelEdit}>
          <UsernameField profile={profile} setProfile={setProfile} setInfo={setInfo} setError={setError} setEditing={setEditing} saving={saving} setSaving={setSaving} />
        </ProfileRow>

        <ProfileRow label="WhatsApp" value={profile.phone || "— no configurado —"} editing={editing === "phone"}
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

        {error && <div className="text-xs mt-1" style={{ color: C.urgent }}>{error}</div>}
        {info && <div className="text-xs mt-1" style={{ color: C.signal }}>{info}</div>}
      </div>
    </div>
  );
}

function ProfileRow({ label, value, editing, onEdit, onCancel, children }) {
  return (
    <div style={{ borderColor: C.hairline, background: C.panel }} className="border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>{label}</div>
          {!editing && <div className="text-sm mt-0.5 truncate" style={{ color: C.ink }}>{value}</div>}
        </div>
        {!editing && (
          <button onClick={onEdit} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-1.5 text-xs shrink-0">Cambiar</button>
        )}
      </div>
      {editing && <div className="mt-3">{children}</div>}
    </div>
  );
}

function FieldActions({ onSave, onCancel, saving, saveLabel = "Guardar" }) {
  return (
    <div className="flex gap-2 mt-2">
      <button onClick={onCancel} style={{ color: C.inkSoft }} className="px-3 py-1.5 text-xs">Cancelar</button>
      <button onClick={onSave} disabled={saving} style={{ background: C.spine, color: C.paper }} className="px-3 py-1.5 text-xs disabled:opacity-60">
        {saving ? "Guardando..." : saveLabel}
      </button>
    </div>
  );
}

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
      <input value={val} onChange={(e) => setVal(e.target.value)} style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 text-sm outline-none" />
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
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="ej. fernando" style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 text-sm outline-none" />
      <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Sin espacios ni acentos. Debe ser único en el equipo.</p>
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
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="con lada, ej. 8711234567" style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 text-sm outline-none" />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}

function EmailField({ setInfo, setError, setEditing, saving, setSaving }) {
  const [val, setVal] = useState("");
  const save = async () => {
    if (!val.trim() || !val.includes("@")) { setError("Escribe un correo válido."); return; }
    setSaving(true); setError("");
    const { error } = await supabase.auth.updateUser({ email: val.trim() });
    setSaving(false);
    if (error) { setError(error.message || "No se pudo actualizar el correo."); return; }
    setInfo("Te enviamos un correo de confirmación a la dirección nueva. Sigue usando tu correo actual para iniciar sesión hasta que confirmes el cambio.");
    setEditing(null);
  };
  return (
    <div>
      <input type="email" value={val} onChange={(e) => setVal(e.target.value)} placeholder="nuevo@correo.com" style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 text-sm outline-none" />
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
        <input type={show ? "text" : "password"} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Nueva contraseña" style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 pr-9 text-sm outline-none" />
        <button type="button" onClick={() => setShow((v) => !v)} style={{ color: C.inkSoft }} className="absolute right-2.5 top-1/2 -translate-y-1/2" tabIndex={-1}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirmar contraseña" style={{ borderColor: C.hairline, background: C.paper }} className="w-full border px-3 py-2 text-sm outline-none" />
      <FieldActions onSave={save} onCancel={() => setEditing(null)} saving={saving} />
    </div>
  );
}
