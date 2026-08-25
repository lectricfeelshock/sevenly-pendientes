"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, Bell, MessageSquare, ArrowRightLeft, X, Search, Flag,
  ChevronRight, ChevronDown, Trash2, CheckCircle2, Circle,
  PauseCircle, PlayCircle, Send, LogOut, History, Mail, Users,
  User, TrendingUp, BookOpen, Download, Lock, CheckCheck, BellRing,
} from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", signalSoft: "#E4EFEA",
  amber: "#B8791F", amberSoft: "#F5EBDA", urgent: "#B3402B", urgentSoft: "#F6E4DF",
  gray: "#8A8D95", spine: "#14181F",
};

// Estados que puede elegir la persona ASIGNADA
const ASSIGNEE_STATUSES = ["No iniciado", "En progreso", "Detenido", "Entregado"];
const STATUS_ICON = {
  "No iniciado": Circle, "En progreso": PlayCircle, "Detenido": PauseCircle,
  "Entregado": CheckCircle2, "Finalizado": CheckCheck,
};
const URGENCIES = [
  { label: "Baja", color: C.gray, rank: 0 }, { label: "Media", color: C.signal, rank: 1 },
  { label: "Alta", color: C.amber, rank: 2 }, { label: "Urgente", color: C.urgent, rank: 3 },
];
const DEFAULT_CATEGORIES = ["Video", "Diseño", "Guiones", "Briefs"];
const DONE_STATUSES = ["Entregado", "Finalizado"];

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
function urgencyRank(u) { return (URGENCIES.find((x) => x.label === u) || URGENCIES[0]).rank; }

function dueLegend(deadline, status) {
  if (!deadline || DONE_STATUSES.includes(status)) return null;
  const d = daysUntil(deadline);
  if (d === null) return null;
  const dt = new Date(deadline + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today.getDay() === 5 && dt.getDay() === 1 && d === 3) return { text: "Es el lunes", color: C.amber };
  if (d < 0) return { text: "Vencido", color: C.urgent };
  if (d === 0) return { text: "¡Se entrega hoy!", color: C.urgent };
  if (d === 1) return { text: "Es mañana", color: C.urgent };
  if (d === 2) return { text: "Faltan 2 días", color: C.amber };
  if (d === 3) return { text: "Faltan 3 días", color: C.amber };
  return { text: "Todo chill, aún falta", color: C.inkSoft };
}

function activityMsg(n) {
  if (!n) return "Aún no finalizas pendientes hoy.";
  if (n <= 2) return "Vas bien.";
  if (n <= 5) return "¡Bien hecho, buen ritmo!";
  return "Ha estado pesado hoy — tómate un respiro.";
}

function UrgencyFlag({ urgency }) {
  const u = URGENCIES.find((x) => x.label === urgency) || URGENCIES[0];
  return <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: u.color }}><Flag size={12} fill={u.color} strokeWidth={0} />{u.label}</span>;
}
function DeadlineBadge({ deadline, status }) {
  const legend = dueLegend(deadline, status);
  return (
    <div className="text-right">
      <div className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{fmtDate(deadline)}</div>
      {legend && <div className="font-mono text-[9px] uppercase tracking-wide" style={{ color: legend.color }}>{legend.text}</div>}
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showTeam, setShowTeam] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [primaryTab, setPrimaryTab] = useState("mine"); // requests | mine | all
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: p } = await supabase.from("profiles").select("*");
    setTasks(t || []);
    setProfiles(p || []);
  }, []);

  const loadNotifications = useCallback(async (userId) => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    setNotifications(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(prof);
      await loadAll();
      await loadNotifications(prof.id);
      setReady(true);
    })();
  }, [router, loadAll, loadNotifications]);

  useEffect(() => {
    const channel = supabase.channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel("notif-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => loadNotifications(profile.id))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, loadNotifications]);

  // Revisa deadlines próximos y dispara notificación de "avisarme" una sola vez por tarea
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const candidates = tasks.filter((t) => t.remind_me_by && !t.remind_me_notified && !DONE_STATUSES.includes(t.status) && t.deadline);
      for (const t of candidates) {
        const d = daysUntil(t.deadline);
        if (d !== null && d <= 2) {
          await supabase.from("notifications").insert({ user_id: t.remind_me_by, task_id: t.id, message: `Se acerca el deadline de "${t.title}" (${fmtDate(t.deadline)})` });
          await supabase.from("tasks").update({ remind_me_notified: true }).eq("id", t.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasks]);

  useEffect(() => {
    if (!ready || !profile) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPushSupported(false); return; }
    setPushSupported(true);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
      } catch (e) { /* silencioso */ }
    })();
  }, [ready, profile]);

  const enablePush = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { alert("No diste permiso de notificaciones — puedes activarlo luego desde la configuración del navegador."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert({
        user_id: profile.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: "endpoint" });
      setPushEnabled(true);
    } catch (e) {
      alert("No se pudo activar. Si estás en iPhone, primero agrega la app a tu pantalla de inicio y ábrela desde ahí.");
    }
  };

  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };
  const addHistory = async (taskId, text) => { await supabase.from("task_history").insert({ task_id: taskId, text }); };
  const notify = async (userId, taskId, message) => {
    await supabase.from("notifications").insert({ user_id: userId, task_id: taskId, message });
    fetch("/api/send-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, title: "Sevenly", body: message, url: "/dashboard" }) }).catch(() => {});
  };

  const createTask = async (form) => {
    const assignee = profiles.find((p) => p.id === form.assignedToId);
    const requester = profiles.find((p) => p.id === form.requestedById);
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description, category: form.category,
      requested_by: requester ? requester.name : "", requested_by_id: form.requestedById,
      deadline: form.deadline || null, urgency: form.urgency,
      assigned_to_id: form.assignedToId, assigned_to_name: assignee ? assignee.name : "",
      created_by: profile.id,
    }).select().single();
    if (!error && data) {
      await addHistory(data.id, `Creado por ${profile.name}`);
      if (data.request_date && data.deadline && data.request_date === data.deadline) {
        await addHistory(data.id, `⚠️ Pendiente "de hoy para hoy" — se solicitó y se necesita entregar el mismo día`);
      }
      if (assignee && assignee.id !== profile.id) await notify(assignee.id, data.id, `Te asignaron "${data.title}"`);
    }
    setShowNew(false);
    loadAll();
  };

  const refreshSelected = async (id) => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks(t || []);
    const fresh = (t || []).find((x) => x.id === id);
    if (fresh) setSelected(fresh);
  };

  const updateTask = async (task, patch, historyNote) => {
    await supabase.from("tasks").update(patch).eq("id", task.id);
    if (historyNote) await addHistory(task.id, historyNote);
    await refreshSelected(task.id);
  };

  const finalizeTask = async (task) => {
    await supabase.from("tasks").update({ status: "Finalizado" }).eq("id", task.id);
    await addHistory(task.id, `${profile.name} finalizó el pendiente`);
    await supabase.from("finalized_log").insert({ user_id: task.assigned_to_id, task_title: task.title });
    await refreshSelected(task.id);
  };

  const deliverTask = async (task) => {
    await supabase.from("tasks").update({ status: "Entregado" }).eq("id", task.id);
    await addHistory(task.id, `${profile.name} marcó como entregado`);
    await refreshSelected(task.id);
  };

  const deleteTask = async (id) => { await supabase.from("tasks").delete().eq("id", id); setSelected(null); loadAll(); };

  const markNotifsRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unread);
    loadNotifications(profile.id);
  };

  if (!ready) return <div style={{ background: C.spine, minHeight: "100vh" }} className="w-full" />;

  let base = tasks;
  if (primaryTab === "requests") base = tasks.filter((t) => t.requested_by_id === profile.id);
  else if (primaryTab === "mine") base = tasks.filter((t) => t.assigned_to_id === profile.id);

  const filtered = base.filter((t) => {
    if (statusFilter !== "Todos" && t.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!t.title.toLowerCase().includes(s) && !(t.requested_by || "").toLowerCase().includes(s) && !t.assigned_to_name.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const byUrgency = {};
  filtered.forEach((t) => { (byUrgency[t.urgency] = byUrgency[t.urgency] || []).push(t); });
  const urgencyOrder = ["Urgente", "Alta", "Media", "Baja"];
  Object.values(byUrgency).forEach((arr) => arr.sort((a, b) => {
    const aDone = DONE_STATUSES.includes(a.status) ? 1 : 0, bDone = DONE_STATUSES.includes(b.status) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity, bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return ad - bd;
  }));

  const unreadCount = notifications.filter((n) => !n.read).length;
  const bellLabel = unreadCount === 0 ? null : unreadCount > 3 ? "+3" : String(unreadCount);

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
          <button onClick={() => { setShowNotifs(true); markNotifsRead(); }} className="relative">
            <Bell size={17} style={{ color: C.inkSoft }} />
            {bellLabel && <span style={{ background: C.urgent, color: "#fff" }} className="absolute -top-1.5 -right-2 text-[9px] font-mono px-1 py-0.5 leading-none rounded-full">{bellLabel}</span>}
          </button>
          <button onClick={logout} title="Cerrar sesión"><LogOut size={15} style={{ color: C.inkSoft }} /></button>
        </div>
      </div>

      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-2.5 flex flex-wrap items-center gap-2">
        {[["requests", "Mis solicitudes"], ["mine", "Mis pendientes"], ["all", "Todos"]].map(([key, label]) => (
          <button key={key} onClick={() => setPrimaryTab(key)}
            style={{ borderColor: primaryTab === key ? C.signal : C.hairline, background: primaryTab === key ? C.signal : "transparent", color: primaryTab === key ? "#fff" : C.ink }}
            className="border-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap">{label}</button>
        ))}
      </div>

      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-2.5 flex flex-wrap items-center gap-2">
        <div style={{ borderColor: C.hairline, background: C.panel }} className="flex items-center gap-1.5 border px-2.5 py-1.5 flex-1 min-w-[160px] max-w-xs">
          <Search size={13} style={{ color: C.inkSoft }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="text-sm outline-none bg-transparent flex-1" />
        </div>
        {["Todos", ...ASSIGNEE_STATUSES, "Finalizado"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ borderColor: statusFilter === s ? C.spine : C.hairline, background: statusFilter === s ? C.spine : "transparent", color: statusFilter === s ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap">{s}</button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto pb-16">
        {Object.keys(byUrgency).length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
        {urgencyOrder.filter((u) => byUrgency[u]?.length).map((u) => {
          const uInfo = URGENCIES.find((x) => x.label === u);
          return (
            <div key={u} className="mt-6">
              <div style={{ borderColor: uInfo.color }} className="flex items-center gap-2 px-5 pb-1.5 border-b-2">
                <Flag size={14} fill={uInfo.color} strokeWidth={0} style={{ color: uInfo.color }} />
                <span style={{ color: uInfo.color, fontFamily: "Georgia, serif" }} className="text-base uppercase tracking-wide">{u}</span>
                <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{byUrgency[u].length}</span>
              </div>
              <div style={{ borderColor: C.hairline }} className="border-x">
                {byUrgency[u].map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelected(t)} />)}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewTaskForm onClose={() => setShowNew(false)} onCreate={createTask} profiles={profiles} profile={profile} />}
      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} onUpdate={updateTask} onDelete={deleteTask} onFinalize={finalizeTask} onDeliver={deliverTask} profiles={profiles} profile={profile} notify={notify} />}
      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={profiles} tasks={tasks} />}
      {showActivity && <ActivityPanel onClose={() => setShowActivity(false)} profile={profile} />}
      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} notifications={notifications} onOpenTask={(taskId) => { const t = tasks.find((x) => x.id === taskId); if (t) setSelected(t); setShowNotifs(false); }} pushSupported={pushSupported} pushEnabled={pushEnabled} onEnablePush={enablePush} />}
    </div>
  );
}

function TaskRow({ task, onOpen }) {
  const Icon = STATUS_ICON[task.status];
  const isDone = DONE_STATUSES.includes(task.status);
  const urgent = task.urgency === "Urgente" && !isDone;
  const sameDay = task.request_date && task.deadline && task.request_date === task.deadline;
  return (
    <button onClick={onOpen} style={{ borderColor: C.hairline, background: urgent ? C.urgentSoft : C.panel }} className="w-full text-left border-b px-4 py-3 flex items-center gap-3">
      <Icon size={16} style={{ color: isDone ? C.signal : C.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.paper, color: C.inkSoft, border: `1px solid ${C.hairline}` }}>{task.category}</span>
          <span style={{ color: C.ink, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }} className="text-sm font-medium truncate">{task.title}</span>
          {sameDay && <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 flex items-center gap-1" style={{ background: C.urgentSoft, color: C.urgent, border: `1px solid ${C.urgent}` }}>De hoy para hoy 💀</span>}
          {Array.from({ length: task.remind_assignee_count || 0 }).map((_, i) => <Bell key={i} size={11} style={{ color: C.amber, flexShrink: 0 }} />)}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>solicita {task.requested_by}</span>
          <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>→ {task.assigned_to_name}</span>
        </div>
      </div>
      <DeadlineBadge deadline={task.deadline} status={task.status} />
      <ChevronRight size={15} style={{ color: C.inkSoft, flexShrink: 0 }} />
    </button>
  );
}

function NewTaskForm({ onClose, onCreate, profiles, profile }) {
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]), [newCategory, setNewCategory] = useState("");
  const [requestedById, setRequestedById] = useState(profile.id), [deadline, setDeadline] = useState("");
  const [urgency, setUrgency] = useState("Media"), [assignedToId, setAssignedToId] = useState(profile.id);

  const submit = () => {
    if (!title.trim() || !assignedToId || !requestedById) return;
    onCreate({ title, description, category: newCategory.trim() || category, requestedById, deadline, urgency, assignedToId });
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
              <select value={requestedById} onChange={(e) => setRequestedById(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
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

function TaskDetail({ task, onClose, onUpdate, onDelete, onFinalize, onDeliver, profiles, profile, notify }) {
  const [comment, setComment] = useState(""), [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]), [showHistory, setShowHistory] = useState(false);
  const [delegateId, setDelegateId] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const assignee = profiles.find((p) => p.id === task.assigned_to_id);

  const isAssignee = task.assigned_to_id === profile.id;
  const isRequester = task.requested_by_id === profile.id;
  const isFinalized = task.status === "Finalizado";
  const isDelivered = task.status === "Entregado";

  const loadExtras = useCallback(async () => {
    const { data: c } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at");
    const { data: h } = await supabase.from("task_history").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
    setComments(c || []); setHistory(h || []);
  }, [task.id]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  const setStatus = (s) => {
    if (isFinalized) return;
    if (s === "Entregado") { onDeliver(task); return; }
    onUpdate(task, { status: s }, `${profile.name} cambió el estado a "${s}"`);
  };

  const changeUrgency = (u) => {
    if (isFinalized || !isAssignee) return;
    onUpdate(task, { urgency: u }, `${profile.name} cambió la urgencia a "${u}"`);
  };
  const changeDeadline = (d) => {
    if (isFinalized || !isRequester) return;
    onUpdate(task, { deadline: d }, `${profile.name} cambió el deadline a ${fmtDate(d)}`);
  };

  const addComment = async () => {
    if (!comment.trim() || isFinalized) return;
    await supabase.from("task_comments").insert({ task_id: task.id, author_id: profile.id, author_name: profile.name, text: comment.trim() });
    await onUpdate(task, {}, `${profile.name} agregó un comentario`);
    setComment(""); loadExtras();
  };
  const delegate = async () => {
    if (isFinalized) return;
    const p = profiles.find((x) => x.id === delegateId);
    if (!p) return;
    await onUpdate(task, { assigned_to_id: p.id, assigned_to_name: p.name }, `${profile.name} delegó a ${p.name}`);
    if (p.id !== profile.id) await notify(p.id, task.id, `Te delegaron "${task.title}"`);
    setDelegateId("");
  };

  const toggleRemindMe = async () => {
    if (task.remind_me_by) return; // ya se activó, no se puede desactivar
    await onUpdate(task, { remind_me_by: profile.id }, `${profile.name} activó "avisarme" en este pendiente`);
  };
  const toggleNotifyRequester = async () => {
    if (task.notify_requester || !task.requested_by_id) return;
    await onUpdate(task, { notify_requester: true }, `${profile.name} activó el aviso al solicitante`);
    await notify(task.requested_by_id, task.id, `"${task.title}" fue entregado`);
  };
  const bumpRemindAssignee = async () => {
    if (!isRequester) return;
    const today = todayISO();
    if ((task.remind_assignee_count || 0) >= 3 || task.remind_assignee_last_date === today) return;
    await onUpdate(task, { remind_assignee_count: (task.remind_assignee_count || 0) + 1, remind_assignee_last_date: today }, `${profile.name} resaltó el pendiente para ${task.assigned_to_name}`);
    if (task.assigned_to_id && task.assigned_to_id !== profile.id) await notify(task.assigned_to_id, task.id, `Te resaltaron "${task.title}"`);
  };

  const sendReminderEmail = async () => {
    if (!assignee) return;
    const subject = encodeURIComponent(`Recordatorio: ${task.title}`);
    const body = encodeURIComponent(`Hola ${assignee.name},\n\nRecordatorio del pendiente "${task.title}" (${task.category}).\nDeadline: ${fmtDate(task.deadline)}\nEstado: ${task.status}\n\nDe parte de ${profile.name}, panel Sevenly.`);
    const to = encodeURIComponent(assignee.email || "");
    window.open(`https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por correo a ${assignee.name}`);
  };
  const sendReminderWhatsapp = async () => {
    if (!assignee || !assignee.phone) return;
    const cleanPhone = assignee.phone.replace(/\D/g, "");
    const text = encodeURIComponent(`Hola ${assignee.name}, recordatorio: "${task.title}" (${task.category}). Deadline: ${fmtDate(task.deadline)}. Estado: ${task.status}. — ${profile.name}, Sevenly`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por WhatsApp a ${assignee.name}`);
  };

  const downloadHistory = () => {
    const lines = [
      `Pendiente: ${task.title}`, `Categoría: ${task.category}`, `Solicita: ${task.requested_by}`,
      `Asignado a: ${task.assigned_to_name}`, `Deadline: ${fmtDate(task.deadline)}`, `Urgencia: ${task.urgency}`,
      `Estado final: ${task.status}`, "", "--- Historial ---",
      ...history.slice().reverse().map((h) => `[${new Date(h.created_at).toLocaleString("es-MX")}] ${h.text}`),
      "", "--- Comentarios ---",
      ...comments.map((c) => `[${new Date(c.created_at).toLocaleString("es-MX")}] ${c.author_name}: ${c.text}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${task.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: "rgba(20,24,31,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper }} className="w-full max-w-md h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b px-5 py-4 sticky top-0 flex items-start justify-between gap-3">
          <div><div className="font-mono text-[10px] uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: C.inkSoft }}>{task.category}{isFinalized && <><Lock size={10} /> Finalizado — solo lectura</>}</div>
            <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg leading-tight">{task.title}</h2>
            {task.request_date && task.deadline && task.request_date === task.deadline && (
              <div className="font-mono text-[10px] uppercase tracking-wider mt-1" style={{ color: C.urgent }}>De hoy para hoy 💀</div>
            )}</div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {task.description && <p style={{ color: C.ink }} className="text-sm leading-relaxed">{task.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Solicita</div><div style={{ color: C.ink }}>{task.requested_by}</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Asignado a</div><div style={{ color: C.ink }}>{task.assigned_to_name}</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Fecha de solicitud</div><div style={{ color: C.ink }}>{fmtDate(task.request_date)}</div></div>
            <div></div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Deadline</div>
              {isRequester && !isFinalized ? (
                <input type="date" value={task.deadline || ""} onChange={(e) => changeDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1 text-xs outline-none" />
              ) : <div style={{ color: C.ink }}>{fmtDate(task.deadline)}</div>}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Urgencia</div>
              {isAssignee && !isFinalized ? (
                <select value={task.urgency} onChange={(e) => changeUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1 text-xs outline-none">
                  {URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                </select>
              ) : <UrgencyFlag urgency={task.urgency} />}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Estado</div>
            <div className="flex flex-wrap gap-1.5">
              {ASSIGNEE_STATUSES.map((s) => { const Icon = STATUS_ICON[s]; const active = task.status === s;
                return <button key={s} disabled={isFinalized} onClick={() => setStatus(s)} style={{ borderColor: active ? C.spine : C.hairline, background: active ? C.spine : "transparent", color: active ? C.paper : C.inkSoft }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"><Icon size={13} /> {s}</button>; })}
              {isFinalized && <span style={{ borderColor: C.signal, color: C.signal }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5"><CheckCheck size={13} /> Finalizado</span>}
            </div>
          </div>

          {isRequester && isDelivered && !isFinalized && (
            !confirmFinalize ? (
              <button onClick={() => setConfirmFinalize(true)} style={{ background: C.signal, color: "#fff" }} className="px-3 py-2 text-sm flex items-center justify-center gap-2"><CheckCheck size={14} /> Finalizar pendiente</button>
            ) : (
              <div style={{ borderColor: C.signal, background: C.signalSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: C.signal }}>Una vez finalizado, nadie podrá volver a moverlo. ¿Seguro?</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setConfirmFinalize(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                  <button onClick={() => onFinalize(task)} style={{ background: C.signal, color: "#fff" }} className="text-xs px-2.5 py-1">Sí, finalizar</button>
                </div>
              </div>
            )
          )}

          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Delegar</div>
            <div className="flex gap-2">
              <select disabled={isFinalized} value={delegateId} onChange={(e) => setDelegateId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none disabled:opacity-50">
                <option value="">Elegir persona...</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button disabled={isFinalized} onClick={delegate} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-50"><ArrowRightLeft size={14} /> Delegar</button>
            </div>
          </div>

          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Recordatorios</div>
            <div className="flex flex-col gap-1.5 text-sm mb-3" style={{ color: C.ink }}>
              {isDelivered && isAssignee && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!task.notify_requester} disabled={!!task.notify_requester || isFinalized} onChange={toggleNotifyRequester} />
                  Avisar al solicitante (una sola vez)
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!task.remind_me_by} disabled={!!task.remind_me_by || isFinalized} onChange={toggleRemindMe} />
                Avisarme cuando se acerque el deadline (una sola vez, a mi campanita)
              </label>
              {isRequester && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: C.inkSoft }}>Resaltar para {task.assigned_to_name} ({task.remind_assignee_count || 0}/3 hoy máx. 1)</span>
                  <button disabled={isFinalized || (task.remind_assignee_count || 0) >= 3 || task.remind_assignee_last_date === todayISO()} onClick={bumpRemindAssignee} style={{ borderColor: C.hairline, color: C.ink }} className="border px-2 py-1 text-xs disabled:opacity-40">Resaltar</button>
                </div>
              )}
            </div>
            {isRequester && (
              <div className="flex flex-col gap-2">
                <button onClick={sendReminderEmail} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center"><Mail size={14} /> Enviar recordatorio por correo</button>
                <button onClick={sendReminderWhatsapp} disabled={!assignee?.phone} style={{ borderColor: C.signal, color: assignee?.phone ? C.signal : C.gray }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center disabled:cursor-not-allowed"><Send size={14} /> {assignee?.phone ? "Recordar por WhatsApp" : "Sin celular registrado"}</button>
              </div>
            )}
            <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Correo abre Outlook Web ya redactado (solo dale enviar); WhatsApp abre con el mensaje listo. Ninguno sale automático.</p>
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
            {!isFinalized && (
              <div className="flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Agregar link, avance o lo que falta..." style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none" />
                <button onClick={addComment} style={{ background: C.spine, color: C.paper }} className="px-3 py-2"><Send size={14} /></button>
              </div>
            )}
          </div>

          <div style={{ borderColor: C.hairline }} className="border-t pt-4 flex items-center justify-between gap-2">
            <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-sm" style={{ color: C.ink }}>
              <History size={14} /> Historial <ChevronDown size={13} style={{ color: C.inkSoft, transform: showHistory ? "rotate(180deg)" : "none" }} />
            </button>
            <button onClick={downloadHistory} disabled={!isFinalized} title={isFinalized ? "" : "Se habilita cuando el solicitante finaliza el pendiente"} style={{ color: isFinalized ? C.ink : C.gray }} className="flex items-center gap-1.5 text-sm disabled:cursor-not-allowed"><Download size={14} /> Descargar</button>
          </div>
          {showHistory && (
            <div className="flex flex-col gap-1.5 border-l-2 pl-3 -mt-3" style={{ borderColor: C.hairline }}>
              {history.map((h) => (
                <div key={h.id} className="text-xs">
                  <div style={{ color: C.ink }}>{h.text}</div>
                  <div className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(h.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}

          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs flex items-center gap-1.5 mt-1 self-start" style={{ color: C.urgent }}><Trash2 size={13} /> Eliminar pendiente</button>
          ) : (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>¿Eliminar? {isFinalized ? "Su registro de finalizado seguirá contando en el perfil de quien lo hizo. " : ""}No se puede deshacer.</span>
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

function NotificationsPanel({ onClose, notifications, onOpenTask, pushSupported, pushEnabled, onEnablePush }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4" style={{ background: "rgba(20,24,31,0.35)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="border w-full max-w-sm mt-14 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b px-4 py-3 flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.ink }}><Bell size={14} /> Notificaciones</div>
          <div className="flex items-center gap-2">
            {pushSupported && !pushEnabled && (
              <button onClick={onEnablePush} style={{ borderColor: C.signal, color: C.signal }} className="border px-2 py-1 text-[11px] flex items-center gap-1"><BellRing size={11} /> Activar</button>
            )}
            <button onClick={onClose}><X size={15} style={{ color: C.inkSoft }} /></button>
          </div>
        </div>
        <div className="p-2">
          {notifications.length === 0 && <div className="text-xs px-2 py-4" style={{ color: C.inkSoft }}>Sin notificaciones todavía.</div>}
          {notifications.map((n) => (
            <button key={n.id} onClick={() => n.task_id && onOpenTask(n.task_id)} style={{ background: n.read ? "transparent" : C.signalSoft }} className="w-full text-left px-3 py-2.5 flex flex-col gap-0.5">
              <span className="text-sm" style={{ color: C.ink }}>{n.message}</span>
              <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(n.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ onClose, profiles, tasks }) {
  const [picked, setPicked] = useState(null);
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
            const open = picked === p.id;
            return (
              <div key={p.id}>
                <button onClick={() => setPicked(open ? null : p.id)} style={{ borderColor: C.hairline, background: open ? C.panel : "transparent" }} className="w-full text-left border px-3 py-2.5 flex items-center justify-between">
                  <span className="text-sm" style={{ color: C.ink }}>{p.name}</span>
                  <span className="flex items-center gap-2"><span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{inProgress.length} en progreso</span><ChevronDown size={13} style={{ color: C.inkSoft, transform: open ? "rotate(180deg)" : "none" }} /></span>
                </button>
                {open && (
                  <div style={{ borderColor: C.hairline }} className="border-l-2 ml-3 pl-3 mt-1.5 mb-2 flex flex-col gap-2">
                    {inProgress.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>Nada "en progreso" ahora mismo.</div>}
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

function ActivityPanel({ onClose, profile }) {
  const [log, setLog] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("finalized_log").select("*").eq("user_id", profile.id).order("finalized_at", { ascending: false }).limit(100);
      setLog(data || []);
    })();
  }, [profile.id]);
  const today = todayISO();
  const days = Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const iso = dt.toISOString().slice(0, 10);
    const count = log.filter((l) => l.finalized_at.slice(0, 10) === iso).length;
    return { iso, label: dt.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }), count };
  });
  const todayCount = days[0].count;

  const downloadLog = () => {
    const lines = [
      `Pendientes finalizados por ${profile.name}`, `Total histórico: ${log.length}`, "",
      ...log.map((l) => `[${new Date(l.finalized_at).toLocaleString("es-MX")}] ${l.task_title}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `finalizados_${profile.name.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4" style={{ background: "rgba(20,24,31,0.35)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="border w-full max-w-xs mt-14 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.ink }}><TrendingUp size={14} /> Mi actividad</div>
          <button onClick={onClose}><X size={15} style={{ color: C.inkSoft }} /></button>
        </div>
        <div style={{ background: C.signalSoft, color: C.signal }} className="px-3 py-2 text-sm mb-3">Hoy: <strong>{todayCount}</strong> finalizado(s). {activityMsg(todayCount)}</div>
        <div className="flex flex-col gap-1 mb-3">
          {days.map((d) => <div key={d.iso} className="flex items-center justify-between text-xs"><span style={{ color: C.inkSoft }} className="capitalize">{d.label}</span><span style={{ color: C.ink }} className="font-mono">{d.count}</span></div>)}
        </div>
        <button onClick={downloadLog} disabled={log.length === 0} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-xs flex items-center justify-center gap-2 w-full mb-2 disabled:opacity-40"><Download size={13} /> Descargar mi lista de finalizados</button>
        <p className="text-[10px]" style={{ color: C.inkSoft }}>Este registro se queda aunque el pendiente se borre después de finalizado.</p>
      </div>
    </div>
  );
}
