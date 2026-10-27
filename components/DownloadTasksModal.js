"use client";
import { useState } from "react";
import { X, Download } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import { downloadTasksPdf } from "@/lib/logPdf";

const STATUS_OPTIONS = ["No iniciado", "En progreso", "Detenido", "Entregado", "Finalizado"];
const URGENCY_OPTIONS = ["Baja", "Media", "Alta", "Urgente"];
const NO_ACCOUNT = "__sin_cuenta__";

const toggle = (set, value) => {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
};

function CheckboxGroup({ label, options, selected, onToggle }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold tracking-[0.09em] mb-1.5" style={{ color: C.inkSoft }}>{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <label key={opt.value}
              style={{ background: checked ? C.ink : C.subtle, color: checked ? C.paper : C.inkMedium }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium cursor-pointer select-none">
              <input type="checkbox" checked={checked} onChange={() => onToggle(opt.value)} className="hidden" />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// CHANGES.md #27: ventana del clic derecho "Descargar Pendientes" — casillas
// usando los mismos filtros que ya existen en el dashboard (pestaña, Estado,
// Urgencia, Categoría, Cuenta, Programados), para elegir qué va en el PDF.
export default function DownloadTasksModal({
  onClose, tasks, subtasks, accounts, categoryOptions, effectiveId, viewerName,
}) {
  const [tabs, setTabs] = useState(new Set(["requests", "mine"]));
  const [statuses, setStatuses] = useState(new Set(STATUS_OPTIONS));
  const [urgencies, setUrgencies] = useState(new Set(URGENCY_OPTIONS));
  const [categories, setCategories] = useState(new Set(categoryOptions));
  const [accountIds, setAccountIds] = useState(new Set([...accounts.map((a) => a.id), NO_ACCOUNT]));
  const [includeProgramados, setIncludeProgramados] = useState(false);
  const [busy, setBusy] = useState(false);

  const isRequesterOf = (t) => t.requested_by_id === effectiveId || t.responsible_id === effectiveId || (t.co_requester_ids || []).includes(effectiveId);
  const isAssignedTo = (t) => t.assigned_to_id === effectiveId || (t.task_type === "colaborativo" && (t.team_member_ids || []).includes(effectiveId)) || subtasks.some((s) => s.task_id === t.id && s.assigned_to_id === effectiveId);
  const isProgramado = (t) => !!t.request_date && t.request_date > new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : null;

  const download = async () => {
    setBusy(true);
    const filtered = tasks.filter((t) => {
      const inTab = (tabs.has("requests") && isRequesterOf(t)) || (tabs.has("mine") && isAssignedTo(t));
      if (!inTab) return false;
      if (!includeProgramados && isProgramado(t)) return false;
      if (!statuses.has(t.status)) return false;
      if (!urgencies.has(t.urgency)) return false;
      if (!categories.has(t.category)) return false;
      if (!accountIds.has(t.account_id || NO_ACCOUNT)) return false;
      return true;
    });
    const rows = filtered.map((t) => {
      const accountName = accounts.find((a) => a.id === t.account_id)?.name;
      const metaParts = [t.category, t.urgency, t.status, t.deadline ? `vence ${fmtDate(t.deadline)}` : null, accountName].filter(Boolean);
      return { title: t.title, meta: metaParts.join(" · ") };
    });
    await downloadTasksPdf({
      name: viewerName, rows,
      subtitle: `${rows.length} filtrado(s) de ${tasks.length} total`,
      filename: `pendientes_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.5)" }} onClick={onClose}>
      <div style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card, maxHeight: "85vh" }} className="w-full max-w-md flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Download size={18} style={{ color: C.signal }} />
            <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 19 }}>Descargar Pendientes</h2>
          </div>
          <button onClick={onClose} style={{ color: C.inkSoft }}><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          <CheckboxGroup
            label="Pestaña"
            options={[{ value: "requests", label: "Solicitudes" }, { value: "mine", label: "Asignados" }]}
            selected={tabs} onToggle={(v) => setTabs((s) => toggle(s, v))}
          />
          <CheckboxGroup
            label="Estado"
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            selected={statuses} onToggle={(v) => setStatuses((s) => toggle(s, v))}
          />
          <CheckboxGroup
            label="Urgencia"
            options={URGENCY_OPTIONS.map((u) => ({ value: u, label: u }))}
            selected={urgencies} onToggle={(v) => setUrgencies((s) => toggle(s, v))}
          />
          {categoryOptions.length > 0 && (
            <CheckboxGroup
              label="Categoría"
              options={categoryOptions.map((c) => ({ value: c, label: c }))}
              selected={categories} onToggle={(v) => setCategories((s) => toggle(s, v))}
            />
          )}
          {accounts.length > 0 && (
            <CheckboxGroup
              label="Cuenta"
              options={[...accounts.map((a) => ({ value: a.id, label: a.name })), { value: NO_ACCOUNT, label: "Sin cuenta" }]}
              selected={accountIds} onToggle={(v) => setAccountIds((s) => toggle(s, v))}
            />
          )}
          <label className="flex items-center gap-2 text-sm" style={{ color: C.ink }}>
            <input type="checkbox" checked={includeProgramados} onChange={() => setIncludeProgramados((v) => !v)} />
            Incluir pendientes programados
          </label>
        </div>

        <div style={{ boxShadow: `inset 0 1px 0 ${C.hairline}` }} className="px-5 py-4 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={busy} style={{ color: C.inkMedium, background: C.subtle, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Cancelar</button>
          <button onClick={download} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.6 : 1, borderRadius: R.pill }} className="px-5 py-2.5 text-sm font-semibold">{busy ? "Generando..." : "Descargar PDF"}</button>
        </div>
      </div>
    </div>
  );
}
