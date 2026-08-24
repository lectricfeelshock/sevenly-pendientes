"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, Bell, MessageSquare, ArrowRightLeft, X, Search, Flag,
  ChevronRight, ChevronDown, Trash2, CheckCircle2, Circle,
  PauseCircle, PlayCircle, Send, LogOut, History, Mail, Users,
  User, TrendingUp, BookOpen,
} from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", signalSoft: "#E4EFEA",
  amber: "#B8791F", urgent: "#B3402B", urgentSoft: "#F6E4DF", gray: "#8A8D95", spine: "#14181F",
};

const STATUSES = ["No iniciado", "En progreso", "Detenido", "Terminado y entregado"];
const STATUS_ICON = { "No iniciado": Circle, "En progreso": PlayCircle, "Detenido": PauseCircle, "Terminado y entregado": CheckCircle2 };
const URGENCIES = [
  { label: "Baja", color: C.gray }, { label: "Media", color: C.signal },
  { label: "Alta", color: C.amber }, { label: "Urgente", color: C.urgent },
];
const DEFAULT_CATEGORIES = ["General", "Diseño", "Cliente", "Administrativo"];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
function daysUntil(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((dt - now) / 86400000);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function activityMsg(n) {
  if (!n) return "Aún no completas pendientes hoy.";
  if (n <= 2) return "Vas bien.";
  if (n <= 5) return "¡Bien hecho, buen ritmo!";
  return "Ha estado pesado hoy — tómate un respiro.";
}

function UrgencyFlag({ urgency }) {
  const u = URGENCIES.find((x) => x.label === urgency) || URGENCIES[0];
  return <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: u.color }}><Flag size={12} fill={u.color} strokeWidth={0} />{u.label}</span>;
}
function DeadlineBadge({ deadline, done }) {
  const d = daysUntil(deadline);
  let color = C.inkSoft, label = fmtDate(deadline);
  if (!done && d !== null) {
    if (d < 0) { color = C.urgent; label = `${fmtDate(deadline)} · vencido`; }
    else if (d === 0) { color = C.urgent; label = `${fmtDate(deadline)} · hoy`; }
    else if (d <= 2) { color = C.amber; label = `${fmtDate(deadline)} · ${d}d`; }
  }
  return <span className="font-mono text-[11px]" style={{ color }}>{label}</span>;
}

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showTeam, setShowTeam] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [onlyMine, setOnlyMine] = useState(true);

  const loadAll = useCallback(async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: p } = await supabase.from("profiles").select("*");
    setTasks(t || []);
    setProfiles(p || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(prof);
      await loadAll();
      setReady(true);
    })();
  }, [router, loadAll]);

  useEffect(() => {
    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  const addHistory = async (taskId, text) => {
    await supabase.from("task_history").insert({ task_id: taskId, text });
  };

  const createTask = async (form) => {
    const assignee = profiles.find((p) => p.id === form.assignedToId);
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description, category: form.category,
      requested_by: form.requestedBy, deadline: form.deadline || null, urgency: form.urgency,
      assigned_to_id: form.assignedToId, assigned_to_name: assignee ? assignee.name : "",
      created_by: profile.id,
    }).select().single();
    if (!error && data) await addHistory(data.id, `Creado por ${profile.name}`);
    setShowNew(false);
    loadAll();
  };

  const updateTask = async (task, patch, historyNote) => {
    const payload = { ...patch };
    if (patch.status === "Terminado y entregado" && task.status !== "Terminado y entregado") {
      payload.completed_at = new Date().toISOString();
      payload.completed_by = profile.id;
    }
    await supabase.from("tasks").update(payload).eq("id", task.id);
    if (historyNote) await addHistory(task.id, historyNote);
    loadAll();
  };

  const deleteTask = async (id) => { await supabase.from("tasks").delete().eq("id", id); setSelected(null); loadAll(); };

  if (!ready) return <div style={{ background: C.spine, minHeight: "100vh" }} className="w-full" />;

  const filtered = tasks.filter((t) => {
    if (onlyMine && t.assigned_to_id !== profile.id) return false;
    if (statusFilter !== "Todos" && t.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!t.title.toLowerCase().includes(s) && !t.requested_by.toLowerCase().includes(s) && !t.assigned_to_name.toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const byCategory = {};
  filtered.forEach((t) => { (byCategory[t.category] = byCategory[t.category] || []).push(t); });
  Object.values(byCategory).forEach((arr) => arr.sort((a, b) => {
    const aDone = a.status === "Terminado y entregado" ? 1 : 0, bDone = b.status === "Terminado y entregado" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity, bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return ad - bd;
  }));

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans">
      <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b sticky top-0 z-20 px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: C.inkSoft }}>Sevenly</div>
          <h1 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-xl leading-tight">Panel de pendientes</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNew(true)} style={{ background: C.spine, color: C.paper }} className="px-3.5 py-2 text-sm flex items-center gap-1.5"><Plus size={15} /> Nuevo</button>
          <button onClick={() => router.push("/biblioteca")} className="flex items-center gap-1.5 text-sm" style={{ color: C.ink }}><BookOpen size={15} style={{ color: C.inkSoft }} /> Biblioteca</button>
          <button onClick={() => setShowTeam(true)} className="flex items-center gap-1.5 text-sm" style={{ color: C.ink }}><Users size={15} style={{ color: C.inkSoft }} /> Equipo</button>
          <button onClick={() => setShowActivity(true)} className="flex items-center gap-1.5 text-sm" style={{ color: C.ink }}><User size={14} style={{ color: C.inkSoft }} /> {profile.name}</button>
          <button onClick={logout} title="Cerrar sesión"><LogOut size={15} style={{ color: C.inkSoft }} /></button>
        </div>
      </div>

      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-2.5 flex flex-wrap items-center gap-2">
        <div style={{ borderColor: C.hairline, background: C.panel }} className="flex items-center gap-1.5 border px-2.5 py-1.5 flex-1 min-w-[160px] max-w-xs">
          <Search size={13} style={{ color: C.inkSoft }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="text-sm outline-none bg-transparent flex-1" />
        </div>
        {["Todos", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ borderColor: statusFilter === s ? C.spine : C.hairline, background: statusFilter === s ? C.spine : "transparent", color: statusFilter === s ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap">{s}</button>
        ))}
        <button onClick={() => setOnlyMine((v) => !v)}
          style={{ borderColor: onlyMine ? C.spine : C.hairline, background: onlyMine ? C.spine : "transparent", color: onlyMine ? C.paper : C.inkSoft }}
          className="border px-2.5 py-1.5 text-xs whitespace-nowrap">Solo lo mío</button>
      </div>

      <div className="max-w-3xl mx-auto pb-16">
        {Object.keys(byCategory).length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat} className="mt-6">
            <div style={{ borderColor: C.hairline }} className="flex items-center gap-2 px-5 pb-1.5 border-b-2">
              <span style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-base">{cat}</span>
              <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{items.length}</span>
            </div>
            <div style={{ borderColor: C.hairline }} className="border-x">
              {items.map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelected(t)} />)}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewTaskForm onClose={() => setShowNew(false)} onCreate={createTask} profiles={profiles} profile={profile} />}
      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} onUpdate={updateTask} onDelete={deleteTask} profiles={profiles} profile={profile} />}
      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={profiles} tasks={tasks} />}
      {showActivity && <ActivityPanel onClose={() => setShowActivity(false)} profile={profile} tasks={tasks} />}
    </div>
  );
}

function TaskRow({ task, onOpen }) {
  const Icon = STATUS_ICON[task.status];
  const isDone = task.status === "Terminado y entregado";
  const d = daysUntil(task.deadline);
  const soon = !isDone && d !== null && d <= 2;
  return (
    <button onClick={onOpen} style={{ borderColor: C.hairline, background: soon ? C.urgentSoft : C.panel }} className="w-full text-left border-b px-4 py-3 flex items-center gap-3">
      <Icon size={16} style={{ color: isDone ? C.signal : C.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ color: C.ink, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }} className="text-sm font-medium truncate">{task.title}</span>
          {(task.remind_me || task.remind_assignee) && <Bell size={11} style={{ color: C.amber, flexShrink: 0 }} />}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <UrgencyFlag urgency={task.urgency} />
          <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>solicita {task.requested_by}</span>
          <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>→ {task.assigned_to_name}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0"><DeadlineBadge deadline={task.deadline} done={isDone} /></div>
      <ChevronRight size={15} style={{ color: C.inkSoft, flexShrink: 0 }} />
    </button>
  );
}

function NewTaskForm({ onClose, onCreate, profiles, profile }) {
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]), [newCategory, setNewCategory] = useState("");
  const [requestedBy, setRequestedBy] = useState(profile.name), [deadline, setDeadline] = useState("");
  const [urgency, setUrgency] = useState("Media"), [assignedToId, setAssignedToId] = useState(profile.id);

  const submit = () => {
    if (!title.trim() || !assignedToId) return;
    onCreate({ title, description, category: newCategory.trim() || category, requestedBy, deadline, urgency, assignedToId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-lg border max-h-[90vh] overflow-y-auto">
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">Nuevo pendiente</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>...o nueva</label>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Solicita</label>
              <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Asignar a</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
              </select></div>
          </div>
        </div>
        <div style={{ borderColor: C.hairline }} className="border-t px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} style={{ background: C.spine, color: C.paper }} className="px-4 py-2 text-sm">Crear pendiente</button>
        </div>
      </div>
    </div>
  );
}

function TaskDetail({ task, onClose, onUpdate, onDelete, profiles, profile }) {
  const [comment, setComment] = useState(""), [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]), [showHistory, setShowHistory] = useState(false);
  const [delegateId, setDelegateId] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const assignee = profiles.find((p) => p.id === task.assigned_to_id);

  const loadExtras = useCallback(async () => {
    const { data: c } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at");
    const { data: h } = await supabase.from("task_history").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
    setComments(c || []); setHistory(h || []);
  }, [task.id]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  const setStatus = (s) => onUpdate(task, { status: s, ...(s === "Terminado y entregado" ? { checked_done: false } : {}) }, `${profile.name} cambió el estado a "${s}"`);
  const addComment = async () => {
    if (!comment.trim()) return;
    await supabase.from("task_comments").insert({ task_id: task.id, author_id: profile.id, author_name: profile.name, text: comment.trim() });
    await onUpdate(task, {}, `${profile.name} agregó un comentario`);
    setComment(""); loadExtras();
  };
  const delegate = async () => {
    const p = profiles.find((x) => x.id === delegateId);
    if (!p) return;
    await onUpdate(task, { assigned_to_id: p.id, assigned_to_name: p.name }, `${profile.name} delegó a ${p.name}`);
    setDelegateId("");
  };
  const sendReminderEmail = async () => {
    if (!assignee) return;
    const subject = encodeURIComponent(`Recordatorio: ${task.title}`);
    const body = encodeURIComponent(`Hola ${assignee.name},\n\nRecordatorio del pendiente "${task.title}" (${task.category}).\nDeadline: ${fmtDate(task.deadline)}\nEstado: ${task.status}\n\nDe parte de ${profile.name}, panel Sevenly.`);
    window.open(`mailto:${assignee.email || ""}?subject=${subject}&body=${body}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por correo a ${assignee.name}`);
  };
  const sendReminderWhatsapp = async () => {
    if (!assignee || !assignee.phone) return;
    const text = encodeURIComponent(`Hola ${assignee.name}, recordatorio: "${task.title}" (${task.category}). Deadline: ${fmtDate(task.deadline)}. Estado: ${task.status}. — ${profile.name}, Sevenly`);
    window.open(`https://wa.me/${assignee.phone}?text=${text}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por WhatsApp a ${assignee.name}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: "rgba(20,24,31,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper }} className="w-full max-w-md h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b px-5 py-4 sticky top-0 flex items-start justify-between gap-3">
          <div><div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>{task.category}</div>
            <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg leading-tight">{task.title}</h2></div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {task.description && <p style={{ color: C.ink }} className="text-sm leading-relaxed">{task.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Solicita</div><div style={{ color: C.ink }}>{task.requested_by}</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Asignado a</div><div style={{ color: C.ink }}>{task.assigned_to_name}</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Solicitud</div><div style={{ color: C.ink }}>{fmtDate(task.request_date)}</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Deadline</div><DeadlineBadge deadline={task.deadline} done={task.status === "Terminado y entregado"} /></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Urgencia</div><UrgencyFlag urgency={task.urgency} /></div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Estado</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => { const Icon = STATUS_ICON[s]; const active = task.status === s;
                return <button key={s} onClick={() => setStatus(s)} style={{ borderColor: active ? C.spine : C.hairline, background: active ? C.spine : "transparent", color: active ? C.paper : C.inkSoft }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5"><Icon size={13} /> {s}</button>; })}
            </div>
          </div>
          {task.status === "Terminado y entregado" && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.ink }}>
              <input type="checkbox" checked={!!task.checked_done} onChange={(e) => onUpdate(task, { checked_done: e.target.checked }, `${profile.name} ${e.target.checked ? "revisó y cerró" : "reabrió"} el pendiente`)} />
              Revisado y cerrado (checklist final)
            </label>
          )}
          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Delegar</div>
            <div className="flex gap-2">
              <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none">
                <option value="">Elegir persona...</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={delegate} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-1"><ArrowRightLeft size={14} /> Delegar</button>
            </div>
          </div>
          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Recordatorios</div>
            <div className="flex flex-col gap-1.5 text-sm mb-3" style={{ color: C.ink }}>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!task.remind_me} onChange={(e) => onUpdate(task, { remind_me: e.target.checked })} /> Avisarme cuando se acerque el deadline</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!task.remind_assignee} onChange={(e) => onUpdate(task, { remind_assignee: e.target.checked })} /> Resaltar para el asignado</label>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={sendReminderEmail} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center"><Mail size={14} /> Enviar recordatorio por correo</button>
              <button onClick={sendReminderWhatsapp} disabled={!assignee?.phone} style={{ borderColor: C.signal, color: assignee?.phone ? C.signal : C.gray }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center disabled:cursor-not-allowed"><Send size={14} /> {assignee?.phone ? "Recordar por WhatsApp" : "Sin celular registrado"}</button>
            </div>
          </div>
          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: C.inkSoft }}><MessageSquare size={12} /> Comentarios</div>
            <div className="flex flex-col gap-2 mb-3 max-h-52 overflow-y-auto">
              {comments.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>Sin comentarios todavía.</div>}
              {comments.map((c) => (
                <div key={c.id} style={{ background: C.panel, borderColor: C.hairline }} className="border px-3 py-2">
                  <div className="flex items-center justify-between mb-0.5"><span className="text-xs font-medium" style={{ color: C.ink }}>{c.author_name}</span>
                    <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(c.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                  <div className="text-sm" style={{ color: C.ink }}>{c.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Agregar link, avance o lo que falta..." style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none" />
              <button onClick={addComment} style={{ background: C.spine, color: C.paper }} className="px-3 py-2"><Send size={14} /></button>
            </div>
          </div>
          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-sm" style={{ color: C.ink }}>
              <History size={14} /> Historial <ChevronDown size={13} style={{ color: C.inkSoft, transform: showHistory ? "rotate(180deg)" : "none" }} />
            </button>
            {showHistory && (
              <div className="mt-2.5 flex flex-col gap-1.5 border-l-2 pl-3" style={{ borderColor: C.hairline }}>
                {history.map((h) => (
                  <div key={h.id} className="text-xs">
                    <div style={{ color: C.ink }}>{h.text}</div>
                    <div className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(h.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs flex items-center gap-1.5 mt-1 self-start" style={{ color: C.urgent }}><Trash2 size={13} /> Eliminar pendiente</button>
          ) : (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>¿Eliminar? No se puede deshacer.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmDelete(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={() => onDelete(task.id)} style={{ background: C.urgent, color: "#fff" }} className="text-xs px-2.5 py-1">Sí, eliminar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ onClose, profiles, tasks }) {
  const [picked, setPicked] = useState(null);
  const today = todayISO();
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: "rgba(20,24,31,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper }} className="w-full max-w-sm h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b px-5 py-4 sticky top-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-lg" style={{ color: C.ink, fontFamily: "Georgia, serif" }}><Users size={17} /> Equipo</div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-4 flex flex-col gap-1.5">
          {profiles.map((p) => {
            const inProgress = tasks.filter((t) => t.assigned_to_id === p.id && t.status === "En progreso");
            const doneToday = tasks.filter((t) => t.completed_by === p.id && t.completed_at && t.completed_at.slice(0, 10) === today).length;
            const open = picked === p.id;
            return (
              <div key={p.id}>
                <button onClick={() => setPicked(open ? null : p.id)} style={{ borderColor: C.hairline, background: open ? C.panel : "transparent" }} className="w-full text-left border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-sm" style={{ color: C.ink }}>{p.name}</span>
                  <span className="flex items-center gap-2"><span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{inProgress.length} en progreso</span><ChevronDown size={13} style={{ color: C.inkSoft, transform: open ? "rotate(180deg)" : "none" }} /></span>
                </button>
                {open && (
                  <div style={{ borderColor: C.hairline }} className="border-l-2 ml-3 pl-3 mt-1.5 mb-2 flex flex-col gap-2">
                    <div style={{ background: C.signalSoft, color: C.signal }} className="px-2.5 py-1.5 text-xs w-fit">{doneToday} completado(s) hoy</div>
                    {inProgress.map((t) => <div key={t.id} className="text-xs"><div style={{ color: C.ink }}>{t.title}</div><div className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{t.category} · deadline {fmtDate(t.deadline)}</div></div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({ onClose, profile, tasks }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const iso = dt.toISOString().slice(0, 10);
    const count = tasks.filter((t) => t.completed_by === profile.id && t.completed_at && t.completed_at.slice(0, 10) === iso).length;
    return { iso, label: dt.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }), count };
  });
  const todayCount = days[0].count;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4" style={{ background: "rgba(20,24,31,0.35)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="border w-full max-w-xs mt-14 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.ink }}><TrendingUp size={14} /> Mi actividad</div>
          <button onClick={onClose}><X size={15} style={{ color: C.inkSoft }} /></button>
        </div>
        <div style={{ background: C.signalSoft, color: C.signal }} className="px-3 py-2 text-sm mb-3">Hoy: <strong>{todayCount}</strong> completado(s). {activityMsg(todayCount)}</div>
        <div className="flex flex-col gap-1">
          {days.map((d) => <div key={d.iso} className="flex items-center justify-between text-xs"><span style={{ color: C.inkSoft }} className="capitalize">{d.label}</span><span style={{ color: C.ink }} className="font-mono">{d.count}</span></div>)}
        </div>
      </div>
    </div>
  );
}
