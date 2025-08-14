// src/components/OrdersBoard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onOrders, onDrivers, patchOrder } from "../lib/api-firebase";
import { useAuth } from "../lib/auth-context";
import { db } from "../lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

const currency = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function OrdersBoard() {
  const { user } = useAuth(); // ← muestra quién está logueado
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);

  // Formularios para crear driver por UID (Auth)
  const [nuevoDriverNombre, setNuevoDriverNombre] = useState("");
  const [nuevoDriverUid, setNuevoDriverUid] = useState("");

  useEffect(() => {
    const unsubOrders = onOrders({}, setOrders);
    const unsubDrivers = onDrivers(setDrivers);
    return () => {
      unsubOrders && unsubOrders();
      unsubDrivers && unsubDrivers();
    };
  }, []);

  const setEstado = async (id, estado) => {
    await patchOrder({ id, status: estado });
  };

  const asignar = async (id, driverId) => {
    // driverId debe ser el UID del repartidor (id del doc en /drivers)
    await patchOrder({ id, assigned_driver: driverId || null, status: "asignado" });
  };

  const registrarCobro = async (id) => {
    const recibido = Number(prompt("¿Cuánto recibió?", "0") || 0);
    await patchOrder({ id, cash_received: recibido });
  };

  // Alta de driver con UID específico (coincide con Authentication)
  const agregarDriverConUid = async () => {
    const name = (nuevoDriverNombre || "").trim();
    const uid = (nuevoDriverUid || "").trim();
    if (!name || !uid) return alert("Captura nombre y UID.");

    // Crea/actualiza doc con ID = UID
    await setDoc(doc(collection(db, "drivers"), uid), {
      name,
      active: true,
      // puedes agregar phone u otros campos
    });
    setNuevoDriverNombre("");
    setNuevoDriverUid("");
    alert("Repartidor guardado con UID.");
  };

  const pendientes = useMemo(
    () => orders.filter((o) => o.status !== "entregado" && o.status !== "cancelado"),
    [orders]
  );

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Pedidos a domicilio</h2>
        <div className="text-xs text-slate-600">
          {user ? <>Admin: <b>{user.email}</b></> : "No autenticado"}
        </div>
      </div>

      {/* Alta de repartidor por UID */}
      <div className="grid md:grid-cols-3 gap-2 items-end mb-3">
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
          className="px-3 py-2 rounded-xl bg-slate-100 border h-[42px]"
          onClick={agregarDriverConUid}
        >
          Guardar repartidor
        </button>
      </div>

      <div className="overflow-auto border rounded-xl">
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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b align-top">
                <td className="py-2 px-2">{o.folio}</td>
                <td>
                  {o.createdAt?.seconds
                    ? new Date(o.createdAt.seconds * 1000).toLocaleTimeString()
                    : ""}
                </td>
                <td>{o.customer?.name || ""}</td>
                <td className="max-w-[260px]">
                  {o.customer?.address || ""}
                  <br />
                  <span className="text-xs text-slate-500">{o.notes || ""}</span>
                </td>
                <td>{o.customer?.phone || ""}</td>
                <td>{currency(o.total)}</td>
                <td className="capitalize">{o.status?.replace("_", " ")}</td>
                <td>
                  <select
                    className="border rounded-lg p-1"
                    value={o.assignedDriver || ""}
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
                </td>
                <td className="space-x-2 whitespace-nowrap">
                  <a
                    className="underline text-blue-700"
                    href={buildMapsLink(o)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mapa
                  </a>
                  {o.status === "pendiente" && (
                    <button
                      className="px-2 py-1 rounded bg-slate-100"
                      onClick={() => setEstado(o.id, "asignado")}
                    >
                      Asignado
                    </button>
                  )}
                  {(o.status === "asignado" || o.status === "pendiente") && (
                    <button
                      className="px-2 py-1 rounded bg-slate-100"
                      onClick={() => setEstado(o.id, "en_camino")}
                    >
                      Salió
                    </button>
                  )}
                  {o.status !== "entregado" && (
                    <button
                      className="px-2 py-1 rounded bg-emerald-100"
                      onClick={() => setEstado(o.id, "entregado")}
                    >
                      Entregado
                    </button>
                  )}
                  <button
                    className="px-2 py-1 rounded bg-amber-100"
                    onClick={() => registrarCobro(o.id)}
                  >
                    Cobro
                  </button>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td className="py-3 px-2 text-slate-500" colSpan={9}>
                  Sin pedidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm text-slate-600">
        Pendientes: <b>{pendientes.length}</b>
      </div>
    </div>
  );
}

function buildMapsLink(o) {
  if (o.lat && o.lng)
    return `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    o.customer?.address || ""
  )}`;
}
