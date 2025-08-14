// src/components/POS.jsx — Sistema de Punto de Venta
// ✅ Diseño moderno y responsive (móvil primero)
// ✅ Domicilio con mapa (marker arrastrable + geolocalización)
// ✅ Mostrador con efectivo recibido y cálculo de cambio
// ✅ Reporte de caja por sesión (KPIs + tabla) y PDF
// ✅ Generación de pedidos vía createOrderApi
// Requisitos: tailwind, react-leaflet, leaflet, jspdf, jspdf-autotable

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createOrderApi } from "../lib/api-firebase";

const DEFAULT_PRICES = {
  premium: { mostrador: { "1": 5, "4": 15, "10": 20, "20": 30 }, domicilio: { "10": 24, "20": 35 } },
  alcalina: { mostrador: { "1": 20, "4": 28, "10": 38, "20": 55 }, domicilio: { "10": 39, "20": 60 } },
};

const currency = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);

const shadowUrl =
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png";
const blueIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function POS() {
  const [prices] = useState(DEFAULT_PRICES);
  const [agua, setAgua] = useState("premium");
  const [ventaTipo, setVentaTipo] = useState("domicilio"); // mostrador | domicilio
  const [cart, setCart] = useState([]);
  const [cliente, setCliente] = useState({ nombre: "", direccion: "", telefono: "", notas: "" });
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [recibido, setRecibido] = useState(0); // solo mostrador

  // Registro de ventas de la sesión (se llena al crearPedido OK)
  const [ventas, setVentas] = useState([]);

  const total = cart.reduce((s, it) => s + it.precioUnit * it.qty, 0);
  const cambio = Math.max(Number(recibido || 0) - Number(total || 0), 0);
  const quedaEnCaja = Math.min(Number(recibido || 0), Number(total || 0));

  const productos = useMemo(() => {
    const tabla = prices[agua][ventaTipo] || {};
    return Object.entries(tabla).map(([litros, precio]) => ({ litros, precio }));
  }, [agua, ventaTipo, prices]);

  const addItem = (litros, precioUnit) => {
    setCart((prev) => {
      const key = `${agua}-${ventaTipo}-${litros}`;
      const i = prev.findIndex((x) => x.key === key);
      if (i >= 0) {
        const c = [...prev];
        c[i] = { ...c[i], qty: c[i].qty + 1 };
        return c;
        };
      return [...prev, { key, agua, ventaTipo, litros, precioUnit, qty: 1 }];
    });
  };

  const inc = (key, delta) => {
    setCart((prev) =>
      prev
        .map((it) => (it.key === key ? { ...it, qty: Math.max(0, it.qty + delta) } : it))
        .filter((it) => it.qty > 0)
    );
  };

  const clearCart = () => setCart([]);

  const pedirUbicacion = () => {
    if (!navigator.geolocation) return alert("Geolocalización no disponible.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert("No fue posible obtener ubicación.")
    );
  };

  const generarPedido = async () => {
    if (!cart.length) return alert("Agrega productos.");
    if (ventaTipo === "domicilio" && !cliente.direccion.trim()) return alert("Captura la dirección.");

    try {
      const payload = {
        type: ventaTipo, // para distinguir en reportes
        customer: { name: cliente.nombre, phone: cliente.telefono, address: cliente.direccion },
        notes: cliente.notas,
        lat: coords.lat,
        lng: coords.lng,
        total,
        cash_received: ventaTipo === "mostrador" ? Number(recibido || 0) : 0,
        cash_change: ventaTipo === "mostrador" ? cambio : 0,
        items: cart.map((it) => ({
          agua: it.agua,
          liters: Number(it.litros),
          unit_price: Number(it.precioUnit),
          qty: it.qty,
        })),
      };

      const order = await createOrderApi(payload);

      // Guardar en ventas de sesión
      setVentas((prev) => [
        ...prev,
        {
          id: order?.id || crypto.randomUUID(),
          folio: order?.folio || "",
          type: ventaTipo,
          ts: new Date(),
          total,
          recibido: payload.cash_received,
          cambio: payload.cash_change,
        },
      ]);

      alert("Pedido creado: " + (order?.folio || ""));
      clearCart();
      setCliente({ nombre: "", direccion: "", telefono: "", notas: "" });
      setCoords({ lat: null, lng: null });
      setRecibido(0);
    } catch (e) {
      alert("Error: " + (e?.message || e));
    }
  };

  // KPIs de caja por sesión
  const { ventasTotales, efectivoRecibido, cambioEntregado, netoCaja, totalMostrador, totalDomicilio } = useMemo(() => {
    let ventasTotales = 0,
      efectivoRecibido = 0,
      cambioEntregado = 0,
      totalMostrador = 0,
      totalDomicilio = 0;

    for (const v of ventas) {
      ventasTotales += Number(v.total || 0);
      efectivoRecibido += Number(v.recibido || 0);
      cambioEntregado += Number(v.cambio || 0);
      if (v.type === "mostrador") totalMostrador += Number(v.total || 0);
      if (v.type === "domicilio") totalDomicilio += Number(v.total || 0);
    }

    const netoCaja = Math.max(efectivoRecibido - cambioEntregado, 0);
    return { ventasTotales, efectivoRecibido, cambioEntregado, netoCaja, totalMostrador, totalDomicilio };
  }, [ventas]);

  // PDF de ventas de la sesión
  const exportVentasPDF = () => {
    try {
      const doc = new jsPDF({ unit: "pt" });
      const fecha = new Date();
      doc.setFontSize(14);
      doc.text("Reporte de ventas (sesión)", 40, 40);
      doc.setFontSize(10);
      doc.text(
        `Fecha: ${fecha.toLocaleDateString("es-MX")} ${fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
        40,
        58
      );

      const head = [["Folio", "Tipo", "Hora", "Total", "Recibido", "Cambio"]];
      const body = ventas.map((v) => [
        v.folio || "",
        v.type,
        v.ts instanceof Date
          ? v.ts.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
          : "",
        currency(v.total),
        currency(v.recibido),
        currency(v.cambio),
      ]);

      const tableOptions = {
        head,
        body,
        startY: 80,
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [17, 24, 39] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 90 },
          2: { cellWidth: 80 },
          3: { cellWidth: 70, halign: "right" },
          4: { cellWidth: 80, halign: "right" },
          5: { cellWidth: 70, halign: "right" },
        },
      };

      if (typeof doc.autoTable === "function") doc.autoTable(tableOptions);
      else autoTable(doc, tableOptions);

      const y = (doc.lastAutoTable?.finalY || 80) + 20;
      doc.setFontSize(11);
      doc.text(`Ventas totales: ${currency(ventasTotales)}`, 40, y);
      doc.text(`Mostrador: ${currency(totalMostrador)}`, 40, y + 18);
      doc.text(`Domicilio: ${currency(totalDomicilio)}`, 40, y + 36);
      doc.text(`Recibido: ${currency(efectivoRecibido)}`, 260, y);
      doc.text(`Cambio: ${currency(cambioEntregado)}`, 260, y + 18);
      doc.text(`En caja: ${currency(netoCaja)}`, 260, y + 36);

      doc.save(`reporte-ventas-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      alert("No se pudo generar el PDF: " + (e?.message || e));
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-bold">DARMAX — POS</h1>
        <div className="text-sm text-slate-600">Diseño responsive · Sesión local</div>
      </header>

      {/* Controles principales */}
      <div className="grid grid-cols-2 gap-3">
        <Toggle
          value={ventaTipo}
          onChange={(v) => {
            setVentaTipo(v);
            if (v === "mostrador") setCliente((c) => ({ ...c, direccion: "" }));
          }}
          options={[
            ["mostrador", "Mostrador"],
            ["domicilio", "Domicilio"],
          ]}
          label="Tipo de venta"
        />
        <Toggle
          value={agua}
          onChange={setAgua}
          options={[
            ["premium", "Premium (Ósmosis)"],
            ["alcalina", "Alcalina"],
          ]}
          label="Tipo de agua"
        />
      </div>

      {/* Presentaciones */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Presentaciones</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {productos.map((p) => (
            <button
              key={p.litros}
              onClick={() => addItem(p.litros, p.precio)}
              className="rounded-2xl border bg-slate-50 hover:bg-slate-100 p-4 text-center transition"
            >
              <div className="text-3xl font-bold">{p.litros}L</div>
              <div className="text-xl">{currency(p.precio)}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Carrito + Datos */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Carrito</h2>

        {cart.length === 0 ? (
          <div className="text-slate-500">Toca para agregar productos.</div>
        ) : (
          <ul className="divide-y">
            {cart.map((it) => (
              <li key={it.key} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium capitalize">{it.agua} {it.litros}L</div>
                  <div className="text-xs text-slate-500">{currency(it.precioUnit)} c/u</div>
                </div>
                <div className="flex items-center gap-2">
                  <QtyPicker qty={it.qty} onDec={() => inc(it.key, -1)} onInc={() => inc(it.key, 1)} />
                  <div className="w-20 text-right font-semibold">{currency(it.qty * it.precioUnit)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {ventaTipo === "domicilio" ? (
          <div className="grid gap-3 mt-4">
            <Input
              label="Dirección"
              value={cliente.direccion}
              onChange={(v) => setCliente({ ...cliente, direccion: v })}
              placeholder="Calle, número, colonia"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Nombre" value={cliente.nombre} onChange={(v) => setCliente({ ...cliente, nombre: v })} />
              <Input label="Teléfono" value={cliente.telefono} onChange={(v) => setCliente({ ...cliente, telefono: v })} />
            </div>
            <Input
              label="Notas"
              value={cliente.notas}
              onChange={(v) => setCliente({ ...cliente, notas: v })}
              placeholder="Ej. dejar en portón"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button className="px-3 py-2 rounded-xl bg-white border" onClick={pedirUbicacion}>
                📍 Usar mi ubicación
              </button>
              <div className="text-xs text-slate-600">
                {coords.lat && coords.lng
                  ? `(${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)})`
                  : "Sin ubicación"}
              </div>
            </div>

            <div className="h-64 w-full overflow-hidden rounded-xl border">
              <MiniMap coords={coords} setCoords={setCoords} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KPI label="Total" value={currency(total)} />
              <Input
                type="number"
                label="Recibido"
                value={recibido}
                onChange={(v) => setRecibido(Number(v))}
                placeholder="0"
              />
              <KPI label="Cambio" value={currency(cambio)} highlight />
              <KPI label="Queda en caja" value={currency(quedaEnCaja)} />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <div className="text-lg">
            <b>Total:</b> {currency(total)}
          </div>
          <div className="flex items-center gap-2">
            {!!cart.length && (
              <button className="rounded-xl bg-white border py-3 px-4" onClick={clearCart}>
                Vaciar
              </button>
            )}
            <button
              className="rounded-xl bg-emerald-600 text-white py-3 px-4 font-semibold"
              onClick={generarPedido}
            >
              Crear pedido
            </button>
          </div>
        </div>
      </section>

      {/* Reporte de caja (sesión) */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold">Caja — Reporte de la sesión</h2>
          <button
            onClick={exportVentasPDF}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm"
          >
            Exportar PDF
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
          <KPI label="Ventas totales" value={currency(ventasTotales)} />
          <KPI label="Mostrador" value={currency(totalMostrador)} />
          <KPI label="Domicilio" value={currency(totalDomicilio)} />
          <KPI label="Recibido" value={currency(efectivoRecibido)} />
          <KPI label="Cambio" value={currency(cambioEntregado)} />
          <KPI label="En caja" value={currency(netoCaja)} highlight />
        </div>

        {ventas.length ? (
          <div className="overflow-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Folio</th>
                  <th>Tipo</th>
                  <th>Hora</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Recibido</th>
                  <th className="text-right">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="py-2 px-2">{v.folio}</td>
                    <td className="capitalize">{v.type}</td>
                    <td>
                      {v.ts instanceof Date
                        ? v.ts.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                        : ""}
                    </td>
                    <td className="text-right">{currency(v.total)}</td>
                    <td className="text-right">{currency(v.recibido)}</td>
                    <td className="text-right">{currency(v.cambio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-slate-500">Aún no hay ventas en esta sesión.</div>
        )}
      </section>
    </div>
  );
}

function Toggle({ label, value, onChange, options }) {
  return (
    <div>
      {label && <div className="text-sm text-slate-600 mb-1">{label}</div>}
      <div className="grid grid-cols-2 gap-2">
        {options.map(([val, text]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`rounded-2xl py-3 px-3 shadow-sm border ${
              value === val ? "bg-emerald-600 text-white border-emerald-600" : "bg-white"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block">
      <div className="text-sm text-slate-600 mb-1">{label}</div>
      <input
        className="w-full border rounded-xl p-3 bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function KPI({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl border p-3 ${highlight ? "bg-emerald-50 border-emerald-200" : "bg-white"}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function QtyPicker({ qty, onDec, onInc }) {
  return (
    <div className="inline-flex items-center rounded-xl border overflow-hidden">
      <button onClick={onDec} className="px-3 py-1.5 hover:bg-slate-100">−</button>
      <div className="px-3 py-1.5 min-w-8 text-center">{qty}</div>
      <button onClick={onInc} className="px-3 py-1.5 hover:bg-slate-100">＋</button>
    </div>
  );
}

/**
 * MiniMap — mapa compacto con marker arrastrable.
 * - Un tap/click actualiza las coords
 * - El marker se puede arrastrar
 */
function MiniMap({ coords, setCoords }) {
  const center = coords.lat && coords.lng ? [coords.lat, coords.lng] : [19.4326, -99.1332]; // CDMX
  const [markerPos, setMarkerPos] = useState(center);
  const markerRef = useRef(null);

  useEffect(() => {
    if (coords.lat && coords.lng) setMarkerPos([coords.lat, coords.lng]);
  }, [coords]);

  const MapClick = () => {
    useMapEvents({
      click(e) {
        setMarkerPos([e.latlng.lat, e.latlng.lng]);
        setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    return null;
  };

  return (
    <MapContainer center={center} zoom={14} className="h-64 w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClick />
      <Marker
        draggable
        position={markerPos}
        icon={blueIcon}
        ref={markerRef}
        eventHandlers={{
          dragend() {
            const m = markerRef.current;
            if (!m) return;
            const ll = m.getLatLng();
            setMarkerPos([ll.lat, ll.lng]);
            setCoords({ lat: ll.lat, lng: ll.lng });
          },
        }}
      />
    </MapContainer>
  );
}
