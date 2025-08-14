// src/pages/DriverApp.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onOrders, patchOrder, postDriverLocation } from "../lib/api-firebase";
import { useAuth } from "../lib/auth-context";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const makeIcon = (url) =>
  L.icon({
    iconUrl: url,
    shadowUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const driverIcon = makeIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png"
);
const activeOrderIcon = makeIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png"
);
const deliveredOrderIcon = makeIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png"
);

const currency = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);

export default function DriverApp() {
  const { user } = useAuth();
  const driverId = user?.uid || "";

  const [orders, setOrders] = useState([]);
  const [tracking, setTracking] = useState(true);
  const [geoErr, setGeoErr] = useState("");
  const [driverPos, setDriverPos] = useState(null);
  const [showDelivered, setShowDelivered] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    const unsub = onOrders({ driver: driverId }, setOrders);
    return () => unsub && unsub();
  }, [driverId]);

  const setEstado = async (id, estado) => {
    await patchOrder({ id, status: estado });
  };

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
          const { latitude, longitude } = pos.coords;
          setDriverPos({ lat: latitude, lng: longitude });
          if (driverId) postDriverLocation(driverId, latitude, longitude).catch(() => {});
        },
        (err) => setGeoErr(err?.message || "No fue posible obtener ubicación.")
      );

    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [tracking, driverId]);

  const activos = useMemo(
    () => orders.filter((o) => o.status !== "entregado" && o.status !== "cancelado"),
    [orders]
  );
  const entregados = useMemo(() => orders.filter((o) => o.status === "entregado"), [orders]);
  const totalRuta = useMemo(() => activos.reduce((s, o) => s + Number(o.total || 0), 0), [activos]);

  if (!driverId) {
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-xl font-bold">Repartos</h1>
        <p className="text-slate-600">No se detectó sesión de repartidor.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Repartos</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Pedidos activos: {activos.length} &nbsp;•&nbsp; Total: <b>{currency(totalRuta)}</b>
          </span>
          <button
            className={`px-3 py-2 rounded-xl border transition ${
              tracking ? "bg-emerald-100" : "bg-white hover:bg-slate-50"
            }`}
            onClick={() => setTracking((v) => !v)}
            title="Activar/desactivar envío de ubicación"
          >
            {tracking ? "⏺ Enviando ubicación" : "▶ Iniciar ubicación"}
          </button>
        </div>
      </div>

      {geoErr && <div className="text-xs text-amber-700">📍 {geoErr}</div>}

      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-semibold">Mapa de ruta</div>
          <div className="text-xs text-slate-500">Arrastra/zoom para explorar</div>
        </div>
        <div className="h-[380px] w-full">
          <OrdersMap driverPos={driverPos} activos={activos} entregados={entregados} />
        </div>
      </div>

      <Section title="Pedidos activos">
        {!activos.length && <div className="text-slate-500">Sin pedidos activos.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activos.map((o) => (
            <OrderCard key={o.id} o={o} setEstado={setEstado} />
          ))}
        </div>
      </Section>

      <Section
        title={`Entregados (${entregados.length})`}
        right={
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" className="scale-110" checked={showDelivered} onChange={(e) => setShowDelivered(e.target.checked)} />
            Mostrar
          </label>
        }
      >
        {showDelivered ? (
          entregados.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {entregados.map((o) => (
                <OrderCard key={o.id} o={o} setEstado={setEstado} delivered />
              ))}
            </div>
          ) : (
            <div className="text-slate-500">No hay entregados.</div>
          )
        ) : (
          <div className="text-slate-500">Ocultos.</div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="font-semibold">{title}</div>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function OrderCard({ o, setEstado, delivered = false }) {
  const goMaps =
    o.lat && o.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer?.address || "")}`;

  const statusText = (o.status || "").replace("_", " ");

  return (
    <div className={`border rounded-2xl p-3 bg-white shadow-sm ${delivered ? "opacity-80" : ""}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold">{o.folio}</div>
          <div className="text-xs text-slate-500">{o.id}</div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full border capitalize bg-slate-50">{statusText}</span>
      </div>
      <div className="mt-2 text-sm space-y-1">
        <div>
          <b>Cliente:</b> {o.customer?.name || ""} — {o.customer?.phone || ""}
        </div>
        <div>
          <b>Dirección:</b> {o.customer?.address || ""}
        </div>
        {o.notes && <div className="text-slate-600">{o.notes}</div>}
        <div className="mt-1">
          <b>Total:</b> {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(o.total || 0)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <a className="px-3 py-2 rounded-xl bg-slate-100 border hover:bg-slate-200" href={goMaps} target="_blank" rel="noreferrer">
          📍 Abrir mapa
        </a>

        {!delivered && o.status !== "en_camino" && (
          <button className="px-3 py-2 rounded-xl bg-slate-100 border hover:bg-slate-200" onClick={() => setEstado(o.id, "en_camino")}>
            En camino
          </button>
        )}

        {!delivered && (
          <button className="px-3 py-2 rounded-xl bg-emerald-100 border hover:bg-emerald-200" onClick={() => setEstado(o.id, "entregado")}>
            Entregado
          </button>
        )}
      </div>
    </div>
  );
}

function OrdersMap({ driverPos, activos, entregados }) {
  const activesWithCoords = activos.filter((o) => Number(o.lat) && Number(o.lng)).map((o) => ({ id: o.id, folio: o.folio, lat: Number(o.lat), lng: Number(o.lng) }));
  const deliveredWithCoords = entregados.filter((o) => Number(o.lat) && Number(o.lng)).map((o) => ({ id: o.id, folio: o.folio, lat: Number(o.lat), lng: Number(o.lng) }));

  const initialCenter = driverPos
    ? [driverPos.lat, driverPos.lng]
    : activesWithCoords[0]
    ? [activesWithCoords[0].lat, activesWithCoords[0].lng]
    : deliveredWithCoords[0]
    ? [deliveredWithCoords[0].lat, deliveredWithCoords[0].lng]
    : [19.4326, -99.1332];

  return (
    <MapContainer center={initialCenter} zoom={13} className="h-full w-full">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {driverPos && (
        <>
          <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">Tu ubicación</div>
                <div>
                  Lat: {driverPos.lat.toFixed(5)}, Lng: {driverPos.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
          <Circle center={[driverPos.lat, driverPos.lng]} radius={40} pathOptions={{ fillOpacity: 0.1 }} />
        </>
      )}
      {activesWithCoords.map((p) => (
        <Marker key={`a-${p.id}`} position={[p.lat, p.lng]} icon={activeOrderIcon}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{p.folio}</div>
              <a className="inline-block mt-2 underline" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                Ir con Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
      {deliveredWithCoords.map((p) => (
        <Marker key={`d-${p.id}`} position={[p.lat, p.lng]} icon={deliveredOrderIcon}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{p.folio} (entregado)</div>
              <a className="inline-block mt-2 underline" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                Ver en Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
      <FitToMarkers driverPos={driverPos} points={[...activesWithCoords, ...deliveredWithCoords]} />
    </MapContainer>
  );
}

function FitToMarkers({ driverPos, points }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    if (driverPos) bounds.extend([driverPos.lat, driverPos.lng]);
    points.forEach((p) => bounds.extend([p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  }, [driverPos, points, map]);
  return null;
}
