"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, Bell, MessageSquare, ArrowRightLeft, X, Search, Flag,
  ChevronRight, ChevronDown, Trash2, CheckCircle2, Circle,
  PauseCircle, PlayCircle, Send, LogOut, History, Mail, Users,
  BookOpen, Download, Lock, CheckCheck, BellRing,
  Image as ImageIcon, Megaphone, Eye, Pencil, Paperclip, Link2, Clock,
} from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import BottomNav from "@/components/BottomNav";
import TeamPanel from "@/components/TeamPanel";
import LoadingScreen from "@/components/LoadingScreen";
import AccountsOnboarding from "@/components/AccountsOnboarding";

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

// Un pendiente (Individual, Personal o Colaborativo) cuyo deadline ya pasó y
// que aún no se entrega — en Colaborativo, mientras falte por entregar
// aunque sea una subtarea. Ya no es una urgencia aparte: se muestra con la
// tarjeta en negro (ver TaskRow) en vez de subir de urgencia.
function isOverdueUrgent(task) {
  return !DONE_STATUSES.includes(task.status) && !!task.deadline && daysUntil(task.deadline) < 0;
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.65)" }}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div style={{ boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4">
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500 }}>Vista previa</h2>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {showPopupPreview && (
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1.5" style={{ color: C.inkSoft }}>Así se ve el pop up</div>
              <div style={{ background: C.paper, borderRadius: R.lg, overflow: "hidden" }}>
                {mediaUrl && (
                  <button type="button" onClick={() => setShowFullMedia(true)} className="block w-full cursor-zoom-in">
                    {isVideo
                      ? <video src={mediaUrl} autoPlay loop muted playsInline className="w-full aspect-video object-cover" style={{ maxHeight: 160 }} />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={mediaUrl} alt="" className="w-full aspect-video object-cover" style={{ maxHeight: 160 }} />}
                  </button>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>
                    <Megaphone size={12} /> Aviso
                  </div>
                  <h3 style={{ color: C.ink, fontFamily: FONT_SERIF }} className="text-base mb-1">{title || "(sin título)"}</h3>
                  {description && <p className="text-sm whitespace-pre-wrap" style={{ color: C.ink }}>{renderWithLinks(description, C.signal)}</p>}
                </div>
              </div>
            </div>
          )}
          {showNotifPreview && (
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1.5" style={{ color: C.inkSoft }}>Así se ve la notificación</div>
              <div style={{ background: C.signalSoft, borderRadius: R.lg }} className="px-3.5 py-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Bell size={14} style={{ color: C.signal, flexShrink: 0 }} />
                  <span className="text-sm" style={{ color: C.ink }}>{notifMessage}</span>
                </div>
                {mediaUrl && <span className="text-xs font-medium self-start ml-6" style={{ color: C.signal }}>Ver más</span>}
              </div>
            </div>
          )}
        </div>
        <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="px-5 py-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Cancelar</button>
          <button onClick={onConfirm} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.6 : 1, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">{busy ? "..." : confirmLabel}</button>
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
        <label className="text-[11.5px] font-bold tracking-[0.09em] flex items-center gap-1.5" style={{ color: C.inkSoft }}><Link2 size={12} /> Referenciar pendientes (opcional)</label>
        <span className="text-[11px] font-semibold" style={{ color: atLimit ? C.urgent : C.inkSoft }}>{selected.length}/{POPUP_TASK_LIMIT}</span>
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
                <span className="flex items-center gap-1.5"><span className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{memberTasks.length}</span><ChevronDown size={12} style={{ color: C.inkSoft, transform: open ? "rotate(180deg)" : "none" }} /></span>
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
                          <span className="flex-1">{t.title} <span className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>· {t.status}</span></span>
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
    task.status, task.urgency, task.category, typeLabel,
    ...(task.co_requester_names || []), ...teamNames,
  ];
  return haystacks.some((h) => normalizeText(h).includes(q));
}

// CHANGES.md #2h: la lupa del dashboard también encuentra recursos de la
// Biblioteca — mismo criterio que el buscador de Biblioteca (#2g): nombre y etiquetas.
function matchesResourceQuery(resource, rawQuery) {
  const q = normalizeText(rawQuery.trim());
  if (!q) return false;
  const haystacks = [resource.title, ...(resource.tags || [])];
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
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: u.color }}><Flag size={12} fill={u.color} strokeWidth={0} />{u.label}</span>;
}
function DeadlineBadge({ deadline, status, hideToday, dark }) {
  const legend = dueLegend(deadline, status);
  const showLegend = legend && !(hideToday && legend.text === "¡Se entrega hoy!");
  return (
    <div className="text-right flex flex-col items-end gap-1">
      <div className="text-[12.5px]" style={{ color: dark ? C.overdueInkSoft : C.inkSoft }}>{fmtDate(deadline)}</div>
      {showLegend && <div className="text-[10.5px] font-bold" style={{ color: dark ? C.overdueInk : legend.color }}>{legend.text}</div>}
    </div>
  );
}

// Celda de la cuadrícula de info del Desglose (Solicita / Asignado a /
// Fecha de solicitud / Deadline general): tarjeta blanca propia con la
// etiqueta arriba y el valor abajo.
function InfoCell({ label, value, full }) {
  return (
    <div style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className={`px-3 py-2.5 flex flex-col gap-0.5 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className="text-[10.5px] font-semibold truncate" style={{ color: C.gray }}>{label}</span>
      <span className="text-[13.5px] font-semibold truncate" style={{ color: C.ink }}>{value}</span>
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
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // CHANGES.md #12: filtro activo del dashboard — reemplaza los tabs de
  // estado de antes por 5 filtros (Todos/Estado/Urgencia/Categoría/Deadline,
  // + "Programados" en "Mis solicitudes"). Solo uno puede estar activo a la
  // vez. `value` filtra por un valor puntual; `order` ("desc" = de mayor a
  // menor, "asc" = de menor a mayor) ordena/agrupa sin filtrar a un solo valor.
  // Filtro por default al entrar a la app: "No iniciado", para que lo
  // primero que se vea sea lo que aún falta por arrancar.
  const [activeFilter, setActiveFilter] = useState({ type: "Estado", value: "No iniciado" });
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
  const [resources, setResources] = useState([]); // recursos de Biblioteca visibles para mí (CHANGES.md #2h)
  const [accounts, setAccounts] = useState([]);
  const [accountFilterId, setAccountFilterId] = useState(null); // null = todas las cuentas del usuario
  const [showAccountFilter, setShowAccountFilter] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: t } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const { data: p } = await supabase.from("profiles").select("*");
    const { data: st } = await supabase.from("subtasks").select("*").order("created_at", { ascending: true });
    const { data: rt } = await supabase.from("recurring_templates").select("*");
    // CHANGES.md #2h: la lupa del dashboard también busca en la Biblioteca —
    // RLS ya limita esto a generales + propios + compartidos conmigo.
    const { data: res } = await supabase.from("resources").select("*");
    const { data: accs } = await supabase.from("accounts").select("*").order("name");
    setTasks(t || []);
    setProfiles(p || []);
    setSubtasks(st || []);
    setRecurringTemplates(rt || []);
    setResources(res || []);
    setAccounts(accs || []);
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

  // CHANGES.md #18: avisa cada día (no solo una vez) a quien no ha entregado
  // su pendiente vencido — Individual, Personal, o su propia subtarea si es
  // Colaborativo. En Colaborativo solo le llega a quien de verdad no
  // entregó su parte, nunca al resto del equipo. Al darle clic abre el
  // desglose de ese pendiente (vía task_id, igual que las demás
  // notificaciones). overdue_last_reminded_on (en tasks/subtasks) evita
  // mandar más de una por día por persona.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const today = todayISO();
      const title = (t) => `¿Aún no has entregado "${t.title}"?`;
      const body = `Revisa si este pendiente ya fue y dale en "Entregado" para que alguien pueda finalizártelo.`;
      for (const t of tasks) {
        if (!isOverdueUrgent(t)) continue;
        if (t.task_type === "colaborativo") {
          const teamSubtasks = subtasks.filter((s) => s.task_id === t.id);
          for (const s of teamSubtasks) {
            if (!s.assigned_to_id || s.status === "Entregado" || s.overdue_last_reminded_on === today) continue;
            await notify(s.assigned_to_id, t.id, body, title(t));
            await supabase.from("subtasks").update({ overdue_last_reminded_on: today }).eq("id", s.id);
          }
        } else if (t.assigned_to_id && t.overdue_last_reminded_on !== today) {
          await notify(t.assigned_to_id, t.id, body, title(t));
          await supabase.from("tasks").update({ overdue_last_reminded_on: today }).eq("id", t.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasks, subtasks]);

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
      // "always_welcome": pop up de bienvenida, sin fecha — le sale a
      // cualquiera que no lo haya cerrado todavía, sin importar el día.
      const { data: pops } = await supabase.from("popups").select("*")
        .or(`scheduled_date.eq.${today},always_welcome.eq.true`)
        .order("created_at", { ascending: true });
      if (!pops || pops.length === 0) { setPopupQueue([]); return; }
      const forMe = pops.filter((p) => !p.target_user_ids || p.target_user_ids.length === 0 || p.target_user_ids.includes(profile.id));
      const dueNow = forMe.filter((p) => p.always_welcome || !p.scheduled_time || p.scheduled_time.slice(0, 5) <= nowHHMM);
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
    fetch("/api/send-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, title: title || "Terregal", body: message, url: "/dashboard" }) }).catch(() => {});
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
        requested_by_id: form.requestedById || profile.id, co_requester_ids: form.coRequesterIds || [],
        assigned_to_id: form.taskType === "colaborativo" ? null : (form.assignedToId || null),
        team_member_ids: form.taskType === "colaborativo" ? (form.teamMemberIds || []) : [],
        subtask_specs: subtaskSpecs,
        account_id: form.accountId || null,
      }).select().single();

      if (!tplError && tpl) {
        const assignee = form.taskType === "colaborativo" ? null : profiles.find((p) => p.id === form.assignedToId);
        const requester = profiles.find((p) => p.id === form.requestedById);
        const coRequesters = (form.coRequesterIds || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
        const { data: firstTask } = await supabase.from("tasks").insert({
          title: form.title, description: form.description, category: form.category,
          task_type: form.taskType,
          requested_by: requester ? requester.name : profile.name, requested_by_id: form.requestedById || profile.id,
          co_requester_ids: coRequesters.map((p) => p.id), co_requester_names: coRequesters.map((p) => p.name),
          assigned_to_id: form.taskType === "colaborativo" ? null : (form.assignedToId || null),
          assigned_to_name: assignee ? assignee.name : "",
          team_member_ids: form.taskType === "colaborativo" ? (form.teamMemberIds || []) : [],
          deadline: form.deadline, urgency: form.urgency || "Media",
          request_date: form.scheduledDate,
          recurring_template_id: tpl.id,
          created_by: profile.id,
          account_id: form.accountId || null,
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
      account_id: form.accountId || null,
    }).select().single();

    if (!error && data) {
      await addHistory(data.id, `Creado por ${profile.name}`);
      if (data.request_date && data.deadline && data.request_date === data.deadline) {
        await addHistory(data.id, `⚠️ Pendiente "de hoy para hoy" — se solicitó y se necesita entregar el mismo día`);
      }
      if (assignee && assignee.id !== profile.id) await notify(assignee.id, data.id, `Te asignaron "${data.title}"`);
      // CHANGES.md #19: si quien crea el Individual elige a otra persona
      // como solicitante principal, se le avisa igual que a un co-solicitante.
      if (requester && requester.id !== profile.id) await notify(requester.id, data.id, `Te agregaron como solicitante del pendiente "${data.title}"`);
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
    // CHANGES.md #22: antes había que darle aparte a "Avisar al solicitante" —
    // ahora se le avisa solo, en cuanto se entrega.
    if (task.requested_by_id && task.requested_by_id !== profile.id) {
      await notify(
        task.requested_by_id, task.id,
        `${profile.name} ya entregó su pendiente, revísalo y dale finalizado. Al finalizar pendientes podrá sumarle al registro personal de ${profile.name}`,
        "Te entregaron un pendiente"
      );
    }
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

  // CHANGES.md #23: cualquiera con acceso puede cambiar el deadline de una
  // subtarea — pero si quien lo cambia no es el solicitante, se le avisa.
  const updateSubtaskDeadline = async (subtask, deadline) => {
    await supabase.from("subtasks").update({ deadline }).eq("id", subtask.id);
    const task = tasks.find((t) => t.id === subtask.task_id);
    if (task && task.requested_by_id && task.requested_by_id !== profile.id) {
      await notify(task.requested_by_id, task.id, `${profile.name} cambió el deadline de la subtarea "${subtask.title}" de "${task.title}" a ${fmtDate(deadline)}`);
    }
    loadAll();
  };

  const markNotifsRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unread);
    loadNotifications(profile.id);
  };

  if (!ready) return <LoadingScreen />;

  // CHANGES.md #24: onboarding de "cuentas" + puesto — bloqueante, antes de
  // dejar entrar al dashboard. Les sale a los usuarios nuevos y, una sola
  // vez, a los que ya estaban registrados desde antes de que esto existiera.
  if (!profile.account_ids?.length || !profile.job_title) {
    return <AccountsOnboarding profile={profile} onDone={setProfile} />;
  }

  const isAdmin = profile?.role === "admin";
  const isGerente = profile?.role === "gerente" || profile?.role === "admin";
  const assignableProfiles = profiles.filter((p) => p.role !== "admin");
  const myAccounts = accounts.filter((a) => (profile.account_ids || []).includes(a.id));
  // Un gerente solo puede "ver como" compañeros que compartan al menos una
  // cuenta con él. Si el gerente todavía no configuró sus cuentas en Mi
  // perfil, no se restringe nada (se sigue viendo a todo el equipo).
  const viewAsCandidates = profiles.filter((p) => p.id !== profile.id && p.role !== "admin")
    .filter((p) => (profile.account_ids || []).length === 0 || (p.account_ids || []).some((id) => (profile.account_ids || []).includes(id)));
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
  if (accountFilterId) base = base.filter((t) => t.account_id === accountFilterId);
  // Universo de la búsqueda avanzada (CHANGES.md #1): siempre "todos mis
  // pendientes" — los que solicité o me asignaron — sin importar qué pestaña
  // esté activa.
  const myTasks = tasks.filter((t) => isRequesterOf(t, effectiveId) || isAssignedTo(t, effectiveId));

  const filtered = base.filter((t) => {
    if (activeFilter.type === "Programados") return isProgramado(t);
    if (activeFilter.type === "Estado" && activeFilter.value) return t.status === activeFilter.value;
    if (activeFilter.type === "Urgencia" && activeFilter.value) return t.urgency === activeFilter.value;
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
  const urgencyGroupOrder = ["Urgente", "Alta", "Media", "Baja"];

  // Modo de agrupación de la lista: por default (o al filtrar a un valor
  // puntual de Estado/Urgencia/Categoría) se agrupa por urgencia, igual que
  // siempre. "Estado: de mayor/menor a menor/mayor" agrupa por estado en vez
  // de por urgencia. "Deadline" no agrupa — lista plana ordenada por fecha.
  let groupKeyOf = (t) => t.urgency;
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

  // Resumen bajo el título: activos y cuántos se entregan hoy — sobre el
  // universo de la pestaña actual (base), sin que los filtros secundarios
  // (Estado/Urgencia/...) lo muevan.
  const activeInTab = base.filter((t) => !DONE_STATUSES.includes(t.status));
  const dueTodayCount = activeInTab.filter((t) => t.deadline === todayISO()).length;

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full font-sans pb-28 md:pb-10 md:pl-[248px]">
      <div className="px-5 pt-4 md:hidden">
        <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: C.inkSoft }}>TERREGAL</div>
      </div>
      <div className="px-5 pt-3 flex items-center gap-2.5">
        <button onClick={() => setShowSearch(true)}
          style={{ background: C.panel, borderRadius: R.pill, boxShadow: SH.soft }}
          className="flex-1 min-w-0 h-11 px-4 flex items-center gap-2.5 text-left">
          <Search size={16} style={{ color: C.gray, flexShrink: 0 }} />
          <span className="text-sm truncate" style={{ color: C.inkFaint }}>Buscar</span>
        </button>
        <button onClick={() => { setShowNotifs(true); markNotifsRead(); }} className="relative flex-shrink-0"
          style={{ width: 44, height: 44, borderRadius: R.pill, background: C.panel, boxShadow: SH.soft, color: C.inkMedium }}>
          <span className="flex items-center justify-center w-full h-full"><Bell size={18} /></span>
          {bellLabel && <span style={{ background: C.urgent, color: "#fff" }} className="absolute top-0 right-0 text-[9px] font-bold w-4 h-4 flex items-center justify-center leading-none rounded-full">{bellLabel}</span>}
        </button>
        <button onClick={() => setShowNew(true)}
          style={{ background: C.ink, color: C.paper, borderRadius: R.pill, height: 44 }}
          className="px-4 flex items-center gap-1.5 text-[13.5px] font-semibold flex-shrink-0 whitespace-nowrap">
          <Plus size={16} /> <span className="hidden sm:inline">Nuevo pendiente</span>
        </button>
      </div>
      <div className="px-5 pt-4">
        <div className="relative inline-block">
          <button onClick={() => myAccounts.length > 0 && setShowAccountFilter((v) => !v)} className="flex items-center gap-1.5">
            <h1 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em" }} className="leading-[1.08]">Pendientes</h1>
            {myAccounts.length > 0 && <ChevronDown size={18} style={{ color: C.inkSoft, transform: showAccountFilter ? "rotate(180deg)" : "none", marginTop: 4 }} />}
          </button>
          {showAccountFilter && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5">
              <button onClick={() => { setAccountFilterId(null); setShowAccountFilter(false); }}
                style={{ color: !accountFilterId ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">Todas las cuentas</button>
              {myAccounts.map((a) => (
                <button key={a.id} onClick={() => { setAccountFilterId(a.id); setShowAccountFilter(false); }}
                  style={{ color: accountFilterId === a.id ? C.signal : C.ink }}
                  className="w-full text-left px-3.5 py-2 text-sm">{a.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[13.5px]" style={{ color: C.inkSoft }}>
          {accountFilterId && <span style={{ color: C.inkMedium, fontWeight: 600 }}>{accounts.find((a) => a.id === accountFilterId)?.name} ·</span>}
          <span>{activeInTab.length} activo{activeInTab.length === 1 ? "" : "s"}</span>
          {dueTodayCount > 0 && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: R.pill, background: "#C3C0B8" }} />
              <span style={{ color: C.urgent, fontWeight: 600 }}>{dueTodayCount} se entrega{dueTodayCount === 1 ? "" : "n"} hoy</span>
            </>
          )}
        </div>
      </div>

      <div className="px-5 pt-4 flex flex-wrap items-center gap-2.5 relative">
        <div style={{ background: C.subtle, borderRadius: R.pill }} className="flex gap-1 p-1 flex-shrink-0">
          {[["requests", "Solicitudes"], ["mine", "Asignados"], ...(isAdmin ? [["popups", "Pop Ups"]] : [])].map(([key, label]) => (
            <button key={key} onClick={() => setPrimaryTab(key)}
              style={primaryTab === key ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
              className="h-9 px-3.5 rounded-full text-[12.5px] whitespace-nowrap">{label}</button>
          ))}
        </div>
        <div className="basis-full h-0 md:hidden" />
        <span style={{ width: 1, height: 20, background: C.hairline, flexShrink: 0 }} />
        <button onClick={() => { setActiveFilter({ type: "Todos" }); setOpenFilterKey(null); }}
          style={activeFilter.type === "Todos" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
          className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap">Todos</button>
        {primaryTab === "requests" && (
          <button onClick={() => { setActiveFilter({ type: "Programados" }); setOpenFilterKey(null); }}
            style={activeFilter.type === "Programados" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
            className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap">Programados</button>
        )}

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Estado" ? null : "Estado")}
            style={activeFilter.type === "Estado" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
            className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
            Estado <ChevronDown size={13} style={{ transform: openFilterKey === "Estado" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Estado" && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5">
              {[...ASSIGNEE_STATUSES, "Finalizado"].map((s) => (
                <button key={s} onClick={() => { setActiveFilter({ type: "Estado", value: s }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Estado" && activeFilter.value === s ? C.signal : C.ink }}
                  className="w-full text-left px-3.5 py-2 text-sm">{s}</button>
              ))}
              <div style={{ background: C.hairlineSoft }} className="h-px my-1 mx-1" />
              <button onClick={() => { setActiveFilter({ type: "Estado", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Estado" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Estado", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Estado" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Urgencia" ? null : "Urgencia")}
            style={activeFilter.type === "Urgencia" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
            className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
            Urgencia <ChevronDown size={13} style={{ transform: openFilterKey === "Urgencia" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Urgencia" && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5">
              {URGENCIES.map((u) => (
                <button key={u.label} onClick={() => { setActiveFilter({ type: "Urgencia", value: u.label }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Urgencia" && activeFilter.value === u.label ? C.signal : C.ink }}
                  className="w-full text-left px-3.5 py-2 text-sm">{u.label}</button>
              ))}
              <div style={{ background: C.hairlineSoft }} className="h-px my-1 mx-1" />
              <button onClick={() => { setActiveFilter({ type: "Urgencia", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Urgencia" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Urgencia", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Urgencia" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Categoria" ? null : "Categoria")}
            style={activeFilter.type === "Categoria" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
            className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
            Categoría <ChevronDown size={13} style={{ transform: openFilterKey === "Categoria" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Categoria" && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5 max-h-64 overflow-y-auto">
              {categoryOptions.length === 0 && <div className="px-3.5 py-2 text-sm" style={{ color: C.inkSoft }}>Sin categorías todavía.</div>}
              {categoryOptions.map((c) => (
                <button key={c} onClick={() => { setActiveFilter({ type: "Categoria", value: c }); setOpenFilterKey(null); }}
                  style={{ color: activeFilter.type === "Categoria" && activeFilter.value === c ? C.signal : C.ink }}
                  className="w-full text-left px-3.5 py-2 text-sm">{c}</button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setOpenFilterKey((k) => k === "Deadline" ? null : "Deadline")}
            style={activeFilter.type === "Deadline" ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
            className="h-[34px] px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
            Deadline <ChevronDown size={13} style={{ transform: openFilterKey === "Deadline" ? "rotate(180deg)" : "none" }} />
          </button>
          {openFilterKey === "Deadline" && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5">
              <button onClick={() => { setActiveFilter({ type: "Deadline", order: "asc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Deadline" && activeFilter.order === "asc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De mayor a menor</button>
              <button onClick={() => { setActiveFilter({ type: "Deadline", order: "desc" }); setOpenFilterKey(null); }}
                style={{ color: activeFilter.type === "Deadline" && activeFilter.order === "desc" ? C.signal : C.ink }}
                className="w-full text-left px-3.5 py-2 text-sm">De menor a mayor</button>
            </div>
          )}
        </div>

        {/* Lanzamiento del buscador — quitar esta leyenda después del 2026-08-31 */}
        {todayISO() === "2026-08-31" && (
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.signal }}>¡Nuevo!</span>
        )}
        {watchers.length > 0 && <Eye size={15} style={{ color: C.urgent }} />}
        {isGerente && (
          <div className="relative">
            <button onClick={() => setShowTeamPicker((v) => !v)}
              style={viewingAs ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, boxShadow: SH.soft, color: C.inkMedium, fontWeight: 500 }}
              className="h-9 px-3.5 rounded-full text-[12.5px] whitespace-nowrap flex items-center gap-1">
              Mi equipo <ChevronDown size={13} style={{ transform: showTeamPicker ? "rotate(180deg)" : "none" }} />
            </button>
            {showTeamPicker && (
              <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] py-1.5">
                <button onClick={() => { stopViewingAs(); setShowTeamPicker(false); }} style={{ color: C.inkSoft, boxShadow: `inset 0 -1px 0 ${C.hairlineSoft}` }} className="w-full text-left px-3.5 py-2 text-sm">Ver el mío (salir)</button>
                {viewAsCandidates.map((p) => (
                  <button key={p.id} onClick={() => { startViewingAs(p.id); setShowTeamPicker(false); }}
                    style={{ color: viewingAs === p.id ? C.signal : C.ink, background: viewingAs === p.id ? C.signalSoft : "transparent" }}
                    className="w-full text-left px-3.5 py-2 text-sm">{p.name}</button>
                ))}
                {viewAsCandidates.length === 0 && (profile.account_ids || []).length > 0 && (
                  <p className="px-3.5 py-2 text-xs" style={{ color: C.inkSoft }}>Nadie más comparte tus cuentas todavía.</p>
                )}
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

      <div className="max-w-3xl mx-auto px-5 pb-10">
        {flatDeadlineList ? (
          <>
            {flatDeadlineList.length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
            {flatDeadlineList.length > 0 && (
              <div className="mt-6 flex flex-col gap-2.5">
                {flatDeadlineList.map((t) => <TaskRow key={t.id} task={t} unreadComments={unreadCommentsByTask[t.id] || 0} onOpen={() => setSelected(t)} />)}
              </div>
            )}
          </>
        ) : (
          <>
            {Object.keys(grouped).length === 0 && <div className="text-center py-16" style={{ color: C.inkSoft }}><p className="text-sm">No hay pendientes que coincidan con el filtro.</p></div>}
            {groupOrder.filter((k) => grouped[k]?.length).map((k) => {
              const color = groupIsStatus ? C.inkMedium : (URGENCIES.find((x) => x.label === k) || {}).color;
              const StatusIcon = groupIsStatus ? STATUS_ICON[k] : null;
              return (
                <div key={k} className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ width: 9, height: 9, borderRadius: R.pill, background: color }} />
                    <span style={{ color: C.inkMedium, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.11em" }} className="uppercase">{k}</span>
                    <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: R.pill, background: C.subtle, color: C.inkMedium, fontSize: 11, fontWeight: 700 }} className="flex items-center justify-center">{grouped[k].length}</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
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

      <BottomNav active="pendientes" profile={profile} onEquipo={() => setShowTeam(true)} />

      {showNew && <NewTaskForm onClose={() => { setShowNew(false); setAssignChangesFor(null); }} onCreate={createTask} onCreatePopup={createPopup} profiles={assignableProfiles} profile={profile} isAdmin={isAdmin} tasks={tasks} subtasks={subtasks} initialData={assignChangesFor} accounts={myAccounts.length > 0 ? myAccounts : accounts} />}
      {popupQueue[0] && <PopupModal popup={popupQueue[0]} onClose={dismissPopup} tasks={tasks} subtasks={subtasks} profiles={profiles} onFinalizeTask={finalizeTask} />}
      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} onUpdate={updateTask} onDelete={deleteTask} onDeleteRecurring={deleteRecurringTask} recurringTemplates={recurringTemplates} onFinalize={finalizeTask} onDeliver={deliverTask} profiles={profiles} assignableProfiles={assignableProfiles} profile={profile} notify={notify} subtasks={subtasks.filter((s) => s.task_id === selected.id)} onAddSubtask={addSubtask} onUpdateSubtaskStatus={updateSubtaskStatus} onUpdateSubtaskDescription={updateSubtaskDescription} onUpdateSubtaskDeadline={updateSubtaskDeadline} onAssignChanges={startAssignChanges} viewerIsGerente={!!viewingAs && !isAdmin} onCommentsRead={reloadMyCommentReads} />}
      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} profiles={assignableProfiles} tasks={tasks} />}
      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} notifications={notifications} onOpenTask={(taskId) => { const t = tasks.find((x) => x.id === taskId); if (t) setSelected(t); setShowNotifs(false); }} onOpenFilter={(target) => { if (target === "requests:Entregado") { setPrimaryTab("requests"); setActiveFilter({ type: "Estado", value: "Entregado" }); } setShowNotifs(false); }} pushSupported={pushSupported} pushEnabled={pushEnabled} onEnablePush={enablePush} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} tasks={myTasks} profiles={profiles} resources={resources} onOpenTask={(t) => { setSelected(t); setShowSearch(false); }} onOpenResource={(r) => { setShowSearch(false); router.push(`/biblioteca?open=${r.id}`); }} />}
    </div>
  );
}

function TaskRow({ task, onOpen, unreadComments = 0 }) {
  const Icon = STATUS_ICON[task.status];
  const isDone = DONE_STATUSES.includes(task.status);
  // Pendiente vencido (individual, personal o colaborativo): tarjeta en
  // negro en vez de subir a una urgencia especial — ver isOverdueUrgent.
  const overdue = isOverdueUrgent(task);
  const urgent = task.urgency === "Urgente" && !isDone && !overdue;
  const sameDay = task.request_date && task.deadline && task.request_date === task.deadline;
  const effType = effectiveTaskType(task);
  const typeLabel = TASK_TYPES.find((t) => t.key === effType)?.label;
  const programado = !!task.request_date && task.request_date > todayISO();
  const inkColor = overdue ? C.overdueInk : C.ink;
  const inkSoftColor = overdue ? C.overdueInkSoft : C.inkSoft;
  const chipStyle = overdue
    ? { background: "rgba(246,243,237,0.12)", color: C.overdueInkSoft }
    : { background: C.subtle, color: "#6F747E" };
  const typeChipStyle = overdue
    ? { background: "rgba(47,125,104,0.22)", color: "#8FC4B2" }
    : { background: C.signalSoft, color: C.signal };
  return (
    <button
      onClick={onOpen}
      style={{ borderRadius: R.lg, background: overdue ? C.spine : urgent ? "#FBEFEB" : C.panel, boxShadow: SH.card }}
      className="w-full text-left p-[14px] flex gap-3"
    >
      <div style={{ width: 38, height: 38, borderRadius: 13, background: overdue ? "rgba(246,243,237,0.12)" : C.subtle, color: overdue ? C.overdueInk : isDone ? C.signal : C.inkSoft }} className="flex items-center justify-center flex-shrink-0">
        <Icon size={19} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={chipStyle} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full">{task.category}</span>
          {effType && effType !== "individual" && (
            <span style={typeChipStyle} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full">{typeLabel}</span>
          )}
          {programado && (
            <span style={typeChipStyle} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10} /> Programado</span>
          )}
          {task.changes_round > 0 && (
            <span style={typeChipStyle} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full">Cambios Ronda {task.changes_round}</span>
          )}
          {unreadComments > 0 && (
            <span className="relative inline-flex" style={{ flexShrink: 0 }}>
              <MessageSquare size={14} style={{ color: inkSoftColor }} />
              <span style={{ background: C.urgent, color: "#fff" }} className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 leading-none rounded-full">{unreadComments > 9 ? "9+" : unreadComments}</span>
            </span>
          )}
          {Array.from({ length: task.remind_assignee_count || 0 }).map((_, i) => <Bell key={i} size={11} style={{ color: C.amber, flexShrink: 0 }} />)}
        </div>
        <div style={{ color: inkColor, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }} className="text-[15.5px] font-semibold leading-tight truncate">{task.title}</div>
        <div style={{ color: inkSoftColor }} className="text-[13px] truncate">
          {task.requested_by}{(task.co_requester_names || []).length > 0 ? ` + ${task.co_requester_names.join(", ")}` : task.responsible_name ? ` + ${task.responsible_name}` : ""}
          {" → "}
          {task.task_type === "colaborativo" ? `equipo (${(task.team_member_ids || []).length})` : task.assigned_to_name}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <DeadlineBadge deadline={task.deadline} status={task.status} hideToday={sameDay} dark={overdue} />
        {sameDay && <div className="text-[10px] font-bold text-right" style={{ color: C.urgent }}>De hoy para hoy 💀</div>}
      </div>
    </button>
  );
}

function NewTaskForm({ onClose, onCreate, onCreatePopup, profiles, profile, isAdmin, tasks, subtasks, initialData, accounts }) {
  const [mode, setMode] = useState("pendiente"); // "pendiente" | "popup" (solo admins ven el selector)
  const [accountId, setAccountId] = useState("");
  const [taskType, setTaskType] = useState("individual"); // individual | personal | colaborativo
  const [title, setTitle] = useState(initialData?.title || ""), [description, setDescription] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]), [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [urgency, setUrgency] = useState("Media"), [assignedToId, setAssignedToId] = useState("");

  // Individual y Colaborativo: Programar pendiente (Día programado +
  // repetición opcional). El día de la semana / ocurrencia del mes no se
  // elige a mano — sale del Día programado.
  const [scheduling, setScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [repeatMode, setRepeatMode] = useState("none"); // "none" | "weekly" | "monthly"
  const [showRepeatMenu, setShowRepeatMenu] = useState(false);

  // Colaborativo: equipo + subtareas
  const [teamMemberIds, setTeamMemberIds] = useState([]);
  const [subtaskRows, setSubtaskRows] = useState([]);
  const [showSubtaskRule, setShowSubtaskRule] = useState(false);

  // Solicita: además de ti, puedes agregar más solicitantes (individual y colaborativo)
  const [coRequesterIds, setCoRequesterIds] = useState([]);
  const [showRequesterPicker, setShowRequesterPicker] = useState(false);
  const toggleCoRequester = (id) => setCoRequesterIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  // CHANGES.md #19: en Individual, el solicitante principal ya no tiene que
  // ser siempre quien crea el pendiente — se puede elegir a cualquiera del
  // equipo (por default, tú). Así, eligiéndote a ti mismo como solicitante
  // Y como asignado, puedes cubrir el caso que antes cubría "Personal".
  const [requesterId, setRequesterId] = useState(profile.id);
  const [showRequesterSelect, setShowRequesterSelect] = useState(false);

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

  // CHANGES.md #19: "Asignar a" ahora también te incluye a ti mismo.
  const individualAssignable = profiles;
  const assignedToProfile = individualAssignable.find((p) => p.id === assignedToId);
  const [showAssignPicker, setShowAssignPicker] = useState(false);

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
    if (accounts.length > 0 && !accountId) return;
    const finalCategory = newCategory.trim() || category;
    const changesRound = initialData?.changesRound || null;
    if (taskType === "individual") {
      if (!assignedToId || deadlineError) return;
      onCreate({ title, description, category: finalCategory, taskType, requestedById: requesterId, coRequesterIds, deadline, urgency, assignedToId, subtasks: subtaskRows, scheduling, scheduledDate, repeatMode, changesRound, accountId });
    } else if (taskType === "personal") {
      onCreate({ title, description, category: finalCategory, taskType, requestedById: profile.id, deadline, urgency, assignedToId: profile.id, changesRound, accountId });
    } else if (taskType === "colaborativo") {
      if (teamMemberIds.length < 2 || deadlineError || missingSubtaskCoverage) return;
      onCreate({ title, description, category: finalCategory, taskType, requestedById: profile.id, coRequesterIds, deadline, urgency, teamMemberIds, subtasks: subtaskRows, scheduling, scheduledDate, repeatMode, changesRound, accountId });
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

  // Campos reutilizados entre individual y colaborativo (columna derecha)
  const primaryRequesterName = taskType === "individual"
    ? (profiles.find((p) => p.id === requesterId)?.name || profile.name)
    : profile.name;
  const isPrimaryRequesterMe = taskType !== "individual" || requesterId === profile.id;
  const solicitaField = (
    <div>
      <label className="text-[11.5px] font-bold tracking-[0.09em] flex items-center gap-1.5" style={{ color: C.inkSoft }}>
        Solicita
        <button type="button" onClick={() => setShowRequesterPicker((v) => !v)} title="Agregar más solicitantes" style={{ background: C.signalSoft, color: C.signal }} className="rounded-full w-4 h-4 flex items-center justify-center leading-none"><Plus size={9} /></button>
      </label>
      {taskType === "individual" ? (
        <div className="relative">
          <button type="button" onClick={() => setShowRequesterSelect((v) => !v)}
            style={{ background: C.paper, borderRadius: R.md }}
            className="w-full px-3.5 py-2.5 text-sm mt-1.5 flex items-center gap-1.5 text-left">
            <span style={{ color: C.ink }}>{primaryRequesterName}{isPrimaryRequesterMe ? " (tú)" : ""}</span>
            {coRequesterIds.length > 0 && <span style={{ color: C.inkSoft }}>+ {coRequesterIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}</span>}
            <ChevronDown size={14} style={{ color: C.gray, marginLeft: "auto", flexShrink: 0, transform: showRequesterSelect ? "rotate(180deg)" : "none" }} />
          </button>
          {showRequesterSelect && (
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 right-0 top-full mt-1.5 z-20 p-1.5 max-h-56 overflow-y-auto">
              {profiles.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => { setRequesterId(p.id); setCoRequesterIds((prev) => prev.filter((x) => x !== p.id)); setShowRequesterSelect(false); }}
                  style={{ background: requesterId === p.id ? C.subtle : "transparent" }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left">
                  <span className="text-sm font-semibold" style={{ color: C.ink }}>{p.name}{p.id === profile.id ? " (tú)" : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.paper, borderRadius: R.md, color: C.inkSoft }} className="w-full px-3.5 py-2.5 text-sm mt-1.5">
          {profile.name} (tú){coRequesterIds.length > 0 ? ` + ${coRequesterIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}` : ""}
        </div>
      )}
      {showRequesterPicker && (
        <div style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="p-3 mt-1.5 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {profiles.filter((p) => p.id !== (taskType === "individual" ? requesterId : profile.id)).map((p) => (
              <button key={p.id} type="button" onClick={() => toggleCoRequester(p.id)}
                style={{ background: coRequesterIds.includes(p.id) ? C.ink : C.panel, boxShadow: coRequesterIds.includes(p.id) ? "none" : SH.soft, color: coRequesterIds.includes(p.id) ? C.paper : C.inkMedium, fontWeight: coRequesterIds.includes(p.id) ? 600 : 500 }}
                className="h-[30px] px-3 rounded-full text-xs">{p.name}</button>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: C.inkSoft }}>Las personas que selecciones aparecerán junto al solicitante principal.</p>
        </div>
      )}
    </div>
  );

  const repeatField = usesDeadlineRules ? (
    <div className="relative">
      <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Se repite</label>
      <button type="button" onClick={() => setShowRepeatMenu((v) => !v)}
        style={{ background: C.paper, borderRadius: R.md }}
        className="w-full h-[46px] px-3.5 mt-1.5 flex items-center justify-between text-sm outline-none">
        <span>{REPEAT_MODES.find((m) => m.value === repeatMode)?.label}</span>
        <ChevronDown size={15} style={{ color: C.gray, transform: showRepeatMenu ? "rotate(180deg)" : "none" }} />
      </button>
      {showRepeatMenu && (
        <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 right-0 top-full mt-1.5 z-20 p-1.5">
          {REPEAT_MODES.map((m) => (
            <button key={m.value} type="button"
              onClick={() => { setRepeatMode(m.value); setScheduling(m.value !== "none"); setShowRepeatMenu(false); }}
              style={{ color: repeatMode === m.value ? C.signal : C.ink }}
              className="w-full text-left px-3 py-2 text-sm rounded-md">{m.label}</button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const scheduledDateField = scheduling ? (
    <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Día programado</label>
      <input type="date" value={scheduledDate} min={todayStr} onChange={(e) => setScheduledDate(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>
  ) : null;

  const generalDeadlineUrgencyField = (
    <div className="grid grid-cols-2 gap-3">
      <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Deadline{scheduling ? " general" : ""}</label>
        <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>
      <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Urgencia</label>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none">
          {URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
        </select></div>
      {deadlineError && <p className="col-span-2 text-[11px]" style={{ color: C.urgent }}>{deadlineError}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.55)" }}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div style={{ boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4 flex items-center justify-between">
          {isAdmin ? (
            <div style={{ background: C.subtle, borderRadius: R.pill }} className="flex gap-1 p-1">
              {[["pendiente", "Pendiente"], ["popup", "Pop Up"]].map(([key, label]) => (
                <button key={key} onClick={() => setMode(key)}
                  style={mode === key ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                  className="h-9 px-3.5 rounded-full text-sm">{label}</button>
              ))}
            </div>
          ) : (
            <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 23, fontWeight: 500 }}>Nuevo pendiente</h2>
          )}
          <button onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }}
            className="flex items-center justify-center"><X size={17} /></button>
        </div>

        {mode === "popup" && isAdmin ? (
          <div className="p-5 flex flex-col gap-4">
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Título</label>
              <input value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</label>
              <textarea value={popupDesc} onChange={(e) => setPopupDesc(e.target.value)} rows={4} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>
            <div>
              <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>¿A quién le sale?</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {profiles.map((p) => (
                  <button key={p.id} type="button" onClick={() => togglePopupTarget(p.id)}
                    style={{ background: popupTargetIds.includes(p.id) ? C.ink : C.panel, boxShadow: popupTargetIds.includes(p.id) ? "none" : SH.soft, color: popupTargetIds.includes(p.id) ? C.paper : C.inkMedium, fontWeight: popupTargetIds.includes(p.id) ? 600 : 500 }}
                    className="h-[30px] px-3 rounded-full text-xs">{p.name}</button>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Sin nadie seleccionado = le sale a todo el equipo.</p>
            </div>
            <PopupTaskPicker profiles={profiles} tasks={tasks} subtasks={subtasks} selected={popupTasks} onToggleTask={togglePopupTask} onToggleField={togglePopupTaskField} onApplyToAll={applyPopupFieldsToAll} />
            {!onlyNotification && (
              <div>
                <label className="text-[11.5px] font-bold tracking-[0.09em] flex items-center gap-1.5" style={{ color: C.inkSoft }}><ImageIcon size={12} /> Imagen, GIF o video (opcional)</label>
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
              <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Día programado (opcional)</label>
                <input type="date" value={popupDate} onChange={(e) => setPopupDate(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" />
                <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Vacío = se guarda en "Nuevos" para programarlo después.</p></div>
              <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Hora (opcional)</label>
                <input type="time" value={popupTime} onChange={(e) => setPopupTime(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" />
                <p className="text-[10px] mt-1" style={{ color: C.inkSoft }}>Vacío = aparece todo el día.</p></div>
            </div>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {accounts.length > 0 && (
              <div>
                <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>¿Para qué cuenta es?</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {accounts.map((a) => (
                    <button key={a.id} type="button" onClick={() => setAccountId(a.id)}
                      style={accountId === a.id ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, color: C.inkMedium, boxShadow: SH.soft, fontWeight: 500 }}
                      className="h-9 px-3.5 rounded-full text-[13px]">{a.name}</button>
                  ))}
                </div>
                {!accountId && <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Elige una cuenta para poder crear el pendiente.</p>}
              </div>
            )}

            <div style={{ background: C.subtle, borderRadius: R.pill }} className="flex gap-1 p-1">
              {/* CHANGES.md #19: se quita "Personal" de las opciones al crear
                  — Individual ya cubre ese caso (solicitante = tú, asignado
                  = tú). Los pendientes Personal que ya existen se quedan
                  igual, solo ya no se pueden crear nuevos. */}
              {TASK_TYPES.filter((tt) => tt.key !== "personal").map((tt) => (
                <button key={tt.key} onClick={() => setTaskType(tt.key)}
                  style={taskType === tt.key ? { background: C.panel, boxShadow: "0 1px 3px rgba(27,30,36,0.10)", color: C.ink, fontWeight: 700 } : { color: C.inkSoft, fontWeight: 600 }}
                  className="flex-1 h-9 rounded-full text-[12.5px]">{tt.label}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-4">
                <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Título{initialData && <span className="ml-1.5" style={{ color: C.signal }}>· Cambios Ronda {initialData.changesRound}</span>}</label>
                  <input value={title} onChange={(e) => !initialData && setTitle(e.target.value)} readOnly={!!initialData} style={{ background: C.paper, borderRadius: R.md, color: initialData ? C.inkSoft : C.ink, cursor: initialData ? "not-allowed" : "text" }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>

                <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-1.5 outline-none" /></div>

                <div>
                  <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Categoría</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {DEFAULT_CATEGORIES.map((c) => (
                      <button key={c} type="button" onClick={() => { setCategory(c); setNewCategory(""); setShowNewCategory(false); }}
                        style={!showNewCategory && category === c ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: C.panel, color: C.inkMedium, boxShadow: SH.soft, fontWeight: 500 }}
                        className="h-9 px-3.5 rounded-full text-[13px]">{c}</button>
                    ))}
                    <button type="button" onClick={() => setShowNewCategory((v) => !v)}
                      style={showNewCategory ? { background: C.ink, color: C.paper, fontWeight: 600 } : { background: "transparent", color: C.inkSoft, fontWeight: 500, boxShadow: `inset 0 0 0 1.5px ${C.hairline}` }}
                      className="h-9 px-3.5 rounded-full text-[13px] flex items-center gap-1"><Plus size={13} /> Nueva</button>
                  </div>
                  {showNewCategory && (
                    <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Escribe la categoría nueva" autoFocus
                      style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3.5 py-2.5 text-sm mt-2 outline-none" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {taskType === "individual" && (
                  <>
                    <div className="relative">
                      <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Asignar a</label>
                      <button type="button" onClick={() => setShowAssignPicker((v) => !v)}
                        style={{ background: C.paper, borderRadius: R.md }}
                        className="w-full h-[46px] px-3 mt-1.5 flex items-center gap-2.5 text-sm outline-none">
                        {assignedToProfile ? (
                          <>
                            <span style={{ width: 24, height: 24, borderRadius: R.pill, background: C.subtle, color: "#6F747E" }} className="flex-shrink-0 flex items-center justify-center text-[11px] font-bold">{(assignedToProfile.name || "?").trim().charAt(0).toUpperCase()}</span>
                            <span className="font-semibold truncate" style={{ color: C.ink }}>{assignedToProfile.name}</span>
                          </>
                        ) : (
                          <span style={{ color: C.inkFaint }}>Elegir persona...</span>
                        )}
                        <ChevronDown size={15} style={{ color: C.gray, marginLeft: "auto", flexShrink: 0, transform: showAssignPicker ? "rotate(180deg)" : "none" }} />
                      </button>
                      {showAssignPicker && (
                        <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="absolute left-0 right-0 top-full mt-1.5 z-20 p-1.5 max-h-56 overflow-y-auto">
                          {individualAssignable.map((p) => (
                            <button key={p.id} type="button" onClick={() => { setAssignedToId(p.id); setShowAssignPicker(false); }}
                              style={{ background: assignedToId === p.id ? C.subtle : "transparent" }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left">
                              <span style={{ width: 24, height: 24, borderRadius: R.pill, background: C.subtle, color: "#6F747E" }} className="flex-shrink-0 flex items-center justify-center text-[11px] font-bold">{(p.name || "?").trim().charAt(0).toUpperCase()}</span>
                              <span className="text-sm font-semibold" style={{ color: C.ink }}>{p.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {solicitaField}
                    {repeatField}
                    {scheduledDateField}
                    {generalDeadlineUrgencyField}

                    <div>
                      <div className="flex flex-col gap-2 mb-2">
                        {subtaskRows.map((row, i) => (
                          <div key={i} style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="p-3 flex flex-col gap-1.5">
                            <div className="flex gap-1.5">
                              <input value={row.title} onChange={(e) => updateSubtaskRow(i, "title", e.target.value)} placeholder="Título de la subtarea" style={{ background: C.paper, borderRadius: R.md }} className="flex-1 px-3 py-2 text-xs outline-none" />
                              <button type="button" onClick={() => removeSubtaskRow(i)}><X size={14} style={{ color: C.inkSoft }} /></button>
                            </div>
                            <textarea value={row.description} onChange={(e) => updateSubtaskRow(i, "description", e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none resize-y" />
                            <input type="date" value={row.deadline} min={baseDateStr} max={deadline || undefined} onChange={(e) => updateSubtaskRow(i, "deadline", e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none" />
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={addSubtaskRow} disabled={!assignedToId}
                        style={{ borderRadius: R.md, boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, color: C.inkSoft }}
                        className="w-full h-12 flex items-center justify-center gap-1.5 text-sm font-medium disabled:opacity-40">
                        <Plus size={15} /> Agregar subtarea
                      </button>
                      {subtaskRows.length === 0 && <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Sin subtarea con deadline propio, hereda el deadline general de arriba. Se asignarán a {assignedToId ? (individualAssignable.find((p) => p.id === assignedToId)?.name || "la persona asignada") : "la persona que asignes"}.</p>}
                    </div>
                  </>
                )}

                {taskType === "personal" && generalDeadlineUrgencyField}

                {taskType === "colaborativo" && (
                  <>
                    {solicitaField}

                    <div>
                      <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Equipo de trabajo</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {profiles.map((p) => (
                          <button key={p.id} type="button" onClick={() => toggleTeamMember(p.id)}
                            style={{ background: teamMemberIds.includes(p.id) ? C.ink : C.panel, boxShadow: teamMemberIds.includes(p.id) ? "none" : SH.soft, color: teamMemberIds.includes(p.id) ? C.paper : C.inkMedium, fontWeight: teamMemberIds.includes(p.id) ? 600 : 500 }}
                            className="h-[30px] px-3 rounded-full text-xs">{p.name}</button>
                        ))}
                      </div>
                      {teamMemberIds.length < 2 && <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>Selecciona al menos 2 personas del equipo.</p>}
                    </div>

                    {repeatField}
                    {scheduledDateField}
                    {generalDeadlineUrgencyField}

                    <div>
                      <div className="flex flex-col gap-2 mb-2">
                        {subtaskRows.map((row, i) => (
                          <div key={i} style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="p-3 flex flex-col gap-1.5">
                            <div className="flex gap-1.5">
                              <input value={row.title} onChange={(e) => updateSubtaskRow(i, "title", e.target.value)} placeholder="Título de la subtarea" style={{ background: C.paper, borderRadius: R.md }} className="flex-1 px-3 py-2 text-xs outline-none" />
                              <button type="button" onClick={() => removeSubtaskRow(i)}><X size={14} style={{ color: C.inkSoft }} /></button>
                            </div>
                            <textarea value={row.description} onChange={(e) => updateSubtaskRow(i, "description", e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none resize-y" />
                            <div className="grid grid-cols-2 gap-1.5">
                              <select value={row.assignedToId} onChange={(e) => updateSubtaskRow(i, "assignedToId", e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none">
                                <option value="">Asignar a...</option>
                                {profiles.filter((p) => teamMemberIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <input type="date" value={row.deadline} min={baseDateStr} max={deadline || undefined} onChange={(e) => updateSubtaskRow(i, "deadline", e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={addSubtaskRow} disabled={teamMemberIds.length === 0}
                        style={{ borderRadius: R.md, boxShadow: `inset 0 0 0 1.5px ${C.hairline}`, color: C.inkSoft }}
                        className="w-full h-12 flex items-center justify-center gap-1.5 text-sm font-medium disabled:opacity-40">
                        <Plus size={15} /> Agregar subtarea
                      </button>
                      {subtaskRows.length === 0 && <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Sin subtarea con deadline propio, hereda el deadline general de arriba.</p>}
                      {missingSubtaskCoverage && (
                        <p className="text-[11px] mt-1.5" style={{ color: C.urgent }}>
                          Falta asignar subtarea a: {teamMemberIds.filter((id) => !subtaskRows.some((r) => r.assignedToId === id && r.title.trim())).map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">Cancelar</button>
          {mode === "popup" && isAdmin ? (
            <button onClick={() => setShowPopupConfirm(true)} disabled={!popupTitle.trim() || popupSaving || !!popupImageError} style={{ background: C.ink, color: C.paper, opacity: popupSaving ? 0.6 : 1, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed">¿Listo?</button>
          ) : (
            <button onClick={handleCreateClick} disabled={(usesDeadlineRules && !!deadlineError) || (accounts.length > 0 && !accountId)} style={{ background: C.ink, color: C.paper, opacity: (usesDeadlineRules && deadlineError) || (accounts.length > 0 && !accountId) ? 0.5 : 1, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed">Crear pendiente</button>
          )}
        </div>
      </div>
      {showSubtaskRule && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.6)" }} onClick={() => setShowSubtaskRule(false)}>
          <div style={{ background: C.paper, borderRadius: R.xl, boxShadow: SH.card }} className="max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold" style={{ color: C.urgent }}>Tienes que asignar subtareas</p>
            <p className="text-sm mt-2" style={{ color: C.ink }}>Si no asignas subtareas los de tu equipo no podrán seleccionar que ya entregaron su parte y el pendiente no se podrá finalizar.</p>
            <button onClick={() => setShowSubtaskRule(false)} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="mt-3 px-4 py-2 text-xs font-semibold w-full">Entendido</button>
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
            {label} <span className="text-[11px] font-semibold">({grouped[key].length})</span>
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
                <div className="text-sm font-medium truncate" style={{ color: C.ink }}>{p.title}{p.only_notification && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: C.inkSoft }}>· solo notificación</span>}</div>
                <div className="text-[12px] mt-0.5" style={{ color: C.inkSoft }}>
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
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF }} className="text-lg">Editar Pop Up</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>¿A quién le sale?</label>
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
              <label className="text-[11.5px] font-bold tracking-[0.09em] flex items-center gap-1.5" style={{ color: C.inkSoft }}><ImageIcon size={12} /> Reemplazar imagen, GIF o video (opcional)</label>
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
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Día programado (opcional)</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" />
              <p className="text-[11px] mt-1" style={{ color: C.inkSoft }}>Vacío = se queda en "Nuevos".</p></div>
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Hora (opcional)</label>
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
    <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="px-3 py-2.5 flex flex-col gap-2.5 text-xs">
      {fields.includes("requester") && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Solicitante/s</div><div style={{ color: C.ink }}>{task.requested_by}{coRequesterNames.length ? ` + ${coRequesterNames.join(", ")}` : ""}</div></div>
      )}
      {fields.includes("assignee") && !isColaborativo && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Asignado</div><div style={{ color: C.ink }}>{task.assigned_to_name || "—"}</div></div>
      )}
      {fields.includes("team") && isColaborativo && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Equipo de trabajo</div><div style={{ color: C.ink }}>{teamNames.join(", ") || "—"}</div></div>
      )}
      {fields.includes("description") && task.description && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</div><div style={{ color: C.ink }} className="whitespace-pre-wrap break-words">{renderWithLinks(task.description, C.signal)}</div></div>
      )}
      {fields.includes("status") && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Estado</div><div style={{ color: C.ink }}>{task.status}</div></div>
      )}
      {fields.includes("generalStatus") && hasSubtasks && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Estado general</div><div style={{ color: C.ink }}>{task.status} ({deliveredCount}/{subsForTask.length} subtareas entregadas)</div></div>
      )}
      {fields.includes("requestedDate") && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Fecha de solicitud</div><div style={{ color: C.ink }}>{fmtDate(task.request_date)}</div></div>
      )}
      {fields.includes("deadline") && (
        <div><div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Fecha de deadline</div><div style={{ color: C.ink }}>{fmtDate(task.deadline)}</div></div>
      )}
      {fields.includes("deliveredDate") && (
        <div>
          <div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Fecha de entregado</div>
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
          <div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Subtareas ({deliveredCount}/{subsForTask.length})</div>
          <div className="flex flex-col gap-0.5 mt-0.5">
            {subsForTask.map((s) => <div key={s.id} style={{ color: C.ink }}>{s.title} — {s.assigned_to_name} · {s.status}</div>)}
          </div>
        </div>
      )}
      {canFinalize && (
        <button onClick={handleFinalize} disabled={busy} style={{ background: C.signal, color: "#fff", borderRadius: R.pill }} className="px-3 py-2 text-xs font-semibold disabled:opacity-60">{busy ? "Finalizando..." : "Finalizar pendiente"}</button>
      )}
      {showDownload && (
        <button onClick={handleDownload} style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.pill }} className="px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"><Download size={12} /> Descargar historial</button>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.65)" }}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm relative overflow-hidden max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: R.pill, background: C.panel, boxShadow: SH.soft, color: C.inkMedium }} className="absolute top-3 right-3 z-10 flex items-center justify-center">
          <X size={16} />
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
          <div className="flex items-center gap-1.5 mb-2 text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>
            <Megaphone size={12} /> Aviso
          </div>
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF }} className="text-lg mb-2">{popup.title}</h2>
          {popup.description && <p className="text-sm whitespace-pre-wrap break-words" style={{ color: C.ink }}>{renderWithLinks(popup.description, C.signal)}</p>}
          {relatedEntries.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Pendientes relacionados</div>
              {relatedEntries.map(({ entry, task }) => {
                const open = openTaskId === task.id;
                return (
                  <div key={task.id} style={{ background: C.paper, borderRadius: R.md, overflow: "hidden" }}>
                    <button onClick={() => setOpenTaskId(open ? null : task.id)} className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate" style={{ color: C.ink }}>{task.title}</span>
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
          <button onClick={onClose} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="mt-4 px-4 py-2.5 text-sm font-semibold w-full">Entendido</button>
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
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF }} className="text-lg">Convertir a Colaborativo</h2>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Título</label>
            <input value={task.title} readOnly style={{ borderColor: C.hairline, background: C.panel, color: C.inkSoft, cursor: "not-allowed" }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Categoría</label>
              <select value={category} onChange={(e) => { setCategory(e.target.value); setNewCategory(""); }} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>...o nueva</label>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
          </div>

          <div>
            <label className="text-[11.5px] font-bold tracking-[0.09em] flex items-center gap-1.5" style={{ color: C.inkSoft }}>
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
            <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Equipo de trabajo</label>
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
              <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Subtareas</label>
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
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Deadline general</label>
              <input type="date" value={deadline} min={minGeneralDeadline} onChange={(e) => setDeadline(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none" /></div>
            <div><label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Urgencia</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={{ borderColor: C.hairline, background: C.panel }} className="w-full border px-3 py-2 text-sm mt-1 outline-none">
                {URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
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

function TaskDetail({ task, onClose, onUpdate, onDelete, onDeleteRecurring, recurringTemplates, onFinalize, onDeliver, profiles, assignableProfiles, profile, notify, subtasks, onAddSubtask, onUpdateSubtaskStatus, onUpdateSubtaskDescription, onUpdateSubtaskDeadline, onAssignChanges, viewerIsGerente, onCommentsRead }) {
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
  // effectiveTaskType, no task.task_type: un Personal delegado a otra
  // persona se ve y se comporta como Individual en cuanto se le asigna
  // (ver effectiveTaskType), así que también debe poder llevar subtareas.
  const effType = effectiveTaskType(task);
  const showSubtasks = isColaborativo || effType === "individual";
  // CHANGES.md #10: en un Individual, además del/los solicitante(s), el
  // propio asignado puede agregarse subtareas a sí mismo para dividir su
  // pendiente — no reparte nada, targetAssignedToId sigue fijo a él mismo.
  const canAddSubtask = !isFinalized && !viewerIsGerente && (isAnyRequester || (effType === "individual" && isAssignee));
  const sameDay = task.request_date && task.deadline && task.request_date === task.deadline;
  const hasSubtasks = subtasks.length > 0;
  const allSubtasksDelivered = hasSubtasks && subtasks.every((s) => s.status === "Entregado");
  const canFinalize = !viewerIsGerente && !isFinalized && (isAdmin || (isColaborativo ? isAnyRequester && allSubtasksDelivered : isRequester && (hasSubtasks ? allSubtasksDelivered : isDelivered)));
  // CHANGES.md #23: ya no solo el solicitante/admin — cualquiera con acceso
  // al pendiente puede cambiar el deadline (se le avisa al solicitante si
  // quien lo cambia no es él mismo, ver changeDeadline).
  const canEditDeadline = !isFinalized && !viewerIsGerente;
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
    const patch = { status: s };
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
    onUpdate(task, { deadline: d }, `${profile.name} cambió el deadline a ${fmtDate(d)}`);
    // CHANGES.md #23: cualquiera puede cambiar el deadline, pero si quien lo
    // cambia no es un solicitante, se les avisa a todos los solicitantes.
    if (!isAnyRequester) {
      const requesterIds = new Set([task.requested_by_id, task.responsible_id, ...(task.co_requester_ids || [])].filter(Boolean));
      for (const rid of requesterIds) notify(rid, task.id, `${profile.name} cambió el deadline de "${task.title}" a ${fmtDate(d)}`);
    }
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
    await onUpdate(task, { assigned_to_id: p.id, assigned_to_name: p.name }, `${profile.name} ${isPersonalSolo ? "asignó a" : "delegó a"} ${p.name}`);
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
    const body = encodeURIComponent(`Hola ${reminderRecipient.name},\n\nRecordatorio del pendiente "${task.title}" (${task.category}).\nDeadline: ${fmtDate(task.deadline)}\nEstado: ${task.status}\n\nDe parte de ${profile.name}, panel Terregal.`);
    const to = encodeURIComponent(reminderRecipient.email || "");
    window.open(`https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`, "_blank");
    await onUpdate(task, {}, `${profile.name} envió recordatorio por correo a ${reminderRecipient.name}`);
  };
  const sendReminderWhatsapp = async () => {
    if (!reminderRecipient || !reminderRecipient.phone) return;
    const cleanPhone = reminderRecipient.phone.replace(/\D/g, "");
    const text = encodeURIComponent(`Hola ${reminderRecipient.name}, recordatorio: "${task.title}" (${task.category}). Deadline: ${fmtDate(task.deadline)}. Estado: ${task.status}. — ${profile.name}, Terregal`);
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
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: "rgba(27,30,36,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }} className="w-full max-w-md h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: C.paper }} className="px-5 pt-4 sticky top-0 z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span style={{ background: C.subtle, color: "#6F747E", borderRadius: R.pill, fontWeight: 600 }} className="text-[10.5px] px-2.5 py-1 inline-flex items-center gap-1">
              {task.category}
              {!isFinalized && !viewerIsGerente && (
                <button onClick={() => { setCategoryDraft(task.category || DEFAULT_CATEGORIES[0]); setNewCategoryDraft(""); setEditingCategory((v) => !v); }} title="Cambiar categoría" className="flex-shrink-0">
                  <Pencil size={10} />
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={downloadHistory} disabled={!isFinalized} title={isFinalized ? "Descargar" : "Se habilita cuando el solicitante finaliza el pendiente"}
              style={{ width: 34, height: 34, borderRadius: R.pill, background: C.panel, boxShadow: SH.soft, color: isFinalized ? C.inkMedium : C.inkFaint }}
              className="flex items-center justify-center disabled:cursor-not-allowed"><Download size={15} /></button>
            <button onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: R.pill, background: C.panel, boxShadow: SH.soft, color: C.inkMedium }}
              className="flex items-center justify-center"><X size={17} /></button>
          </div>
        </div>
        <div className="px-5 pb-2 pt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: C.inkSoft }}>
          {task.task_type && effectiveTaskType(task) !== "individual" && <span style={{ color: C.signal, fontWeight: 600 }}>{TASK_TYPES.find((t) => t.key === effectiveTaskType(task))?.label}</span>}
          {task.recurring_template_id && <span>🔁 {recurringTpl?.frequency_type === "monthly" ? "Mensual" : "Semanal"}</span>}
          {isFinalized && <span className="flex items-center gap-1"><Lock size={10} /> Finalizado — solo lectura</span>}
          {viewerIsGerente && !isFinalized && <span className="flex items-center gap-1"><Eye size={10} /> Modo lectura</span>}
        </div>
        {editingCategory && (
          <div className="px-5 pb-3">
            <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="p-3 flex flex-col gap-1.5 max-w-xs">
              <select value={categoryDraft} onChange={(e) => { setCategoryDraft(e.target.value); setNewCategoryDraft(""); }} style={{ background: C.paper, borderRadius: R.sm }} className="px-2.5 py-1.5 text-xs outline-none">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={newCategoryDraft} onChange={(e) => setNewCategoryDraft(e.target.value)} placeholder="...o escribe una nueva" style={{ background: C.paper, borderRadius: R.sm }} className="px-2.5 py-1.5 text-xs outline-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingCategory(false)} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                <button onClick={saveCategory} style={{ background: C.ink, color: C.paper, borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Guardar</button>
              </div>
            </div>
          </div>
        )}
        <div className="px-5 pb-5 flex flex-col gap-5">
          <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 27, fontWeight: 500 }} className="leading-tight -mt-2">
            {task.title}
            {task.changes_round > 0 && (
              <span className="text-[11px] font-semibold uppercase tracking-wider ml-2" style={{ color: C.signal, fontFamily: "inherit" }}>Cambios Ronda {task.changes_round}</span>
            )}
          </h2>
          {(() => {
            const legend = dueLegend(task.deadline, task.status);
            const urg = URGENCIES.find((u) => u.label === task.urgency) || URGENCIES[0];
            const legendPill = legend && (
              legend.color === C.amber ? { background: C.amberSoft, color: C.amberInk } :
              legend.color === C.urgent ? { background: C.urgentSoft, color: C.urgentInk } :
              null
            );
            if (!legend && !canEditUrgency) return null;
            return (
              <div className="flex items-center gap-2.5">
                {legend && (legendPill ? (
                  <span style={{ ...legendPill, borderRadius: R.pill, fontWeight: 700 }} className="text-[11.5px] px-3 py-1.5">{legend.text}</span>
                ) : (
                  <span className="text-[12.5px]" style={{ color: C.inkSoft }}>{legend.text}</span>
                ))}
                {canEditUrgency && !isFinalized && !viewerIsGerente ? (
                  <select value={task.urgency} onChange={(e) => changeUrgency(e.target.value)} style={{ background: C.paper, borderRadius: R.pill, color: urg.color }} className="px-3 py-1.5 text-[12.5px] font-semibold outline-none">
                    {URGENCIES.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                  </select>
                ) : (
                  <UrgencyFlag urgency={task.urgency} />
                )}
              </div>
            );
          })()}
          {editingDescription ? (
            <div className="flex flex-col gap-1.5">
              <textarea value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} rows={3} style={{ borderColor: C.hairline, background: C.panel, color: C.ink }} className="w-full px-3.5 py-2.5 text-sm outline-none resize-y" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setDescriptionDraft(task.description || ""); setEditingDescription(false); }} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                <button onClick={saveDescription} style={{ background: C.spine, color: C.paper, borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Guardar</button>
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
          {isOverdueUrgent(task) && canEditUrgency && !isFinalized && !viewerIsGerente && (
            <div className="text-[11px] font-semibold -mt-3" style={{ color: C.urgent }}>Venció — aún sin entregar</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {isPersonalSolo ? (
              <InfoCell label="TIPO" value="Pendiente personal (solo tuyo)" full />
            ) : (
              <>
                <InfoCell label="SOLICITA" value={`${task.requested_by}${coRequesterNames.length ? ` + ${coRequesterNames.join(", ")}` : ""}`} />
                {isColaborativo ? (
                  <InfoCell label="EQUIPO" value={teamProfiles.map((p) => p.name).join(", ") || "—"} />
                ) : (
                  <InfoCell
                    label={<span className="flex items-center gap-1">ASIGNADO A
                      {task.task_type === "individual" && isRequester && !isFinalized && !viewerIsGerente && (
                        <button type="button" onClick={() => setShowConvertModal(true)} title="Convertir a Colaborativo" style={{ background: C.signalSoft, color: C.signal }} className="rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none flex-shrink-0"><Plus size={9} /></button>
                      )}
                    </span>}
                    value={task.assigned_to_name}
                  />
                )}
              </>
            )}
            <InfoCell label="SOLICITUD" value={fmtDate(task.request_date)} />
            <InfoCell
              label={showSubtasks ? "DEADLINE GENERAL" : "DEADLINE"}
              value={canEditDeadline ? (
                <input type="date" value={task.deadline || ""} min={showSubtasks ? minGeneralDeadline : undefined} onChange={(e) => changeDeadline(e.target.value)} style={{ background: "transparent" }} className="w-full outline-none -ml-0.5" />
              ) : fmtDate(task.deadline)}
            />
          </div>
          {sameDay && <div className="text-[11px] font-bold -mt-3 text-right" style={{ color: C.urgent }}>De hoy para hoy 💀</div>}

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
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-2 flex items-center gap-2 flex-wrap" style={{ color: C.inkSoft }}>
                Estado
                {isOverdueUrgent(task) && <span className="normal-case tracking-normal" style={{ color: C.urgent }}>Marca entregado y avisa para que te finalicen</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {ASSIGNEE_STATUSES.map((s) => { const Icon = STATUS_ICON[s]; const active = task.status === s;
                  return <button key={s} disabled={isFinalized || viewerIsGerente}
                    onClick={() => setStatus(s)}
                    style={{ height: 38, background: active ? C.ink : C.panel, boxShadow: active ? "none" : SH.soft, color: active ? C.paper : C.inkSoft, fontWeight: active ? 600 : 500, borderRadius: R.pill }}
                    className="px-3.5 text-[13px] flex items-center gap-1.5 disabled:opacity-50"><Icon size={15} /> {s}</button>; })}
                {isFinalized && <span style={{ height: 38, background: C.signalSoft, color: C.signal, borderRadius: R.pill, fontWeight: 600 }} className="px-3.5 text-[13px] flex items-center gap-1.5"><CheckCheck size={15} /> Finalizado</span>}
              </div>
            </div>
          )}

          {(isColaborativo || (effType === "individual" && hasSubtasks)) && (
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-2" style={{ color: C.inkSoft }}>Estado general</div>
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
            <div className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Subtareas ({subtasks.filter((s) => s.status === "Entregado").length}/{subtasks.length})</span>
                  {canAddSubtask && (
                    <button onClick={() => setShowAddSubtask((v) => !v)} title="Agregar subtarea" style={{ background: C.signalSoft, color: C.signal }} className="rounded-full w-5 h-5 flex items-center justify-center leading-none"><Plus size={11} /></button>
                  )}
                </div>
              </div>
              {showAddSubtask && (
                <div style={{ background: C.panel, borderRadius: R.lg, boxShadow: SH.card }} className="p-3.5 flex flex-col gap-1.5 mb-2">
                  <input value={newSubtask.title} onChange={(e) => setNewSubtask((s) => ({ ...s, title: e.target.value }))} placeholder="Título" style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none" />
                  <textarea value={newSubtask.description} onChange={(e) => setNewSubtask((s) => ({ ...s, description: e.target.value }))} placeholder="Descripción (opcional)" rows={2} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none resize-y" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {isColaborativo ? (
                      <select value={newSubtask.assignedToId} onChange={(e) => setNewSubtask((s) => ({ ...s, assignedToId: e.target.value }))} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none">
                        <option value="">Asignar a...</option>
                        {teamProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ background: C.paper, borderRadius: R.md, color: C.inkSoft }} className="px-3 py-2 text-xs flex items-center truncate">{task.assigned_to_name}</div>
                    )}
                    <input type="date" value={newSubtask.deadline} min={todayISO()} max={task.deadline || undefined} onChange={(e) => setNewSubtask((s) => ({ ...s, deadline: e.target.value }))} style={{ background: C.paper, borderRadius: R.md }} className="px-3 py-2 text-xs outline-none" />
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
                    <div key={s.id} style={{ background: mine ? C.signalSoft : C.panel, borderRadius: R.md, boxShadow: mine ? "none" : SH.soft }} className="p-3 cursor-pointer" onClick={() => setExpandedSubtaskId((id) => (id === s.id ? null : s.id))}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`} style={{ color: C.ink }}>{expanded ? renderWithLinks(s.title, C.signal) : s.title}</div>
                          <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{s.assigned_to_name} · {fmtDate(s.deadline || task.deadline)}</div>
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
                          <div className="mt-2 pt-2.5 flex flex-col gap-1.5" style={{ borderColor: C.hairline }} onClick={(e) => e.stopPropagation()}>
                            <textarea value={subtaskDescriptionDraft} onChange={(e) => setSubtaskDescriptionDraft(e.target.value)} rows={2} style={{ borderColor: C.hairline, background: C.paper, color: C.ink }} className="px-3 py-2 text-xs outline-none resize-y" />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingSubtaskId(null)} className="text-xs" style={{ color: C.inkSoft }}>Cancelar</button>
                              <button onClick={() => saveSubtaskDescription(s)} style={{ background: C.spine, color: C.paper, borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Guardar</button>
                            </div>
                          </div>
                        ) : (s.description || (isAnyRequester && !isFinalized && !viewerIsGerente)) && (
                          <div className="mt-2 pt-2.5 flex items-start gap-1.5" style={{ borderColor: C.hairline }}>
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
                      {expanded && (
                        <div className="mt-2 pt-2.5 flex items-center gap-2" style={{ borderColor: C.hairline }} onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>Deadline de la subtarea</span>
                          <input
                            type="date"
                            value={s.deadline || ""}
                            min={todayISO()}
                            max={task.deadline || undefined}
                            disabled={isFinalized || viewerIsGerente}
                            onChange={(e) => onUpdateSubtaskDeadline(s, e.target.value)}
                            style={{ background: C.paper, color: C.ink, borderRadius: R.sm }}
                            className="text-xs outline-none px-2 py-1 disabled:opacity-50"
                          />
                        </div>
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
                  <button onClick={() => onFinalize(task)} style={{ background: C.signal, color: "#fff", borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Sí, finalizar</button>
                </div>
              </div>
            )
          )}
          {!isAdmin && !isFinalized && !allSubtasksDelivered && ((isColaborativo && isAnyRequester) || (effType === "individual" && hasSubtasks && isRequester)) && (
            <p className="text-[11px]" style={{ color: C.inkSoft }}>Se podrá finalizar cuando todas las subtareas queden en "Entregado".</p>
          )}

          {isFinalized && isAnyRequester && !viewerIsGerente && (
            !confirmAssignChanges ? (
              <button onClick={() => setConfirmAssignChanges(true)} style={{ background: C.spine, color: C.paper }} className="px-3 py-2 text-sm flex items-center justify-center gap-2"><ArrowRightLeft size={14} /> Asignar cambios</button>
            ) : (
              <div style={{ background: C.paper, borderRadius: R.md }} className="border px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: C.ink }}>Crearás un nuevo pendiente para solicitar estos cambios.</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setConfirmAssignChanges(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                  <button onClick={() => { setConfirmAssignChanges(false); onAssignChanges(task); }} style={{ background: C.spine, color: C.paper, borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Aceptar</button>
                </div>
              </div>
            )
          )}

          {!isColaborativo && isPersonalSolo && !viewerIsGerente && (
            <div className="pt-5">
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1" style={{ color: C.inkSoft }}>Asignar Responsables</div>
              <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Esas personas se vuelven las solicitantes y tú te quedas como asignado.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {assignableProfiles.filter((p) => p.id !== profile.id).map((p) => (
                  <button key={p.id} type="button" disabled={isFinalized} onClick={() => toggleResponsibleId(p.id)}
                    style={{ background: responsibleIds.includes(p.id) ? C.ink : C.panel, boxShadow: responsibleIds.includes(p.id) ? "none" : SH.soft, color: responsibleIds.includes(p.id) ? C.paper : C.inkMedium, fontWeight: responsibleIds.includes(p.id) ? 600 : 500 }}
                    className="rounded-full px-3 py-1.5 text-xs disabled:opacity-50">{p.name}</button>
                ))}
              </div>
              <button disabled={isFinalized || responsibleIds.length === 0} onClick={assignResponsible}
                style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.md, height: 48 }}
                className="px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"><ArrowRightLeft size={16} /> Asignar Responsables</button>
            </div>
          )}

          <div className="pt-5 grid grid-cols-2 gap-4">
            {!isColaborativo && !viewerIsGerente ? (
              <div>
                <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1" style={{ color: C.inkSoft }}>{isPersonalSolo ? "Asignar a" : "Delegar"}</div>
                <div className="flex flex-col gap-2">
                  <select disabled={isFinalized} value={delegateId} onChange={(e) => setDelegateId(e.target.value)}
                    style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft, height: 48 }}
                    className="w-full px-3.5 text-sm outline-none disabled:opacity-50">
                    <option value="">Elegir persona...</option>
                    {(isPersonalSolo ? assignableProfiles.filter((p) => p.id !== profile.id) : assignableProfiles).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button disabled={isFinalized} onClick={delegate}
                    style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.md, height: 48 }}
                    className="px-3.5 text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"><ArrowRightLeft size={15} /> {isPersonalSolo ? "Asignar a" : "Delegar"}</button>
                </div>
              </div>
            ) : <div />}
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1" style={{ color: C.inkSoft }}>Recordatorios</div>
              <button
                type="button"
                disabled={iAlreadyAskedToRemind || isFinalized}
                onClick={toggleRemindMe}
                style={{ height: 48, ...(iAlreadyAskedToRemind ? { color: C.inkSoft, background: C.subtle } : { color: C.signal, background: C.signalSoft }) }}
                className="w-full px-3 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 text-center disabled:cursor-default"
              >
                {iAlreadyAskedToRemind ? <><CheckCircle2 size={13} /> Te avisamos</> : <><Bell size={13} /> Avisarme del deadline</>}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm" style={{ color: C.ink }}>
              {!isColaborativo && isPersonalSolo && !viewerIsGerente && (
                <div>
                  <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1" style={{ color: C.inkSoft }}>Asignar Responsables</div>
                  <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Esas personas se vuelven las solicitantes y tú te quedas como asignado.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {assignableProfiles.filter((p) => p.id !== profile.id).map((p) => (
                      <button key={p.id} type="button" disabled={isFinalized} onClick={() => toggleResponsibleId(p.id)}
                        style={{ background: responsibleIds.includes(p.id) ? C.ink : C.panel, boxShadow: responsibleIds.includes(p.id) ? "none" : SH.soft, color: responsibleIds.includes(p.id) ? C.paper : C.inkMedium, fontWeight: responsibleIds.includes(p.id) ? 600 : 500 }}
                        className="rounded-full px-3 py-1.5 text-xs disabled:opacity-50">{p.name}</button>
                    ))}
                  </div>
                  <button disabled={isFinalized || responsibleIds.length === 0} onClick={assignResponsible}
                    style={{ background: C.subtle, color: C.inkMedium, borderRadius: R.md, height: 48 }}
                    className="px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"><ArrowRightLeft size={16} /> Asignar Responsables</button>
                </div>
              )}
              {viewerIsGerente && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(task.followers || []).includes(profile.id)} onChange={toggleFollow} />
                  Dar seguimiento <span className="text-[11px]" style={{ color: C.inkSoft }}>(te llegan todas las notificaciones de cambios de este pendiente)</span>
                </label>
              )}
              {!isPersonalSolo && isColaborativo && canRemind && (
                <div>
                  <label className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Recordatorio para</label>
                  <select value={reminderTargetId} onChange={(e) => setReminderTargetId(e.target.value)} style={{ background: C.paper, borderRadius: R.md }} className="w-full px-3 py-2 text-xs outline-none mt-1.5">
                    <option value="">Elegir miembro del equipo...</option>
                    {teamProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {!isPersonalSolo && !isColaborativo && isAnyRequester && !viewerIsGerente && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: C.inkSoft }}>Resaltar para {task.assigned_to_name} ({task.remind_assignee_count || 0}/3 hoy máx. 1)</span>
                  <button disabled={isFinalized || (task.remind_assignee_count || 0) >= 3 || task.remind_assignee_last_date === todayISO()} onClick={bumpRemindAssignee} style={{ background: C.subtle, color: C.inkMedium }} className="px-3 py-1.5 text-xs font-semibold rounded-full disabled:opacity-40">Resaltar</button>
                </div>
              )}
              {!isPersonalSolo && isColaborativo && isAnyRequester && !viewerIsGerente && (
                <div className="flex items-center justify-end">
                  <button disabled={isFinalized || !reminderRecipient} onClick={bumpRemindAssignee} style={{ background: C.subtle, color: C.inkMedium }} className="px-3 py-1.5 text-xs font-semibold rounded-full disabled:opacity-40">Resaltar</button>
                </div>
              )}
            </div>
            {!isPersonalSolo && canRemind && (
              <div className="flex flex-col gap-2">
                <button onClick={sendReminderEmail} disabled={isColaborativo && !reminderRecipient} style={{ background: C.panel, color: C.inkMedium, borderRadius: R.md, height: 48, boxShadow: SH.soft }} className="text-sm flex items-center gap-2 w-full justify-center disabled:opacity-40"><Mail size={16} /> Enviar recordatorio por correo</button>
                <button onClick={sendReminderWhatsapp} disabled={!reminderRecipient?.phone} style={{ background: reminderRecipient?.phone ? C.signalSoft : C.subtle, color: reminderRecipient?.phone ? C.signal : C.gray, borderRadius: R.md, height: 48 }} className="text-sm font-semibold flex items-center gap-2 w-full justify-center disabled:cursor-not-allowed"><Send size={16} /> {reminderRecipient?.phone ? "Recordar por WhatsApp" : "Sin celular registrado"}</button>
              </div>
            )}
            {!isPersonalSolo && canRemind && <p className="text-[11px] mt-1.5" style={{ color: C.inkSoft }}>Correo abre Outlook Web ya redactado (solo dale enviar); WhatsApp abre con el mensaje listo. Ninguno sale automático.</p>}

          {!isPersonalSolo && (
            <div className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11.5px] font-bold tracking-[0.09em]" style={{ color: C.inkSoft }}>Comentarios</div>
                {extractCommentLinks(comments).length > 0 && (
                  <button onClick={() => setShowAttachments((v) => !v)} className="text-xs flex items-center gap-1" style={{ color: C.signal }}>
                    <Paperclip size={12} /> Archivos adjuntos ({extractCommentLinks(comments).length})
                  </button>
                )}
              </div>
              {showAttachments && (
                <div style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="p-3 mb-3 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {extractCommentLinks(comments).map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs underline break-all" style={{ color: C.signal }}>{l.url}</a>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2 mb-3 max-h-52 overflow-y-auto">
                {comments.length === 0 && <div className="text-[13.5px]" style={{ color: C.inkFaint }}>Sin comentarios todavía.</div>}
                {comments.map((c) => (
                  <div key={c.id} style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="px-3.5 py-2.5">
                    <div className="flex items-center justify-between mb-0.5"><span className="text-xs font-medium" style={{ color: C.ink }}>{c.author_name}</span>
                      <span className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{new Date(c.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                    <div className="text-sm break-words whitespace-pre-wrap" style={{ color: C.ink }}>{renderWithLinks(c.text, C.signal)}</div>
                  </div>
                ))}
              </div>
              {!isFinalized && (
                <div className="flex gap-2.5 items-end">
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Agregar link, avance o lo que falta..." rows={1}
                    style={{ background: C.panel, borderRadius: R.pill, boxShadow: SH.soft }} className="flex-1 px-4 py-3 text-sm outline-none resize-none" />
                  <button onClick={addComment}
                    style={{ width: 44, height: 44, borderRadius: R.pill, background: C.ink, color: C.paper, boxShadow: SH.float }}
                    className="flex items-center justify-center flex-shrink-0"><Send size={17} /></button>
                </div>
              )}
            </div>
          )}

          <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="pt-4 flex items-center justify-between gap-2">
            <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.inkMedium }}>
              <History size={16} /> Historial <ChevronDown size={14} style={{ color: C.gray, transform: showHistory ? "rotate(180deg)" : "none" }} />
            </button>
            <button onClick={downloadHistory} disabled={!isFinalized} title={isFinalized ? "" : "Se habilita cuando el solicitante finaliza el pendiente"} style={{ color: isFinalized ? C.inkMedium : C.inkFaint }} className="flex items-center gap-1.5 text-sm disabled:cursor-not-allowed"><Download size={16} /> Descargar</button>
          </div>
          {showHistory && (
            <div className="flex flex-col gap-1.5 border-l-2 pl-3 -mt-3" style={{ borderColor: C.hairline }}>
              {history.map((h) => (
                <div key={h.id} className="text-xs">
                  <div style={{ color: C.ink }}>{h.text}</div>
                  <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{new Date(h.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}

          {confirmDelete && (task.recurring_template_id ? (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex flex-col gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>Este pendiente es de frecuencia. No se puede deshacer.</span>
              <div className="flex gap-2 flex-wrap items-center">
                <button onClick={() => setConfirmDelete(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={() => onDelete(task.id)} style={{ background: C.urgentSoft, color: C.urgentInk, borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Borrar</button>
                <button onClick={() => onDeleteRecurring(task.id, task.recurring_template_id)} style={{ background: C.urgent, color: "#fff", borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Borrar pendientes programados</button>
              </div>
              <span className="text-[10px]" style={{ color: C.inkSoft }}>"Borrar" solo elimina este — la próxima ocurrencia se sigue generando normal. "Borrar pendientes programados" detiene la recurrencia por completo.</span>
            </div>
          ) : (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>¿Eliminar? {isFinalized ? "Su registro de finalizado seguirá contando en el perfil de quien lo hizo. " : ""}No se puede deshacer.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmDelete(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={() => onDelete(task.id)} style={{ background: C.urgent, color: "#fff", borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Sí, eliminar</button>
              </div>
            </div>
          ))}
          {confirmLeave && (
            <div style={{ borderColor: C.urgent, background: C.urgentSoft }} className="border px-3 py-2.5 flex items-center justify-between gap-2 mt-1">
              <span className="text-xs" style={{ color: C.urgent }}>Dejarás de ser responsable de este pendiente.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmLeave(false)} style={{ color: C.inkSoft }} className="text-xs">Cancelar</button>
                <button onClick={leaveTask} style={{ background: C.urgent, color: "#fff", borderRadius: R.pill }} className="text-xs px-3.5 py-1.5 font-semibold">Sí, abandonar</button>
              </div>
            </div>
          )}
          {((!viewerIsGerente && !confirmDelete) || (canLeaveAsRequester && !confirmLeave)) && (
            <div className="flex items-center gap-4 mt-1">
              {!viewerIsGerente && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} className="text-xs flex items-center gap-1.5 self-start" style={{ color: C.urgent }}><Trash2 size={13} /> Eliminar pendiente</button>
              )}
              {canLeaveAsRequester && !confirmLeave && (
                <button onClick={() => setConfirmLeave(true)} className="text-xs flex items-center gap-1.5 self-start" style={{ color: C.urgent }}><LogOut size={13} /> Abandonar</button>
              )}
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
function SearchModal({ onClose, tasks, profiles, resources, onOpenTask, onOpenResource }) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? tasks.filter((t) => matchesSearchQuery(t, query, profiles)) : [];
  // CHANGES.md #2h: además de pendientes, busca recursos de Biblioteca.
  const resourceResults = query.trim() ? (resources || []).filter((r) => matchesResourceQuery(r, query)) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" style={{ background: "rgba(27,30,36,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-md mt-14 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: C.paper, boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-4 py-3.5 flex items-center gap-2.5 sticky top-0 z-10">
          <Search size={16} style={{ color: C.inkSoft, flexShrink: 0 }} />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca palabras clave..." className="text-sm outline-none bg-transparent flex-1" />
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center flex-shrink-0"><X size={14} /></button>
        </div>
        <div className="p-2.5 flex flex-col gap-1.5">
          {query.trim() && results.length === 0 && resourceResults.length === 0 && <div className="text-xs px-2.5 py-4" style={{ color: C.inkSoft }}>Sin resultados para "{query}".</div>}
          {results.map((t) => (
            <button key={t.id} onClick={() => onOpenTask(t)} style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="w-full text-left px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="text-sm font-medium truncate" style={{ color: C.ink }}>{t.title}</span>
              <span className="text-[11px]" style={{ color: C.inkSoft }}>{t.status} · {t.category} · solicita {t.requested_by} → {t.task_type === "colaborativo" ? "equipo" : t.assigned_to_name}</span>
            </button>
          ))}
          {resourceResults.length > 0 && (
            <div className="text-[11px] font-bold tracking-[0.09em] px-2 pt-2 pb-0.5" style={{ color: C.inkSoft }}>BIBLIOTECA</div>
          )}
          {resourceResults.map((r) => (
            <button key={r.id} onClick={() => onOpenResource(r)} style={{ background: C.panel, borderRadius: R.md, boxShadow: SH.soft }} className="w-full text-left px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: C.ink }}><BookOpen size={12} style={{ color: C.signal, flexShrink: 0 }} /> {r.title}</span>
              <span className="text-[11px]" style={{ color: C.inkSoft }}>{r.is_general ? "Recurso general" : "Mis recursos"}{(r.tags || []).length > 0 ? ` · ${r.tags.join(", ")}` : ""}</span>
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
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4" style={{ background: "rgba(27,30,36,0.35)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderRadius: R.xxl, boxShadow: SH.card }} className="w-full max-w-sm mt-14 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: C.paper, boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-4 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.ink }}><Bell size={15} /> Notificaciones</div>
          <div className="flex items-center gap-2">
            {pushSupported && !pushEnabled && (
              <button onClick={onEnablePush} style={{ background: C.signalSoft, color: C.signal, borderRadius: R.pill }} className="px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1"><BellRing size={11} /> Activar</button>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center flex-shrink-0"><X size={14} /></button>
          </div>
        </div>
        <div className="p-2.5 flex flex-col gap-1.5">
          {notifications.length === 0 && <div className="text-xs px-2.5 py-4" style={{ color: C.inkSoft }}>Sin notificaciones todavía.</div>}
          {notifications.map((n) => (
            <div key={n.id} role={(n.task_id || n.target) ? "button" : undefined} onClick={() => { if (n.task_id) onOpenTask(n.task_id); else if (n.target) onOpenFilter(n.target); }}
              style={{ background: n.read ? C.panel : C.signalSoft, borderRadius: R.md, boxShadow: n.read ? SH.soft : "none", cursor: (n.task_id || n.target) ? "pointer" : "default" }}
              className="w-full text-left px-3.5 py-3 flex flex-col gap-0.5">
              {n.title && <span className="text-sm font-medium break-words" style={{ color: C.ink }}>{n.title}</span>}
              <span className="text-sm break-words" style={{ color: n.title ? C.inkSoft : C.ink }}>{renderWithLinks(n.message, C.signal)}</span>
              {n.image_url && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFullMediaUrl(n.image_url); }}
                  className="text-xs font-semibold self-start"
                  style={{ color: C.signal }}
                >
                  Ver más
                </button>
              )}
              <span className="text-[11px]" style={{ color: C.inkSoft }}>{new Date(n.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
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

