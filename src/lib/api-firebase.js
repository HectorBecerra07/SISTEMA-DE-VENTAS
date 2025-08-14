// src/lib/api-firebase.js
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

/* =======================================================
   DRIVERS
   ======================================================= */

// Suscripción a todos los drivers
export function onDrivers(cb) {
  const qRef = query(collection(db, "drivers"));
  return onSnapshot(qRef, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// Suscripción a UN driver (por uid)
export function onDriverDoc(uid, cb, onError) {
  if (!uid) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, "drivers", uid),
    (snap) => cb(snap.exists() ? { id: uid, ...snap.data() } : null),
    (err) => onError && onError(err)
  );
}

// Crear driver con ID automático
export async function createDriver(name, phone = null) {
  const ref = await addDoc(collection(db, "drivers"), {
    name: name || "",
    phone: phone || null,
    active: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name, phone, active: true };
}

// Crear/actualizar driver POR UID
export async function createDriverWithUid(
  uid,
  { name, phone = null, active = true } = {}
) {
  if (!uid) throw new Error("Falta UID");
  await setDoc(
    doc(db, "drivers", uid),
    {
      name: name || "",
      phone: phone || null,
      active: Boolean(active),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { id: uid, name: name || "", phone: phone || null, active: Boolean(active) };
}

// Leer /drivers/{uid} una vez
export async function getDriverByUid(uid) {
  if (!uid) return null;
  const ref = doc(db, "drivers", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

/* =======================================================
   ROLES (/users)
   ======================================================= */

export async function setUserRole(uid, role, email = null) {
  if (!uid || !role) throw new Error("Falta uid o role");
  await setDoc(
    doc(db, "users", uid),
    {
      role, // 'admin' | 'driver'
      ...(email ? { email } : {}),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return true;
}

export async function getUserRole(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().role || null : null;
}

export function onUserRole(uid, cb, onError) {
  if (!uid) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => cb(snap.exists() ? (snap.data().role || null) : null),
    (err) => onError && onError(err)
  );
}

/* =======================================================
   ORDERS
   ======================================================= */

// Evita índice compuesto: con filtros NO usamos orderBy
export function onOrders(params = {}, cb, onErr) {
  const { status, driver, max = 200 } = params;
  const filters = [];
  if (status) filters.push(where("status", "==", status));
  if (driver) filters.push(where("assignedDriver", "==", driver));

  const qRef = filters.length
    ? query(collection(db, "orders"), ...filters, limit(max))
    : query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(max));

  return onSnapshot(
    qRef,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("[onOrders] ERROR:", err);
      onErr && onErr(err);
    }
  );
}

export async function createOrderApi(payload) {
  const { customer, notes, lat, lng, total, items } = payload;
  const today = new Date().toISOString().slice(0, 10);

  const ref = await addDoc(collection(db, "orders"), {
    folio: `PD-${today}`,
    status: "pendiente",
    assignedDriver: null,
    outAt: null,
    deliveredAt: null,
    customer: {
      name: customer?.name || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
    },
    notes: notes || "",
    lat: lat ?? null,
    lng: lng ?? null,
    total: Number(total || 0),
    items: (items || []).map((it) => ({
      agua: it.agua || it.water_type || "premium",
      liters: Number(it.liters ?? it.litros ?? 0),
      unit_price: Number(it.unit_price ?? it.precioUnit ?? 0),
      qty: Number(it.qty || 1),
    })),
    createdAt: serverTimestamp(),
  });

  const suf = ref.id.slice(-4).toUpperCase();
  await updateDoc(ref, { folio: `PD-${today}-${suf}` });
  return { id: ref.id, folio: `PD-${today}-${suf}` };
}

/**
 * patchOrder:
 *  - SOLO cambia estado y asignación (para app del repartidor y tablero).
 *  - NO acepta cash_received (el cobro lo registra recordPayment desde el tablero).
 */
export async function patchOrder(patch) {
  const { id, status, assigned_driver } = patch;
  if (!id) throw new Error("Falta id");

  const data = {};
  if (status) {
    data.status = status;
    if (status === "en_camino") data.outAt = serverTimestamp();
    if (status === "entregado") data.deliveredAt = serverTimestamp();
  }
  if (assigned_driver !== undefined) {
    data.assignedDriver = assigned_driver || null;
  }

  await updateDoc(doc(db, "orders", id), data);
  return true;
}

/**
 * recordPayment (SOLO TABLERO):
 *  Registra el cobro en el pedido.
 *  Guarda: cashReceived, changeGiven, paymentMethod, paidBy, paidAt.
 */
export async function recordPayment(
  orderId,
  amount,
  { changeGiven = 0, method = "efectivo", paidBy = "admin" } = {}
) {
  if (!orderId) throw new Error("Falta orderId");
  await updateDoc(doc(db, "orders", orderId), {
    cashReceived: Number(amount || 0),
    changeGiven: Number(changeGiven || 0),
    paymentMethod: method,
    paidBy,
    paidAt: serverTimestamp(),
  });
  return true;
}

/**
 * (Opcional) Obtener pedidos por rango de fechas (para reportes/PDF).
 * start y end son objetos Date. Filtra por createdAt si existe.
 */
export async function getOrdersRangeOnce(start, end) {
  const filters = [];
  if (start) filters.push(where("createdAt", ">=", start));
  if (end)   filters.push(where("createdAt", "<=", end));

  const qRef = filters.length
    ? query(collection(db, "orders"), ...filters, limit(2000))
    : query(collection(db, "orders"), limit(2000));

  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* =======================================================
   DRIVER LOCATION
   ======================================================= */
/**
 * Guarda lat/lng en /drivers/{uid} (para tablero en tiempo real)
 * y, opcionalmente, historial en /drivers/{uid}/locations.
 */
export async function postDriverLocation(
  driver_id,
  lat,
  lng,
  { keepHistory = true } = {}
) {
  if (!driver_id || lat == null || lng == null) return;

  await setDoc(
    doc(db, "drivers", driver_id),
    { lat: Number(lat), lng: Number(lng), updatedAt: serverTimestamp() },
    { merge: true }
  );

  if (keepHistory) {
    await addDoc(collection(db, "drivers", driver_id, "locations"), {
      lat: Number(lat),
      lng: Number(lng),
      at: serverTimestamp(),
    });
  }
}
