"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Eye, EyeOff } from "lucide-react";
import { C, R } from "@/lib/theme";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState(""); // usuario o correo, solo para login
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
        if (!email.trim() || !email.includes("@")) throw new Error("Escribe un correo válido.");
        if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim(), phone: phone.trim() } },
        });
        if (signUpError) throw signUpError;
        if (signUpData?.session) {
          // La verificación de correo está desactivada → ya quedó logueado, entra directo.
          router.replace("/dashboard");
          return;
        }
        setInfo("Cuenta creada. Revisa tu correo para confirmar tu cuenta y luego inicia sesión.");
        setMode("login");
      } else {
        const raw = identifier.trim();
        if (!raw) throw new Error("Escribe tu usuario o tu correo.");

        let loginEmail = raw;
        if (!raw.includes("@")) {
          // No es un correo → lo tratamos como username y buscamos su correo
          const { data: foundEmail, error: rpcError } = await supabase.rpc("email_for_username", { uname: raw });
          if (rpcError) throw rpcError;
          if (!foundEmail) throw new Error("No encontramos ese usuario.");
          loginEmail = foundEmail;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
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

  const field = (label, children) => (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>{label}</div>
      {children}
    </div>
  );

  const inputCls = "h-[50px] rounded-[14px] px-[15px] text-[15px] outline-none w-full";
  const inputStyle = { background: C.paper, color: C.ink };

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm flex flex-col items-center">

        <div className="flex flex-col items-center gap-3 mb-[30px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Terregal" className="w-[230px]" />
          <div style={{ fontSize: 14.5, color: C.inkSoft }} className="text-center">Los pendientes del equipo, en orden.</div>
        </div>

        <div
          style={{ background: C.panel, borderRadius: R.xxl, boxShadow: "0 1px 2px rgba(27,30,36,0.04), 0 14px 34px rgba(27,30,36,0.07)" }}
          className="w-full p-[22px] flex flex-col gap-4"
        >
          {mode === "register" && (
            <>
              {field("TU NOMBRE", (
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required style={inputStyle} className={inputCls} />
              ))}
              {field("WHATSAPP", (
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu celular (con lada)" style={inputStyle} className={inputCls} />
              ))}
              {field("CORREO", (
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" required style={inputStyle} className={inputCls} />
              ))}
            </>
          )}
          {mode === "login" && field("USUARIO O CORREO", (
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="fer" style={inputStyle} className={inputCls} />
          ))}

          {field("CONTRASEÑA", (
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••••"
                required
                style={inputStyle}
                className={inputCls + " pr-10"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ color: C.gray }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          ))}

          {error && <div className="text-xs" style={{ color: C.urgent }}>{error}</div>}
          {info && <div className="text-xs" style={{ color: C.signal }}>{info}</div>}

          <button
            onClick={submit}
            disabled={loading}
            style={{ background: C.ink, color: C.paper, borderRadius: R.md, boxShadow: "0 8px 18px rgba(27,30,36,0.20)" }}
            className="h-[52px] text-[15.5px] font-semibold mt-1 disabled:opacity-60"
          >
            {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </div>

        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setInfo(""); }}
          className="text-sm mt-[22px]"
        >
          <span style={{ color: C.inkSoft }}>{mode === "login" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}</span>{" "}
          <span style={{ color: C.signal, fontWeight: 600 }}>{mode === "login" ? "Crear una" : "Iniciar sesión"}</span>
        </button>

        <div style={{ color: "#B6B2A8", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.14em" }} className="mt-10">
          TERREGAL · CONTROL DE TAREAS
        </div>
      </div>
    </div>
  );
}
