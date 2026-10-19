"use client";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, ExternalLink, X, Trash2, Pencil, BookOpen, Play,
  Search, Share2, Copy, Upload, Link2, FileText, FileSpreadsheet, Image as ImageIcon, Users, ChevronDown,
} from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import BottomNav from "@/components/BottomNav";
import LoadingScreen from "@/components/LoadingScreen";
import TeamPanel from "@/components/TeamPanel";
import FaqBubble from "@/components/FaqBubble";

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
    <Suspense fallback={<LoadingScreen />}>
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
  const [tasks, setTasks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showTeam, setShowTeam] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [view, setView] = useState("general"); // "general" | "mine"
  const [activeTags, setActiveTags] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [openFilterKey, setOpenFilterKey] = useState(null); // "cuentas" | "etiquetas" | null
  const [query, setQuery] = useState("");
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    const [{ data: res }, { data: profs }, { data: tsk }, { data: accs }] = await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("tasks").select("id, assigned_to_id, status, title, category, deadline"),
      supabase.from("accounts").select("*").order("name"),
    ]);
    setResources(res || []);
    setProfiles(profs || []);
    setTasks(tsk || []);
    setAccounts(accs || []);
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
  // Un recurso publicado sigue apareciendo en "Mis recursos" de quien lo
  // publicó, además de en "Recursos públicos" — solo deja de estar ahí si
  // no es tuyo.
  const myResources = resources.filter((r) => !r.is_general || r.owner_id === profile.id);
  const currentList = view === "general" ? generalResources : myResources;
  const allTags = Array.from(new Set(currentList.flatMap((r) => r.tags || []))).sort();
  const byTags = (list) => activeTags.length === 0 ? list : list.filter((r) => (r.tags || []).some((t) => activeTags.includes(t)));
  const byAccount = (list) => !selectedAccountId ? list : list.filter((r) => r.account_id === selectedAccountId);
  const applyFilters = (list) => byAccount(byTags(list));
  const searching = query.trim().length > 0;
  const searchResults = searching ? resources.filter((r) => matchesQuery(r, query)) : [];

  const changeView = (v) => { setView(v); setActiveTags([]); setSelectedAccountId(null); };
  const toggleTagFilter = (tag) => setActiveTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const openNewResource = () => { setEditing(null); setShowForm(true); };
  const openEdit = (r) => { setEditing(r); setShowForm(true); setSelected(null); };

  const saveResource = async (form, visibility) => {
    const fields = {
      title: form.title, description: form.description, tags: form.tags,
      url: form.url, file_path: form.file_path, file_name: form.file_name,
      file_type: form.file_type, file_size: form.file_size, account_id: form.accountId || null,
    };
    if (editing) {
      await supabase.from("resources").update({ ...fields, is_general: visibility === "public" }).eq("id", editing.id);
    } else {
      await supabase.from("resources").insert({
        ...fields, created_by: profile.id, owner_id: profile.id, is_general: visibility === "public",
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

  if (!ready) return <LoadingScreen />;

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans pb-28 md:pb-10 md:pl-[248px]">
      <div className="px-5 pt-4 pb-1 flex items-center justify-between md:hidden">
        <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: C.inkSoft }}>TERREGAL</div>
      </div>

      <div className="max-w-3xl mx-auto p-5 md:pt-10">
        <div className="flex items-center gap-2.5 mb-5">
          <div style={{ background: C.panel, borderRadius: R.pill, boxShadow: SH.soft }} className="flex-1 min-w-0 h-11 px-4 flex items-center gap-2.5">
            <Search size={16} style={{ color: C.gray, flexShrink: 0 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="text-sm outline-none bg-transparent flex-1 min-w-0" style={{ color: C.ink }} />
            {query && <button onClick={() => setQuery("")} className="flex-shrink-0"><X size={14} style={{ color: C.inkSoft }} /></button>}
          </div>
        </div>

        {!searching && (
          <>
            <h1 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em" }} className="leading-tight mb-1">Biblioteca</h1>
            <p style={{ color: C.inkSoft, fontSize: 14 }} className="mb-5">Todo lo que necesitas para crear, en un solo lugar.</p>
          </>
        )}

        {searching ? (
          <>
            <div className="text-[11.5px] font-bold tracking-[0.09em] mb-3" style={{ color: C.inkSoft }}>RESULTADOS ({searchResults.length})</div>
            {searchResults.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>Nada para "{query}".</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {searchResults.map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} accounts={accounts} onOpen={() => setSelected(r)} />)}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2.5 mb-6">
              <div style={{ background: C.subtle, borderRadius: R.pill }} className="flex gap-1 p-1 flex-shrink-0">
                <button
                  onClick={() => changeView("general")}
                  style={view === "general" ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                  className="h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap"
                >
                  Recursos públicos
                </button>
                <button
                  onClick={() => changeView("mine")}
                  style={view === "mine" ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                  className="h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap"
                >
                  Mis recursos
                </button>
              </div>

              <span style={{ width: 1, height: 20, background: C.hairline, flexShrink: 0 }} />

              <div className="relative">
                <button type="button" onClick={() => setOpenFilterKey((k) => k === "cuentas" ? null : "cuentas")}
                  style={selectedAccountId ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
                  className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
                  {selectedAccountId ? accounts.find((a) => a.id === selectedAccountId)?.name : "Cuentas"}
                  <ChevronDown size={13} style={{ transform: openFilterKey === "cuentas" ? "rotate(180deg)" : "none" }} />
                </button>
                {openFilterKey === "cuentas" && (
                  <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5 max-h-72 overflow-y-auto">
                    <button onClick={() => { setSelectedAccountId(null); setOpenFilterKey(null); }}
                      style={{ color: !selectedAccountId ? C.signal : C.ink }}
                      className="w-full text-left px-3.5 py-2 text-sm">Todas</button>
                    {accounts.map((a) => (
                      <button key={a.id} onClick={() => { setSelectedAccountId(a.id); setOpenFilterKey(null); }}
                        style={{ color: selectedAccountId === a.id ? C.signal : C.ink }}
                        className="w-full text-left px-3.5 py-2 text-sm">{a.name}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button type="button" onClick={() => setOpenFilterKey((k) => k === "etiquetas" ? null : "etiquetas")}
                  style={activeTags.length > 0 ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
                  className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
                  Etiquetas{activeTags.length > 0 ? ` (${activeTags.length})` : ""}
                  <ChevronDown size={13} style={{ transform: openFilterKey === "etiquetas" ? "rotate(180deg)" : "none" }} />
                </button>
                {openFilterKey === "etiquetas" && (
                  <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[200px] py-1.5 max-h-72 overflow-y-auto">
                    {allTags.length === 0 && <p className="px-3.5 py-2 text-xs" style={{ color: C.inkSoft }}>No hay etiquetas todavía.</p>}
                    {allTags.map((tag) => (
                      <label key={tag} className="w-full flex items-center gap-2 px-3.5 py-2 text-sm cursor-pointer" style={{ color: C.ink }}>
                        <input type="checkbox" checked={activeTags.includes(tag)} onChange={() => toggleTagFilter(tag)} />
                        {tag}
                      </label>
                    ))}
                    {activeTags.length > 0 && (
                      <>
                        <div style={{ background: C.hairlineSoft }} className="h-px my-1 mx-1" />
                        <button onClick={() => { setActiveTags([]); setOpenFilterKey(null); }} style={{ color: C.inkSoft }} className="w-full text-left px-3.5 py-2 text-sm">Quitar selección</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {view === "general" ? (
              <section>
                {generalResources.length === 0 && <p className="text-sm mb-3" style={{ color: C.inkSoft }}>Todavía no hay recursos públicos — dale a "Agregar recurso" para el primero.</p>}
                {generalResources.length > 0 && applyFilters(generalResources).length === 0 && <p className="text-sm mb-3" style={{ color: C.inkSoft }}>Nada con esos filtros todavía.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {applyFilters(generalResources).map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} accounts={accounts} onOpen={() => setSelected(r)} />)}
                  <button onClick={openNewResource} style={{ background: C.subtle, color: C.inkSoft, borderRadius: R.xxl, borderColor: C.hairline }} className="aspect-[4/3] flex flex-col items-center justify-center gap-2 border-2 border-dashed">
                    <Plus size={20} />
                    <span className="text-xs font-medium">Agregar recurso</span>
                  </button>
                </div>
              </section>
            ) : (
              <section>
                <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>Los que tú agregaste, más los que te compartieron.</p>
                {myResources.length === 0 && <p className="text-sm mb-3" style={{ color: C.inkSoft }}>Todavía no tienes recursos personales — dale a "Agregar recurso".</p>}
                {myResources.length > 0 && applyFilters(myResources).length === 0 && <p className="text-sm mb-3" style={{ color: C.inkSoft }}>Nada con esos filtros todavía.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {applyFilters(myResources).map((r) => <ResourceCard key={r.id} r={r} profiles={profiles} profile={profile} accounts={accounts} onOpen={() => setSelected(r)} />)}
                  <button onClick={openNewResource} style={{ background: C.subtle, color: C.inkSoft, borderRadius: R.xxl, borderColor: C.hairline }} className="aspect-[4/3] flex flex-col items-center justify-center gap-2 border-2 border-dashed">
                    <Plus size={20} />
                    <span className="text-xs font-medium">Agregar recurso</span>
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <BottomNav active="biblioteca" profile={profile} onEquipo={() => setShowTeam(true)} />
      <FaqBubble profile={profile} onDismiss={(iso) => setProfile((p) => ({ ...p, faq_bubble_dismissed_at: iso }))} />

      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={profiles.filter((p) => p.role !== "admin")} tasks={tasks} />}

      {selected && (
        <ResourceDetail
          resource={selected}
          profile={profile}
          profiles={profiles}
          accounts={accounts}
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
          accounts={accounts.filter((a) => (profile.account_ids || []).includes(a.id))}
          ownerId={profile.id}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={saveResource}
        />
      )}

      {sharing && (
        <ShareResourceModal
          resource={sharing}
          profiles={profiles.filter((p) => p.id !== profile.id && p.role !== "admin")}
          onClose={() => setSharing(null)}
          onSave={saveShare}
        />
      )}
    </div>
  );
}

function ResourceCard({ r, profiles, profile, accounts, onOpen }) {
  const embed = r.url ? getVideoEmbed(r.url) : null;
  const isImageFile = r.file_path && fileKind(r.file_type) === "image";
  const thumbnail = embed?.thumbnail || (isImageFile ? publicFileUrl(r.file_path) : null);
  const FileIcon = fileIconFor(r.file_type);
  const sharedByOther = !r.is_general && r.owner_id !== profile.id;
  const ownerName = sharedByOther ? profiles.find((p) => p.id === r.owner_id)?.name : null;
  const publishedByMe = r.is_general && r.owner_id === profile.id;
  const account = accounts.find((a) => a.id === r.account_id);
  return (
    <button
      onClick={onOpen}
      style={{ borderRadius: R.xxl, background: C.panel, boxShadow: SH.card, backgroundImage: thumbnail ? `url(${thumbnail})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
      className="relative p-4 text-left flex flex-col gap-2 aspect-[4/3] justify-between hover:brightness-[0.98] overflow-hidden"
    >
      {thumbnail && <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(27,30,36,0.75), rgba(27,30,36,0.15))" }} />}
      <div className="relative flex items-center justify-between">
        {embed ? (
          <span className="flex items-center justify-center rounded-full" style={{ background: C.ink, width: 28, height: 28 }}>
            <Play size={12} style={{ color: C.paper }} fill={C.paper} />
          </span>
        ) : r.file_path ? (
          <span style={{ width: 36, height: 36, borderRadius: 13, background: thumbnail ? "rgba(255,255,255,0.18)" : C.signalSoft, color: thumbnail ? C.paper : C.signal }} className="flex items-center justify-center">
            <FileIcon size={18} />
          </span>
        ) : account ? (
          <span style={{ width: 36, height: 36, borderRadius: 13, background: thumbnail ? "rgba(255,255,255,0.18)" : C.signalSoft, color: thumbnail ? C.paper : C.signal }} className="flex items-center justify-center text-sm font-bold">
            {account.name.trim().charAt(0).toUpperCase()}
          </span>
        ) : (
          <span style={{ width: 36, height: 36, borderRadius: 13, background: thumbnail ? "rgba(255,255,255,0.18)" : C.signalSoft, color: thumbnail ? C.paper : C.signal }} className="flex items-center justify-center">
            <BookOpen size={18} />
          </span>
        )}
        {isNewResource(r.created_at) && (
          <span style={{ background: C.urgentSoft, color: C.urgentInk, borderRadius: R.pill, fontWeight: 700 }} className="text-[10px] px-2 py-0.5">Nuevo</span>
        )}
      </div>
      <div className="relative">
        <span style={{ color: thumbnail ? C.paper : C.ink, fontFamily: FONT_SERIF, fontSize: 17 }} className="leading-tight block mb-1.5">{r.title}</span>
        {ownerName && (
          <span style={{ color: thumbnail ? "rgba(255,255,255,0.85)" : C.inkSoft, fontSize: 10.5, fontWeight: 600 }} className="block mb-1">de {ownerName}</span>
        )}
        {publishedByMe && (
          <span style={{ color: thumbnail ? "rgba(255,255,255,0.85)" : C.signal, fontSize: 10.5, fontWeight: 600 }} className="block mb-1">Público</span>
        )}
        {r.tags && r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ background: thumbnail ? "rgba(255,255,255,0.18)" : C.subtle, color: thumbnail ? C.paper : C.inkMedium, borderRadius: R.pill, fontWeight: 600 }} className="text-[9px] px-1.5 py-[1px]">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function ResourceDetail({ resource, profile, profiles, accounts, isAdmin, alreadyCopied, onClose, onEdit, onDelete, onShare, onAddToMine }) {
  const embed = resource.url ? getVideoEmbed(resource.url) : null;
  const FileIcon = fileIconFor(resource.file_type);
  const isImageFile = resource.file_path && fileKind(resource.file_type) === "image";
  const fileUrl = resource.file_path ? publicFileUrl(resource.file_path) : null;
  const isMine = resource.owner_id === profile.id;
  const owner = profiles.find((p) => p.id === resource.owner_id);
  const canManage = resource.is_general ? isAdmin : isMine;
  const accountName = accounts.find((a) => a.id === resource.account_id)?.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.55)" }} onClick={onClose}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4 flex items-start justify-between gap-3">
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500 }} className="leading-tight">{resource.title}</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center flex-shrink-0"><X size={15} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {!resource.is_general && !isMine && owner && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: C.inkSoft }}><Users size={11} /> Compartido por {owner.name}</p>
          )}
          {resource.description && <p className="text-sm whitespace-pre-wrap" style={{ color: C.ink }}>{resource.description}</p>}
          {accountName && (
            <span style={{ background: C.signalSoft, color: C.signal, borderRadius: R.pill, fontWeight: 600 }} className="self-start text-[11px] px-2.5 py-1">{accountName}</span>
          )}
          {resource.tags && resource.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {resource.tags.map((tag) => (
                <span key={tag} className="text-[9px] font-semibold px-1.5 py-[1px]" style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.pill }}>{tag}</span>
              ))}
            </div>
          )}
          {embed && (
            <div className="w-full" style={{ aspectRatio: "16/9", borderRadius: R.lg, overflow: "hidden" }}>
              <iframe
                src={embed.embedUrl}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          )}
          {isImageFile && fileUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={resource.title} className="w-full object-contain" style={{ maxHeight: 260, background: C.paper, borderRadius: R.lg }} />
          )}
          {resource.url && (
            <a href={resource.url} target="_blank" rel="noopener noreferrer" style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
              <ExternalLink size={14} /> Abrir link
            </a>
          )}
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
              <FileIcon size={14} /> {resource.file_name || "Abrir archivo"}{resource.file_size ? ` · ${fmtFileSize(resource.file_size)}` : ""}
            </a>
          )}
          <div className="flex gap-4 justify-center flex-wrap pt-1">
            {resource.is_general && !isMine && (
              <button onClick={onAddToMine} disabled={alreadyCopied} className="text-xs font-semibold flex items-center gap-1 disabled:opacity-40" style={{ color: C.signal }}>
                <Copy size={12} /> {alreadyCopied ? "Ya en mis recursos" : "Añadir a mis recursos"}
              </button>
            )}
            {!resource.is_general && isMine && (
              <button onClick={onShare} className="text-xs font-semibold flex items-center gap-1" style={{ color: C.signal }}><Share2 size={12} /> Compartir</button>
            )}
            {canManage && (
              <>
                <button onClick={onEdit} className="text-xs font-semibold flex items-center gap-1" style={{ color: C.inkSoft }}><Pencil size={12} /> Editar</button>
                <button onClick={onDelete} className="text-xs font-semibold flex items-center gap-1" style={{ color: C.urgent }}><Trash2 size={12} /> Borrar</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareResourceModal({ resource, profiles, onClose, onSave }) {
  const [selected, setSelected] = useState(resource.shared_with || []);
  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.55)" }} onClick={onClose}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4 flex items-center justify-between gap-3">
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500 }} className="flex items-center gap-1.5"><Share2 size={16} /> Compartir "{resource.title}"</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center flex-shrink-0"><X size={15} /></button>
        </div>
        <div className="p-5">
          <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>Aparecerá en "Mis recursos" de quien elijas, sin volverse general.</p>
          <div style={{ background: C.paper, borderRadius: R.md }} className="flex flex-col gap-0.5 mb-4 max-h-64 overflow-y-auto p-2">
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm px-1.5 py-1.5 rounded-md" style={{ color: C.ink }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
            {profiles.length === 0 && <p className="text-xs px-1.5 py-1" style={{ color: C.inkSoft }}>No hay más gente en el equipo todavía.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Cancelar</button>
            <button onClick={() => onSave(selected)} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceForm({ initial, accounts, ownerId, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [accountId, setAccountId] = useState(initial?.account_id || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [inputMode, setInputMode] = useState(initial?.file_path ? "file" : "link");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState(null); // "private" | "public" | null

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

  const requestSave = (visibility) => {
    if (!title.trim()) { setError("Falta el nombre."); return; }
    setError("");
    setPendingVisibility(visibility);
  };

  const confirmSave = async () => {
    setSaving(true);
    setError("");
    let fileFields;
    if (inputMode === "link") {
      fileFields = { url: url.trim() || null, file_path: null, file_name: null, file_type: null, file_size: null };
    } else if (file) {
      const path = `${ownerId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("resource-files").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) { setError(`No se pudo subir el archivo (${upErr.message}).`); setSaving(false); setPendingVisibility(null); return; }
      fileFields = { url: null, file_path: path, file_name: file.name, file_type: file.type, file_size: file.size };
    } else {
      fileFields = { url: null, file_path: initial?.file_path || null, file_name: initial?.file_name || null, file_type: initial?.file_type || null, file_size: initial?.file_size || null };
    }
    await onSave({ title: title.trim(), description: description.trim(), tags, accountId: accountId || null, ...fileFields }, pendingVisibility);
    setSaving(false);
    setPendingVisibility(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.55)" }}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div style={{ boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4 flex items-center justify-between gap-3">
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500 }}>
            {initial ? "Editar recurso" : "Nuevo recurso"}
          </h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center flex-shrink-0"><X size={15} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Nombre (ej. "Stock")</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" />
          </div>
          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder='Ej. "Aquí podrás encontrar fotos y videos de stock"' style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none resize-y" />
          </div>

          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Link o archivo (opcional)</label>
            <div style={{ background: C.subtle, borderRadius: R.pill }} className="flex gap-1 p-1 mt-1.5 mb-2">
              <button type="button" onClick={() => setInputMode("link")}
                style={inputMode === "link" ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                className="flex-1 h-9 rounded-full text-[12.5px] flex items-center justify-center gap-1.5"><Link2 size={12} /> Link</button>
              <button type="button" onClick={() => setInputMode("file")}
                style={inputMode === "file" ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                className="flex-1 h-9 rounded-full text-[12.5px] flex items-center justify-center gap-1.5"><Upload size={12} /> Subir archivo</button>
            </div>
            {inputMode === "link" ? (
              <>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm outline-none" />
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
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Cuenta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none">
              <option value="">Sin cuenta</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Etiquetas</label>
            <div className="flex gap-2 mt-1.5">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Ej. video, fotos, plantillas..."
                style={{ background: C.paper, borderRadius: R.md }}
                className="flex-1 px-3.5 py-2.5 text-sm outline-none"
              />
              <button type="button" onClick={addTag} style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.md }} className="px-4 text-sm font-semibold">Agregar</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span key={t} style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.pill, fontWeight: 600 }} className="px-2.5 py-1 text-xs flex items-center gap-1">
                    {t}
                    <button type="button" onClick={() => removeTag(t)}><X size={11} style={{ color: C.inkSoft }} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs" style={{ color: C.urgent }}>{error}</p>}
        </div>
        <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="px-5 py-4 flex justify-end gap-2 flex-wrap">
          <button onClick={onClose} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Cancelar</button>
          <button onClick={() => requestSave("private")} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Guardar para mí</button>
          <button onClick={() => requestSave("public")} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Publicar</button>
        </div>
      </div>

      {pendingVisibility && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.6)" }} onClick={() => !saving && setPendingVisibility(null)}>
          <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500 }} className="mb-2">
              {pendingVisibility === "private" ? "¿Guardar solo para ti?" : "¿Publicar este recurso?"}
            </h3>
            <p className="text-sm mb-4" style={{ color: C.inkMedium }}>
              {pendingVisibility === "private"
                ? "Este recurso solo lo podrás ver tú, posteriormente podrás compartirlo con tus compañeros."
                : "Este recurso pasará a estar público y cualquiera podrá verlo."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingVisibility(null)} disabled={saving} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-4 py-2 text-sm font-semibold disabled:opacity-60">Cancelar</button>
              <button onClick={confirmSave} disabled={saving} style={{ background: C.ink, color: C.paper, opacity: saving ? 0.6 : 1, borderRadius: R.pill }} className="px-4 py-2 text-sm font-semibold">{saving ? "Guardando..." : "Seguir"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
