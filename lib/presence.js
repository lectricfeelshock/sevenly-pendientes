"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// CHANGES.md #28: presencia "en línea" vía un canal de Supabase Realtime
// compartido por toda la app. Cada página que llama a este hook (con el
// profile ya cargado) se "trackea" a sí misma con nombre + cuentas, y se
// entera cuando otros entran/salen.
//
// - onlineIds: ids de todos los que están conectados ahora mismo (para el
//   puntito verde en Mi equipo — no se filtra por cuenta, ahí se muestra
//   a cualquiera del equipo que ya se le muestra al usuario).
// - joinQueue / dequeueJoin: cola de avisos "fulano está en línea", ya
//   filtrada para solo incluir a quienes comparten al menos una cuenta con
//   el usuario actual (no es notificación de campanita — eso lo renderiza
//   components/OnlineBanner).
export function usePresence(profile) {
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [joinQueue, setJoinQueue] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    const myAccountIds = profile.account_ids || [];
    const channel = supabase.channel("online-presence", {
      config: { presence: { key: profile.id } },
    });

    const syncIds = () => setOnlineIds(new Set(Object.keys(channel.presenceState())));

    channel
      .on("presence", { event: "sync" }, syncIds)
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        syncIds();
        if (key === profile.id) return;
        const meta = newPresences[newPresences.length - 1] || {};
        const theirAccountIds = meta.account_ids || [];
        const sharesAccount = theirAccountIds.some((id) => myAccountIds.includes(id));
        if (!sharesAccount) return;
        setJoinQueue((q) => [...q, { id: key, name: meta.name || "Alguien", at: Date.now() }]);
      })
      .on("presence", { event: "leave" }, syncIds)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name: profile.name, account_ids: myAccountIds });
      });

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, profile?.name]);

  const dequeueJoin = () => setJoinQueue((q) => q.slice(1));

  return { onlineIds, joinQueue, dequeueJoin };
}
