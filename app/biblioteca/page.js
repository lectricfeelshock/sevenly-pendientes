"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Plus, ExternalLink, X, Trash2, Pencil, BookOpen, Tag, Play, Gamepad2 } from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", urgent: "#B3402B", urgentSoft: "#F6E4DF", spine: "#14181F",
};

function isNewResource(createdAt) {
  if (!createdAt) return false;
  return new Date(createdAt).toDateString() === new Date().toDateString();
}

function getVideoEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
      let id = null;
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2];
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
      else id = u.searchParams.get("v");
      if (!id) return null;
      return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}`, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
    }

    if (host === "drive.google.com") {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = match ? match[1] : u.searchParams.get("id");
      if (!id) return null;
      return { type: "drive", embedUrl: `https://drive.google.com/file/d/${id}/preview`, thumbnail: null };
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const match = u.pathname.match(/(\d+)/);
      if (!match) return null;
      return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${match[1]}`, thumbnail: null };
    }

    if (host === "figma.com") {
      return { type: "figma", embedUrl: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(u.toString())}`, thumbnail: null };
    }

    return null;
  } catch {
    return null;
  }
}

export default function BibliotecaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [resources, setResources] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeTags, setActiveTags] = useState([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("resources").select("*").order("created_at", { ascending: false });
    setResources(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(prof);
      await load();
      setReady(true);
    })();
  }, [router, load]);

  useEffect(() => {
    const channel = supabase.channel("resources-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "resources" }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load]);

  const isAdmin = profile?.role === "admin";
  const allTags = Array.from(new Set(resources.flatMap((r) => r.tags || []))).sort();
  const filteredResources = activeTags.length === 0 ? resources : resources.filter((r) => (r.tags || []).some((t) => activeTags.includes(t)));

  const saveResource = async (form) => {
    if (editing) {
      await supabase.from("resources").update({ title: form.title, description: form.description, url: form.url, tags: form.tags }).eq("id", editing.id);
    } else {
      await supabase.from("resources").insert({ title: form.title, description: form.description, url: form.url, tags: form.tags, created_by: profile.id });
    }
    setShowForm(false); setEditing(null); load();
  };
  const deleteResource = async (id) => { await supabase.from("resources").delete().eq("id", id); setSelected(null); load(); };

  if (!ready) return <div style={{ background: C.spine, minHeight: "100vh" }} className="w-full" />;

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans">
      <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b sticky top-0 z-20 px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}><ArrowLeft size={18} style={{ color: C.inkSoft }} /></button>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase flex items-center gap-1" style={{ color: C.inkSoft }}><BookOpen size={11} /> Sevenly</div>
            <h1 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-xl leading-tight">Biblioteca</h1>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ background: C.spine, color: C.paper }} className="px-3.5 py-2 text-sm flex items-center gap-1.5">
            <Plus size={15} /> Agregar recurso
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-5">
        <p className="text-sm mb-5" style={{ color: C.inkSoft }}>
          Todo lo que necesitas para crear, en un solo lugar.
        </p>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            <button
              onClick={() => setActiveTags([])}
              style={{ borderColor: activeTags.length === 0 ? C.spine : C.hairline, background: activeTags.length === 0 ? C.spine : "transparent", color: activeTags.length === 0 ? C.paper : C.inkSoft }}
              className="border px-2.5 py-1.5 text-xs whitespace-nowrap"
            >
              Todas
            </button>
            {allTags.map((tag) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTags((prev) => active ? prev.filter((t) => t !== tag) : [...prev, tag])}
                  style={{ borderColor: active ? C.spine : C.hairline, background: active ? C.spine : "transparent", color: active ? C.paper : C.inkSoft }}
                  className="border px-2.5 py-1.5 text-xs whitespace-nowrap"
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        {resources.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Todavía no hay recursos agregados{isAdmin ? " — dale a \"Agregar recurso\" para el primero." : "."}</p>}
        {resources.length > 0 && filteredResources.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nada con esas etiquetas todavía.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredResources.map((r) => {
            const embed = getVideoEmbed(r.url);
            return (
              <button key={r.id} onClick={() => setSelected(r)} style={{ borderColor: C.hairline, background: C.panel, backgroundImage: embed?.thumbnail ? `url(${embed.thumbnail})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} className="relative border p-4 text-left flex flex-col gap-2 aspect-square justify-between hover:brightness-[0.98] overflow-hidden">
                {embed?.thumbnail && <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,24,31,0.75), rgba(20,24,31,0.15))" }} />}
                <div className="relative flex items-center justify-between">
                  {embed?.type === "figma" ? (
                    <span className="flex items-center justify-center rounded-full" style={{ background: C.spine, width: 26, height: 26 }}>
                      <Gamepad2 size={13} style={{ color: C.paper }} />
                    </span>
                  ) : embed ? (
                    <span className="flex items-center justify-center rounded-full" style={{ background: C.spine, width: 26, height: 26 }}>
                      <Play size={12} style={{ color: C.paper }} fill={C.paper} />
                    </span>
                  ) : (
                    <BookOpen size={20} style={{ color: embed?.thumbnail ? C.paper : C.signal }} />
                  )}
                  {isNewResource(r.created_at) && (
                    <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.urgentSoft, color: C.urgent, border: `1px solid ${C.urgent}` }}>Nuevo</span>
                  )}
                </div>
                <div className="relative">
                  <span style={{ color: embed?.thumbnail ? C.paper : C.ink, fontFamily: "Georgia, serif" }} className="text-base leading-tight block mb-1.5">{r.title}</span>
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: embed?.thumbnail ? "rgba(255,255,255,0.15)" : C.paper, color: embed?.thumbnail ? C.paper : C.inkSoft, border: `1px solid ${embed?.thumbnail ? "rgba(255,255,255,0.4)" : C.hairline}` }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }} onClick={() => setSelected(null)}>
          <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">{selected.title}</h2>
              <button onClick={() => setSelected(null)}><X size={18} style={{ color: C.inkSoft }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: C.ink }}>{selected.description}</p>
            {selected.tags && selected.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-4">
                {selected.tags.map((tag) => (
                  <span key={tag} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.paper, color: C.inkSoft, border: `1px solid ${C.hairline}` }}>{tag}</span>
                ))}
              </div>
            )}
            {(() => {
              const embed = getVideoEmbed(selected.url);
              if (!embed) return null;
              return (
                <div className="w-full mb-3" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={embed.embedUrl}
                    className="w-full h-full border-0"
                    style={{ borderColor: C.hairline }}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                </div>
              );
            })()}
            <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm flex items-center justify-center gap-2 mb-3">
              <ExternalLink size={14} /> Abrir link
            </a>
            {isAdmin && (
              <div className="flex gap-3 justify-center">
                <button onClick={() => { setEditing(selected); setShowForm(true); setSelected(null); }} className="text-xs flex items-center gap-1" style={{ color: C.inkSoft }}><Pencil size={12} /> Editar</button>
                <button onClick={() => deleteResource(selected.id)} className="text-xs flex items-center gap-1" style={{ color: C.urgent }}><Trash2 size={12} /> Borrar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && <ResourceForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveResource} />}
    </div>
  );
}

function ResourceForm({ initial, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const clean = tagInput.trim();
    if (!clean) return;
    if (!tags.includes(clean)) setTags([...tags, clean]);
    setTagInput("");
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));

  const submit = () => {
    if (!title.trim() || !url.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), url: url.trim(), tags });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-md border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">{initial ? "Editar recurso" : "Nuevo recurso"}</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Nombre (ej. "Stock")</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder='Ej. "Aquí podrás encontrar fotos y videos de stock"' style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Link (SharePoint/OneDrive/YouTube/Drive/Vimeo/Figma)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
            <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Los links de YouTube, Google Drive o Vimeo se muestran como video, un link de Figma (ej. un prototipo del emulador de la app) se muestra embebido y navegable, el resto como link normal.</p>
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Etiquetas</label>
            <div className="flex gap-2 mt-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Ej. video, fotos, plantillas..."
                style={{ borderColor: C.hairline, background: C.panel }}
                className="flex-1 border px-3 py-2 text-sm outline-none"
              />
              <button type="button" onClick={addTag} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm">Agregar</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span key={t} style={{ background: C.paper, borderColor: C.hairline, color: C.ink }} className="border px-2 py-1 text-xs flex items-center gap-1">
                    {t}
                    <button type="button" onClick={() => removeTag(t)}><X size={11} style={{ color: C.inkSoft }} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm">Guardar</button>
        </div>
      </div>
    </div>
  );
}
