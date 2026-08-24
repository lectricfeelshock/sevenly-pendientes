"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Eye, EyeOff } from "lucide-react";

const C = { paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B", hairline: "#DCD6C8", urgent: "#B3402B", spine: "#14181F" };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "register") {
        if (!name.trim()) throw new Error("Escribe tu nombre.");
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim(), phone: phone.trim() } },
        });
        if (signUpError) throw signUpError;
        setInfo("Cuenta creada. Revisa tu correo para confirmar tu cuenta y luego inicia sesión.");
        setMode("login");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace("/dashboard");
      }
    } catch (e) {
      setError(e.message || "Algo salió mal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: C.spine, minHeight: "100vh" }} className="w-full flex items-center justify-center p-6">
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border p-8">
        <div style={{ color: C.inkSoft }} className="font-mono text-[11px] tracking-[0.2em] uppercase mb-1">Sevenly · Acceso</div>
        <h1 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-2xl mb-5">
          {mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
        </h1>

        <div className="flex flex-col gap-3 mb-3">
          {mode === "register" && (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={{ borderColor: C.hairline, background: C.panel }} className="border px-3 py-2 text-sm outline-none" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu celular (con lada)" style={{ borderColor: C.hairline, background: C.panel }} className="border px-3 py-2 text-sm outline-none" />
            </>
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" style={{ borderColor: C.hairline, background: C.panel }} className="border px-3 py-2 text-sm outline-none" />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Contraseña"
              style={{ borderColor: C.hairline, background: C.panel }}
              className="w-full border px-3 py-2 pr-9 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{ color: C.inkSoft }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && <div className="text-xs mb-3" style={{ color: C.urgent }}>{error}</div>}
        {info && <div className="text-xs mb-3" style={{ color: "#0F6E5C" }}>{info}</div>}

        <button onClick={submit} disabled={loading} style={{ background: C.spine, color: C.paper }} className="w-full px-4 py-2 text-sm mb-3 disabled:opacity-60">
          {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setInfo(""); }}
          className="text-xs underline"
          style={{ color: C.inkSoft }}
        >
          {mode === "login" ? "Aún no tengo cuenta — crear una" : "Ya tengo cuenta — iniciar sesión"}
        </button>
      </div>
    </div>
  );
}
