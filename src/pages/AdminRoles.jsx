// src/pages/AdminRoles.jsx
import React, { useState } from "react";
import { createDriverWithUid, setUserRole } from "../lib/api-firebase";

export default function AdminRoles() {
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("driver");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!uid) return setMsg("Pega el UID del usuario (Authentication).");

    try {
      setBusy(true);

      if (role === "driver") {
        await createDriverWithUid(uid, {
          name: name || email?.split("@")[0] || "Repartidor",
          phone: phone || null,
          active: true,
        });
      }

      await setUserRole(uid, role, email || null);

      setMsg(`✅ Rol asignado: ${role} (UID: ${uid})`);
      setUid(""); setEmail(""); setName(""); setPhone("");
    } catch (err) {
      setMsg(`❌ Error: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Asignar rol</h1>
      <p className="text-sm text-slate-600">
        Pega el <b>UID</b> desde <i>Authentication → Usuarios</i>.  
        Si eliges <b>driver</b>, también se creará/actualizará <code>/drivers/UID</code>.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <div className="text-slate-600">UID (Authentication)</div>
          <input className="border rounded-xl p-2 w-full" value={uid}
                 onChange={(e)=>setUid(e.target.value)} placeholder="pega aquí el UID" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <div className="text-slate-600">Email (opcional)</div>
            <input className="border rounded-xl p-2 w-full" value={email}
                   onChange={(e)=>setEmail(e.target.value)} placeholder="usuario@correo.com" />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Nombre (driver)</div>
            <input className="border rounded-xl p-2 w-full" value={name}
                   onChange={(e)=>setName(e.target.value)} placeholder="Juan Pérez" />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Teléfono (driver)</div>
            <input className="border rounded-xl p-2 w-full" value={phone}
                   onChange={(e)=>setPhone(e.target.value)} placeholder="55..." />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Rol</div>
            <select className="border rounded-xl p-2 w-full" value={role}
                    onChange={(e)=>setRole(e.target.value)}>
              <option value="driver">driver (repartidor)</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>

        <button type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
                disabled={busy}>
          {busy ? "Guardando..." : "Asignar rol"}
        </button>
      </form>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
