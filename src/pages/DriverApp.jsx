// src/pages/DriverApp.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onOrders, patchOrder, postDriverLocation } from "../lib/api-firebase";
import { useAuth } from "../lib/auth-context";

const currency = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function DriverApp() {
  // 1) Tomamos driverId de la URL o usamos el UID del usuario logueado
  const queryDriverId = new URLSearchParams(location.search).get("driverId") || "";
  const { user } = useAuth();
  const driverId = queryDriverId || user?.uid || "";

  const [orders, setOrders] = useState([]);
  const [tracking, setTracking] = useState(true);   // control para iniciar/detener GPS
  const [geoErr, setGeoErr] = useState("");

  // 2) Suscripción en tiempo real a pedidos del driver
  useEffect(() => {
    if (!driverId) return; // si no tenemos uid todavía, esperamos
    const unsub = onOrders({ driver: driverId }, setOrders);
    return () => unsub && unsub();
  }, [driverId]);

  // 3) Acciones sobre pedidos
  const setEstado = async (id, estado) => {
    await patchOrder({ id, status: estado });
  };

  const cobrar = async (id) => {
    const recibido = Number(prompt("¿Cuánto recibiste?", "0") || 0);
    await patchOrder({ id, cash_received: recibido });
    alert("Cobro registrado.");
  };

  // 4) Envío periódico de ubicación (cada 15 s) mientras tracking = true
  useEffect(() => {
    if (!tracking) return;
    if (!navigator.geolocation) {
      setGeoErr("Geolocalización no disponible en este dispositivo/navegador.");
      return;
    }
    setGeoErr("");

    const tick = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const usedDriverId = driverId || orders[0]?.assignedDriver;
          if (usedDriverId) {
            postDriverLocation(usedDriverId, pos.coords.latitude, pos.coords.longitude).catch(() => {});
          }
        },
        (err) => setGeoErr(err?.message || "No fue posible obtener ubicación.")
      );

    // primer ping inmediato + intervalo
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [tracking, driverId, orders]);

  const totalRuta = useMemo(() => orders.reduce((s, o) => s + Number(o.total || 0), 0), [orders]);

  // 5) Mensajes guía
  if (!driverId) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-xl font-bold">Repartos</h1>
        <p className="text-slate-600">
          No se detectó <b>driverId</b> ni sesión de repartidor.
        </p>
        <p className="text-sm text-slate-600">
          Inicia sesión o abre esta página como <code>/repartidor?driverId=TU_UID</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Repartos</h1>
        <button
          className={`px-3 py-2 rounded-xl border ${tracking ? "bg-emerald-100" : "bg-white"}`}
          onClick={() => setTracking((v) => !v)}
          title="Activar/desactivar envío de ubicación"
        >
          {tracking ? "⏺ Enviando ubicación" : "▶ Iniciar ubicación"}
        </button>
      </div>

      <div className="text-sm text-slate-600">
        Pedidos: {orders.length} — Total: <b>{currency(totalRuta)}</b>
      </div>
      {geoErr && <div className="text-xs text-amber-700">📍 {geoErr}</div>}

      {!orders.length && <div className="text-slate-500">Sin pedidos por ahora.</div>}

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="border rounded-2xl p-3 bg-white">
            <div className="flex justify-between">
              <div className="font-semibold">{o.folio}</div>
              <div className="capitalize text-sm">{o.status?.replace("_", " ")}</div>
            </div>
            <div className="mt-1 text-sm">
              <div>
                <b>Cliente:</b> {o.customer?.name || ""} — {o.customer?.phone || ""}
              </div>
              <div>
                <b>Dirección:</b> {o.customer?.address || ""}
              </div>
              {o.notes && <div className="text-slate-600">{o.notes}</div>}
              <div className="mt-1">
                <b>Total:</b> {currency(o.total)}
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <a
                className="px-3 py-2 rounded-xl bg-slate-100 border"
                href={buildMapsLink(o)}
                target="_blank"
                rel="noreferrer"
              >
                📍 Abrir mapa
              </a>
              {o.status !== "en_camino" && (
                <button
                  className="px-3 py-2 rounded-xl bg-slate-100 border"
                  onClick={() => setEstado(o.id, "en_camino")}
                >
                  En camino
                </button>
              )}
              <button
                className="px-3 py-2 rounded-xl bg-emerald-100 border"
                onClick={() => setEstado(o.id, "entregado")}
              >
                Entregado
              </button>
              <button className="px-3 py-2 rounded-xl bg-amber-100 border" onClick={() => cobrar(o.id)}>
                Cobro
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildMapsLink(o) {
  if (o.lat && o.lng) return `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer?.address || "")}`;
}
