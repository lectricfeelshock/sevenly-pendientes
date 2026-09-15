"use client";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft, Plus, ExternalLink, X, Trash2, Pencil, BookOpen, Play,
  Search, Share2, Copy, Upload, Link2, FileText, FileSpreadsheet, Image as ImageIcon, Users,
} from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", signalSoft: "#E4EFEA",
  urgent: "#B3402B", urgentSoft: "#F6E4DF", spine: "#14181F",
};

// CHANGES.md #2d: bucket "resource-files" — 20 MB por archivo, solo estos
// tipos (confirmado viable: plan Free de Supabase, 1 GB de storage total,
// 0 bytes usados al momento de habilitarlo).
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const FILE_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,image/*,application/pdf";

function normalizeText(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// CHANGES.md #2g: el buscador de Biblioteca solo mira nombre y etiquetas.
function matchesQuery(resource, rawQuery) {
  const q = normalizeText(rawQuery.trim());
  if (!q) return false;
  const haystacks = [resource.title, ...(resource.tags || [])];
  return haystacks.some((h) => normalizeText(h).includes(q));
}

function isNewResource(createdAt) {
  if (!createdAt) return false;
  return new Date(createdAt).toDateString() === new Date().toDateString();
}

function fileKind(fileType) {
  if (!fileType) return "other";
  if (fileType.startsWith("image/")) return "image";
  if (fileType === "application/pdf") return "pdf";
  if (fileType.includes("word")) return "doc";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "xls";
  return "other";
}
function fileIconFor(fileType) {
  const kind = fileKind(fileType);
  if (kind === "image") return ImageIcon;
  if (kind === "xls") return FileSpreadsheet;
  return FileText;
}
function publicFileUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from("resource-files").getPublicUrl(path);
  return data?.publicUrl || null;
}
function fmtFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    return null;
  } catch {
    return null;
  }
}

export default function BibliotecaPage() {
  return (
    <Suspense fallback={<div style={{ background: C.spine, minHeight: "100vh" }} className="w-full" />}>
      <BibliotecaPageInner />
    </Suspense>
  );
}

function BibliotecaPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [resources, setResources] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formIsGeneral, setFormIsGeneral] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [activeTags, setActiveTags] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    const [{ data: res }, { data: profs }] = await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
    ]);
    setResources(res || []);
    setProfiles(profs || []);
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

  // CHANGES.md #2h: al llegar desde la lupa del dashboard con ?open=<id>,
  // abre directo el desglose de ese recurso (una sola vez).
  useEffect(() => {
    if (!ready || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const openId = searchParams.get("open");
    if (!openId) return;
    const r = resources.find((x) => x.id === openId);
    if (r) setSelected(r);
  }, [ready, resources, searchParams]);

  const isAdmin = profile?.role === "admin";
  const generalResources = resources.filter((r) => r.is_general);
  const myResources = resources.filter((r) => !r.is_general);
  const allTags = Array.from(new Set(resources.flatMap((r) => r.tags || []))).sort();
  const byTags = (list) => activeTags.length === 0 ? list : list.filter((r) => (r.tags || []).some((t) => activeTags.includes(t)));
  const searching = query.trim().length > 0;
  const searchResults = searching ? resources.filter((r) => matchesQuery(r, query)) : [];

  const openNewGeneral = () => { setEditing(null); setFormIsGeneral(true); setShowForm(true); };
  const openNewPersonal = () => { setEditing(null); setFormIsGeneral(false); setShowForm(true); };
  const openEdit = (r) => { setEditing(r); setFormIsGeneral(!!r.is_general); setShowForm(true); setSelected(null); };

  const saveResource = async (form) => {
    const fields = {
      title: form.title, description: form.description, tags: form.tags,
      url: form.url, file_path: form.file_path, file_name: form.file_name,
      file_type: form.file_type, file_size: form.file_size,
    };
    if (editing) {
      await supabase.from("resources").update(fields).eq("id", editing.id);
    } else {
      await supabase.from("resources").insert({
        ...fields, created_by: profile.id, owner_id: profile.id, is_general: formIsGeneral,
      });
    }
    setShowForm(false); setEditing(null); load();
  };

  const deleteResource = async (r) => {
    if (r.file_path) await supabase.storage.from("resource-files").remove([r.file_path]);
    await supabase.from("resources").delete().eq("id", r.id);
    setSelected(null); load();
  };

  // CHANGES.md #2f: copia un recurso general a "Mis recursos" de quien lo ve.
  const alreadyCopied = (r) => myResources.some((x) => x.owner_id === profile.id && x.copied_from === r.id);
  const addToMyResources = async (r) => {
    if (alreadyCopied(r)) return;
    await supabase.from("resources").insert({
      title: r.title, description: r.description, tags: r.tags || [],
      url: r.url || null, file_path: r.file_path || null, file_name: r.file_name || null,
      file_type: r.file_type || null, file_size: r.file_size || null,
      created_by: profile.id, owner_id: profile.id, is_general: false, copied_from: r.id,
    });
    load();
  };

  const saveShare = async (ids) => {
    await supabase.from("resources").update({ shared_with: ids }).eq("id", sharing.id);
    setSharing(null); load();
  };

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
        <button onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }} title="Buscar en Biblioteca" style={{ background: C.spine }} className="p-2 flex items-center justify-center">
          <Search size={15} style={{ color: C.paper }} />
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-5">
        {searchOpen && (
          <div style={{ borderColor: C.hairline, background: C.panel }} className="border flex items-center gap-2 px-3 py-2.5 mb-5">
            <Search size={14} style={{ color: C.inkSoft, flexShrink: 0 }} />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca por nombre o etiqueta..." className="text-sm outline-none bg-transparent flex-1" />
            {query && <button onClick={() => setQuery("")}><X size={14} style={{ color: C.inkSoft }} /></button>}
          </div>
        )}

        {searching ? (
          <>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Resultados ({searchResults.length})</div>
            {searchResults.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nada para "{query}".</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {searchResults.map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} onOpen={() => setSelected(r)} />)}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mb-5" style={{ color: C.inkSoft }}>Todo lo que necesitas para crear, en un solo lugar.</p>

            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
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

            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-base">Recursos generales</h2>
                {isAdmin && (
                  <button onClick={openNewGeneral} style={{ background: C.spine, color: C.paper }} className="px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <Plus size={13} /> Agregar recurso
                  </button>
                )}
              </div>
              {generalResources.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Todavía no hay recursos generales{isAdmin ? " — dale a \"Agregar recurso\" para el primero." : "."}</p>}
              {generalResources.length > 0 && byTags(generalResources).length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nada con esas etiquetas todavía.</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {byTags(generalResources).map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} onOpen={() => setSelected(r)} />)}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-base">Mis recursos</h2>
                <button onClick={openNewPersonal} style={{ background: C.spine, color: C.paper }} className="px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <Plus size={13} /> Agregar nuevo recurso
                </button>
              </div>
              <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>Los que tú agregaste, más los que te compartieron.</p>
              {myResources.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Todavía no tienes recursos personales — dale a "Agregar nuevo recurso".</p>}
              {myResources.length > 0 && byTags(myResources).length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nada con esas etiquetas todavía.</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {byTags(myResources).map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} onOpen={() => setSelected(r)} />)}
              </div>
            </section>
          </>
        )}
      </div>

      {selected && (
        <ResourceDetail
          resource={selected}
          profile={profile}
          profiles={profiles}
          isAdmin={isAdmin}
          alreadyCopied={alreadyCopied(selected)}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => deleteResource(selected)}
          onShare={() => { setSharing(selected); setSelected(null); }}
          onAddToMine={() => addToMyResources(selected)}
        />
      )}

      {showForm && (
        <ResourceForm
          initial={editing}
          isGeneral={formIsGeneral}
          ownerId={profile.id}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={saveResource}
        />
      )}

      {sharing && (
        <ShareResourceModal
          resource={sharing}
          profiles={profiles.filter((p) => p.id !== profile.id)}
          onClose={() => setSharing(null)}
          onSave={saveShare}
        />
      )}
    </div>
  );
}

function ResourceCard({ r, profiles, profile, onOpen }) {
  const embed = r.url ? getVideoEmbed(r.url) : null;
  const isImageFile = r.file_path && fileKind(r.file_type) === "image";
  const thumbnail = embed?.thumbnail || (isImageFile ? publicFileUrl(r.file_path) : null);
  const FileIcon = fileIconFor(r.file_type);
  const sharedByOther = !r.is_general && r.owner_id !== profile.id;
  const ownerName = sharedByOther ? profiles.find((p) => p.id === r.owner_id)?.name : null;
  return (
    <button onClick={onOpen} style={{ borderColor: C.hairline, background: C.panel, backgroundImage: thumbnail ? `url(${thumbnail})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} className="relative border p-4 text-left flex flex-col gap-2 aspect-square justify-between hover:brightness-[0.98] overflow-hidden">
      {thumbnail && <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(20,24,31,0.75), rgba(20,24,31,0.15))" }} />}
      <div className="relative flex items-center justify-between">
        {embed ? (
          <span className="flex items-center justify-center rounded-full" style={{ background: C.spine, width: 26, height: 26 }}>
            <Play size={12} style={{ color: C.paper }} fill={C.paper} />
          </span>
        ) : r.file_path ? (
          <FileIcon size={20} style={{ color: thumbnail ? C.paper : C.signal }} />
        ) : (
          <BookOpen size={20} style={{ color: C.signal }} />
        )}
        {isNewResource(r.created_at) && (
          <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.urgentSoft, color: C.urgent, border: `1px solid ${C.urgent}` }}>Nuevo</span>
        )}
      </div>
      <div className="relative">
        <span style={{ color: thumbnail ? C.paper : C.ink, fontFamily: "Georgia, serif" }} className="text-base leading-tight block mb-1">{r.title}</span>
        {ownerName && (
          <span className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: thumbnail ? "rgba(255,255,255,0.85)" : C.inkSoft }}>de {ownerName}</span>
        )}
        {r.tags && r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: thumbnail ? "rgba(255,255,255,0.15)" : C.paper, color: thumbnail ? C.paper : C.inkSoft, border: `1px solid ${thumbnail ? "rgba(255,255,255,0.4)" : C.hairline}` }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function ResourceDetail({ resource, profile, profiles, isAdmin, alreadyCopied, onClose, onEdit, onDelete, onShare, onAddToMine }) {
  const embed = resource.url ? getVideoEmbed(resource.url) : null;
  const FileIcon = fileIconFor(resource.file_type);
  const isImageFile = resource.file_path && fileKind(resource.file_type) === "image";
  const fileUrl = resource.file_path ? publicFileUrl(resource.file_path) : null;
  const isMine = resource.owner_id === profile.id;
  const owner = profiles.find((p) => p.id === resource.owner_id);
  const canManage = resource.is_general ? isAdmin : isMine;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">{resource.title}</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        {!resource.is_general && !isMine && owner && (
          <p className="text-[11px] mb-2 flex items-center gap-1" style={{ color: C.inkSoft }}><Users size={11} /> Compartido por {owner.name}</p>
        )}
        <p className="text-sm mb-3" style={{ color: C.ink }}>{resource.description}</p>
        {resource.tags && resource.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {resource.tags.map((tag) => (
              <span key={tag} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.paper, color: C.inkSoft, border: `1px solid ${C.hairline}` }}>{tag}</span>
            ))}
          </div>
        )}
        {embed && (
          <div className="w-full mb-3" style={{ aspectRatio: "16/9" }}>
            <iframe
              src={embed.embedUrl}
              className="w-full h-full border-0"
              style={{ borderColor: C.hairline }}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}
        {isImageFile && fileUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={resource.title} className="w-full mb-3 object-contain" style={{ maxHeight: 260, background: C.panel, border: `1px solid ${C.hairline}` }} />
        )}
        {resource.url && (
          <a href={resource.url} target="_blank" rel="noopener noreferrer" style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm flex items-center justify-center gap-2 mb-3">
            <ExternalLink size={14} /> Abrir link
          </a>
        )}
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm flex items-center justify-center gap-2 mb-3">
            <FileIcon size={14} /> {resource.file_name || "Abrir archivo"}{resource.file_size ? ` · ${fmtFileSize(resource.file_size)}` : ""}
          </a>
        )}
        <div className="flex gap-3 justify-center flex-wrap">
          {resource.is_general && (
            <button onClick={onAddToMine} disabled={alreadyCopied} className="text-xs flex items-center gap-1 disabled:opacity-40" style={{ color: C.signal }}>
              <Copy size={12} /> {alreadyCopied ? "Ya en mis recursos" : "Añadir a mis recursos"}
            </button>
          )}
          {!resource.is_general && isMine && (
            <button onClick={onShare} className="text-xs flex items-center gap-1" style={{ color: C.signal }}><Share2 size={12} /> Compartir</button>
          )}
          {canManage && (
            <>
              <button onClick={onEdit} className="text-xs flex items-center gap-1" style={{ color: C.inkSoft }}><Pencil size={12} /> Editar</button>
              <button onClick={onDelete} className="text-xs flex items-center gap-1" style={{ color: C.urgent }}><Trash2 size={12} /> Borrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareResourceModal({ resource, profiles, onClose, onSave }) {
  const [selected, setSelected] = useState(resource.shared_with || []);
  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg flex items-center gap-1.5"><Share2 size={16} /> Compartir "{resource.title}"</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>Aparecerá en "Mis recursos" de quien elijas, sin volverse general.</p>
        <div className="flex flex-col gap-1.5 mb-4 max-h-64 overflow-y-auto">
          {profiles.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm px-1 py-1" style={{ color: C.ink }}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
          {profiles.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>No hay más gente en el equipo todavía.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => onSave(selected)} style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ResourceForm({ initial, isGeneral, ownerId, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [inputMode, setInputMode] = useState(initial?.file_path ? "file" : "link");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const clean = tagInput.trim();
    if (!clean) return;
    if (!tags.includes(clean)) setTags([...tags, clean]);
    setTagInput("");
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    setError("");
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_SIZE) { setError(`"${f.name}" pesa más de 20 MB — elige otro archivo.`); e.target.value = ""; setFile(null); return; }
    if (!ALLOWED_MIME_TYPES.includes(f.type)) { setError("Ese tipo de archivo no está permitido. Solo imágenes, PDF, Word o Excel."); e.target.value = ""; setFile(null); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!title.trim()) { setError("Falta el nombre."); return; }
    if (inputMode === "link" && !url.trim()) { setError("Falta el link."); return; }
    if (inputMode === "file" && !file && !initial?.file_path) { setError("Elige un archivo."); return; }
    setSaving(true);
    setError("");
    let fileFields;
    if (inputMode === "link") {
      fileFields = { url: url.trim(), file_path: null, file_name: null, file_type: null, file_size: null };
    } else if (file) {
      const path = `${ownerId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("resource-files").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) { setError(`No se pudo subir el archivo (${upErr.message}).`); setSaving(false); return; }
      fileFields = { url: null, file_path: path, file_name: file.name, file_type: file.type, file_size: file.size };
    } else {
      fileFields = { url: null, file_path: initial.file_path, file_name: initial.file_name, file_type: initial.file_type, file_size: initial.file_size };
    }
    await onSave({ title: title.trim(), description: description.trim(), tags, ...fileFields });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-md border p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">
            {initial ? "Editar recurso" : isGeneral ? "Nuevo recurso general" : "Nuevo recurso personal"}
          </h2>
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
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Link o archivo</label>
            <div className="flex gap-1.5 mt-1 mb-2">
              <button type="button" onClick={() => setInputMode("link")} style={{ borderColor: inputMode === "link" ? C.signal : C.hairline, background: inputMode === "link" ? C.signal : "transparent", color: inputMode === "link" ? "#fff" : C.ink }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5"><Link2 size={12} /> Link</button>
              <button type="button" onClick={() => setInputMode("file")} style={{ borderColor: inputMode === "file" ? C.signal : C.hairline, background: inputMode === "file" ? C.signal : "transparent", color: inputMode === "file" ? "#fff" : C.ink }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5"><Upload size={12} /> Subir archivo</button>
            </div>
            {inputMode === "link" ? (
              <>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm outline-none" />
                <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Los links de YouTube, Google Drive o Vimeo se muestran como video, el resto como link normal.</p>
              </>
            ) : (
              <>
                <input type="file" accept={FILE_ACCEPT} onChange={onPickFile} className="text-sm block" />
                {file ? (
                  <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{file.name} · {fmtFileSize(file.size)}</p>
                ) : initial?.file_path ? (
                  <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Archivo actual: {initial.file_name} — elige uno nuevo para reemplazarlo.</p>
                ) : null}
                <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Imágenes, PDF, Word o Excel. Máximo 20 MB.</p>
              </>
            )}
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
          {error && <p className="text-xs" style={{ color: C.urgent }}>{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ background: C.spine, color: C.paper, opacity: saving ? 0.6 : 1 }} className="px-4 py-2 text-sm">{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
