"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, Bell, MessageSquare, ArrowRightLeft, X, Search, Flag,
  ChevronRight, ChevronDown, Trash2, CheckCircle2, Circle,
  PauseCircle, PlayCircle, Send, LogOut, History, Mail, Users,
  User, TrendingUp, BookOpen, Download, Lock, CheckCheck, BellRing,
  Image as ImageIcon, Megaphone, Eye, Pencil, Paperclip, Link2, Clock,
} from "lucide-react";

const C = {
  paper: "#F6F4EE", panel: "#FFFFFF", ink: "#1C1F26", inkSoft: "#5B5F6B",
  hairline: "#DCD6C8", signal: "#0F6E5C", signalSoft: "#E4EFEA",
  amber: "#B8791F", amberSoft: "#F5EBDA", urgent: "#B3402B", urgentSoft: "#F6E4DF",
  veryUrgent: "#7A1B10", veryUrgentSoft: "#E7B3A6",
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
  { label: "Muy urgente", color: C.veryUrgent, rank: 4 },
];
// "Muy urgente" es automática (pendiente vencido) — nadie la elige a mano.
const SELECTABLE_URGENCIES = URGENCIES.filter((u) => u.label !== "Muy urgente");
const DEFAULT_CATEGORIES = ["Video", "Diseño", "Guiones", "Briefs"];
const DONE_STATUSES = ["Entregado", "Finalizado"];
// CHANGES.md #12: orden "de mayor a menor" del filtro Estado.
const STATUS_GROUP_ORDER = ["Finalizado", "Entregado", "Detenido", "En progreso", "No iniciado"];
const TASK_TYPES = [
  { key: "individual", label: "Individual" },
  { key: "personal", label: "Personal" },
  { key: "colaborativo", label: "Colaborativo" },
];
const REPEAT_MODES = [
  { value: "none", label: "No se repite" },
  { value: "weekly", label: "Cada semana" },
  { value: "monthly", label: "Todos los meses" },
];

// Un pendiente Personal se muestra como Individual en cuanto se le asigna
// a alguien más (con "Asignar responsable" o "Asignar a").
function effectiveTaskType(task) {
  if (task.task_type === "personal" && task.assigned_to_id !== task.requested_by_id) return "individual";
  return task.task_type;
}

// Un pendiente Individual o Personal (nunca Colaborativo) cuyo deadline ya
// pasó y que aún no se entrega se vuelve "Muy urgente" automáticamente.
function isOverdueUrgent(task) {
  return task.task_type !== "colaborativo" && !DONE_STATUSES.includes(task.status) && !!task.deadline && daysUntil(task.deadline) < 0;
}
function effectiveUrgency(task) {
  return isOverdueUrgent(task) ? "Muy urgente" : task.urgency;
}

// Estado general derivado de las subtareas (Colaborativo, y también Individual
// cuando tiene subtareas): "Entregado" solo si TODAS están "Entregado";
// si no, gana "Detenido" sobre "En progreso" sobre "No iniciado".
function computeGeneralStatus(subs) {
  if (!subs || subs.length === 0) return null;
  if (subs.every((s) => s.status === "Entregado")) return "Entregado";
  if (subs.some((s) => s.status === "Detenido")) return "Detenido";
  if (subs.some((s) => s.status === "En progreso")) return "En progreso";
  return "No iniciado";
}

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
// Conteo de días entre dos fechas ISO — es la base de "Programar pendiente":
// cuántos días hay del día programado a cada deadline, para recalcularlos
// en cada nueva ocurrencia sin importar si repite semanal o mensual.
function daysBetweenISO(aISO, bISO) {
  if (!aISO || !bISO) return 0;
  const a = new Date(aISO + "T00:00:00"), b = new Date(bISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
// "El primer jueves del mes" = qué ocurrencia (1ª, 2ª, 3ª...) de su día de
// la semana es una fecha dentro de su propio mes.
function monthOccurrenceOfISO(dISO) {
  return Math.ceil(new Date(dISO + "T00:00:00").getDate() / 7);
}
function popupStoragePath(url) {
  const marker = "/storage/v1/object/public/popups/";
  if (!url || !url.includes(marker)) return null;
  return decodeURIComponent(url.split(marker)[1]);
}

function taskBelongsToMember(t, id, subtasks) {
  return t.assigned_to_id === id ||
    (t.task_type === "colaborativo" && (t.team_member_ids || []).includes(id)) ||
    subtasks.some((s) => s.task_id === t.id && s.assigned_to_id === id);
}

function getPopupMedia(url) {
  if (!url) return null;
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return { kind: "video", src: url };
  return { kind: "image", src: url };
}

function PopupMediaPreview({ url, maxHeight }) {
  const media = getPopupMedia(url);
  if (!media) return null;
  if (media.kind === "video") {
    return <video src={media.src} autoPlay loop muted playsInline className="w-full aspect-video object-cover" style={{ maxHeight }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media.src} alt="" className="w-full aspect-video object-cover" style={{ maxHeight }} />;
}

// Vista previa del pop up (y de la notificación, si aplica) antes de crearlo
// o guardarlo — reemplaza el "Programar"/"Guardar" directo por un paso de
// confirmación. `file` (si viene) manda sobre `existingUrl` para la
// previsualización de la imagen/GIF/video.
function PopupConfirmModal({ title, description, existingUrl, file, onlyNotification, replicateNotification, onCancel, onConfirm, confirmLabel, busy }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [showFullMedia, setShowFullMedia] = useState(false);
  useEffect(() => {
    if (!file) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const mediaUrl = file ? objectUrl : existingUrl;
  const isVideo = file ? file.type.startsWith("video/") : getPopupMedia(mediaUrl)?.kind === "video";
  const showPopupPreview = !onlyNotification;
  const showNotifPreview = onlyNotification || replicateNotification;
  const notifMessage = `📣 ${title}${description ? " — " + description : ""}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.65)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border max-h-[90vh] overflow-y-auto">
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">Vista previa</h2>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {showPopupPreview && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1.5" style={{ color: C.inkSoft }}>Así se ve el pop up</div>
              <div style={{ borderColor: C.hairline }} className="border overflow-hidden">
                {mediaUrl && (
                  <button type="button" onClick={() => setShowFullMedia(true)} className="block w-full cursor-zoom-in">
                    {isVideo
                      ? <video src={mediaUrl} autoPlay loop muted playsInline className="w-full aspect-video object-cover" style={{ maxHeight: 160 }} />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={mediaUrl} alt="" className="w-full aspect-video object-cover" style={{ maxHeight: 160 }} />}
                  </button>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-1.5 mb-1.5 font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>
                    <Megaphone size={12} /> Aviso
                  </div>
                  <h3 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-base mb-1">{title || "(sin título)"}</h3>
                  {description && <p className="text-sm whitespace-pre-wrap" style={{ color: C.ink }}>{renderWithLinks(description, C.signal)}</p>}
                </div>
              </div>
            </div>
          )}
          {showNotifPreview && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1.5" style={{ color: C.inkSoft }}>Así se ve la notificación</div>
              <div style={{ borderColor: C.hairline, background: C.signalSoft }} className="border px-3 py-2.5 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Bell size={14} style={{ color: C.signal, flexShrink: 0 }} />
                  <span className="text-sm" style={{ color: C.ink }}>{notifMessage}</span>
                </div>
                {mediaUrl && <span className="text-xs font-medium self-start ml-6" style={{ color: C.signal }}>Ver más</span>}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderColor: C.hairline }} className="border-t px-5 py-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm disabled:opacity-60">Cancelar</button>
          <button onClick={onConfirm} disabled={busy} style={{ background: C.spine, color: C.paper, opacity: busy ? 0.6 : 1 }} className="px-4 py-2 text-sm">{busy ? "..." : confirmLabel}</button>
        </div>
      </div>
      {showFullMedia && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ background: "rgba(20,24,31,0.92)" }}
          onClick={() => setShowFullMedia(false)}
        >
          <button
            onClick={() => setShowFullMedia(false)}
            style={{ background: C.paper }}
            className="absolute top-3 right-3 z-10 p-1 rounded-full"
          >
            <X size={18} style={{ color: C.inkSoft }} />
          </button>
          {isVideo ? (
            <video
              src={mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

const POPUP_TASK_LIMIT = 10;

const POPUP_TASK_FIELDS = [
  { key: "requester", label: "Solicitante/s" },
  { key: "assignee", label: "Asignado" },
  { key: "team", label: "Equipo de trabajo", colaborativoOnly: true },
  { key: "description", label: "Descripción" },
  { key: "status", label: "Estado" },
  { key: "generalStatus", label: "Estado general", needsSubtasks: true },
  { key: "requestedDate", label: "Fecha de solicitud" },
  { key: "deadline", label: "Fecha de deadline" },
  { key: "deliveredDate", label: "Fecha de entregado", deliveredOnly: true },
  { key: "subtasksList", label: "Subtareas", needsSubtasks: true },
  { key: "finalize", label: "Botón para finalizar pendiente" },
];

function applicablePopupFields(task, subsForTask) {
  return POPUP_TASK_FIELDS.filter((f) => {
    if (f.colaborativoOnly && task.task_type !== "colaborativo") return false;
    if (f.needsSubtasks && subsForTask.length === 0) return false;
    if (f.deliveredOnly && !DONE_STATUSES.includes(task.status)) return false;
    return true;
  });
}

function PopupTaskPicker({ profiles, tasks, subtasks, selected, onToggleTask, onToggleField, onApplyToAll }) {
  const [openMember, setOpenMember] = useState(null);
  const [openFieldsFor, setOpenFieldsFor] = useState(null);
  const atLimit = selected.length >= POPUP_TASK_LIMIT;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}><Link2 size={12} /> Referenciar pendientes (opcional)</label>
        <span className="font-mono text-[10px]" style={{ color: atLimit ? C.urgent : C.inkSoft }}>{selected.length}/{POPUP_TASK_LIMIT}</span>
      </div>
      <div style={{ borderColor: C.hairline }} className="border mt-1.5 max-h-72 overflow-y-auto">
        {profiles.map((p) => {
          const memberTasks = tasks.filter((t) => taskBelongsToMember(t, p.id, subtasks));
          const open = openMember === p.id;
          const pickedHere = memberTasks.filter((t) => selected.some((s) => s.id === t.id)).length;
          return (
            <div key={p.id} style={{ borderColor: C.hairline }} className="border-b last:border-b-0">
              <button type="button" onClick={() => setOpenMember(open ? null : p.id)} className="w-full text-left px-2.5 py-2 flex items-center justify-between">
                <span className="text-xs" style={{ color: C.ink }}>{p.name}{pickedHere > 0 && <span className="ml-1.5" style={{ color: C.signal }}>({pickedHere})</span>}</span>
                <span className="flex items-center gap-1.5"><span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{memberTasks.length}</span><ChevronDown size={12} style={{ color: C.inkSoft, transform: open ? "rotate(180deg)" : "none" }} /></span>
              </button>
              {open && (
                <div className="px-2.5 pb-2 flex flex-col gap-1">
                  {memberTasks.length === 0 && <div className="text-[11px]" style={{ color: C.inkSoft }}>Sin pendientes.</div>}
                  {memberTasks.map((t) => {
                    const entry = selected.find((s) => s.id === t.id);
                    const checked = !!entry;
                    const disabled = !checked && atLimit;
                    const subsForTask = subtasks.filter((s) => s.task_id === t.id);
                    const fieldsAvailable = applicablePopupFields(t, subsForTask);
                    const fieldsOpen = openFieldsFor === t.id;
                    return (
                      <div key={t.id}>
                        <div className="flex items-start gap-2 text-xs" style={{ color: disabled ? C.inkSoft : C.ink, opacity: disabled ? 0.5 : 1 }}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggleTask(t.id)} className="mt-0.5" />
                          <span className="flex-1">{t.title} <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>· {t.status}</span></span>
                          {checked && (
                            <button type="button" onClick={() => setOpenFieldsFor(fieldsOpen ? null : t.id)} title="Elegir qué mostrar">
                              <Eye size={13} style={{ color: fieldsOpen ? C.signal : C.inkSoft }} />
                            </button>
                          )}
                        </div>
                        {checked && fieldsOpen && (
                          <div style={{ borderColor: C.hairline, background: C.panel }} className="border ml-5 mt-1 mb-1 p-2 flex flex-col gap-1">
                            {fieldsAvailable.map((f) => (
                              <label key={f.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.ink }}>
                                <input type="checkbox" checked={entry.fields.includes(f.key)} onChange={() => onToggleField(t.id, f.key)} />
                                {f.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selected.length > 1 && (
        <button type="button" onClick={onApplyToAll} style={{ borderColor: C.hairline, color: C.ink }} className="border px-2.5 py-1.5 text-xs mt-1.5">Aplicar lo del primero a todos</button>
      )}
      <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Salen como pendientes desplegables dentro del pop up — máximo {POPUP_TASK_LIMIT}. El ojo elige qué mostrar de cada uno.</p>
    </div>
  );
}

const URL_MATCH_REGEX = /https?:\/\/[^\s]+/g;
const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/;

function renderWithLinks(text, linkColor) {
  return text.split(URL_SPLIT_REGEX).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: linkColor }} onClick={(e) => e.stopPropagation()}>{part}</a>
      : <span key={i}>{part}</span>
  );
}

function extractCommentLinks(comments) {
  const out = [];
  for (const c of comments) {
    const matches = (c.text || "").match(URL_MATCH_REGEX) || [];
    for (const url of matches) out.push({ url, author: c.author_name, date: c.created_at });
  }
  return out;
}
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

function normalizeText(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Búsqueda avanzada del dashboard (CHANGES.md #1): nombres (solicitante,
// asignado, equipo), estado, urgencia, categoría, título, tipo de pendiente,
// y las palabras "hoy"/"mañana" contra el deadline.
function matchesSearchQuery(task, rawQuery, profiles) {
  const q = normalizeText(rawQuery.trim());
  if (!q) return false;
  if (q === "hoy" || q === "manana") {
    const d = daysUntil(task.deadline);
    if (d === null) return false;
    return q === "hoy" ? d === 0 : d === 1;
  }
  const teamNames = (task.team_member_ids || []).map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean);
  const typeLabel = TASK_TYPES.find((x) => x.key === effectiveTaskType(task))?.label || "";
  const haystacks = [
    task.title, task.requested_by, task.assigned_to_name, task.responsible_name,
    task.status, effectiveUrgency(task), task.category, typeLabel,
    ...(task.co_requester_names || []), ...teamNames,
  ];
  return haystacks.some((h) => normalizeText(h).includes(q));
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
function DeadlineBadge({ deadline, status, hideToday }) {
  const legend = dueLegend(deadline, status);
  const showLegend = legend && !(hideToday && legend.text === "¡Se entrega hoy!");
  return (
    <div className="text-right">
      <div className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{fmtDate(deadline)}</div>
      {showLegend && <div className="font-mono text-[9px] uppercase tracking-wide" style={{ color: legend.color }}>{legend.text}</div>}
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
  // CHANGES.md #6: "Asignar cambios" abre el formulario de crear pendiente
  // con el título fijo del pendiente al que se le piden cambios, y sube de
  // ronda cada vez que se repite el ciclo sobre un pendiente que ya venía
  // de otra ronda de cambios.
  const [assignChangesFor, setAssignChangesFor] = useState(null);
  const startAssignChanges = (task) => {
    setAssignChangesFor({ title: task.title, changesRound: (task.changes_round || 0) + 1 });
    setSelected(null);
    setShowNew(true);
  };
  const [showTeam, setShowTeam] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // CHANGES.md #12: filtro activo del dashboard — reemplaza los tabs de
  // estado de antes por 5 filtros (Todos/Estado/Urgencia/Categoría/Deadline,
  // + "Programados" en "Mis solicitudes"). Solo uno puede estar activo a la
  // vez. `value` filtra por un valor puntual; `order` ("desc" = de mayor a
  // menor, "asc" = de menor a mayor) ordena/agrupa sin filtrar a un solo valor.
  const [activeFilter, setActiveFilter] = useState({ type: "Todos" });
  const [openFilterKey, setOpenFilterKey] = useState(null);
  const [primaryTab, setPrimaryTab] = useState("mine"); // requests | mine | all
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [popupQueue, setPopupQueue] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [viewingAs, setViewingAs] = useState(null); // id del compañero que un Gerente está observando
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [watchers, setWatchers] = useState([]); // gerentes que me están observando a mí ahora mismo
  const [taskComments, setTaskComments] = useState([]); // { id, task_id, created_at } de todos los pendientes
  const [commentReads, setCommentReads] = useState([]); // { task_id, last_read_at } del usuario actual

  const loadAll = useCallback(async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: p } = await supabase.from("profiles").select("*");
    const { data: st } = await supabase.from("subtasks").select("*").order("created_at", { ascending: true });
    const { data: rt } = await supabase.from("recurring_templates").select("*");
    setTasks(t || []);
    setProfiles(p || []);
    setSubtasks(st || []);
    setRecurringTemplates(rt || []);
  }, []);

  const loadNotifications = useCallback(async (userId) => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    setNotifications(data || []);
  }, []);

  const loadCommentMeta = useCallback(async (userId) => {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from("task_comments").select("id, task_id, created_at"),
      supabase.from("task_comment_reads").select("task_id, last_read_at").eq("user_id", userId),
    ]);
    setTaskComments(c || []);
    setCommentReads(r || []);
  }, []);

  const reloadMyCommentReads = useCallback(() => {
    if (profile) loadCommentMeta(profile.id);
  }, [profile, loadCommentMeta]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(prof);
      await loadAll();
      await loadNotifications(prof.id);
      await loadCommentMeta(prof.id);
      setReady(true);
    })();
  }, [router, loadAll, loadNotifications, loadCommentMeta]);

  useEffect(() => {
    const channel = supabase.channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel("comment-meta-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, () => loadCommentMeta(profile.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comment_reads", filter: `user_id=eq.${profile.id}` }, () => loadCommentMeta(profile.id))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, loadCommentMeta]);

  useEffect(() => {
    if (!ready || !profile) return;
    const loadWatchers = async () => {
      const { data } = await supabase.from("watching").select("manager_id").eq("watched_id", profile.id);
      setWatchers(data || []);
    };
    loadWatchers();
    const channel = supabase.channel("watching-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "watching", filter: `watched_id=eq.${profile.id}` }, loadWatchers)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [ready, profile]);

  const startViewingAs = async (targetId) => {
    if (!targetId) { stopViewingAs(); return; }
    await supabase.from("watching").delete().eq("manager_id", profile.id); // limpia cualquier observación anterior
    setViewingAs(targetId);
    await supabase.from("watching").upsert(
      { manager_id: profile.id, watched_id: targetId, updated_at: new Date().toISOString() },
      { onConflict: "manager_id,watched_id" }
    );
  };
  const stopViewingAs = async () => {
    if (viewingAs) await supabase.from("watching").delete().eq("manager_id", profile.id).eq("watched_id", viewingAs);
    setViewingAs(null);
  };
  useEffect(() => {
    const cleanup = () => { if (viewingAs && profile) supabase.from("watching").delete().eq("manager_id", profile.id).eq("watched_id", viewingAs); };
    window.addEventListener("beforeunload", cleanup);
    return () => { window.removeEventListener("beforeunload", cleanup); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingAs]);

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
      const candidates = tasks.filter((t) => (t.remind_me_by_ids || []).length > (t.remind_me_notified_ids || []).length && !DONE_STATUSES.includes(t.status) && t.deadline);
      for (const t of candidates) {
        const d = daysUntil(t.deadline);
        if (d !== null && d <= 2) {
          const notifiedIds = t.remind_me_notified_ids || [];
          const pendingIds = (t.remind_me_by_ids || []).filter((id) => !notifiedIds.includes(id));
          if (pendingIds.length === 0) continue;
          for (const userId of pendingIds) {
            await supabase.from("notifications").insert({ user_id: userId, task_id: t.id, message: `Se acerca el deadline de "${t.title}" (${fmtDate(t.deadline)})` });
          }
          await supabase.from("tasks").update({ remind_me_notified_ids: [...notifiedIds, ...pendingIds] }).eq("id", t.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasks]);

  // Avisa una sola vez a la persona asignada cuando su pendiente Individual o
  // Personal se vence sin haberse entregado (los Colaborativos no aplican).
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const overdue = tasks.filter((t) => isOverdueUrgent(t) && t.assigned_to_id && !t.overdue_notified);
      for (const t of overdue) {
        await supabase.from("notifications").insert({ user_id: t.assigned_to_id, task_id: t.id, message: `Venció tu pendiente "${t.title}" el día de ayer ¿Si lo entregaste?` });
        await supabase.from("tasks").update({ overdue_notified: true }).eq("id", t.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasks]);

  // CHANGES.md #4b: avisa al solicitante (y co-solicitantes) exactamente 24h
  // después de entregado un pendiente si sigue sin finalizarse — una sola vez
  // por pendiente. Corre en cualquier sesión con el dashboard abierto (se
  // reevalúa cada vez que "tasks" se actualiza, que es en tiempo real), así
  // que en la práctica llega muy cerca de esa hora exacta mientras alguien
  // del equipo tenga la app abierta; /api/reminder-10am corre una vez al día
  // como respaldo por si nadie la tuvo abierta. Si a la misma persona se le
  // juntan más de 2 pendientes al mismo tiempo, se agrupan en una sola
  // notificación que al abrirse lleva al dashboard filtrado en "Mis
  // solicitudes" + "Entregado".
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const dayMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const candidates = tasks.filter((t) =>
        t.status === "Entregado" && t.delivered_at && !t.delivery_reminder_sent &&
        now - new Date(t.delivered_at).getTime() >= dayMs
      );
      if (candidates.length === 0) return;
      const byRequester = new Map();
      for (const t of candidates) {
        const targetIds = Array.from(new Set([t.requested_by_id, t.responsible_id, ...(t.co_requester_ids || [])].filter(Boolean)));
        for (const userId of targetIds) {
          if (!byRequester.has(userId)) byRequester.set(userId, []);
          byRequester.get(userId).push(t);
        }
      }
      for (const [userId, list] of byRequester.entries()) {
        if (list.length > 2) {
          await notify(userId, null, `Tienes ${list.length} pendientes entregados sin finalizar`, "¿Pudiste revisarlo?", "requests:Entregado");
        } else {
          for (const t of list) {
            await notify(userId, t.id, "Tienes un pendiente entregado. Si ya todo ok, finalízalo", "¿Pudiste revisarlo?");
          }
        }
      }
      await supabase.from("tasks").update({ delivery_reminder_sent: true }).in("id", candidates.map((t) => t.id));
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

  useEffect(() => {
    if (!ready || !profile) return;
    (async () => {
      const today = todayISO();
      const nowHHMM = new Date().toTimeString().slice(0, 5);
      const { data: pops } = await supabase.from("popups").select("*")
        .eq("scheduled_date", today)
        .order("created_at", { ascending: true });
      if (!pops || pops.length === 0) { setPopupQueue([]); return; }
      const forMe = pops.filter((p) => !p.target_user_ids || p.target_user_ids.length === 0 || p.target_user_ids.includes(profile.id));
      const dueNow = forMe.filter((p) => !p.scheduled_time || p.scheduled_time.slice(0, 5) <= nowHHMM);
      if (dueNow.length === 0) { setPopupQueue([]); return; }
      const { data: dismissed } = await supabase.from("popup_dismissed").select("popup_id").eq("user_id", profile.id);
      const dismissedIds = new Set((dismissed || []).map((d) => d.popup_id));
      const pending = dueNow.filter((p) => !dismissedIds.has(p.id));

      // "Solo notificación": nunca se muestra como pop up — se manda directo a la campanita, una sola vez.
      const notifyOnly = pending.filter((p) => p.only_notification);
      for (const p of notifyOnly) {
        await supabase.from("notifications").insert({ user_id: profile.id, task_id: null, message: `📣 ${p.title}${p.description ? " — " + p.description : ""}`, ...(p.image_url ? { image_url: p.image_url } : {}) });
        await supabase.from("popup_dismissed").insert({ user_id: profile.id, popup_id: p.id });
      }

      setPopupQueue(pending.filter((p) => !p.only_notification));
    })();
  }, [ready, profile]);

  const dismissPopup = async () => {
    const current = popupQueue[0];
    if (!current || !profile) return;
    setPopupQueue((q) => q.slice(1));
    await supabase.from("popup_dismissed").insert({ user_id: profile.id, popup_id: current.id });
    if (current.replicate_notification) {
      await supabase.from("notifications").insert({ user_id: profile.id, task_id: null, message: `📣 ${current.title}${current.description ? " — " + current.description : ""}`, ...(current.image_url ? { image_url: current.image_url } : {}) });
    }
  };

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

  // "Programados" solo existe como filtro dentro de "Mis solicitudes" — si
  // se sale de esa pestaña con el filtro puesto, se resetea para que no
  // quede aplicado de forma invisible (sin chip para quitarlo) en las otras.
  useEffect(() => {
    if (primaryTab !== "requests" && activeFilter.type === "Programados") setActiveFilter({ type: "Todos" });
  }, [primaryTab, activeFilter]);

  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };
  const addHistory = async (taskId, text) => { await supabase.from("task_history").insert({ task_id: taskId, text }); };
  const notify = async (userId, taskId, message, title, target) => {
    await supabase.from("notifications").insert({ user_id: userId, task_id: taskId, message, ...(title ? { title } : {}), ...(target ? { target } : {}) });
    fetch("/api/send-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, title: title || "Sevenly", body: message, url: "/dashboard" }) }).catch(() => {});
  };

  const createTask = async (form) => {
    if (form.scheduling && (form.repeatMode === "weekly" || form.repeatMode === "monthly")) {
      // Programar pendiente + repetición: crea la PLANTILLA que el cron va
      // a usar para generar cada ocurrencia siguiente, Y de una vez crea la
      // PRIMERA ocurrencia con su Día programado como request_date — así
      // aparece en Programados de inmediato, sin esperar al cron. El día
      // de la semana y "cuál ocurrencia del mes" salen del Día programado
      // — nadie los elige a mano. Los deadlines (general y de cada
      // subtarea) se guardan como conteo de días desde ahí, para
      // recalcularse en cada ocurrencia nueva.
      const subtaskSpecs = (form.subtasks || [])
        .filter((s) => s.title?.trim())
        .map((s) => ({
          title: s.title.trim(), description: s.description || "",
          assigned_to_id: form.taskType === "colaborativo" ? (s.assignedToId || null) : (form.assignedToId || null),
          offset_days: s.deadline ? daysBetweenISO(form.scheduledDate, s.deadline) : daysBetweenISO(form.scheduledDate, form.deadline),
        }));
      const { data: tpl, error: tplError } = await supabase.from("recurring_templates").insert({
        title: form.title, description: form.description, category: form.category,
        task_type: form.taskType, frequency_type: form.repeatMode,
        weekday: new Date(form.scheduledDate + "T00:00:00").getDay(),
        month_occurrence: monthOccurrenceOfISO(form.scheduledDate),
        deadline_offset_days: daysBetweenISO(form.scheduledDate, form.deadline),
        urgency: form.urgency || "Media",
        requested_by_id: profile.id, co_requester_ids: form.coRequesterIds || [],
        assigned_to_id: form.taskType === "colaborativo" ? null : (form.assignedToId || null),
        team_member_ids: form.taskType === "colaborativo" ? (form.teamMemberIds || []) : [],
        subtask_specs: subtaskSpecs,
      }).select().single();

      if (!tplError && tpl) {
        const assignee = form.taskType === "colaborativo" ? null : profiles.find((p) => p.id === form.assignedToId);
        const coRequesters = (form.coRequesterIds || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
        const { data: firstTask } = await supabase.from("tasks").insert({
          title: form.title, description: form.description, category: form.category,
          task_type: form.taskType,
          requested_by: profile.name, requested_by_id: profile.id,
          co_requester_ids: coRequesters.map((p) => p.id), co_requester_names: coRequesters.map((p) => p.name),
          assigned_to_id: form.taskType === "colaborativo" ? null : (form.assignedToId || null),
          assigned_to_name: assignee ? assignee.name : "",
          team_member_ids: form.taskType === "colaborativo" ? (form.teamMemberIds || []) : [],
          deadline: form.deadline, urgency: form.urgency || "Media",
          request_date: form.scheduledDate,
          recurring_template_id: tpl.id,
          created_by: profile.id,
        }).select().single();

        if (firstTask) {
          for (const spec of subtaskSpecs) {
            const subDeadline = new Date(form.scheduledDate + "T00:00:00");
            subDeadline.setDate(subDeadline.getDate() + (spec.offset_days ?? 0));
            const subAssignee = profiles.find((p) => p.id === spec.assigned_to_id);
            await supabase.from("subtasks").insert({
              task_id: firstTask.id, title: spec.title, description: spec.description,
              assigned_to_id: spec.assigned_to_id || null,
              assigned_to_name: subAssignee ? subAssignee.name : "",
              deadline: subDeadline.toISOString().slice(0, 10),
            });
          }
          await supabase.from("recurring_templates").update({ current_task_id: firstTask.id }).eq("id", tpl.id);
        }
      }
      setShowNew(false);
      loadAll();
      return;
    }

    const assignee = profiles.find((p) => p.id === form.assignedToId);
    const requester = profiles.find((p) => p.id === form.requestedById);
    const coRequesters = (form.coRequesterIds || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean);

    const { data, error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description, category: form.category,
      task_type: form.taskType || "individual",
      requested_by: requester ? requester.name : profile.name, requested_by_id: form.requestedById || profile.id,
      co_requester_ids: coRequesters.map((p) => p.id), co_requester_names: coRequesters.map((p) => p.name),
      deadline: form.deadline || null, urgency: form.urgency || "Media",
      assigned_to_id: form.assignedToId || null, assigned_to_name: assignee ? assignee.name : "",
      team_member_ids: form.teamMemberIds || [],
      // "Programar pendiente" sin repetición: el pendiente nace con su Día
      // programado como fecha de solicitud, en vez de la de hoy. Mientras
      // esa fecha siga en el futuro, cuenta como "Programado".
      ...(form.scheduling && form.scheduledDate ? { request_date: form.scheduledDate } : {}),
      ...(form.changesRound ? { changes_round: form.changesRound } : {}),
      created_by: profile.id,
    }).select().single();

    if (!error && data) {
      await addHistory(data.id, `Creado por ${profile.name}`);
      if (data.request_date && data.deadline && data.request_date === data.deadline) {
        await addHistory(data.id, `⚠️ Pendiente "de hoy para hoy" — se solicitó y se necesita entregar el mismo día`);
      }
      if (assignee && assignee.id !== profile.id) await notify(assignee.id, data.id, `Te asignaron "${data.title}"`);
      for (const p of coRequesters) {
        if (p.id !== profile.id) await notify(p.id, data.id, `Te agregaron como solicitante del pendiente "${data.title}"`);
      }
      if (form.taskType === "colaborativo") {
        for (const id of form.teamMemberIds || []) {
          if (id !== profile.id) await notify(id, data.id, `Te agregaron al equipo del pendiente colaborativo "${data.title}"`);
        }
        for (const st of form.subtasks || []) {
          if (!st.title.trim() || !st.assignedToId) continue;
          const stAssignee = profiles.find((p) => p.id === st.assignedToId);
          await supabase.from("subtasks").insert({
            task_id: data.id, title: st.title, description: st.description,
            assigned_to_id: st.assignedToId, assigned_to_name: stAssignee ? stAssignee.name : "",
            deadline: st.deadline || null,
          });
          if (st.assignedToId !== profile.id) await notify(st.assignedToId, data.id, `Te asignaron la subtarea "${st.title}" dentro de "${data.title}"`);
        }
      } else if (form.taskType === "individual") {
        for (const st of form.subtasks || []) {
          if (!st.title.trim() || !form.assignedToId) continue;
          await supabase.from("subtasks").insert({
            task_id: data.id, title: st.title, description: st.description,
            assigned_to_id: form.assignedToId, assigned_to_name: assignee ? assignee.name : "",
            deadline: st.deadline || null,
          });
        }
      }
    }
    setShowNew(false);
    loadAll();
  };

  const createPopup = async (form) => {
    let imageUrl = null;
    let uploadError = null;
    if (form.imageFile) {
      const ext = (form.imageFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("popups").upload(path, form.imageFile, { cacheControl: "3600", upsert: false });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("popups").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      } else {
        uploadError = upErr.message;
      }
    }
    await supabase.from("popups").insert({
      title: form.title, description: form.description, image_url: imageUrl,
      scheduled_date: form.scheduledDate || null, scheduled_time: form.scheduledTime,
      target_user_ids: form.targetUserIds || [], replicate_notification: !!form.replicateNotification, only_notification: !!form.onlyNotification,
      related_tasks: form.relatedTasks || [], created_by: profile.id,
    });
    setShowNew(false);
    return { uploadError };
  };

  const refreshSelected = async (id) => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks(t || []);
    const fresh = (t || []).find((x) => x.id === id);
    if (fresh) setSelected(fresh);
  };

  const notifyFollowers = async (task, message) => {
    for (const followerId of task.followers || []) {
      if (followerId !== profile.id) await notify(followerId, task.id, message);
    }
  };

  const updateTask = async (task, patch, historyNote) => {
    await supabase.from("tasks").update(patch).eq("id", task.id);
    if (historyNote) {
      await addHistory(task.id, historyNote);
      await notifyFollowers(task, historyNote);
    }
    await refreshSelected(task.id);
  };

  const finalizeTask = async (task) => {
    await supabase.from("tasks").update({ status: "Finalizado", finalized_at: new Date().toISOString() }).eq("id", task.id);
    await addHistory(task.id, `${profile.name} finalizó el pendiente`);
    await notifyFollowers(task, `${profile.name} finalizó "${task.title}"`);
    await supabase.from("finalized_log").insert({ user_id: task.assigned_to_id || task.requested_by_id, task_title: task.title, delivered_at: task.delivered_at || null });
    await refreshSelected(task.id);
  };

  const deliverTask = async (task) => {
    await supabase.from("tasks").update({ status: "Entregado", delivered_at: new Date().toISOString(), delivery_reminder_sent: false }).eq("id", task.id);
    await addHistory(task.id, `${profile.name} marcó como entregado`);
    await notifyFollowers(task, `${profile.name} marcó como entregado "${task.title}"`);
    await refreshSelected(task.id);
  };

  const deleteTask = async (id) => { await supabase.from("tasks").delete().eq("id", id); setSelected(null); loadAll(); };
  // "Borrar pendientes programados": borra esta instancia Y detiene la
  // recurrencia (la plantilla deja de generar nuevas). "Borrar" solo pasa
  // por deleteTask de arriba, sin tocar la plantilla.
  const deleteRecurringTask = async (id, templateId) => {
    await supabase.from("recurring_templates").update({ active: false }).eq("id", templateId);
    await supabase.from("tasks").delete().eq("id", id);
    setSelected(null);
    loadAll();
  };

  // Recalcula el estado general de un pendiente (Colaborativo, o Individual con
  // subtareas) a partir del estado actual de todas sus subtareas, y lo guarda si
  // cambió. Solo los solicitantes se notifican cuando queda listo para finalizar.
  const applyGeneralStatusFromSubtasks = async (taskId, subtasksForTask) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === "Finalizado") return;
    const newStatus = computeGeneralStatus(subtasksForTask);
    if (!newStatus || newStatus === task.status) return;
    const patch = newStatus === "Entregado" ? { status: newStatus, delivered_at: new Date().toISOString(), delivery_reminder_sent: false } : { status: newStatus };
    await supabase.from("tasks").update(patch).eq("id", taskId);
    await addHistory(taskId, `Estado general actualizado automáticamente a "${newStatus}" según las subtareas`);
    if (newStatus === "Entregado") {
      const requesterIds = new Set([task.requested_by_id, task.responsible_id, ...(task.co_requester_ids || [])].filter(Boolean));
      for (const rid of requesterIds) {
        if (rid !== profile.id) await notify(rid, taskId, `Todas las subtareas de "${task.title}" fueron entregadas — ya puedes finalizarlo`);
      }
    }
  };

  const addSubtask = async (taskId, st) => {
    if (!st.title.trim() || !st.assignedToId) return;
    const stAssignee = profiles.find((p) => p.id === st.assignedToId);
    const { data: inserted } = await supabase.from("subtasks").insert({
      task_id: taskId, title: st.title, description: st.description,
      assigned_to_id: st.assignedToId, assigned_to_name: stAssignee ? stAssignee.name : "",
      deadline: st.deadline || null,
    }).select().single();
    if (st.assignedToId !== profile.id) {
      const task = tasks.find((t) => t.id === taskId);
      await notify(st.assignedToId, taskId, `Te asignaron la subtarea "${st.title}" dentro de "${task?.title || ""}"`);
    }
    const forTask = [...subtasks.filter((s) => s.task_id === taskId), inserted].filter(Boolean);
    await applyGeneralStatusFromSubtasks(taskId, forTask);
    loadAll();
  };

  const updateSubtaskStatus = async (subtask, status) => {
    const patch = status === "Entregado" ? { status, delivered_at: new Date().toISOString() } : { status };
    await supabase.from("subtasks").update(patch).eq("id", subtask.id);
    if (status === "Entregado") {
      const task = tasks.find((t) => t.id === subtask.task_id);
      if (task && task.requested_by_id && task.requested_by_id !== profile.id) {
        await notify(task.requested_by_id, task.id, `${subtask.assigned_to_name} entregó la subtarea "${subtask.title}" de "${task.title}"`);
      }
    }
    const forTask = subtasks.filter((s) => s.task_id === subtask.task_id).map((s) => (s.id === subtask.id ? { ...s, status } : s));
    await applyGeneralStatusFromSubtasks(subtask.task_id, forTask);
    loadAll();
  };

  const updateSubtaskDescription = async (subtask, description) => {
    await supabase.from("subtasks").update({ description }).eq("id", subtask.id);
    loadAll();
  };

  const markNotifsRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unread);
    loadNotifications(profile.id);
  };

  if (!ready) return <div style={{ background: C.spine, minHeight: "100vh" }} className="w-full" />;

  const isAdmin = profile?.role === "admin";
  const isGerente = profile?.role === "gerente" || profile?.role === "admin";
  const assignableProfiles = profiles.filter((p) => p.role !== "admin");
  const effectiveId = viewingAs || profile.id;
  const viewingProfile = viewingAs ? profiles.find((p) => p.id === viewingAs) : null;

  const readByTask = Object.fromEntries(commentReads.map((r) => [r.task_id, r.last_read_at]));
  const unreadCommentsByTask = {};
  for (const c of taskComments) {
    const lastRead = readByTask[c.task_id];
    if (lastRead && new Date(c.created_at) <= new Date(lastRead)) continue;
    unreadCommentsByTask[c.task_id] = (unreadCommentsByTask[c.task_id] || 0) + 1;
  }

  const isAssignedTo = (t, id) =>
    t.assigned_to_id === id ||
    (t.task_type === "colaborativo" && (t.team_member_ids || []).includes(id)) ||
    subtasks.some((s) => s.task_id === t.id && s.assigned_to_id === id);

  const isRequesterOf = (t, id) => t.requested_by_id === id || t.responsible_id === id || (t.co_requester_ids || []).includes(id);

  // "Programados": un pendiente cuenta como programado mientras su Día
  // programado (request_date) siga en el futuro — sea de frecuencia o no.
  // En cuanto llega esa fecha se "publica": deja de estar en Programados y
  // pasa a verse como cualquier pendiente Individual o Colaborativo normal
  // (No iniciado, asignado a quien corresponda). Si es de frecuencia, para
  // entonces el cron ya generó la SIGUIENTE ocurrencia por adelantado —con
  // sus fechas de solicitud y deadline ya actualizadas— así que en
  // Programados nunca hay un hueco: siempre hay una tarjeta viva.
  const isProgramado = (t) => !!t.request_date && t.request_date > todayISO();

  // Solo el solicitante ve un pendiente mientras está Programado — al
  // asignado no le debe salir todavía en "Mis pendientes" ni en "Todos"
  // (a menos que también sea de los solicitantes).
  let base = tasks;
  if (primaryTab === "requests") base = tasks.filter((t) => isRequesterOf(t, effectiveId));
  else if (primaryTab === "mine") base = tasks.filter((t) => isAssignedTo(t, effectiveId) && !isProgramado(t));
  else if (primaryTab === "all") base = tasks.filter((t) => isRequesterOf(t, effectiveId) || (isAssignedTo(t, effectiveId) && !isProgramado(t)));
  // Universo de la búsqueda avanzada (CHANGES.md #1): siempre "todos mis
  // pendientes" — los que solicité o me asignaron — sin importar qué pestaña
  // esté activa.
  const myTasks = tasks.filter((t) => isRequesterOf(t, effectiveId) || isAssignedTo(t, effectiveId));

  const filtered = base.filter((t) => {
    if (activeFilter.type === "Programados") return isProgramado(t);
    if (activeFilter.type === "Estado" && activeFilter.value) return t.status === activeFilter.value;
    if (activeFilter.type === "Urgencia" && activeFilter.value) return effectiveUrgency(t) === activeFilter.value;
    if (activeFilter.type === "Categoria" && activeFilter.value) return t.category === activeFilter.value;
    return true;
  });
  const categoryOptions = Array.from(new Set(base.map((t) => t.category).filter(Boolean))).sort();

  const sortByDoneThenDeadline = (a, b) => {
    const aDone = DONE_STATUSES.includes(a.status) ? 1 : 0, bDone = DONE_STATUSES.includes(b.status) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity, bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return ad - bd;
  };
  const urgencyGroupOrder = ["Muy urgente", "Urgente", "Alta", "Media", "Baja"];

  // Modo de agrupación de la lista: por default (o al filtrar a un valor
  // puntual de Estado/Urgencia/Categoría) se agrupa por urgencia, igual que
  // siempre. "Estado: de mayor/menor a menor/mayor" agrupa por estado en vez
  // de por urgencia. "Deadline" no agrupa — lista plana ordenada por fecha.
  let groupKeyOf = (t) => effectiveUrgency(t);
  let groupOrder = urgencyGroupOrder;
  let groupIsStatus = false;
  let flatDeadlineList = null;

  if (activeFilter.type === "Estado" && activeFilter.order) {
    groupKeyOf = (t) => t.status;
    groupOrder = activeFilter.order === "asc" ? [...STATUS_GROUP_ORDER].reverse() : STATUS_GROUP_ORDER;
    groupIsStatus = true;
  } else if (activeFilter.type === "Urgencia" && activeFilter.order === "asc") {
    groupOrder = [...urgencyGroupOrder].reverse();
  } else if (activeFilter.type === "Deadline" && activeFilter.order) {
    flatDeadlineList = [...filtered].sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity, bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return activeFilter.order === "asc" ? ad - bd : bd - ad;
    });
  }

  const grouped = {};
  if (!flatDeadlineList) {
    filtered.forEach((t) => { const k = groupKeyOf(t); (grouped[k] = grouped[k] || []).push(t); });
    Object.values(grouped).forEach((arr) => arr.sort(sortByDoneThenDeadline));
  }

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

      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-2.5 flex flex-wrap items-center gap-2 relative">
        {[["requests", "Mis solicitudes"], ["mine", "Mis pendientes"], ["all", "Todos"], ...(isAdmin ? [["popups", "Pop Ups"]] : [])].map(([key, label]) => (
          <button key={key} onClick={() => setPrimaryTab(key)}
            style={{ borderColor: primaryTab === key ? C.signal : C.hairline, background: primaryTab === key ? C.signal : "transparent", color: primaryTab === key ? "#fff" : C.ink }}
            className="border-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap">{label}</button>
        ))}
        {watchers.length > 0 && <Eye size={15} style={{ color: C.urgent }} />}
        {isGerente && (
          <div className="relative">
            <button onClick={() => setShowTeamPicker((v) => !v)}
              style={{ borderColor: viewingAs ? C.signal : C.hairline, background: viewingAs ? C.signal : "transparent", color: viewingAs ? "#fff" : C.ink }}
              className="border-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap flex items-center gap-1">
              Mi equipo <ChevronDown size={13} style={{ transform: showTeamPicker ? "rotate(180deg)" : "none" }} />
            </button>
            {showTeamPicker && (
              <div style={{ borderColor: C.hairline, background: C.paper }} className="absolute left-0 top-full mt-1 border z-30 min-w-[180px] shadow-lg">
                <button onClick={() => { stopViewingAs(); setShowTeamPicker(false); }} style={{ color: C.inkSoft, borderColor: C.hairline }} className="w-full text-left px-3 py-2 text-sm border-b">Ver el mío (salir)</button>
                {profiles.filter((p) => p.id !== profile.id && p.role !== "admin").map((p) => (
                  <button key={p.id} onClick={() => { startViewingAs(p.id); setShowTeamPicker(false); }}
                    style={{ color: viewingAs === p.id ? C.signal : C.ink, background: viewingAs === p.id ? C.signalSoft : "transparent" }}
                    className="w-full text-left px-3 py-2 text-sm">{p.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {viewingAs && viewingProfile && (
        <div style={{ background: C.signalSoft, color: C.signal }} className="px-5 py-2 text-sm flex items-center justify-between gap-2">
          <span>Viendo como <strong>{viewingProfile.name}</strong> (solo lectura)</span>
          <button onClick={stopViewingAs} className="underline text-xs">Salir</button>
        </div>
      )}

      {primaryTab === "popups" && isAdmin ? (
        <PopupsAdminPanel profile={profile} profiles={assignableProfiles} tasks={tasks} subtasks={subtasks} />
      ) : (
      <>
      <div style={{ borderColor: C.hairline }} className="border-b px-5 py-2.5 flex flex-wrap items-center gap-2">
        <button onClick={() => { setActiveFilter({ type: "Todos" }); setOpenFilterKey(null); }}
          style={{ borderColor: activeFilter.type === "Todos" ? C.spine : C.hairline, background: activeFilter.type === "Todos" ? C.spine : "transparent", color: activeFilter.type === "Todos" ? C.paper : C.inkSoft }}
          className="border px-2.5 py-1.5 text-xs whitespace-nowrap">Todos</button>
        {primaryTab === "requests" && (
          <button onClick={() => { setActiveFilter({ type: "Programados" }); setOpenFilterKey(null); }}
            style={{ borderColor: activeFilter.type === "Programados" ? C.spine : C.hairline, background: activeFilter.type === "Programados" ? C.spine : "transparent", color: activeFilter.type === "Programados" ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap">Programados</button>
        )}

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Estado" ? null : "Estado")}
            style={{ borderColor: activeFilter.type === "Estado" ? C.spine : C.hairline, background: activeFilter.type === "Estado" ? C.spine : "transparent", color: activeFilter.type === "Estado" ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap flex items-center gap-1">
            Estado <ChevronDown size={11} style={{ transform: openFilterKey === "Estado" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Estado" && (
            <div style={{ borderColor: C.hairline, background: C.paper }} className="absolute left-0 top-full mt-1 border z-30 min-w-[180px] shadow-lg py-1">
              {[...ASSIGNEE_STATUSES, "Finalizado"].map((s) => (
                <button key={s} onClick={() => { setActiveFilter({ type: "Estado", value: s }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Estado" && activeFilter.value === s ? C.signal : C.ink }}
                  className="w-full text-left px-3 py-1.5 text-sm">{s}</button>
              ))}
              <div style={{ borderColor: C.hairline }} className="border-t my-1" />
              <button onClick={() => { setActiveFilter({ type: "Estado", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Estado" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Estado", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Estado" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Urgencia" ? null : "Urgencia")}
            style={{ borderColor: activeFilter.type === "Urgencia" ? C.spine : C.hairline, background: activeFilter.type === "Urgencia" ? C.spine : "transparent", color: activeFilter.type === "Urgencia" ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap flex items-center gap-1">
            Urgencia <ChevronDown size={11} style={{ transform: openFilterKey === "Urgencia" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Urgencia" && (
            <div style={{ borderColor: C.hairline, background: C.paper }} className="absolute left-0 top-full mt-1 border z-30 min-w-[180px] shadow-lg py-1">
              {URGENCIES.map((u) => (
                <button key={u.label} onClick={() => { setActiveFilter({ type: "Urgencia", value: u.label }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Urgencia" && activeFilter.value === u.label ? C.signal : C.ink }}
                  className="w-full text-left px-3 py-1.5 text-sm">{u.label}</button>
              ))}
              <div style={{ borderColor: C.hairline }} className="border-t my-1" />
              <button onClick={() => { setActiveFilter({ type: "Urgencia", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Urgencia" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Urgencia", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Urgencia" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Categoria" ? null : "Categoria")}
            style={{ borderColor: activeFilter.type === "Categoria" ? C.spine : C.hairline, background: activeFilter.type === "Categoria" ? C.spine : "transparent", color: activeFilter.type === "Categoria" ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap flex items-center gap-1">
            Categoría <ChevronDown size={11} style={{ transform: openFilterKey === "Categoria" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Categoria" && (
            <div style={{ borderColor: C.hairline, background: C.paper }} className="absolute left-0 top-full mt-1 border z-30 min-w-[180px] shadow-lg py-1 max-h-64 overflow-y-auto">
              {categoryOptions.length === 0 && <div className="px-3 py-1.5 text-sm" style={{ color: C.inkSoft }}>Sin categorías todavía.</div>}
              {categoryOptions.map((c) => (
                <button key={c} onClick={() => { setActiveFilter({ type: "Categoria", value: c }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Categoria" && activeFilter.value === c ? C.signal : C.ink }}
                  className="w-full text-left px-3 py-1.5 text-sm">{c}</button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Deadline" ? null : "Deadline")}
            style={{ borderColor: activeFilter.type === "Deadline" ? C.spine : C.hairline, background: activeFilter.type === "Deadline" ? C.spine : "transparent", color: activeFilter.type === "Deadline" ? C.paper : C.inkSoft }}
            className="border px-2.5 py-1.5 text-xs whitespace-nowrap flex items-center gap-1">
            Deadline <ChevronDown size={11} style={{ transform: openFilterKey === "Deadline" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Deadline" && (
            <div style={{ borderColor: C.hairline, background: C.paper }} className="absolute left-0 top-full mt-1 border z-30 min-w-[180px] shadow-lg py-1">
              <button onClick={() => { setActiveFilter({ type: "Deadline", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Deadline" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Deadline", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Deadline" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3 py-1.5 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Lanzamiento del buscador — quitar esta leyenda después del 2026-08-31 */}
          {todayISO() === "2026-08-31" && (
            <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: C.signal }}>¡Nuevo!</span>
          )}
          <button onClick={() => setShowSearch(true)} title="Buscar pendientes" style={{ background: C.spine }} className="p-2 flex items-center justify-center">
            <Search size={15} style={{ color: C.paper }} />
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto pb-16">
        {flatDeadlineList ? (
          <>
            {flatDeadlineList.length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
            {flatDeadlineList.length > 0 && (
              <div className="mt-6">
                <div style={{ borderColor: C.hairline }} className="border-x border-t">
                  {flatDeadlineList.map((t) => <TaskRow key={t.id} task={t} unreadComments={unreadCommentsByTask[t.id] || 0} onOpen={() => setSelected(t)} />)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {Object.keys(grouped).length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
            {groupOrder.filter((k) => grouped[k]?.length).map((k) => {
              const color = groupIsStatus ? C.inkSoft : (URGENCIES.find((x) => x.label === k) || {}).color;
              const StatusIcon = groupIsStatus ? STATUS_ICON[k] : null;
              return (
                <div key={k} className="mt-6">
                  <div style={{ borderColor: color }} className="flex items-center gap-2 px-5 pb-1.5 border-b-2">
                    {groupIsStatus ? <StatusIcon size={14} style={{ color }} /> : <Flag size={14} fill={color} strokeWidth={0} style={{ color }} />}
                    <span style={{ color, fontFamily: "Georgia, serif" }} className="text-base uppercase tracking-wide">{k}</span>
                    <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>{grouped[k].length}</span>
                  </div>
                  <div style={{ borderColor: C.hairline }} className="border-x">
                    {grouped[k].map((t) => <TaskRow key={t.id} task={t} unreadComments={unreadCommentsByTask[t.id] || 0} onOpen={() => setSelected(t)} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      </>
      )}

      {showNew && <NewTaskForm onClose={() => { setShowNew(false); setAssignChangesFor(null); }} onCreate={createTask} onCreatePopup={createPopup} profiles={assignableProfiles} profile={profile} isAdmin={isAdmin} tasks={tasks} subtasks={subtasks} initialData={assignChangesFor} />}
      {popupQueue[0] && <PopupModal popup={popupQueue[0]} onClose={dismissPopup} tasks={tasks} subtasks={subtasks} profiles={profiles} onFinalizeTask={finalizeTask} />}
      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} onUpdate={updateTask} onDelete={deleteTask} onDeleteRecurring={deleteRecurringTask} recurringTemplates={recurringTemplates} onFinalize={finalizeTask} onDeliver={deliverTask} profiles={profiles} assignableProfiles={assignableProfiles} profile={profile} notify={notify} subtasks={subtasks.filter((s) => s.task_id === selected.id)} onAddSubtask={addSubtask} onUpdateSubtaskStatus={updateSubtaskStatus} onUpdateSubtaskDescription={updateSubtaskDescription} onAssignChanges={startAssignChanges} viewerIsGerente={!!viewingAs && !isAdmin} onCommentsRead={reloadMyCommentReads} />}
      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={assignableProfiles} tasks={tasks} />}
      {showActivity && <ActivityPanel onClose={() => setShowActivity(false)} profile={profile} router={router} />}
      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} notifications={notifications} onOpenTask={(taskId) => { const t = tasks.find((x) => x.id === taskId); if (t) setSelected(t); setShowNotifs(false); }} onOpenFilter={(target) => { if (target === "requests:Entregado") { setPrimaryTab("requests"); setActiveFilter({ type: "Estado", value: "Entregado" }); } setShowNotifs(false); }} pushSupported={pushSupported} pushEnabled={pushEnabled} onEnablePush={enablePush} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} tasks={myTasks} profiles={profiles} onOpenTask={(t) => { setSelected(t); setShowSearch(false); }} />}
    </div>
  );
}

function TaskRow({ task, onOpen, unreadComments = 0 }) {
  const Icon = STATUS_ICON[task.status];
  const isDone = DONE_STATUSES.includes(task.status);
  const veryUrgent = isOverdueUrgent(task);
  const urgent = task.urgency === "Urgente" && !isDone && !veryUrgent;
  const sameDay = task.request_date && task.deadline && task.request_date === task.deadline;
  const effType = effectiveTaskType(task);
  const typeLabel = TASK_TYPES.find((t) => t.key === effType)?.label;
  const programado = !!task.request_date && task.request_date > todayISO();
  return (
    <button onClick={onOpen} style={{ borderColor: C.hairline, background: veryUrgent ? C.veryUrgentSoft : urgent ? C.urgentSoft : C.panel }} className="w-full text-left border-b px-4 py-3 flex items-center gap-3">
      <Icon size={16} style={{ color: isDone ? C.signal : C.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.paper, color: C.inkSoft, border: `1px solid ${C.hairline}` }}>{task.category}</span>
          {effType && effType !== "individual" && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.signalSoft, color: C.signal, border: `1px solid ${C.signal}` }}>{typeLabel}</span>
          )}
          {programado && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 flex items-center gap-1" style={{ background: C.signalSoft, color: C.signal, border: `1px solid ${C.signal}` }}><Clock size={10} /> Programado</span>
          )}
          <span style={{ color: C.ink, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }} className="text-sm font-medium truncate">{task.title}</span>
          {task.changes_round > 0 && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: C.signalSoft, color: C.signal, border: `1px solid ${C.signal}` }}>Cambios Ronda {task.changes_round}</span>
          )}
          {unreadComments > 0 && (
            <span className="relative inline-flex" style={{ flexShrink: 0 }}>
              <MessageSquare size={14} style={{ color: C.inkSoft }} />
              <span style={{ background: C.urgent, color: "#fff" }} className="absolute -top-1.5 -right-1.5 text-[8px] font-mono px-1 py-0.5 leading-none rounded-full">{unreadComments > 9 ? "9+" : unreadComments}</span>
            </span>
          )}
          {Array.from({ length: task.remind_assignee_count || 0 }).map((_, i) => <Bell key={i} size={11} style={{ color: C.amber, flexShrink: 0 }} />)}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>solicita {task.requested_by}{(task.co_requester_names || []).length > 0 ? ` + ${task.co_requester_names.join(", ")}` : task.responsible_name ? ` + ${task.responsible_name}` : ""}</span>
          {task.task_type === "colaborativo" ? (
            <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>→ equipo ({(task.team_member_ids || []).length})</span>
          ) : (
            <span className="font-mono text-[11px]" style={{ color: C.inkSoft }}>→ {task.assigned_to_name}</span>
          )}
        </div>
      </div>
      <div>
        <DeadlineBadge deadline={task.deadline} status={task.status} hideToday={sameDay} />
        {sameDay && <div className="font-mono text-[9px] uppercase tracking-wider text-right mt-0.5" style={{ color: C.urgent }}>De hoy para hoy 💀</div>}
      </div>
      <ChevronRight size={15} style={{ color: C.inkSoft, flexShrink: 0 }} />
    </button>
  );
}

function NewTaskForm({ onClose, onCreate, onCreatePopup, profiles, profile, isAdmin, tasks, subtasks, initialData }) {
  const [mode, setMode] = useState("pendiente"); // "pendiente" | "popup" (solo admins ven el selector)
  const [taskType, setTaskType] = useState("individual"); // individual | personal | colaborativo
  const [title, setTitle] = useState(initialData?.title || ""), [description, setDescription] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]), [newCategory, setNewCategory] = useState("");
  const [deadline, setDeadline] = useState("");
  const [urgency, setUrgency] = useState("Media"), [assignedToId, setAssignedToId] = useState("");

  // Individual y Colaborativo: Programar pendiente (Día programado +
  // repetición opcional). El día de la semana / ocurrencia del mes no se
  // elige a mano — sale del Día programado.
  const [scheduling, setScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [repeatMode, setRepeatMode] = useState("none"); // "none" | "weekly" | "monthly"

  // Colaborativo: equipo + subtareas
  const [teamMemberIds, setTeamMemberIds] = useState([]);
  const [subtaskRows, setSubtaskRows] = useState([]);
  const [showSubtaskRule, setShowSubtaskRule] = useState(false);

  // Solicita: además de ti, puedes agregar más solicitantes (individual y colaborativo)
  const [coRequesterIds, setCoRequesterIds] = useState([]);
  const [showRequesterPicker, setShowRequesterPicker] = useState(false);
  const toggleCoRequester = (id) => setCoRequesterIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Campos del Pop Up
  const [popupTitle, setPopupTitle] = useState(""), [popupDesc, setPopupDesc] = useState("");
  const [popupDate, setPopupDate] = useState(""), [popupImage, setPopupImage] = useState(null);
  const [popupTime, setPopupTime] = useState(""), [popupTargetIds, setPopupTargetIds] = useState([]);
  const [replicateNotification, setReplicateNotification] = useState(false), [onlyNotification, setOnlyNotification] = useState(false);
  const [popupImageError, setPopupImageError] = useState(""), [popupSaving, setPopupSaving] = useState(false);
  const [showPopupConfirm, setShowPopupConfirm] = useState(false);
  const [popupTasks, setPopupTasks] = useState([]); // [{ id, fields: string[] }]

  const togglePopupTarget = (id) => setPopupTargetIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const togglePopupTask = (id) => setPopupTasks((prev) => prev.some((s) => s.id === id) ? prev.filter((s) => s.id !== id) : prev.length >= POPUP_TASK_LIMIT ? prev : [...prev, { id, fields: [] }]);
  const togglePopupTaskField = (id, key) => setPopupTasks((prev) => prev.map((s) => s.id === id ? { ...s, fields: s.fields.includes(key) ? s.fields.filter((k) => k !== key) : [...s.fields, key] } : s));
  const applyPopupFieldsToAll = () => setPopupTasks((prev) => {
    if (prev.length < 2) return prev;
    const base = prev[0].fields;
    return prev.map((s, i) => {
      if (i === 0) return s;
      const t = tasks.find((x) => x.id === s.id);
      const subsForTask = subtasks.filter((x) => x.task_id === s.id);
      const allowed = new Set(applicablePopupFields(t, subsForTask).map((f) => f.key));
      return { ...s, fields: base.filter((k) => allowed.has(k)) };
    });
  });

  const individualAssignable = profiles.filter((p) => p.id !== profile.id);

  const toggleTeamMember = (id) => {
    const removing = teamMemberIds.includes(id);
    setTeamMemberIds((prev) => removing ? prev.filter((x) => x !== id) : [...prev, id]);
    if (removing) {
      setSubtaskRows((rows) => rows.map((r) => (r.assignedToId === id ? { ...r, assignedToId: "" } : r)));
    }
  };
  const addSubtaskRow = () => setSubtaskRows((rows) => [...rows, { title: "", description: "", assignedToId: "", deadline: "" }]);
  const updateSubtaskRow = (i, field, value) => setSubtaskRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const removeSubtaskRow = (i) => setSubtaskRows((rows) => rows.filter((_, idx) => idx !== i));

  // Colaborativo: hasta que no crear pendiente hasta que cada miembro del equipo
  // tenga al menos una subtarea propia con título — si no, nadie del equipo podrá
  // marcar su parte como entregada y el pendiente jamás se podría finalizar.
  const missingSubtaskCoverage = taskType === "colaborativo" &&
    teamMemberIds.some((id) => !subtaskRows.some((r) => r.assignedToId === id && r.title.trim()));

  // Reglas de deadline (individual y colaborativo): nunca antes de hoy (o
  // del Día programado, si se está programando), y el deadline general
  // nunca antes que el deadline más lejano de las subtareas.
  const usesDeadlineRules = taskType === "individual" || taskType === "colaborativo";
  const todayStr = todayISO();
  const baseDateStr = scheduling && scheduledDate ? scheduledDate : todayStr;
  const subtaskDeadlines = usesDeadlineRules ? subtaskRows.map((r) => r.deadline).filter(Boolean) : [];
  const maxSubtaskDeadline = subtaskDeadlines.length ? subtaskDeadlines.reduce((a, b) => (a > b ? a : b)) : null;
  const minGeneralDeadline = maxSubtaskDeadline && maxSubtaskDeadline > baseDateStr ? maxSubtaskDeadline : baseDateStr;
  const deadlineError = !usesDeadlineRules ? "" :
    scheduling && !scheduledDate ? "Elige el día programado." :
    scheduling && repeatMode !== "none" && !deadline ? "Elige el deadline general." :
    deadline && deadline < baseDateStr ? `El deadline general no puede ser antes de ${scheduling ? "el día programado" : "hoy"}.` :
    subtaskDeadlines.some((d) => d < baseDateStr) ? `El deadline de una subtarea no puede ser antes de ${scheduling ? "el día programado" : "hoy"}.` :
    (deadline && maxSubtaskDeadline && deadline < maxSubtaskDeadline) ? "El deadline general no puede ser antes que el de alguna subtarea." :
    "";

  const submit = () => {
    if (!title.trim()) return;
    const finalCategory = newCategory.trim() || category;
    const changesRound = initialData?.changesRound || null;
    if (taskType === "individual") {
      if (!assignedToId || deadlineError) return;
      onCreate({ title, description, category: finalCategory, taskType, requestedById: profile.id, coRequesterIds, deadline, urgency, assignedToId, subtasks: subtaskRows, scheduling, scheduledDate, repeatMode, changesRound });
    } else if (taskType === "personal") {
      onCreate({ title, description, category: finalCategory, taskType, requestedById: profile.id, deadline, urgency, assignedToId: profile.id, changesRound });
    } else if (taskType === "colaborativo") {
      if (teamMemberIds.length < 2 || deadlineError || missingSubtaskCoverage) return;
      onCreate({ title, description, category: finalCategory, taskType, requestedById: profile.id, coRequesterIds, deadline, urgency, teamMemberIds, subtasks: subtaskRows, scheduling, scheduledDate, repeatMode, changesRound });
    }
  };

  const handleCreateClick = () => {
    if (taskType === "colaborativo" && missingSubtaskCoverage) { setShowSubtaskRule(true); return; }
    submit();
  };

  const handlePopupImage = (e) => {
    const file = e.target.files?.[0] || null;
    setPopupImageError("");
    if (file) {
      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? 15 * 1024 * 1024 : 3 * 1024 * 1024;
      if (file.size > maxSize) {
        setPopupImageError(isVideo
          ? "El video pesa más de 15 MB — comprímelo o acórtalo antes de subirlo (recomendado: menos de 8 MB, 10-15 segundos)."
          : "El archivo pesa más de 3 MB — comprímelo antes de subirlo (recomendado: menos de 400 KB).");
        setPopupImage(null);
        e.target.value = "";
        return;
      }
    }
    setPopupImage(file);
  };

  const submitPopup = async () => {
    if (!popupTitle.trim() || popupSaving) return;
    setPopupSaving(true);
    const result = await onCreatePopup({
      title: popupTitle, description: popupDesc, scheduledDate: popupDate, scheduledTime: popupTime || null,
      targetUserIds: popupTargetIds, replicateNotification, onlyNotification, relatedTasks: popupTasks,
      imageFile: onlyNotification ? null : popupImage,
    });
    setPopupSaving(false);
    if (result?.uploadError) alert(`El pop up se creó, pero el archivo no se pudo subir (${result.uploadError}). Revisa en Supabase que el bucket "popups" permita ese tipo de archivo y tamaño.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-lg border max-h-[90vh] overflow-y-auto">
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between">
          {isAdmin ? (
            <div className="flex items-center gap-1.5">
              {[["pendiente", "Pendiente"], ["popup", "Pop Up"]].map(([key, label]) => (
                <button key={key} onClick={() => setMode(key)}
                  style={{ borderColor: mode === key ? C.signal : C.hairline, background: mode === key ? C.signal : "transparent", color: mode === key ? "#fff" : C.ink }}
                  className="border-2 px-3 py-1.5 text-sm font-medium">{label}</button>
              ))}
            </div>
          ) : (
            <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">Nuevo pendiente</h2>
          )}
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>

        {mode === "popup" && isAdmin ? (
          <div className="p-5 flex flex-col gap-4">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Título</label>
              <input value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</label>
              <textarea value={popupDesc} onChange={(e) => setPopupDesc(e.target.value)} rows={4} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>¿A quién le sale?</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {profiles.map((p) => (
                  <button key={p.id} type="button" onClick={() => togglePopupTarget(p.id)}
                    style={{ borderColor: popupTargetIds.includes(p.id) ? C.signal : C.hairline, background: popupTargetIds.includes(p.id) ? C.signal : "transparent", color: popupTargetIds.includes(p.id) ? "#fff" : C.ink }}
                    className="border px-2.5 py-1 text-xs">{p.name}</button>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Sin nadie seleccionado = le sale a todo el equipo.</p>
            </div>
            <PopupTaskPicker profiles={profiles} tasks={tasks} subtasks={subtasks} selected={popupTasks} onToggleTask={togglePopupTask} onToggleField={togglePopupTaskField} onApplyToAll={applyPopupFieldsToAll} />
            {!onlyNotification && (
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}><ImageIcon size={12} /> Imagen, GIF o video (opcional)</label>
                <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handlePopupImage} className="text-sm mt-1.5 block" />
                <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Imagen: 800×450px (16:9), JPG/WebP, menos de 400 KB. Video/GIF: cortos (10-15 seg) y menos de 8 MB — se reproducen solos, sin sonido, al abrir el pop up.</p>
                {popupImageError && <p className="text-[11px] mt-1" style={{ color: C.urgent }}>{popupImageError}</p>}
                {popupImage && !popupImageError && <p className="text-[11px] mt-1" style={{ color: C.signal }}>Lista: {popupImage.name}</p>}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
                <input type="checkbox" checked={replicateNotification} disabled={onlyNotification} onChange={(e) => setReplicateNotification(e.target.checked)} className="mt-0.5" />
                <span>Replicar en notificación <span className="block text-[11px]" style={{ color: C.inkSoft }}>Además del pop up, deja también un aviso en la campanita.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
                <input type="checkbox" checked={onlyNotification} onChange={(e) => { setOnlyNotification(e.target.checked); if (e.target.checked) setReplicateNotification(false); }} className="mt-0.5" />
                <span>Solo notificación <span className="block text-[11px]" style={{ color: C.inkSoft }}>Ya no sale como pop up — solo llega a la campanita.</span></span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Día programado (opcional)</label>
                <input type="date" value={popupDate} onChange={(e) => setPopupDate(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
                <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Vacío = se guarda en "Nuevos" para programarlo después.</p></div>
              <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Hora (opcional)</label>
                <input type="time" value={popupTime} onChange={(e) => setPopupTime(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
                <p className="text-[10px] mt-1" style={{ color: C.inkSoft }}>Vacío = aparece todo el día.</p></div>
            </div>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-1.5">
              {TASK_TYPES.map((tt) => (
                <button key={tt.key} onClick={() => setTaskType(tt.key)}
                  style={{ borderColor: taskType === tt.key ? C.signal : C.hairline, background: taskType === tt.key ? C.signal : "transparent", color: taskType === tt.key ? "#fff" : C.ink }}
                  className="border px-2.5 py-1.5 text-xs font-medium">{tt.label}</button>
              ))}
            </div>

            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Título{initialData && <span className="ml-1.5" style={{ color: C.signal }}>· Cambios Ronda {initialData.changesRound}</span>}</label>
              <input value={title} onChange={(e) => !initialData && setTitle(e.target.value)} readOnly={!!initialData} style={{ borderColor: C.hairline, background: initialData ? C.panel : C.panel, color: initialData ? C.inkSoft : C.ink, cursor: initialData ? "not-allowed" : "text" }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
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

            {taskType === "individual" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}>
                      Solicita
                      <button type="button" onClick={() => setShowRequesterPicker((v) => !v)} title="Agregar más solicitantes" style={{ borderColor: C.signal, color: C.signal }} className="border rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none"><Plus size={9} /></button>
                    </label>
                    <div style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft }} className="w-full border px-3 py-2 text-sm mt-1">
                      {profile.name} (tú){coRequesterIds.length > 0 ? ` + ${coRequesterIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}` : ""}
                    </div>
                  </div>
                  <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Asignar a</label>
                    <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                      <option value="">Elegir persona...</option>
                      {individualAssignable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></div>
                </div>
                {showRequesterPicker && (
                  <div style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {profiles.filter((p) => p.id !== profile.id).map((p) => (
                        <button key={p.id} type="button" onClick={() => toggleCoRequester(p.id)}
                          style={{ borderColor: coRequesterIds.includes(p.id) ? C.signal : C.hairline, background: coRequesterIds.includes(p.id) ? C.signal : "transparent", color: coRequesterIds.includes(p.id) ? "#fff" : C.ink }}
                          className="border px-2.5 py-1 text-xs">{p.name}</button>
                      ))}
                    </div>
                    <p className="text-[11px]" style={{ color: C.inkSoft }}>Las personas que selecciones aparecerán contigo como solicitantes.</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Subtareas</label>
                    <button type="button" onClick={addSubtaskRow} disabled={!assignedToId} style={{ color: C.signal }} className="text-xs flex items-center gap-1 disabled:opacity-40"><Plus size={12} /> Agregar subtarea</button>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {subtaskRows.map((row, i) => (
                      <div key={i} style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
                        <div className="flex gap-1.5">
                          <input value={row.title} onChange={(e) => updateSubtaskRow(i, "title", e.target.value)} placeholder="Título de la subtarea" style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-2 py-1.5 text-xs outline-none" />
                          <button type="button" onClick={() => removeSubtaskRow(i)}><X size={14} style={{ color: C.inkSoft }} /></button>
                        </div>
                        <textarea value={row.description} onChange={(e) => updateSubtaskRow(i, "description", e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none resize-y" />
                        <input type="date" value={row.deadline} min={baseDateStr} max={deadline || undefined} onChange={(e) => updateSubtaskRow(i, "deadline", e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none" />
                      </div>
                    ))}
                    {subtaskRows.length === 0 && <p className="text-[11px]" style={{ color: C.inkSoft }}>Sin subtarea con deadline propio, hereda el deadline general de abajo. Se asignarán a {assignedToId ? (individualAssignable.find((p) => p.id === assignedToId)?.name || "la persona asignada") : "la persona que asignes"}.</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => setScheduling((v) => !v)}
                    style={{ borderColor: scheduling ? C.signal : C.hairline, background: scheduling ? C.signal : "transparent", color: scheduling ? "#fff" : C.ink }}
                    className="border px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"><Clock size={13} /> Programar pendiente</button>
                  {scheduling && (
                    <select value={repeatMode} onChange={(e) => setRepeatMode(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2.5 py-1.5 text-xs outline-none">
                      {REPEAT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
                </div>
                {scheduling ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Día programado</label>
                      <input type="date" value={scheduledDate} min={todayStr} onChange={(e) => setScheduledDate(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline General</label>
                      <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div className="col-span-2"><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
                      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                        {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                      </select></div>
                    {deadlineError && <p className="col-span-2 text-[11px]" style={{ color: C.urgent }}>{deadlineError}</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline general</label>
                      <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
                      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                        {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                      </select></div>
                    {deadlineError && <p className="col-span-2 text-[11px]" style={{ color: C.urgent }}>{deadlineError}</p>}
                  </div>
                )}
              </>
            )}

            {taskType === "personal" && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline</label>
                  <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
                  <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                    {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                  </select></div>
              </div>
            )}

            {taskType === "colaborativo" && (
              <>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}>
                    Solicita
                    <button type="button" onClick={() => setShowRequesterPicker((v) => !v)} title="Agregar más solicitantes" style={{ borderColor: C.signal, color: C.signal }} className="border rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none"><Plus size={9} /></button>
                  </label>
                  <div style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft }} className="w-full border px-3 py-2 text-sm mt-1">
                    {profile.name} (tú){coRequesterIds.length > 0 ? ` + ${coRequesterIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}` : ""}
                  </div>
                </div>
                {showRequesterPicker && (
                  <div style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {profiles.filter((p) => p.id !== profile.id).map((p) => (
                        <button key={p.id} type="button" onClick={() => toggleCoRequester(p.id)}
                          style={{ borderColor: coRequesterIds.includes(p.id) ? C.signal : C.hairline, background: coRequesterIds.includes(p.id) ? C.signal : "transparent", color: coRequesterIds.includes(p.id) ? "#fff" : C.ink }}
                          className="border px-2.5 py-1 text-xs">{p.name}</button>
                      ))}
                    </div>
                    <p className="text-[11px]" style={{ color: C.inkSoft }}>Las personas que selecciones aparecerán contigo como solicitantes.</p>
                  </div>
                )}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Equipo de trabajo</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {profiles.map((p) => (
                      <button key={p.id} type="button" onClick={() => toggleTeamMember(p.id)}
                        style={{ borderColor: teamMemberIds.includes(p.id) ? C.signal : C.hairline, background: teamMemberIds.includes(p.id) ? C.signal : "transparent", color: teamMemberIds.includes(p.id) ? "#fff" : C.ink }}
                        className="border px-2.5 py-1 text-xs">{p.name}</button>
                    ))}
                  </div>
                  {teamMemberIds.length < 2 && <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>Selecciona al menos 2 personas del equipo.</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Subtareas</label>
                    <button type="button" onClick={addSubtaskRow} disabled={teamMemberIds.length === 0} style={{ color: C.signal }} className="text-xs flex items-center gap-1 disabled:opacity-40"><Plus size={12} /> Agregar subtarea</button>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {subtaskRows.map((row, i) => (
                      <div key={i} style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
                        <div className="flex gap-1.5">
                          <input value={row.title} onChange={(e) => updateSubtaskRow(i, "title", e.target.value)} placeholder="Título de la subtarea" style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-2 py-1.5 text-xs outline-none" />
                          <button type="button" onClick={() => removeSubtaskRow(i)}><X size={14} style={{ color: C.inkSoft }} /></button>
                        </div>
                        <textarea value={row.description} onChange={(e) => updateSubtaskRow(i, "description", e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none resize-y" />
                        <div className="grid grid-cols-2 gap-1.5">
                          <select value={row.assignedToId} onChange={(e) => updateSubtaskRow(i, "assignedToId", e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none">
                            <option value="">Asignar a...</option>
                            {profiles.filter((p) => teamMemberIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <input type="date" value={row.deadline} min={baseDateStr} max={deadline || undefined} onChange={(e) => updateSubtaskRow(i, "deadline", e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none" />
                        </div>
                      </div>
                    ))}
                    {subtaskRows.length === 0 && <p className="text-[11px]" style={{ color: C.inkSoft }}>Sin subtarea con deadline propio, hereda el deadline general de abajo.</p>}
                  </div>
                  {missingSubtaskCoverage && (
                    <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>
                      Falta asignar subtarea a: {teamMemberIds.filter((id) => !subtaskRows.some((r) => r.assignedToId === id && r.title.trim())).map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => setScheduling((v) => !v)}
                    style={{ borderColor: scheduling ? C.signal : C.hairline, background: scheduling ? C.signal : "transparent", color: scheduling ? "#fff" : C.ink }}
                    className="border px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"><Clock size={13} /> Programar pendiente</button>
                  {scheduling && (
                    <select value={repeatMode} onChange={(e) => setRepeatMode(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2.5 py-1.5 text-xs outline-none">
                      {REPEAT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
                </div>
                {scheduling ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Día programado</label>
                      <input type="date" value={scheduledDate} min={todayStr} onChange={(e) => setScheduledDate(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline General</label>
                      <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div className="col-span-2"><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
                      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                        {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                      </select></div>
                    {deadlineError && <p className="col-span-2 text-[11px]" style={{ color: C.urgent }}>{deadlineError}</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline general</label>
                      <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
                    <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
                      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                        {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                      </select></div>
                    {deadlineError && <p className="col-span-2 text-[11px]" style={{ color: C.urgent }}>{deadlineError}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ borderColor: C.hairline }} className="border-t px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          {mode === "popup" && isAdmin ? (
            <button onClick={() => setShowPopupConfirm(true)} disabled={!popupTitle.trim() || popupSaving || !!popupImageError} style={{ background: C.spine, color: C.paper, opacity: popupSaving ? 0.6 : 1 }} className="px-4 py-2 text-sm disabled:cursor-not-allowed">¿Listo?</button>
          ) : (
            <button onClick={handleCreateClick} disabled={usesDeadlineRules && !!deadlineError} style={{ background: C.spine, color: C.paper, opacity: usesDeadlineRules && deadlineError ? 0.5 : 1 }} className="px-4 py-2 text-sm disabled:cursor-not-allowed">Crear pendiente</button>
          )}
        </div>
      </div>
      {showSubtaskRule && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.6)" }} onClick={() => setShowSubtaskRule(false)}>
          <div style={{ background: C.paper, borderColor: C.hairline }} className="border max-w-xs p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold" style={{ color: C.urgent }}>Tienes que asignar subtareas</p>
            <p className="text-sm mt-2" style={{ color: C.ink }}>Si no asignas subtareas los de tu equipo no podrán seleccionar que ya entregaron su parte y el pendiente no se podrá finalizar.</p>
            <button onClick={() => setShowSubtaskRule(false)} style={{ background: C.spine, color: C.paper }} className="mt-3 px-3 py-1.5 text-xs w-full">Entendido</button>
          </div>
        </div>
      )}
      {showPopupConfirm && (
        <PopupConfirmModal
          title={popupTitle} description={popupDesc}
          existingUrl={null} file={onlyNotification ? null : popupImage}
          onlyNotification={onlyNotification} replicateNotification={replicateNotification}
          onCancel={() => setShowPopupConfirm(false)} onConfirm={submitPopup}
          confirmLabel="Crear" busy={popupSaving}
        />
      )}
    </div>
  );
}

const POPUP_TABS = [
  ["nuevos", "Nuevos"],
  ["programados", "Programados"],
  ["historial", "Historial"],
];

// CHANGES.md #3: clasifica cada pop up en Nuevos (sin scheduled_date todavía
// — editable, listo para programar), Programados (con fecha futura, aún no
// sale) o Historial (fecha ya pasada, ya salió — se auto-borra a los 3 días
// vía el cron de cleanup-notifications).
function classifyPopup(p, today) {
  if (!p.scheduled_date) return "nuevos";
  return p.scheduled_date >= today ? "programados" : "historial";
}

function PopupsAdminPanel({ profile, profiles, tasks, subtasks }) {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // popup object or null
  const [tab, setTab] = useState("nuevos");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("popups").select("*").order("scheduled_date", { ascending: true });
    setPopups(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = todayISO();
  const grouped = { nuevos: [], programados: [], historial: [] };
  popups.forEach((p) => grouped[classifyPopup(p, today)].push(p));
  const shown = grouped[tab];
  const emptyMessage = {
    nuevos: "Sin borradores por ahora.",
    programados: "No hay pop ups programados todavía. Créalos desde el botón \"Nuevo\".",
    historial: "Sin historial todavía.",
  }[tab];

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <div className="flex gap-2 mb-4">
        {POPUP_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ borderColor: tab === key ? C.signal : C.hairline, background: tab === key ? C.signal : "transparent", color: tab === key ? "#fff" : C.ink }}
            className="border-2 px-3 py-1.5 text-sm font-medium">
            {label} <span className="font-mono text-[10px]">({grouped[key].length})</span>
          </button>
        ))}
      </div>
      {loading && <p className="text-sm" style={{ color: C.inkSoft }}>Cargando...</p>}
      {!loading && shown.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>{emptyMessage}</p>}
      <div className="flex flex-col gap-2">
        {shown.map((p) => {
          const targetLabel = !p.target_user_ids || p.target_user_ids.length === 0 ? "Todo el equipo" : `${p.target_user_ids.length} persona(s)`;
          const dateLabel = p.scheduled_date ? `${fmtDate(p.scheduled_date)}${p.scheduled_time ? " · " + p.scheduled_time.slice(0, 5) : ""}` : "Sin programar todavía";
          return (
            <button key={p.id} onClick={() => setEditing(p)} style={{ borderColor: C.hairline, background: C.panel }} className="border p-3.5 text-left flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: C.ink }}>{p.title}{p.only_notification && <span className="ml-1.5 font-mono text-[10px]" style={{ color: C.inkSoft }}>· solo notificación</span>}</div>
                <div className="font-mono text-[11px] mt-0.5" style={{ color: C.inkSoft }}>
                  {dateLabel} · {targetLabel}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: C.inkSoft }} />
            </button>
          );
        })}
      </div>
      {editing && <PopupEditForm popup={editing} profiles={profiles} tasks={tasks} subtasks={subtasks} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PopupEditForm({ popup, profiles, tasks, subtasks, onClose, onSaved }) {
  const [title, setTitle] = useState(popup.title || "");
  const [description, setDescription] = useState(popup.description || "");
  const [scheduledDate, setScheduledDate] = useState(popup.scheduled_date || "");
  const [scheduledTime, setScheduledTime] = useState(popup.scheduled_time ? popup.scheduled_time.slice(0, 5) : "");
  const [targetUserIds, setTargetUserIds] = useState(popup.target_user_ids || []);
  const [popupTasks, setPopupTasks] = useState(popup.related_tasks || []); // [{ id, fields: string[] }]
  const toggleTask = (id) => setPopupTasks((prev) => prev.some((s) => s.id === id) ? prev.filter((s) => s.id !== id) : prev.length >= POPUP_TASK_LIMIT ? prev : [...prev, { id, fields: [] }]);
  const toggleTaskField = (id, key) => setPopupTasks((prev) => prev.map((s) => s.id === id ? { ...s, fields: s.fields.includes(key) ? s.fields.filter((k) => k !== key) : [...s.fields, key] } : s));
  const applyFieldsToAll = () => setPopupTasks((prev) => {
    if (prev.length < 2) return prev;
    const base = prev[0].fields;
    return prev.map((s, i) => {
      if (i === 0) return s;
      const t = tasks.find((x) => x.id === s.id);
      const subsForTask = subtasks.filter((x) => x.task_id === s.id);
      const allowed = new Set(applicablePopupFields(t, subsForTask).map((f) => f.key));
      return { ...s, fields: base.filter((k) => allowed.has(k)) };
    });
  });
  const [replicateNotification, setReplicateNotification] = useState(!!popup.replicate_notification);
  const [onlyNotification, setOnlyNotification] = useState(!!popup.only_notification);
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const toggleTarget = (id) => setTargetUserIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleImage = (e) => {
    const file = e.target.files?.[0] || null;
    setImageError("");
    if (file) {
      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? 15 * 1024 * 1024 : 3 * 1024 * 1024;
      if (file.size > maxSize) {
        setImageError(isVideo
          ? "El video pesa más de 15 MB — comprímelo o acórtalo antes de subirlo."
          : "El archivo pesa más de 3 MB — comprímelo antes de subirlo.");
        setImageFile(null);
        e.target.value = "";
        return;
      }
    }
    setImageFile(file);
  };

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const oldPath = popupStoragePath(popup.image_url);
    const replacingMedia = !!imageFile;
    let imageUrl = popup.image_url || null;
    let uploadError = null;
    if (imageFile) {
      const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("popups").upload(path, imageFile, { cacheControl: "3600", upsert: false });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("popups").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      } else {
        uploadError = upErr.message;
      }
    }
    await supabase.from("popups").update({
      title: title.trim(), description, image_url: imageUrl,
      scheduled_date: scheduledDate || null, scheduled_time: scheduledTime || null,
      target_user_ids: targetUserIds, replicate_notification: replicateNotification, only_notification: onlyNotification,
      related_tasks: popupTasks,
    }).eq("id", popup.id);
    // Ya reemplazado por el nuevo archivo/link — borra el viejo del bucket para no dejar basura.
    if (replacingMedia && !uploadError && oldPath) await supabase.storage.from("popups").remove([oldPath]);
    setSaving(false);
    if (uploadError) alert(`Se guardaron los demás cambios, pero el archivo no se pudo subir (${uploadError}). Revisa en Supabase que el bucket "popups" permita ese tipo de archivo y tamaño.`);
    onSaved();
  };

  const remove = async () => {
    if (!confirm("¿Borrar este pop up? Ya no le saldrá a nadie.")) return;
    setDeleting(true);
    const path = popupStoragePath(popup.image_url);
    if (path) await supabase.storage.from("popups").remove([path]);
    await supabase.from("popups").delete().eq("id", popup.id);
    setDeleting(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-lg border max-h-[90vh] overflow-y-auto">
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">Editar Pop Up</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>¿A quién le sale?</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {profiles.map((p) => (
                <button key={p.id} type="button" onClick={() => toggleTarget(p.id)}
                  style={{ borderColor: targetUserIds.includes(p.id) ? C.signal : C.hairline, background: targetUserIds.includes(p.id) ? C.signal : "transparent", color: targetUserIds.includes(p.id) ? "#fff" : C.ink }}
                  className="border px-2.5 py-1 text-xs">{p.name}</button>
              ))}
            </div>
            <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Sin nadie seleccionado = le sale a todo el equipo.</p>
          </div>
          <PopupTaskPicker profiles={profiles} tasks={tasks} subtasks={subtasks} selected={popupTasks} onToggleTask={toggleTask} onToggleField={toggleTaskField} onApplyToAll={applyFieldsToAll} />
          {popup.image_url && !imageFile && !onlyNotification && (
            <PopupMediaPreview url={popup.image_url} maxHeight={160} />
          )}
          {!onlyNotification && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}><ImageIcon size={12} /> Reemplazar imagen, GIF o video (opcional)</label>
              <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleImage} className="text-sm mt-1.5 block" />
              <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Imagen: 800×450px, JPG/WebP, menos de 400 KB. Video/GIF: menos de 8 MB.</p>
              {imageError && <p className="text-[11px] mt-1" style={{ color: C.urgent }}>{imageError}</p>}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
              <input type="checkbox" checked={replicateNotification} disabled={onlyNotification} onChange={(e) => setReplicateNotification(e.target.checked)} className="mt-0.5" />
              <span>Replicar en notificación</span>
            </label>
            <label className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
              <input type="checkbox" checked={onlyNotification} onChange={(e) => { setOnlyNotification(e.target.checked); if (e.target.checked) setReplicateNotification(false); }} className="mt-0.5" />
              <span>Solo notificación</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Día programado (opcional)</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
              <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Vacío = se queda en "Nuevos".</p></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Hora (opcional)</label>
              <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          </div>
        </div>
        <div style={{ borderColor: C.hairline }} className="border-t px-5 py-4 flex justify-between gap-2">
          <button onClick={remove} disabled={deleting} style={{ color: C.urgent }} className="px-3 py-2 text-sm flex items-center gap-1.5 disabled:opacity-60"><Trash2 size={14} /> {deleting ? "Borrando..." : "Borrar"}</button>
          <div className="flex gap-2">
            <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
            <button onClick={() => setShowConfirm(true)} disabled={!title.trim() || saving || !!imageError} style={{ background: C.spine, color: C.paper, opacity: saving ? 0.6 : 1 }} className="px-4 py-2 text-sm disabled:cursor-not-allowed">¿Listo?</button>
          </div>
        </div>
      </div>
      {showConfirm && (
        <PopupConfirmModal
          title={title} description={description}
          existingUrl={popup.image_url} file={onlyNotification ? null : imageFile}
          onlyNotification={onlyNotification} replicateNotification={replicateNotification}
          onCancel={() => setShowConfirm(false)} onConfirm={save}
          confirmLabel="Guardar" busy={saving}
        />
      )}
    </div>
  );
}

function canFinalizeInPopup(task, subsForTask) {
  if (task.status === "Finalizado") return false;
  if (subsForTask.length > 0) return subsForTask.every((s) => s.status === "Entregado");
  return task.status === "Entregado";
}

function PopupTaskBreakdown({ task, fields, profiles, subtasks, onFinalizeTask }) {
  const [busy, setBusy] = useState(false);
  const [justFinalized, setJustFinalized] = useState(false);
  const subsForTask = subtasks.filter((s) => s.task_id === task.id);
  const hasSubtasks = subsForTask.length > 0;
  const isColaborativo = task.task_type === "colaborativo";
  const coRequesterNames = (task.co_requester_names || []).length > 0 ? task.co_requester_names : (task.responsible_name ? [task.responsible_name] : []);
  const teamNames = profiles.filter((p) => (task.team_member_ids || []).includes(p.id)).map((p) => p.name);
  const deliveredCount = subsForTask.filter((s) => s.status === "Entregado").length;
  const canFinalize = fields.includes("finalize") && canFinalizeInPopup(task, subsForTask);
  const isFinalized = task.status === "Finalizado" || justFinalized;
  const showDownload = fields.includes("finalize") && isFinalized;
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const handleFinalize = async () => {
    setBusy(true);
    await onFinalizeTask(task);
    setJustFinalized(true);
    setBusy(false);
  };

  const handleDownload = async () => {
    const { data: history } = await supabase.from("task_history").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
    const { data: comments } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at");
    const lines = [
      `Pendiente: ${task.title}`, `Categoría: ${task.category}`,
      `Solicita: ${task.requested_by}${coRequesterNames.length ? " + " + coRequesterNames.join(", ") : ""}`,
      isColaborativo ? `Equipo: ${teamNames.join(", ")}` : `Asignado a: ${task.assigned_to_name}`,
      `Deadline: ${fmtDate(task.deadline)}`, `Estado final: ${task.status}`, "", "--- Historial ---",
      ...(history || []).slice().reverse().map((h) => `[${new Date(h.created_at).toLocaleString("es-MX")}] ${h.text}`),
      "", "--- Comentarios ---",
      ...(comments || []).map((c) => `[${new Date(c.created_at).toLocaleString("es-MX")}] ${c.author_name}: ${c.text}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${task.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ borderColor: C.hairline, background: C.panel }} className="border-t px-3 py-2.5 flex flex-col gap-2.5 text-xs">
      {fields.includes("requester") && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Solicitante/s</div><div style={{ color: C.ink }}>{task.requested_by}{coRequesterNames.length ? ` + ${coRequesterNames.join(", ")}` : ""}</div></div>
      )}
      {fields.includes("assignee") && !isColaborativo && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Asignado</div><div style={{ color: C.ink }}>{task.assigned_to_name || "—"}</div></div>
      )}
      {fields.includes("team") && isColaborativo && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Equipo de trabajo</div><div style={{ color: C.ink }}>{teamNames.join(", ") || "—"}</div></div>
      )}
      {fields.includes("description") && task.description && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</div><div style={{ color: C.ink }} className="whitespace-pre-wrap break-words">{renderWithLinks(task.description, C.signal)}</div></div>
      )}
      {fields.includes("status") && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Estado</div><div style={{ color: C.ink }}>{task.status}</div></div>
      )}
      {fields.includes("generalStatus") && hasSubtasks && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Estado general</div><div style={{ color: C.ink }}>{task.status} ({deliveredCount}/{subsForTask.length} subtareas entregadas)</div></div>
      )}
      {fields.includes("requestedDate") && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Fecha de solicitud</div><div style={{ color: C.ink }}>{fmtDate(task.request_date)}</div></div>
      )}
      {fields.includes("deadline") && (
        <div><div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Fecha de deadline</div><div style={{ color: C.ink }}>{fmtDate(task.deadline)}</div></div>
      )}
      {fields.includes("deliveredDate") && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Fecha de entregado</div>
          {hasSubtasks ? (
            <div className="flex flex-col gap-0.5 mt-0.5">
              {subsForTask.map((s) => <div key={s.id} style={{ color: C.ink }}>{s.title}: {fmtDateTime(s.delivered_at) || "aún no entregada"}</div>)}
            </div>
          ) : (
            <div style={{ color: C.ink }}>{fmtDateTime(task.delivered_at) || "aún no entregado"}</div>
          )}
        </div>
      )}
      {fields.includes("subtasksList") && hasSubtasks && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Subtareas ({deliveredCount}/{subsForTask.length})</div>
          <div className="flex flex-col gap-0.5 mt-0.5">
            {subsForTask.map((s) => <div key={s.id} style={{ color: C.ink }}>{s.title} — {s.assigned_to_name} · {s.status}</div>)}
          </div>
        </div>
      )}
      {canFinalize && (
        <button onClick={handleFinalize} disabled={busy} style={{ background: C.signal, color: "#fff" }} className="px-3 py-1.5 text-xs disabled:opacity-60">{busy ? "Finalizando..." : "Finalizar pendiente"}</button>
      )}
      {showDownload && (
        <button onClick={handleDownload} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-1.5 text-xs flex items-center justify-center gap-1.5"><Download size={12} /> Descargar historial</button>
      )}
    </div>
  );
}

function PopupModal({ popup, onClose, tasks, subtasks, profiles, onFinalizeTask }) {
  const [openTaskId, setOpenTaskId] = useState(null);
  const [showFullMedia, setShowFullMedia] = useState(false);
  const relatedEntries = (popup.related_tasks || [])
    .map((entry) => ({ entry, task: tasks.find((t) => t.id === entry.id) }))
    .filter((x) => x.task);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.7)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-sm border relative overflow-hidden max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} style={{ background: C.paper }} className="absolute top-3 right-3 z-10 p-1 rounded-full">
          <X size={18} style={{ color: C.inkSoft }} />
        </button>
        {popup.image_url && (
          <button type="button" onClick={() => setShowFullMedia(true)} className="block w-full cursor-zoom-in">
            <PopupMediaPreview url={popup.image_url} maxHeight={220} />
          </button>
        )}
        {showFullMedia && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            style={{ background: "rgba(20,24,31,0.92)" }}
            onClick={() => setShowFullMedia(false)}
          >
            <button
              onClick={() => setShowFullMedia(false)}
              style={{ background: C.paper }}
              className="absolute top-3 right-3 z-10 p-1 rounded-full"
            >
              <X size={18} style={{ color: C.inkSoft }} />
            </button>
            {getPopupMedia(popup.image_url)?.kind === "video" ? (
              <video
                src={popup.image_url}
                controls
                autoPlay
                loop
                playsInline
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={popup.image_url}
                alt=""
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )}
        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>
            <Megaphone size={12} /> Aviso
          </div>
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg mb-2">{popup.title}</h2>
          {popup.description && <p className="text-sm whitespace-pre-wrap break-words" style={{ color: C.ink }}>{renderWithLinks(popup.description, C.signal)}</p>}
          {relatedEntries.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Pendientes relacionados</div>
              {relatedEntries.map(({ entry, task }) => {
                const open = openTaskId === task.id;
                return (
                  <div key={task.id} style={{ borderColor: C.hairline }} className="border">
                    <button onClick={() => setOpenTaskId(open ? null : task.id)} className="w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2">
                      <span className="text-xs truncate" style={{ color: C.ink }}>{task.title}</span>
                      <ChevronDown size={12} style={{ color: C.inkSoft, flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }} />
                    </button>
                    {open && (entry.fields || []).length > 0 && (
                      <PopupTaskBreakdown task={task} fields={entry.fields} profiles={profiles} subtasks={subtasks} onFinalizeTask={onFinalizeTask} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onClose} style={{ background: C.spine, color: C.paper }} className="mt-4 px-4 py-2 text-sm w-full">Entendido</button>
        </div>
      </div>
    </div>
  );
}

// CHANGES.md #9: convertir un pendiente individual a colaborativo abre esta
// ventana completa (como crear un pendiente nuevo, pero solo la parte
// colaborativa) en vez de solo agregar gente al equipo. Título fijo — todo
// lo demás (descripción, categoría, deadline, urgencia, solicitantes,
// equipo, subtareas) se puede editar antes de convertir.
function ConvertToColaborativoModal({ task, profiles, profile, onClose, onConvert }) {
  const categoryIsCustom = !DEFAULT_CATEGORIES.includes(task.category);
  const [description, setDescription] = useState(task.description || "");
  const [category, setCategory] = useState(categoryIsCustom ? DEFAULT_CATEGORIES[0] : (task.category || DEFAULT_CATEGORIES[0]));
  const [newCategory, setNewCategory] = useState(categoryIsCustom ? task.category || "" : "");
  const [deadline, setDeadline] = useState(task.deadline || "");
  const [urgency, setUrgency] = useState(task.urgency || "Media");
  const [teamMemberIds, setTeamMemberIds] = useState(task.assigned_to_id ? [task.assigned_to_id] : []);
  const [subtaskRows, setSubtaskRows] = useState([]);
  const [showSubtaskRule, setShowSubtaskRule] = useState(false);
  const existingCoRequesterIds = Array.from(new Set([...(task.co_requester_ids || []), ...(task.responsible_id ? [task.responsible_id] : [])]));
  const [coRequesterIds, setCoRequesterIds] = useState(existingCoRequesterIds);
  const [showRequesterPicker, setShowRequesterPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleCoRequester = (id) => setCoRequesterIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleTeamMember = (id) => {
    const removing = teamMemberIds.includes(id);
    setTeamMemberIds((prev) => removing ? prev.filter((x) => x !== id) : [...prev, id]);
    if (removing) setSubtaskRows((rows) => rows.map((r) => (r.assignedToId === id ? { ...r, assignedToId: "" } : r)));
  };
  const addSubtaskRow = () => setSubtaskRows((rows) => [...rows, { title: "", description: "", assignedToId: "", deadline: "" }]);
  const updateSubtaskRow = (i, field, value) => setSubtaskRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const removeSubtaskRow = (i) => setSubtaskRows((rows) => rows.filter((_, idx) => idx !== i));

  // Misma regla que al crear un colaborativo nuevo: cada persona del equipo
  // necesita al menos una subtarea propia, si no nadie podrá marcar su parte
  // como entregada y el pendiente no se podría finalizar.
  const missingSubtaskCoverage = teamMemberIds.some((id) => !subtaskRows.some((r) => r.assignedToId === id && r.title.trim()));
  const todayStr = todayISO();
  const subtaskDeadlines = subtaskRows.map((r) => r.deadline).filter(Boolean);
  const maxSubtaskDeadline = subtaskDeadlines.length ? subtaskDeadlines.reduce((a, b) => (a > b ? a : b)) : null;
  const minGeneralDeadline = maxSubtaskDeadline && maxSubtaskDeadline > todayStr ? maxSubtaskDeadline : todayStr;

  const submit = async () => {
    if (teamMemberIds.length < 2 || !deadline || missingSubtaskCoverage || saving) return;
    setSaving(true);
    await onConvert({ description, category: newCategory.trim() || category, deadline, urgency, teamMemberIds, coRequesterIds, subtaskRows });
    setSaving(false);
  };
  const handleConvertClick = () => {
    if (missingSubtaskCoverage) { setShowSubtaskRule(true); return; }
    submit();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.55)" }}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="w-full max-w-lg border max-h-[90vh] overflow-y-auto">
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between">
          <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg">Convertir a Colaborativo</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Título</label>
            <input value={task.title} readOnly style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft, cursor: "not-allowed" }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Categoría</label>
              <select value={category} onChange={(e) => { setCategory(e.target.value); setNewCategory(""); }} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>...o nueva</label>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}>
              Solicita
              <button type="button" onClick={() => setShowRequesterPicker((v) => !v)} title="Agregar más solicitantes" style={{ borderColor: C.signal, color: C.signal }} className="border rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none"><Plus size={9} /></button>
            </label>
            <div style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft }} className="w-full border px-3 py-2 text-sm mt-1">
              {task.requested_by}{coRequesterIds.length > 0 ? ` + ${coRequesterIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}` : ""}
            </div>
          </div>
          {showRequesterPicker && (
            <div style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {profiles.filter((p) => p.id !== task.requested_by_id).map((p) => (
                  <button key={p.id} type="button" onClick={() => toggleCoRequester(p.id)}
                    style={{ borderColor: coRequesterIds.includes(p.id) ? C.signal : C.hairline, background: coRequesterIds.includes(p.id) ? C.signal : "transparent", color: coRequesterIds.includes(p.id) ? "#fff" : C.ink }}
                    className="border px-2.5 py-1 text-xs">{p.name}</button>
                ))}
              </div>
              <p className="text-[11px]" style={{ color: C.inkSoft }}>Las personas que selecciones aparecerán junto a {task.requested_by} como solicitantes.</p>
            </div>
          )}

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Equipo de trabajo</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {profiles.map((p) => (
                <button key={p.id} type="button" onClick={() => toggleTeamMember(p.id)}
                  style={{ borderColor: teamMemberIds.includes(p.id) ? C.signal : C.hairline, background: teamMemberIds.includes(p.id) ? C.signal : "transparent", color: teamMemberIds.includes(p.id) ? "#fff" : C.ink }}
                  className="border px-2.5 py-1 text-xs">{p.name}</button>
              ))}
            </div>
            {teamMemberIds.length < 2 && <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>Selecciona al menos 2 personas del equipo.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Subtareas</label>
              <button type="button" onClick={addSubtaskRow} disabled={teamMemberIds.length === 0} style={{ color: C.signal }} className="text-xs flex items-center gap-1 disabled:opacity-40"><Plus size={12} /> Agregar subtarea</button>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              {subtaskRows.map((row, i) => (
                <div key={i} style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <input value={row.title} onChange={(e) => updateSubtaskRow(i, "title", e.target.value)} placeholder="Título de la subtarea" style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-2 py-1.5 text-xs outline-none" />
                    <button type="button" onClick={() => removeSubtaskRow(i)}><X size={14} style={{ color: C.inkSoft }} /></button>
                  </div>
                  <textarea value={row.description} onChange={(e) => updateSubtaskRow(i, "description", e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none resize-y" />
                  <div className="grid grid-cols-2 gap-1.5">
                    <select value={row.assignedToId} onChange={(e) => updateSubtaskRow(i, "assignedToId", e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none">
                      <option value="">Asignar a...</option>
                      {profiles.filter((p) => teamMemberIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="date" value={row.deadline} min={todayStr} max={deadline || undefined} onChange={(e) => updateSubtaskRow(i, "deadline", e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none" />
                  </div>
                </div>
              ))}
              {subtaskRows.length === 0 && <p className="text-[11px]" style={{ color: C.inkSoft }}>Sin subtarea con deadline propio, hereda el deadline general de abajo.</p>}
            </div>
            {missingSubtaskCoverage && (
              <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>
                Falta asignar subtarea a: {teamMemberIds.filter((id) => !subtaskRows.some((r) => r.assignedToId === id && r.title.trim())).map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Deadline general</label>
              <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div><label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Urgencia</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
              </select></div>
          </div>
        </div>
        <div style={{ borderColor: C.hairline }} className="border-t px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkSoft }} className="px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleConvertClick} disabled={teamMemberIds.length < 2 || !deadline || saving} style={{ background: C.spine, color: C.paper, opacity: (teamMemberIds.length < 2 || !deadline || saving) ? 0.5 : 1 }} className="px-4 py-2 text-sm disabled:cursor-not-allowed">{saving ? "..." : "Convertir a Colaborativo"}</button>
        </div>
      </div>
      {showSubtaskRule && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(20,24,31,0.6)" }} onClick={() => setShowSubtaskRule(false)}>
          <div style={{ background: C.paper, borderColor: C.hairline }} className="border max-w-xs p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold" style={{ color: C.urgent }}>Tienes que asignar subtareas</p>
            <p className="text-sm mt-2" style={{ color: C.ink }}>Si no asignas subtareas los de tu equipo no podrán seleccionar que ya entregaron su parte y el pendiente no se podrá finalizar.</p>
            <button onClick={() => setShowSubtaskRule(false)} style={{ background: C.spine, color: C.paper }} className="mt-3 px-3 py-1.5 text-xs w-full">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task, onClose, onUpdate, onDelete, onDeleteRecurring, recurringTemplates, onFinalize, onDeliver, profiles, assignableProfiles, profile, notify, subtasks, onAddSubtask, onUpdateSubtaskStatus, onUpdateSubtaskDescription, onAssignChanges, viewerIsGerente, onCommentsRead }) {
  const recurringTpl = task.recurring_template_id ? (recurringTemplates || []).find((r) => r.id === task.recurring_template_id) : null;
  const [comment, setComment] = useState(""), [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]), [showHistory, setShowHistory] = useState(false);
  const [delegateId, setDelegateId] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const [responsibleIds, setResponsibleIds] = useState([]);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmAssignChanges, setConfirmAssignChanges] = useState(false);
  const [reminderTargetId, setReminderTargetId] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [expandedSubtaskId, setExpandedSubtaskId] = useState(null);
  const [newSubtask, setNewSubtask] = useState({ title: "", description: "", assignedToId: "", deadline: "" });
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState(task.category || "");
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description || "");
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [subtaskDescriptionDraft, setSubtaskDescriptionDraft] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const assignee = profiles.find((p) => p.id === task.assigned_to_id);

  const isColaborativo = task.task_type === "colaborativo";
  const isPersonalSolo = task.task_type === "personal" && task.assigned_to_id === task.requested_by_id;
  const isAssignee = task.assigned_to_id === profile.id;
  const isRequester = task.requested_by_id === profile.id;
  // Co-solicitantes: el "responsable" (legado, uno solo) o cualquiera de los
  // "co_requester_ids" (varios) agregados con el "+" junto a "Solicita".
  const isResponsible = (!!task.responsible_id && task.responsible_id === profile.id) || (task.co_requester_ids || []).includes(profile.id);
  const isAnyRequester = isRequester || isResponsible;
  const isAdmin = profile.role === "admin";
  const isFinalized = task.status === "Finalizado";
  const isDelivered = task.status === "Entregado";
  const canEditUrgency = isColaborativo ? isAnyRequester : isAssignee;
  const teamProfiles = profiles.filter((p) => (task.team_member_ids || []).includes(p.id));
  const coRequesterNames = (task.co_requester_names || []).length > 0 ? task.co_requester_names : (task.responsible_name ? [task.responsible_name] : []);
  const showSubtasks = isColaborativo || task.task_type === "individual";
  const sameDay = task.request_date && task.deadline && task.request_date === task.deadline;
  const hasSubtasks = subtasks.length > 0;
  const allSubtasksDelivered = hasSubtasks && subtasks.every((s) => s.status === "Entregado");
  const canFinalize = !viewerIsGerente && !isFinalized && (isAdmin || (isColaborativo ? isAnyRequester && allSubtasksDelivered : isRequester && (hasSubtasks ? allSubtasksDelivered : isDelivered)));
  const canEditDeadline = (isAnyRequester || isAdmin) && !isFinalized && !viewerIsGerente;
  const canRemind = isAnyRequester || viewerIsGerente; // el gerente sí puede mandar recordatorio de correo/whatsapp aunque esté en modo lectura
  const reminderRecipient = isColaborativo ? teamProfiles.find((p) => p.id === reminderTargetId) : assignee;
  const latestSubtaskDeadline = subtasks.reduce((max, s) => (s.deadline && (!max || s.deadline > max) ? s.deadline : max), null);
  const minGeneralDeadline = latestSubtaskDeadline && latestSubtaskDeadline > todayISO() ? latestSubtaskDeadline : todayISO();
  const subtaskDeadlineError = !newSubtask.deadline ? "" :
    newSubtask.deadline < todayISO() ? "La fecha no puede ser antes de hoy." :
    (task.deadline && newSubtask.deadline > task.deadline) ? "No puede ser después del deadline general." :
    "";

  // CHANGES.md #13: un solicitante puede salirse del pendiente, siempre y
  // cuando quede al menos otro solicitante — nunca se puede quedar sin nadie.
  const totalRequesters = 1 + (task.responsible_id ? 1 : 0) + (task.co_requester_ids || []).length;
  const canLeaveAsRequester = isAnyRequester && totalRequesters > 1 && !isFinalized && !viewerIsGerente;
  const leaveTask = async () => {
    if (!canLeaveAsRequester) return;
    const others = (task.co_requester_ids || []).map((id, i) => ({ id, name: (task.co_requester_names || [])[i] }));
    if (task.responsible_id) others.push({ id: task.responsible_id, name: task.responsible_name });
    let patch;
    if (task.requested_by_id === profile.id) {
      const [newPrimary, ...rest] = others;
      patch = {
        requested_by_id: newPrimary.id, requested_by: newPrimary.name,
        co_requester_ids: rest.map((p) => p.id), co_requester_names: rest.map((p) => p.name),
        responsible_id: null, responsible_name: null,
      };
    } else {
      const rest = others.filter((p) => p.id !== profile.id);
      patch = { co_requester_ids: rest.map((p) => p.id), co_requester_names: rest.map((p) => p.name), responsible_id: null, responsible_name: null };
    }
    await onUpdate(task, patch, `${profile.name} se salió del pendiente como solicitante`);
    setConfirmLeave(false);
    onClose();
  };

  const loadExtras = useCallback(async () => {
    const { data: c } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at");
    const { data: h } = await supabase.from("task_history").select("*").eq("task_id", task.id).order("created_at", { ascending: false });
    setComments(c || []); setHistory(h || []);
  }, [task.id]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  const markCommentsRead = useCallback(async () => {
    const { error } = await supabase.from("task_comment_reads").upsert(
      { task_id: task.id, user_id: profile.id, last_read_at: new Date().toISOString() },
      { onConflict: "task_id,user_id" }
    );
    if (error) { console.error("No se pudo marcar los comentarios como leídos:", error); return; }
    onCommentsRead?.();
  }, [task.id, profile.id, onCommentsRead]);

  // Abrir el desgloce marca los comentarios como leídos (quita la burbujita del pendiente).
  useEffect(() => { markCommentsRead(); }, [markCommentsRead]);

  const setStatus = (s) => {
    if (isFinalized || viewerIsGerente) return;
    if (s === "Entregado") { onDeliver(task); return; }
    // Si el pendiente deja de estar "Entregado", se libera el aviso al solicitante
    // y el de "se venció" — por si se vuelve a vencer y hay que avisar de nuevo.
    const patch = { status: s };
    if (task.notify_requester) patch.notify_requester = false;
    if (task.overdue_notified) patch.overdue_notified = false;
    if (task.delivery_reminder_sent) patch.delivery_reminder_sent = false;
    onUpdate(task, patch, `${profile.name} cambió el estado a "${s}"`);
  };

  const changeUrgency = (u) => {
    if (isFinalized || !canEditUrgency || viewerIsGerente) return;
    onUpdate(task, { urgency: u }, `${profile.name} cambió la urgencia a "${u}"`);
  };
  const changeDeadline = (d) => {
    if (!canEditDeadline) return;
    if (showSubtasks && d) {
      if (d < todayISO()) return;
      if (latestSubtaskDeadline && d < latestSubtaskDeadline) return;
    }
    // Deadline nuevo: si ya se había avisado que venció, se libera para
    // poder avisar de nuevo si se vuelve a vencer.
    const patch = task.overdue_notified ? { deadline: d, overdue_notified: false } : { deadline: d };
    onUpdate(task, patch, `${profile.name} cambió el deadline a ${fmtDate(d)}`);
  };
  // CHANGES.md #9: convertir individual a colaborativo abre una ventana
  // completa (ConvertToColaborativoModal) en vez de solo agregar gente al
  // equipo — permite editar descripción/categoría/deadline/urgencia,
  // agregar solicitantes, equipo de trabajo y subtareas antes de convertir.
  const submitConvertToColaborativo = async ({ description, category, deadline, urgency, teamMemberIds, coRequesterIds, subtaskRows }) => {
    if (isFinalized || viewerIsGerente) return;
    const finalTeam = Array.from(new Set([task.assigned_to_id, ...teamMemberIds].filter(Boolean)));
    const coRequesters = coRequesterIds.map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
    const addedTeamNames = finalTeam.filter((id) => !(task.team_member_ids || []).includes(id)).map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
    await onUpdate(task, {
      task_type: "colaborativo", team_member_ids: finalTeam, assigned_to_id: null, assigned_to_name: "",
      description, category, deadline, urgency,
      co_requester_ids: coRequesters.map((p) => p.id), co_requester_names: coRequesters.map((p) => p.name),
    }, `${profile.name} convirtió el pendiente a Colaborativo${addedTeamNames ? ` y agregó a ${addedTeamNames} al equipo` : ""}`);
    for (const id of finalTeam) {
      if (id !== profile.id && id !== task.assigned_to_id) await notify(id, task.id, `Te agregaron al equipo del pendiente colaborativo "${task.title}"`);
    }
    for (const p of coRequesters) {
      if (p.id !== profile.id && !(task.co_requester_ids || []).includes(p.id)) await notify(p.id, task.id, `Te agregaron como solicitante del pendiente "${task.title}"`);
    }
    for (const st of subtaskRows) {
      if (!st.title.trim() || !st.assignedToId) continue;
      await onAddSubtask(task.id, { title: st.title, description: st.description, assignedToId: st.assignedToId, deadline: st.deadline || null });
    }
    setShowConvertModal(false);
  };
  const saveCategory = async () => {
    const val = newCategoryDraft.trim() || categoryDraft;
    if (!val || isFinalized || viewerIsGerente) return;
    await onUpdate(task, { category: val }, `${profile.name} cambió la categoría a "${val}"`);
    setNewCategoryDraft("");
    setEditingCategory(false);
  };

  const saveDescription = async () => {
    if (!isAnyRequester || isFinalized || viewerIsGerente) return;
    await onUpdate(task, { description: descriptionDraft.trim() }, `${profile.name} editó la descripción`);
    setEditingDescription(false);
  };

  const saveSubtaskDescription = async (subtask) => {
    if (!isAnyRequester || isFinalized || viewerIsGerente) return;
    await onUpdateSubtaskDescription(subtask, subtaskDescriptionDraft.trim());
    setEditingSubtaskId(null);
  };

  const addComment = async () => {
    if (!comment.trim() || isFinalized) return;
    await supabase.from("task_comments").insert({ task_id: task.id, author_id: profile.id, author_name: profile.name, text: comment.trim() });
    await onUpdate(task, {}, `${profile.name} agregó un comentario`);
    setComment(""); loadExtras(); markCommentsRead();
  };
  const delegate = async () => {
    if (isFinalized || viewerIsGerente) return;
    const p = profiles.find((x) => x.id === delegateId);
    if (!p) return;
    await onUpdate(task, { assigned_to_id: p.id, assigned_to_name: p.name, notify_requester: false }, `${profile.name} ${isPersonalSolo ? "asignó a" : "delegó a"} ${p.name}`);
    if (p.id !== profile.id) await notify(p.id, task.id, `Te ${isPersonalSolo ? "asignaron" : "delegaron"} "${task.title}"`);
    setDelegateId("");
  };
  const toggleResponsibleId = (id) => setResponsibleIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const assignResponsible = async () => {
    if (isFinalized || viewerIsGerente) return;
    const selected = responsibleIds.map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
    if (selected.length === 0) return;
    const [primary, ...rest] = selected;
    await onUpdate(task, {
      requested_by_id: primary.id, requested_by: primary.name,
      co_requester_ids: rest.map((p) => p.id), co_requester_names: rest.map((p) => p.name),
      assigned_to_id: profile.id, assigned_to_name: profile.name,
    }, `${profile.name} asignó a ${selected.map((p) => p.name).join(", ")} como responsable${selected.length > 1 ? "s" : ""} de "${task.title}"`);
    for (const p of selected) {
      if (p.id !== profile.id) await notify(p.id, task.id, `Te asignaron como responsable de "${task.title}"`);
    }
    setResponsibleIds([]);
  };

  const toggleFollow = async () => {
    const following = (task.followers || []).includes(profile.id);
    const newFollowers = following ? (task.followers || []).filter((id) => id !== profile.id) : [...(task.followers || []), profile.id];
    await onUpdate(task, { followers: newFollowers }, null);
  };
  const iAlreadyAskedToRemind = (task.remind_me_by_ids || []).includes(profile.id);
  const toggleRemindMe = async () => {
    if (iAlreadyAskedToRemind) return; // cada quien lo activa una sola vez, no se puede desactivar
    await onUpdate(task, { remind_me_by_ids: [...(task.remind_me_by_ids || []), profile.id] }, `${profile.name} activó "avisarme" en este pendiente`);
  };
  const toggleNotifyRequester = async () => {
    if (task.notify_requester || !task.requested_by_id || viewerIsGerente) return;
    await onUpdate(task, { notify_requester: true }, `${profile.name} activó el aviso al solicitante`);
    await notify(
      task.requested_by_id, task.id,
      `${profile.name} ya entregó su pendiente, revísalo y dale finalizado. Al finalizar pendientes podrá sumarle al registro personal de ${profile.name}`,
      "Te entregaron un pendiente"
    );
  };
  const bumpRemindAssignee = async () => {
    if (!isAnyRequester || viewerIsGerente) return;
    if (isColaborativo) {
      if (!reminderRecipient) return;
      await notify(reminderRecipient.id, task.id, `Te resaltaron "${task.title}"`);
      await onUpdate(task, {}, `${profile.name} resaltó "${task.title}" para ${reminderRecipient.name}`);
      return;
    }
    const today = todayISO();
    if ((task.remind_assignee_count || 0) >= 3 || task.remind_assignee_last_date === today) return;
    await onUpdate(task, { remind_assignee_count: (task.remind_assignee_count || 0) + 1, remind_assignee_last_date: today }, `${profile.name} resaltó el pendiente para ${task.assigned_to_name}`);
    if (task.assigned_to_id && task.assigned_to_id !== profile.id) await notify(task.assigned_to_id, task.id, `Te resaltaron "${task.title}"`);
  };

  const sendReminderEmail = async () => {
    if (!reminderRecipient) return;
    const subject = encodeURIComponent(`Recordatorio: ${task.title}`);
    const body = encodeURIComponent(`Hola ${reminderRecipient.name},\n\nRecordatorio del pendiente "${task.title}" (${task.category}).\nDeadline: ${fmtDate(task.deadline)}\nEstado: ${task.status}\n\nDe parte de ${profile.name}, panel Sevenly.`);
    const to = encodeURIComponent(reminderRecipient.email || "");
    window.open(`https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por correo a ${reminderRecipient.name}`);
  };
  const sendReminderWhatsapp = async () => {
    if (!reminderRecipient || !reminderRecipient.phone) return;
    const cleanPhone = reminderRecipient.phone.replace(/\D/g, "");
    const text = encodeURIComponent(`Hola ${reminderRecipient.name}, recordatorio: "${task.title}" (${task.category}). Deadline: ${fmtDate(task.deadline)}. Estado: ${task.status}. — ${profile.name}, Sevenly`);
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por WhatsApp a ${reminderRecipient.name}`);
  };

  const submitNewSubtask = async () => {
    const targetAssignedToId = isColaborativo ? newSubtask.assignedToId : task.assigned_to_id;
    if (!newSubtask.title.trim() || !targetAssignedToId || subtaskDeadlineError) return;
    await onAddSubtask(task.id, { ...newSubtask, assignedToId: targetAssignedToId });
    setNewSubtask({ title: "", description: "", assignedToId: "", deadline: "" });
    setShowAddSubtask(false);
  };

  const downloadHistory = () => {
    const lines = [
      `Pendiente: ${task.title}`, `Categoría: ${task.category}`, `Solicita: ${task.requested_by}${coRequesterNames.length ? " + " + coRequesterNames.join(", ") : ""}`,
      isColaborativo ? `Equipo: ${teamProfiles.map((p) => p.name).join(", ")}` : `Asignado a: ${task.assigned_to_name}`,
      `Deadline: ${fmtDate(task.deadline)}`, `Urgencia: ${task.urgency}`,
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
          <div className="flex-1 min-w-0"><div className="font-mono text-[10px] uppercase tracking-widest mb-1 flex items-center gap-1.5 flex-wrap" style={{ color: C.inkSoft }}>
              {task.category}
              {!isFinalized && !viewerIsGerente && (
                <button onClick={() => { setCategoryDraft(task.category || DEFAULT_CATEGORIES[0]); setNewCategoryDraft(""); setEditingCategory((v) => !v); }} title="Cambiar categoría">
                  <Pencil size={11} style={{ color: C.inkSoft }} />
                </button>
              )}
              {task.task_type && effectiveTaskType(task) !== "individual" && <span style={{ color: C.signal }}>· {TASK_TYPES.find((t) => t.key === effectiveTaskType(task))?.label}</span>}
              {task.recurring_template_id && <span>· 🔁 {recurringTpl?.frequency_type === "monthly" ? "Mensual" : "Semanal"}</span>}
              {isFinalized && <><Lock size={10} /> Finalizado — solo lectura</>}
              {viewerIsGerente && !isFinalized && <><Eye size={10} /> Modo lectura</>}
            </div>
            {editingCategory && (
              <div style={{ borderColor: C.hairline, background: C.panel }} className="border p-2.5 mb-2 flex flex-col gap-1.5 max-w-xs">
                <select value={categoryDraft} onChange={(e) => { setCategoryDraft(e.target.value); setNewCategoryDraft(""); }} style={{ borderColor: C.hairline, background: C.paper }} className="border px-2 py-1 text-xs outline-none">
                  {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={newCategoryDraft} onChange={(e) => setNewCategoryDraft(e.target.value)} placeholder="...o escribe una nueva" style={{ borderColor: C.hairline, background: C.paper }} className="border px-2 py-1 text-xs outline-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingCategory(false)} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                  <button onClick={saveCategory} style={{ background: C.spine, color: C.paper }} className="text-xs px-2.5 py-1">Guardar</button>
                </div>
              </div>
            )}
            <h2 style={{ color: C.ink, fontFamily: "Georgia, serif" }} className="text-lg leading-tight">
              {task.title}
              {task.changes_round > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-wider ml-2" style={{ color: C.signal, fontFamily: "inherit" }}>Cambios Ronda {task.changes_round}</span>
              )}
            </h2></div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {editingDescription ? (
            <div className="flex flex-col gap-1.5">
              <textarea value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} rows={3} style={{ borderColor: C.hairline, background: C.panel, color: C.ink }} className="w-full border px-3 py-2 text-sm outline-none resize-y" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setDescriptionDraft(task.description || ""); setEditingDescription(false); }} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                <button onClick={saveDescription} style={{ background: C.spine, color: C.paper }} className="text-xs px-2.5 py-1">Guardar</button>
              </div>
            </div>
          ) : (
            (task.description || (isAnyRequester && !isFinalized && !viewerIsGerente)) && (
              <div className="flex items-start gap-1.5">
                {task.description ? (
                  <p style={{ color: C.ink }} className="text-sm leading-relaxed whitespace-pre-wrap break-words flex-1">{renderWithLinks(task.description, C.signal)}</p>
                ) : (
                  <p style={{ color: C.inkSoft }} className="text-sm flex-1">Sin descripción.</p>
                )}
                {isAnyRequester && !isFinalized && !viewerIsGerente && (
                  <button onClick={() => { setDescriptionDraft(task.description || ""); setEditingDescription(true); }} title="Editar descripción" className="flex-shrink-0 mt-0.5">
                    <Pencil size={12} style={{ color: C.inkSoft }} />
                  </button>
                )}
              </div>
            )
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {isPersonalSolo ? (
              <div className="col-span-2"><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Tipo</div><div style={{ color: C.ink }}>Pendiente personal (solo tuyo)</div></div>
            ) : (
              <>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Solicita</div>
                  <div style={{ color: C.ink }}>{task.requested_by}{coRequesterNames.length ? ` + ${coRequesterNames.join(", ")}` : ""}</div>
                </div>
                {isColaborativo ? (
                  <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Equipo</div><div style={{ color: C.ink }} className="text-xs leading-relaxed">{teamProfiles.map((p) => p.name).join(", ") || "—"}</div></div>
                ) : (
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5 flex items-center gap-1" style={{ color: C.inkSoft }}>
                      Asignado a
                      {task.task_type === "individual" && isRequester && !isFinalized && !viewerIsGerente && (
                        <button type="button" onClick={() => setShowConvertModal(true)} title="Convertir a Colaborativo" style={{ borderColor: C.signal, color: C.signal }} className="border rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none"><Plus size={9} /></button>
                      )}
                    </div>
                    <div style={{ color: C.ink }}>{task.assigned_to_name}</div>
                  </div>
                )}
              </>
            )}
            <div><div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Fecha de solicitud</div><div style={{ color: C.ink }}>{fmtDate(task.request_date)}</div></div>
            <div></div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Deadline{showSubtasks ? " general" : ""}</div>
              {canEditDeadline ? (
                <input type="date" value={task.deadline || ""} min={showSubtasks ? minGeneralDeadline : undefined} onChange={(e) => changeDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1 text-xs outline-none" />
              ) : <div style={{ color: C.ink }}>{fmtDate(task.deadline)}</div>}
              {sameDay && <div className="font-mono text-[10px] uppercase tracking-wider mt-1" style={{ color: C.urgent }}>De hoy para hoy 💀</div>}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: C.inkSoft }}>Urgencia</div>
              {canEditUrgency && !isFinalized && !viewerIsGerente ? (
                <>
                  <select value={task.urgency} onChange={(e) => changeUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1 text-xs outline-none">
                    {SELECTABLE_URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                  </select>
                  {isOverdueUrgent(task) && <div className="font-mono text-[9px] uppercase tracking-wide mt-1" style={{ color: C.veryUrgent }}>Muy urgente — venció</div>}
                </>
              ) : <UrgencyFlag urgency={effectiveUrgency(task)} />}
            </div>
          </div>

          {showConvertModal && (
            <ConvertToColaborativoModal
              task={task}
              profiles={assignableProfiles}
              profile={profile}
              onClose={() => setShowConvertModal(false)}
              onConvert={submitConvertToColaborativo}
            />
          )}

          {!isColaborativo && !hasSubtasks && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2 flex-wrap" style={{ color: C.inkSoft }}>
                Estado
                {isOverdueUrgent(task) && <span className="normal-case tracking-normal" style={{ color: C.veryUrgent }}>Marca entregado y avisa para que te finalicen</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASSIGNEE_STATUSES.map((s) => { const Icon = STATUS_ICON[s]; const active = task.status === s;
                  return <button key={s} disabled={isFinalized || viewerIsGerente} onClick={() => setStatus(s)} style={{ borderColor: active ? C.spine : C.hairline, background: active ? C.spine : "transparent", color: active ? C.paper : C.inkSoft }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50"><Icon size={13} /> {s}</button>; })}
                {isFinalized && <span style={{ borderColor: C.signal, color: C.signal }} className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5"><CheckCheck size={13} /> Finalizado</span>}
              </div>
            </div>
          )}

          {(isColaborativo || (task.task_type === "individual" && hasSubtasks)) && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Estado general</div>
              <div className="flex items-center gap-1.5">
                {(() => { const Icon = STATUS_ICON[isFinalized ? "Finalizado" : task.status]; return <Icon size={14} style={{ color: isFinalized ? C.signal : C.inkSoft }} />; })()}
                <span className="text-sm" style={{ color: C.ink }}>{isFinalized ? "Finalizado" : task.status}</span>
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>
                {isColaborativo ? "Se mueve automáticamente según las subtareas del equipo — nadie lo mueve a mano." : "Se mueve solo según el estado de las subtareas."}
              </p>
            </div>
          )}

          {showSubtasks && (
            <div style={{ borderColor: C.hairline }} className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Subtareas ({subtasks.filter((s) => s.status === "Entregado").length}/{subtasks.length})</span>
                  {isAnyRequester && !isFinalized && !viewerIsGerente && (
                    <button onClick={() => setShowAddSubtask((v) => !v)} title="Agregar subtarea" style={{ borderColor: C.signal, color: C.signal }} className="border rounded-full w-4 h-4 flex items-center justify-center leading-none"><Plus size={10} /></button>
                  )}
                </div>
              </div>
              {showAddSubtask && (
                <div style={{ borderColor: C.hairline }} className="border p-2.5 flex flex-col gap-1.5 mb-2">
                  <input value={newSubtask.title} onChange={(e) => setNewSubtask((s) => ({ ...s, title: e.target.value }))} placeholder="Título" style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none" />
                  <textarea value={newSubtask.description} onChange={(e) => setNewSubtask((s) => ({ ...s, description: e.target.value }))} placeholder="Descripción (opcional)" rows={2} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none resize-y" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {isColaborativo ? (
                      <select value={newSubtask.assignedToId} onChange={(e) => setNewSubtask((s) => ({ ...s, assignedToId: e.target.value }))} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none">
                        <option value="">Asignar a...</option>
                        {teamProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft }} className="border px-2 py-1.5 text-xs flex items-center truncate">{task.assigned_to_name}</div>
                    )}
                    <input type="date" value={newSubtask.deadline} min={todayISO()} max={task.deadline || undefined} onChange={(e) => setNewSubtask((s) => ({ ...s, deadline: e.target.value }))} style={{ borderColor: C.hairline, background: C.panel }} className="border px-2 py-1.5 text-xs outline-none" />
                  </div>
                  {subtaskDeadlineError && <p className="text-[11px]" style={{ color: C.urgent }}>{subtaskDeadlineError}</p>}
                  <button onClick={submitNewSubtask} disabled={!!subtaskDeadlineError} style={{ background: C.spine, color: C.paper }} className="px-3 py-1.5 text-xs disabled:opacity-50">Agregar subtarea</button>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {subtasks.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>Sin subtareas todavía.</div>}
                {subtasks.map((s) => {
                  const mine = s.assigned_to_id === profile.id;
                  const StIcon = STATUS_ICON[s.status];
                  const expanded = expandedSubtaskId === s.id;
                  return (
                    <div key={s.id} style={{ borderColor: mine ? C.signal : C.hairline, background: mine ? C.signalSoft : C.panel }} className="border p-2.5 cursor-pointer" onClick={() => setExpandedSubtaskId((id) => (id === s.id ? null : s.id))}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`} style={{ color: C.ink }}>{expanded ? renderWithLinks(s.title, C.signal) : s.title}</div>
                          <div className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{s.assigned_to_name} · {fmtDate(s.deadline || task.deadline)}</div>
                        </div>
                        {mine && !isFinalized ? (
                          <select value={s.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdateSubtaskStatus(s, e.target.value)} style={{ borderColor: C.hairline, background: C.paper }} className="border px-1.5 py-1 text-[11px] outline-none shrink-0">
                            {ASSIGNEE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                          </select>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] shrink-0" style={{ color: C.inkSoft }}><StIcon size={12} /> {s.status}</span>
                        )}
                      </div>
                      {expanded && (
                        editingSubtaskId === s.id ? (
                          <div className="mt-2 pt-2 border-t flex flex-col gap-1.5" style={{ borderColor: C.hairline }} onClick={(e) => e.stopPropagation()}>
                            <textarea value={subtaskDescriptionDraft} onChange={(e) => setSubtaskDescriptionDraft(e.target.value)} rows={2} style={{ borderColor: C.hairline, background: C.paper, color: C.ink }} className="border px-2 py-1.5 text-xs outline-none resize-y" />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingSubtaskId(null)} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                              <button onClick={() => saveSubtaskDescription(s)} style={{ background: C.spine, color: C.paper }} className="text-xs px-2.5 py-1">Guardar</button>
                            </div>
                          </div>
                        ) : (s.description || (isAnyRequester && !isFinalized && !viewerIsGerente)) && (
                          <div className="mt-2 pt-2 border-t flex items-start gap-1.5" style={{ borderColor: C.hairline }}>
                            {s.description ? (
                              <div className="text-xs whitespace-pre-wrap break-words flex-1" style={{ color: C.ink }}>{renderWithLinks(s.description, C.signal)}</div>
                            ) : (
                              <div className="text-xs flex-1" style={{ color: C.inkSoft }}>Sin descripción.</div>
                            )}
                            {isAnyRequester && !isFinalized && !viewerIsGerente && (
                              <button onClick={(e) => { e.stopPropagation(); setSubtaskDescriptionDraft(s.description || ""); setEditingSubtaskId(s.id); }} title="Editar descripción" className="flex-shrink-0">
                                <Pencil size={11} style={{ color: C.inkSoft }} />
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canFinalize && (
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
          {!isAdmin && !isFinalized && !allSubtasksDelivered && ((isColaborativo && isAnyRequester) || (task.task_type === "individual" && hasSubtasks && isRequester)) && (
            <p className="text-[11px]" style={{ color: C.inkSoft }}>Se podrá finalizar cuando todas las subtareas queden en "Entregado".</p>
          )}

          {isFinalized && isAnyRequester && !viewerIsGerente && (
            !confirmAssignChanges ? (
              <button onClick={() => setConfirmAssignChanges(true)} style={{ background: C.spine, color: C.paper }} className="px-3 py-2 text-sm flex items-center justify-center gap-2"><ArrowRightLeft size={14} /> Asignar cambios</button>
            ) : (
              <div style={{ borderColor: C.hairline, background: C.panel }} className="border px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: C.ink }}>Crearás un nuevo pendiente para solicitar estos cambios.</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setConfirmAssignChanges(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                  <button onClick={() => { setConfirmAssignChanges(false); onAssignChanges(task); }} style={{ background: C.spine, color: C.paper }} className="text-xs px-2.5 py-1">Aceptar</button>
                </div>
              </div>
            )
          )}

          {!isColaborativo && isPersonalSolo && !viewerIsGerente && (
            <div style={{ borderColor: C.hairline }} className="border-t pt-4">
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>Asignar Responsables</div>
              <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Esas personas se vuelven las solicitantes y tú te quedas como asignado.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {assignableProfiles.filter((p) => p.id !== profile.id).map((p) => (
                  <button key={p.id} type="button" disabled={isFinalized} onClick={() => toggleResponsibleId(p.id)}
                    style={{ borderColor: responsibleIds.includes(p.id) ? C.signal : C.hairline, background: responsibleIds.includes(p.id) ? C.signal : "transparent", color: responsibleIds.includes(p.id) ? "#fff" : C.ink }}
                    className="border px-2.5 py-1 text-xs disabled:opacity-50">{p.name}</button>
                ))}
              </div>
              <button disabled={isFinalized || responsibleIds.length === 0} onClick={assignResponsible} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-50"><ArrowRightLeft size={14} /> Asignar Responsables</button>
            </div>
          )}

          {!isColaborativo && !viewerIsGerente && (
            <div style={{ borderColor: C.hairline }} className="border-t pt-4">
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: C.inkSoft }}>{isPersonalSolo ? "Asignar a" : "Delegar"}</div>
              {isPersonalSolo && <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Esa persona se vuelve la asignada y tú te quedas como solicitante.</p>}
              <div className="flex gap-2">
                <select disabled={isFinalized} value={delegateId} onChange={(e) => setDelegateId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none disabled:opacity-50">
                  <option value="">Elegir persona...</option>
                  {(isPersonalSolo ? assignableProfiles.filter((p) => p.id !== profile.id) : assignableProfiles).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button disabled={isFinalized} onClick={delegate} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-50"><ArrowRightLeft size={14} /> {isPersonalSolo ? "Asignar a" : "Delegar"}</button>
              </div>
            </div>
          )}

          <div style={{ borderColor: C.hairline }} className="border-t pt-4">
            <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: C.inkSoft }}>Recordatorios</div>
            <div className="flex flex-col gap-1.5 text-sm mb-3" style={{ color: C.ink }}>
              {!isPersonalSolo && !viewerIsGerente && isDelivered && isAssignee && (
                <button
                  type="button"
                  disabled={!!task.notify_requester || isFinalized}
                  onClick={toggleNotifyRequester}
                  style={task.notify_requester ? { borderColor: C.hairline, color: C.inkSoft, background: C.panel } : { borderColor: C.signal, color: C.signal }}
                  className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5 self-start disabled:cursor-default"
                >
                  {task.notify_requester ? <><CheckCircle2 size={13} /> Avisado</> : <><Bell size={13} /> Avisar al solicitante</>}
                </button>
              )}
              {viewerIsGerente && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(task.followers || []).includes(profile.id)} onChange={toggleFollow} />
                  Dar seguimiento <span className="text-[11px]" style={{ color: C.inkSoft }}>(te llegan todas las notificaciones de cambios de este pendiente)</span>
                </label>
              )}
              <button
                type="button"
                disabled={iAlreadyAskedToRemind || isFinalized}
                onClick={toggleRemindMe}
                style={iAlreadyAskedToRemind ? { borderColor: C.hairline, color: C.inkSoft, background: C.panel } : { borderColor: C.signal, color: C.signal }}
                className="border px-2.5 py-1.5 text-xs flex items-center gap-1.5 self-start disabled:cursor-default"
              >
                {iAlreadyAskedToRemind ? <><CheckCircle2 size={13} /> Te avisamos</> : <><Bell size={13} /> Avisarme cuando se acerque el deadline</>}
              </button>
              {!isPersonalSolo && isColaborativo && canRemind && (
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.inkSoft }}>Recordatorio para</label>
                  <select value={reminderTargetId} onChange={(e) => setReminderTargetId(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-2 py-1.5 text-xs outline-none mt-1">
                    <option value="">Elegir miembro del equipo...</option>
                    {teamProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {!isPersonalSolo && !isColaborativo && isAnyRequester && !viewerIsGerente && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: C.inkSoft }}>Resaltar para {task.assigned_to_name} ({task.remind_assignee_count || 0}/3 hoy máx. 1)</span>
                  <button disabled={isFinalized || (task.remind_assignee_count || 0) >= 3 || task.remind_assignee_last_date === todayISO()} onClick={bumpRemindAssignee} style={{ borderColor: C.hairline, color: C.ink }} className="border px-2 py-1 text-xs disabled:opacity-40">Resaltar</button>
                </div>
              )}
              {!isPersonalSolo && isColaborativo && isAnyRequester && !viewerIsGerente && (
                <div className="flex items-center justify-end">
                  <button disabled={isFinalized || !reminderRecipient} onClick={bumpRemindAssignee} style={{ borderColor: C.hairline, color: C.ink }} className="border px-2 py-1 text-xs disabled:opacity-40">Resaltar</button>
                </div>
              )}
            </div>
            {!isPersonalSolo && canRemind && (
              <div className="flex flex-col gap-2">
                <button onClick={sendReminderEmail} disabled={isColaborativo && !reminderRecipient} style={{ borderColor: C.hairline, color: C.ink }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center disabled:opacity-40"><Mail size={14} /> Enviar recordatorio por correo</button>
                <button onClick={sendReminderWhatsapp} disabled={!reminderRecipient?.phone} style={{ borderColor: C.signal, color: reminderRecipient?.phone ? C.signal : C.gray }} className="border px-3 py-2 text-sm flex items-center gap-2 w-full justify-center disabled:cursor-not-allowed"><Send size={14} /> {reminderRecipient?.phone ? "Recordar por WhatsApp" : "Sin celular registrado"}</button>
              </div>
            )}
            {!isPersonalSolo && canRemind && <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Correo abre Outlook Web ya redactado (solo dale enviar); WhatsApp abre con el mensaje listo. Ninguno sale automático.</p>}
          </div>

          {!isPersonalSolo && (
            <div style={{ borderColor: C.hairline }} className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: C.inkSoft }}><MessageSquare size={12} /> Comentarios</div>
                {extractCommentLinks(comments).length > 0 && (
                  <button onClick={() => setShowAttachments((v) => !v)} className="text-xs flex items-center gap-1" style={{ color: C.signal }}>
                    <Paperclip size={12} /> Archivos adjuntos ({extractCommentLinks(comments).length})
                  </button>
                )}
              </div>
              {showAttachments && (
                <div style={{ borderColor: C.hairline, background: C.panel }} className="border p-2.5 mb-3 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {extractCommentLinks(comments).map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs underline break-all" style={{ color: C.signal }}>{l.url}</a>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2 mb-3 max-h-52 overflow-y-auto">
                {comments.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>Sin comentarios todavía.</div>}
                {comments.map((c) => (
                  <div key={c.id} style={{ background: C.panel, borderColor: C.hairline }} className="border px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5"><span className="text-xs font-medium" style={{ color: C.ink }}>{c.author_name}</span>
                      <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(c.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                    <div className="text-sm break-words whitespace-pre-wrap" style={{ color: C.ink }}>{renderWithLinks(c.text, C.signal)}</div>
                  </div>
                ))}
              </div>
              {!isFinalized && (
                <div className="flex gap-2 items-end">
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Agregar link, avance o lo que falta..." rows={2} style={{ borderColor: C.hairline, background: C.panel }} className="flex-1 border px-3 py-2 text-sm outline-none resize-y" />
                  <button onClick={addComment} style={{ background: C.spine, color: C.paper }} className="px-3 py-2"><Send size={14} /></button>
                </div>
              )}
            </div>
          )}

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

          {((!viewerIsGerente && (isAnyRequester || isAdmin) && !confirmDelete) || (canLeaveAsRequester && !confirmLeave)) && (
            <div className="flex items-center gap-4 mt-1">
              {!viewerIsGerente && (isAnyRequester || isAdmin) && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} className="text-xs flex items-center gap-1.5 self-start" style={{ color: C.urgent }}><Trash2 size={13} /> Eliminar pendiente</button>
              )}
              {canLeaveAsRequester && !confirmLeave && (
                <button onClick={() => setConfirmLeave(true)} className="text-xs flex items-center gap-1.5 self-start" style={{ color: C.urgent }}><LogOut size={13} /> Abandonar</button>
              )}
            </div>
          )}
          {confirmDelete && (task.recurring_template_id ? (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex flex-col gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>Este pendiente es de frecuencia. No se puede deshacer.</span>
              <div className="flex gap-2 flex-wrap items-center">
                <button onClick={() => setConfirmDelete(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={() => onDelete(task.id)} style={{ borderColor: C.urgent, color: C.urgent }} className="border text-xs px-2.5 py-1">Borrar</button>
                <button onClick={() => onDeleteRecurring(task.id, task.recurring_template_id)} style={{ background: C.urgent, color: "#fff" }} className="text-xs px-2.5 py-1">Borrar pendientes programados</button>
              </div>
              <span className="text-[10px]" style={{ color: C.inkSoft }}>"Borrar" solo elimina este — la próxima ocurrencia se sigue generando normal. "Borrar pendientes programados" detiene la recurrencia por completo.</span>
            </div>
          ) : (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>¿Eliminar? {isFinalized ? "Su registro de finalizado seguirá contando en el perfil de quien lo hizo. " : ""}No se puede deshacer.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmDelete(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={() => onDelete(task.id)} style={{ background: C.urgent, color: "#fff" }} className="text-xs px-2.5 py-1">Sí, eliminar</button>
              </div>
            </div>
          ))}
          {confirmLeave && (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>Dejarás de ser responsable de este pendiente.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmLeave(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={leaveTask} style={{ background: C.urgent, color: "#fff" }} className="text-xs px-2.5 py-1">Sí, abandonar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Búsqueda avanzada del dashboard (CHANGES.md #1). Busca entre TODOS mis
// pendientes (solicitados o asignados), sin importar la pestaña activa, por
// nombre, estado, urgencia, categoría, título, tipo de pendiente, o
// "hoy"/"mañana" contra el deadline.
function SearchModal({ onClose, tasks, profiles, onOpenTask }) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? tasks.filter((t) => matchesSearchQuery(t, query, profiles)) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" style={{ background: "rgba(20,24,31,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="border w-full max-w-md mt-14 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline, background: C.paper }} className="border-b px-4 py-3 flex items-center gap-2 sticky top-0">
          <Search size={15} style={{ color: C.inkSoft, flexShrink: 0 }} />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca palabras clave..." className="text-sm outline-none bg-transparent flex-1" />
          <button onClick={onClose}><X size={16} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-2">
          {query.trim() && results.length === 0 && <div className="text-xs px-2 py-4" style={{ color: C.inkSoft }}>Sin resultados para "{query}".</div>}
          {results.map((t) => (
            <button key={t.id} onClick={() => onOpenTask(t)} style={{ borderColor: C.hairline }} className="w-full text-left border-b last:border-b-0 px-2.5 py-2.5 flex flex-col gap-0.5">
              <span className="text-sm font-medium truncate" style={{ color: C.ink }}>{t.title}</span>
              <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{t.status} · {t.category} · solicita {t.requested_by} → {t.task_type === "colaborativo" ? "equipo" : t.assigned_to_name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ onClose, notifications, onOpenTask, onOpenFilter, pushSupported, pushEnabled, onEnablePush }) {
  const [fullMediaUrl, setFullMediaUrl] = useState(null);
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
            <div key={n.id} role={(n.task_id || n.target) ? "button" : undefined} onClick={() => { if (n.task_id) onOpenTask(n.task_id); else if (n.target) onOpenFilter(n.target); }} style={{ background: n.read ? "transparent" : C.signalSoft, cursor: (n.task_id || n.target) ? "pointer" : "default" }} className="w-full text-left px-3 py-2.5 flex flex-col gap-0.5">
              {n.title && <span className="text-sm font-medium break-words" style={{ color: C.ink }}>{n.title}</span>}
              <span className="text-sm break-words" style={{ color: n.title ? C.inkSoft : C.ink }}>{renderWithLinks(n.message, C.signal)}</span>
              {n.image_url && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFullMediaUrl(n.image_url); }}
                  className="text-xs font-medium self-start"
                  style={{ color: C.signal }}
                >
                  Ver más
                </button>
              )}
              <span className="font-mono text-[10px]" style={{ color: C.inkSoft }}>{new Date(n.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      </div>
      {fullMediaUrl && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: "rgba(20,24,31,0.92)" }}
          onClick={(e) => { e.stopPropagation(); setFullMediaUrl(null); }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setFullMediaUrl(null); }}
            style={{ background: C.paper }}
            className="absolute top-3 right-3 z-10 p-1 rounded-full"
          >
            <X size={18} style={{ color: C.inkSoft }} />
          </button>
          {getPopupMedia(fullMediaUrl)?.kind === "video" ? (
            <video
              src={fullMediaUrl}
              controls
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fullMediaUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
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

function ActivityPanel({ onClose, profile, router }) {
  const [log, setLog] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("finalized_log").select("*").eq("user_id", profile.id).order("finalized_at", { ascending: false }).limit(100);
      setLog(data || []);
    })();
  }, [profile.id]);
  const today = todayISO();
  // CHANGES.md #4e: un pendiente finalizado cuenta con la fecha en que se
  // ENTREGÓ, no la que se finalizó — tanto aquí (y solo si esa fecha sigue
  // dentro de esta ventana de 7 días) como en el reporte descargable.
  const days = Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const iso = dt.toISOString().slice(0, 10);
    const count = log.filter((l) => (l.delivered_at || l.finalized_at).slice(0, 10) === iso).length;
    return { iso, label: dt.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }), count };
  });
  const todayCount = days[0].count;

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
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4" style={{ background: "rgba(20,24,31,0.35)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderColor: C.hairline }} className="border w-full max-w-xs mt-14 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.ink }}><TrendingUp size={14} /> Mi actividad
            <button onClick={() => router.push("/perfil")} style={{ borderColor: C.hairline, color: C.ink }} className="border px-2 py-0.5 text-[11px] ml-1">Ver perfil</button>
          </div>
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
