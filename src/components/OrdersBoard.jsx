// src/components/OrdersBoard.jsx — versión con:
// 1) PDF que sí funciona (registramos el plugin de autotable de forma segura)
// 2) Tabs "Pendientes / Cobrados / Todos" y flujo para mover a Cobrados al cobrar
// 3) Vista responsive (tabla en desktop, tarjetas en móvil)

import React, { useEffect, useMemo, useState } from "react";
import { onOrders, onDrivers, patchOrder, setUserRole } from "../lib/api-firebase"; // 👈 import setUserRole
import { useAuth } from "../lib/auth-context";
import { db } from "../lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";

// 📄 PDF
import jsPDF from "jspdf";
// El plugin de autotable a veces no se registra con el import de solo efectos.
// Para evitar problemas en bundlers/ESM, importamos la función y ofrecemos fallback.
import autoTable from "jspdf-autotable";

// 🗺️ Leaflet
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** === Íconos de colores (públicos) === */
const shadowUrl =
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png";

const icon = (url) =>
  L.icon({
    iconUrl: url,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

// Repartidor = verde
const driverIcon = icon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png"
);
// Pedido sin asignar = rojo
const orderIcon = icon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png"
);
// Pedido asignado = dorado
const assignedOrderIcon = icon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png"
);

const currency = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function OrdersBoard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);

  // Formularios para crear driver por UID (Auth)
  const [nuevoDriverNombre, setNuevoDriverNombre] = useState("");
  const [nuevoDriverUid, setNuevoDriverUid] = useState("");

  // ⚡️ Modal Cobro
  const [openCobro, setOpenCobro] = useState(false);
  const [cobroOrder, setCobroOrder] = useState(null);
  const [recibido, setRecibido] = useState(0);
  const [observacionesCobro, setObservacionesCobro] = useState("");

  // 🧭 Tabs (pendientes / cobrados / todos)
  const [tab, setTab] = useState("pendientes");

  useEffect(() => {
    const unsubOrders = onOrders({}, setOrders);
    const unsubDrivers = onDrivers(setDrivers); // {id, name, lat?, lng?}
    return () => {
      unsubOrders && unsubOrders();
      unsubDrivers && unsubDrivers();
    };
  }, []);

  const setEstado = async (id, estado) => {
    try {
      await patchOrder({ id, status: estado });
    } catch (e) {
      alert(`Error al actualizar estado: ${e?.message || e}`);
    }
  };

  const asignar = async (id, driverId) => {
    try {
      await patchOrder({
        id,
        assigned_driver: driverId || null, // la API guarda en assignedDriver
        status: "asignado",
      });
    } catch (e) {
      alert(`Error al asignar repartidor: ${e?.message || e}`);
    }
  };

  // Alta de driver con UID específico (coincide con Authentication)
  const agregarDriverConUid = async () => {
    const name = (nuevoDriverNombre || "").trim();
    const uid = (nuevoDriverUid || "").trim();
    if (!name || !uid) return alert("Captura nombre y UID.");

    try {
      // 1) /drivers/{uid}
      await setDoc(doc(collection(db, "drivers"), uid), { name, active: true }, { merge: true });

      // 2) /users/{uid}.role = 'driver'  👈 para Navbar/guards
      await setUserRole(uid, "driver");

      // ✅ pinta el repartidor de inmediato (optimistic update)
      setDrivers((prev) => {
        const exists = prev.some((d) => d.id === uid);
        const next = { id: uid, name, active: true };
        return exists ? prev.map((d) => (d.id === uid ? { ...d, ...next } : d)) : [...prev, next];
      });

      setNuevoDriverNombre("");
      setNuevoDriverUid("");
      alert("Repartidor guardado con UID y rol 'driver' asignado.");
    } catch (e) {
      alert(`Error al guardar repartidor: ${e?.message || e}`);
    }
  };

  // 🧾 Abrir/cerrar modal de cobro
  const abrirCobro = (order) => {
    setCobroOrder(order);
    setRecibido(Number(order?.cash_received || 0));
    setObservacionesCobro(order?.cash_notes || "");
    setOpenCobro(true);
  };
  const cerrarCobro = () => {
    setOpenCobro(false);
    setCobroOrder(null);
    setRecibido(0);
    setObservacionesCobro("");
  };

  // 💵 Guardar cobro
  const guardarCobro = async () => {
    if (!cobroOrder) return;
    try {
      const total = Number(cobroOrder.total || 0);
      const recibidoNum = Number(recibido || 0);
      const cambio = Math.max(recibidoNum - total, 0);
      const quedaEnCaja = Math.min(recibidoNum, total);

      await patchOrder({
        id: cobroOrder.id,
        cash_received: recibidoNum,
        cash_change: cambio,
        cash_notes: (observacionesCobro || "").trim(),
        paid: recibidoNum > 0, // 👈 flag para tabs "Cobrados"
        paid_at: serverTimestamp(),
      });

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === cobroOrder.id
            ? {
                ...o,
                cash_received: recibidoNum,
                cash_change: cambio,
                cash_notes: (observacionesCobro || "").trim(),
                paid: recibidoNum > 0,
                paid_at: new Date(),
              }
            : o
        )
      );

      // Si además quieres marcar entregado automáticamente cuando el recibido >= total:
      if (recibidoNum >= total && cobroOrder.status !== "entregado") {
        try { await setEstado(cobroOrder.id, "entregado"); } catch {}
      }

      console.log("Queda en caja:", quedaEnCaja);
      cerrarCobro();
    } catch (e) {
      alert(`Error al registrar cobro: ${e?.message || e}`);
    }
  };

  // 📊 KPIs de caja (en tiempo real)
  const { totalPedidos, totalRecibido, totalCambio, netoEnCaja } = useMemo(() => {
    let totalPedidos = 0;
    let totalRecibido = 0;
    let totalCambio = 0;

    for (const o of orders) {
      const tot = Number(o.total || 0);
      const rec = Number(o.cash_received || 0);
      const camb = typeof o.cash_change === "number" ? Number(o.cash_change) : Math.max(rec - tot, 0);

      totalPedidos += tot;
      totalRecibido += rec;
      totalCambio += camb;
    }

    const netoEnCaja = Math.max(totalRecibido - totalCambio, 0); // lo que realmente queda
    return { totalPedidos, totalRecibido, totalCambio, netoEnCaja };
  }, [orders]);

  // 🧾 PDF de cierre (con fallback a autoTable(doc, ...))
  const generarPDF = () => {
    try {
      const doc = new jsPDF({ unit: "pt" });
      const fecha = new Date();
      doc.setFontSize(14);
      doc.text("Cierre de pedidos", 40, 40);
      doc.setFontSize(10);
      doc.text(
        `Fecha: ${fecha.toLocaleDateString("es-MX")} ${fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
        40,
        58
      );

      const head = [["Folio", "Cliente", "Estado", "Total", "Recibido", "Cambio", "Notas"]];
      const body = orders.map((o) => [
        o.folio || "",
        (o.customer?.name || "").slice(0, 28),
        (o.status || "").replace("_", " "),
        currency(Number(o.total || 0)),
        currency(Number(o.cash_received || 0)),
        currency(
          typeof o.cash_change === "number"
            ? o.cash_change
            : Math.max(Number(o.cash_received || 0) - Number(o.total || 0), 0)
        ),
        (o.cash_notes || "").slice(0, 36),
      ]);

      const tableOptions = {
        head,
        body,
        startY: 80,
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [17, 24, 39] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 140 },
          2: { cellWidth: 90 },
          3: { cellWidth: 70, halign: "right" },
          4: { cellWidth: 80, halign: "right" },
          5: { cellWidth: 70, halign: "right" },
          6: { cellWidth: 120 },
        },
      };

      // Fallback por si el plugin no se adjunta como método
      if (typeof doc.autoTable === "function") {
        doc.autoTable(tableOptions);
      } else {
        autoTable(doc, tableOptions);
      }

      const y = (doc.lastAutoTable?.finalY || 80) + 20;
      doc.setFontSize(11);
      doc.text(`Total pedidos: ${currency(totalPedidos)}`, 40, y);
      doc.text(`Recibido: ${currency(totalRecibido)}`, 40, y + 18);
      doc.text(`Cambio entregado: ${currency(totalCambio)}`, 40, y + 36);
      doc.text(`En caja: ${currency(netoEnCaja)}`, 40, y + 54);

      doc.save(`cierre-pedidos-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      alert(`No se pudo generar el PDF: ${e?.message || e}`);
    }
  };

  // 📌 Derivados para tabs
  const pendientes = useMemo(
    () => orders.filter((o) => !o?.paid && o.status !== "cancelado"),
    [orders]
  );
  const cobrados = useMemo(
    () => orders.filter((o) => !!o?.paid || Number(o?.cash_received || 0) > 0),
    [orders]
  );

  const listado = tab === "pendientes" ? pendientes : tab === "cobrados" ? cobrados : orders;

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
        <h2 className="text-lg font-semibold">Pedidos a domicilio</h2>
        <div className="text-xs text-slate-600">
          {user ? (
            <>Admin: <b>{user.email}</b></>
          ) : (
            "No autenticado"
          )}
        </div>
      </div>

      {/* KPI de caja */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CardKPI title="Total pedidos" value={currency(totalPedidos)} subtitle="Suma de todos los pedidos" />
        <CardKPI title="Recibido" value={currency(totalRecibido)} subtitle="Efectivo recibido" />
        <CardKPI title="Cambio" value={currency(totalCambio)} subtitle="Devuelto al cliente" />
        <CardKPI title="En caja" value={currency(netoEnCaja)} subtitle="Neto después de cambio" highlight />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <TabButton active={tab === "pendientes"} onClick={() => setTab("pendientes")}>
          Pendientes <Badge>{pendientes.length}</Badge>
        </TabButton>
        <TabButton active={tab === "cobrados"} onClick={() => setTab("cobrados")}>
          Cobrados <Badge>{cobrados.length}</Badge>
        </TabButton>
        <TabButton active={tab === "todos"} onClick={() => setTab("todos")}>
          Todos <Badge>{orders.length}</Badge>
        </TabButton>
        <div className="ml-auto">
          <button
            onClick={generarPDF}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition text-sm"
          >
            Generar PDF de cierre
          </button>
        </div>
      </div>

      {/* Mapa en tiempo real */}
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-semibold">Mapa (repartidores y pedidos)</div>
          <div className="text-xs text-slate-500">Enfoca y arrastra para explorar</div>
        </div>
        <div className="h-[360px] md:h-[420px] w-full">
          <OrdersBoardMap orders={orders} drivers={drivers} />
        </div>
      </div>

      {/* Alta de repartidor por UID */}
      <div className="grid md:grid-cols-3 gap-2 items-end">
        <label className="text-sm">
          <div className="text-slate-600">Nombre del repartidor</div>
          <input
            className="border rounded-xl p-2 w-full"
            value={nuevoDriverNombre}
            onChange={(e) => setNuevoDriverNombre(e.target.value)}
            placeholder="Juan Pérez"
          />
        </label>
        <label className="text-sm">
          <div className="text-slate-600">UID (de Authentication)</div>
          <input
            className="border rounded-xl p-2 w-full"
            value={nuevoDriverUid}
            onChange={(e) => setNuevoDriverUid(e.target.value)}
            placeholder="pega aquí el UID"
          />
        </label>
        <button
          className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition h-[42px]"
          onClick={agregarDriverConUid}
        >
          Guardar repartidor
        </button>
      </div>

      {/* === Listado responsive === */}
      {/* Tarjetas en móvil */}
      <div className="grid gap-2 md:hidden">
        {listado.map((o) => (
          <OrderCardMobile key={o.id} o={o} drivers={drivers} abrirCobro={abrirCobro} setEstado={setEstado} asignar={asignar} />
        ))}
        {!listado.length && (
          <div className="py-3 px-2 text-slate-500">Sin pedidos.</div>
        )}
      </div>

      {/* Tabla en desktop */}
      <div className="hidden md:block overflow-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left border-b">
              <th className="py-2 px-2">Folio</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Dirección</th>
              <th>Tel.</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Repartidor</th>
              <th className="text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {listado.map((o) => {
              const assignedKey = o.assignedDriver || o.assigned_driver || "";
              const driver = drivers.find((d) => d.id === assignedKey);
              const hora = o.createdAt?.seconds
                ? new Date(o.createdAt.seconds * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                : "";

              const rec = Number(o.cash_received || 0);
              const camb =
                typeof o.cash_change === "number"
                  ? Number(o.cash_change)
                  : Math.max(rec - Number(o.total || 0), 0);

              return (
                <tr key={o.id} className="border-b align-top">
                  <td className="py-2 px-2">{o.folio}</td>
                  <td>{hora}</td>
                  <td>
                    <div className="font-medium">{o.customer?.name || ""}</div>
                    {!!rec || !!camb ? (
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        Recibido {currency(rec)} • Cambio {currency(camb)}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[260px]">
                    {o.customer?.address || ""}
                    <br />
                    <span className="text-xs text-slate-500">{o.notes || ""}</span>
                  </td>
                  <td>{o.customer?.phone || ""}</td>
                  <td className="font-medium">{currency(o.total)}</td>
                  <td className="capitalize">{o.status?.replace("_", " ")}</td>
                  <td>
                    <select
                      className="border rounded-lg p-1"
                      value={assignedKey}
                      onChange={(e) => asignar(o.id, e.target.value)}
                      title="Selecciona el repartidor (UID)"
                    >
                      <option value="">— Asignar —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} • {d.id.slice(0, 6)}…
                        </option>
                      ))}
                    </select>

                    {/* Ubicación del repartidor (si existe) */}
                    <div className="text-[11px] text-slate-500 mt-1">
                      {driver?.lat && driver?.lng ? (
                        <>
                          📍 {Number(driver.lat).toFixed(5)}, {Number(driver.lng).toFixed(5)}
                        </>
                      ) : (
                        "Sin ubicación"
                      )}
                    </div>
                  </td>
                  <td className="space-x-2 whitespace-nowrap text-right pr-2">
                    <a
                      className="underline text-blue-700"
                      href={buildMapsLink(o, driver)}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir ruta en Google Maps"
                    >
                      Ruta
                    </a>

                    {o.status === "pendiente" && (
                      <button
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                        onClick={() => setEstado(o.id, "asignado")}
                      >
                        Asignado
                      </button>
                    )}
                    {(o.status === "asignado" || o.status === "pendiente") && (
                      <button
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                        onClick={() => setEstado(o.id, "en_camino")}
                      >
                        Salió
                      </button>
                    )}
                    {o.status !== "entregado" && (
                      <button
                        className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200"
                        onClick={() => setEstado(o.id, "entregado")}
                      >
                        Entregado
                      </button>
                    )}
                    <button
                      className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200"
                      onClick={() => abrirCobro(o)}
                    >
                      Cobrar
                    </button>
                  </td>
                </tr>
              );
            })}
            {!listado.length && (
              <tr>
                <td className="py-3 px-2 text-slate-500" colSpan={9}>
                  Sin pedidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer compacto */}
      <div className="flex justify-between items-center mt-3 text-sm text-slate-600">
        <div>
          Pendientes: <b>{pendientes.length}</b>
        </div>
        <div>
          Cobrados: <b>{cobrados.length}</b>
        </div>
      </div>

      {/* Modal cobro */}
      {openCobro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={cerrarCobro} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Cobrar pedido</div>
              <button onClick={cerrarCobro} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm">
                <div className="text-slate-600">Folio</div>
                <div className="font-medium">{cobroOrder?.folio}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <KPIChip label="Total" value={currency(Number(cobroOrder?.total || 0))} />
                <KPIChip label="Recibido" value={currency(Number(recibido || 0))} />
              </div>

              <label className="text-sm block">
                <div className="text-slate-600">¿Cuánto recibió?</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="border rounded-xl p-2 w-full"
                  value={recibido}
                  onChange={(e) => setRecibido(Number(e.target.value))}
                />
                {/* Botones rápidos */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {[50, 100, 150, 200, 300, 500, 1000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                      onClick={() => setRecibido(n)}
                    >
                      {currency(n)}
                    </button>
                  ))}
                </div>
              </label>

              {/* Cambio */}
              <div className="grid grid-cols-2 gap-3">
                <KPIChip
                  label="Cambio a regresar"
                  value={currency(Math.max(Number(recibido || 0) - Number(cobroOrder?.total || 0), 0))}
                  highlight
                />
                <KPIChip
                  label="Queda en caja"
                  value={currency(Math.min(Number(recibido || 0), Number(cobroOrder?.total || 0)))}
                />
              </div>

              <label className="text-sm block">
                <div className="text-slate-600">Notas del cobro (opcional)</div>
                <textarea
                  className="border rounded-xl p-2 w-full min-h-[70px]"
                  value={observacionesCobro}
                  onChange={(e) => setObservacionesCobro(e.target.value)}
                  placeholder="Ej. pagó con 500, billete marcado, etc."
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200" onClick={cerrarCobro}>
                  Cancelar
                </button>
                <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={guardarCobro}>
                  Guardar cobro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm border transition ${
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50"
      }`}
    >
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

function Badge({ children }) {
  return (
    <span className="ml-1 inline-flex items-center justify-center text-[11px] px-2 py-0.5 rounded-full bg-slate-100">
      {children}
    </span>
  );
}

function OrderCardMobile({ o, drivers, abrirCobro, setEstado, asignar }) {
  const assignedKey = o.assignedDriver || o.assigned_driver || "";
  const driver = drivers.find((d) => d.id === assignedKey);
  const hora = o.createdAt?.seconds
    ? new Date(o.createdAt.seconds * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "";
  const rec = Number(o.cash_received || 0);
  const camb = typeof o.cash_change === "number" ? Number(o.cash_change) : Math.max(rec - Number(o.total || 0), 0);

  return (
    <div className="border rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{o.folio}</div>
        <div className="text-xs text-slate-500">{hora}</div>
      </div>
      <div className="mt-1 text-sm">
        <div className="font-medium">{o.customer?.name}</div>
        <div className="text-slate-600">{o.customer?.address}</div>
        {o.notes && <div className="text-xs text-slate-500 mt-1">{o.notes}</div>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-slate-500">Tel: </span>{o.customer?.phone || "—"}</div>
        <div className="text-right font-medium">{currency(o.total)}</div>
      </div>
      {!!rec || !!camb ? (
        <div className="text-[11px] text-emerald-700 mt-1">
          Recibido {currency(rec)} • Cambio {currency(camb)}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <select
          className="border rounded-lg p-1 text-sm"
          value={assignedKey}
          onChange={(e) => asignar(o.id, e.target.value)}
        >
          <option value="">— Asignar —</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} • {d.id.slice(0, 6)}…
            </option>
          ))}
        </select>
        <a
          className="underline text-blue-700 ml-auto text-sm"
          href={buildMapsLink(o, driver)}
          target="_blank"
          rel="noreferrer"
        >
          Ruta
        </a>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {o.status === "pendiente" && (
          <button className="px-2 py-1 rounded bg-slate-100" onClick={() => setEstado(o.id, "asignado")}>Asignado</button>
        )}
        {(o.status === "asignado" || o.status === "pendiente") && (
          <button className="px-2 py-1 rounded bg-slate-100" onClick={() => setEstado(o.id, "en_camino")}>Salió</button>
        )}
        {o.status !== "entregado" && (
          <button className="px-2 py-1 rounded bg-emerald-100" onClick={() => setEstado(o.id, "entregado")}>Entregado</button>
        )}
        <button className="px-2 py-1 rounded bg-amber-100" onClick={() => abrirCobro(o)}>Cobrar</button>
      </div>
    </div>
  );
}

function CardKPI({ title, value, subtitle, highlight }) {
  return (
    <div className={`rounded-2xl border p-3 ${highlight ? "bg-emerald-50 border-emerald-200" : "bg-white"}`}>
      <div className="text-xs text-slate-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
      {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
    </div>
  );
}

function KPIChip({ label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-2 ${highlight ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/** ---- Mapa de tablero con íconos y leyenda ---- */
function OrdersBoardMap({ orders, drivers }) {
  // Pedidos con coordenadas
  const orderPoints = orders
    .filter((o) => Number(o.lat) && Number(o.lng))
    .map((o) => ({
      id: o.id,
      folio: o.folio,
      lat: Number(o.lat),
      lng: Number(o.lng),
      status: o.status,
      name: o?.customer?.name,
      assignedKey: o.assignedDriver || o.assigned_driver || "",
    }));

  // Drivers con coordenadas
  const driverPoints = drivers
    .filter((d) => Number(d.lat) && Number(d.lng))
    .map((d) => ({
      id: d.id,
      name: d.name || "Repartidor",
      lat: Number(d.lat),
      lng: Number(d.lng),
      updatedAt: d.updatedAt, // opcional
    }));

  const initialCenter =
    driverPoints[0]
      ? [driverPoints[0].lat, driverPoints[0].lng]
      : orderPoints[0]
      ? [orderPoints[0].lat, orderPoints[0].lng]
      : [19.4326, -99.1332]; // CDMX

  return (
    <MapContainer center={initialCenter} zoom={13} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Drivers (verde) */}
      {driverPoints.map((d) => (
        <Marker key={d.id} position={[d.lat, d.lng]} icon={driverIcon}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{d.name}</div>
              <div className="text-xs text-slate-600">{d.id}</div>
              <div>Lat: {d.lat.toFixed(5)}, Lng: {d.lng.toFixed(5)}</div>
            </div>
          </Popup>
          <Circle center={[d.lat, d.lng]} radius={40} pathOptions={{ fillOpacity: 0.1 }} />
        </Marker>
      ))}

      {/* Pedidos (rojo o dorado si están asignados) */}
      {orderPoints.map((p) => {
        const isAssigned = Boolean(p.assignedKey);
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={isAssigned ? assignedOrderIcon : orderIcon}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.folio}</div>
                <div className="text-xs text-slate-600">{p.name || "Cliente"}</div>
                <div className="capitalize text-xs">{(p.status || "").replace("_", " ")}</div>
                <a
                  className="inline-block mt-2 underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir con Google Maps
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Rutas (líneas) desde driver asignado hacia su pedido */}
      {orderPoints.map((p) => {
        const d = driverPoints.find((x) => x.id === p.assignedKey);
        if (!d) return null;
        return (
          <Polyline
            key={`line-${p.id}`}
            positions={[[d.lat, d.lng], [p.lat, p.lng]]}
            pathOptions={{ weight: 3 }}
          />
        );
      })}

      <LegendControl />
      <FitAll drivers={driverPoints} orders={orderPoints} />
    </MapContainer>
  );
}

// Ajusta el mapa para encuadrar todo (drivers + pedidos)
function FitAll({ drivers, orders }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    drivers.forEach((d) => bounds.extend([d.lat, d.lng]));
    orders.forEach((p) => bounds.extend([p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  }, [drivers, orders, map]);
  return null;
}

// Leyenda del mapa
function LegendControl() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomleft" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.style.background = "rgba(255,255,255,0.9)";
      div.style.padding = "8px 10px";
      div.style.borderRadius = "12px";
      div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      div.style.fontSize = "12px";
      div.style.lineHeight = "16px";
      div.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">Leyenda</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png" width="12" height="20" />
          <span>Repartidor</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png" width="12" height="20" />
          <span>Pedido asignado</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" width="12" height="20" />
          <span>Pedido sin asignar</span>
        </div>
      `;
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map]);
  return null;
}

function buildMapsLink(o, driver) {
  const hasOrderCoords = Number(o.lat) && Number(o.lng);
  const hasDriverCoords = Number(driver?.lat) && Number(driver?.lng);

  if (hasDriverCoords && hasOrderCoords) {
    return `https://www.google.com/maps/dir/?api=1&origin=${driver.lat},${driver.lng}&destination=${o.lat},${o.lng}`;
  }
  if (hasOrderCoords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer?.address || "")}`;
}
