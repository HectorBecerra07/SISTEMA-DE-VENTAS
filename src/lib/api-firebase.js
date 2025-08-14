
import {
  collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp,
  doc, updateDoc, onSnapshot
} from "firebase/firestore";
import { db } from "./firebase";

/** ===== DRIVERS ===== */
export function onDrivers(cb) {
  const q = query(collection(db, "drivers"), where("active", "==", true), orderBy("name"));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createDriver(name, phone = null) {
  const ref = await addDoc(collection(db, "drivers"), { name, phone, active: true, createdAt: serverTimestamp() });
  return { id: ref.id, name, phone, active: true };
}

/** ===== ORDERS ===== */
export function onOrders(params = {}, cb) {
  const { status, driver, max = 200 } = params;
  const filters = [];
  if (status) filters.push(where("status", "==", status));
  if (driver) filters.push(where("assignedDriver", "==", driver));
  const qRef = query(collection(db, "orders"), ...filters, orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(qRef, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
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
    items: (items || []).map(it => ({
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

export async function patchOrder(patch) {
  const { id, status, assigned_driver, cash_received } = patch;
  if (!id) throw new Error("Falta id");

  const data = {};
  if (status) {
    data.status = status;
    if (status === "en_camino") data.outAt = serverTimestamp();
    if (status === "entregado") data.deliveredAt = serverTimestamp();
  }
  if (assigned_driver !== undefined) data.assignedDriver = assigned_driver || null;
  if (cash_received !== undefined) data.cashReceived = Number(cash_received || 0);

  await updateDoc(doc(db, "orders", id), data);
  return true;
}

export async function postDriverLocation(driver_id, lat, lng) {
  if (!driver_id || lat == null || lng == null) return;
  await addDoc(collection(db, "drivers", driver_id, "locations"), {
    lat: Number(lat), lng: Number(lng), at: serverTimestamp()
  });
}
