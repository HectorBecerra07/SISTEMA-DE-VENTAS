// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { getDriverByUid, getUserRole } from "../lib/api-firebase";
import { useNavigate, useLocation } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const go = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const userCred = await login(email, pass);
      const uid = userCred?.user?.uid;

      // Resolución de destino por rol
      let dest = new URLSearchParams(location.search).get("redirect") || "/";
      if (uid) {
        // Prioridad: driver -> admin -> redirect/home
        const driverDoc = await getDriverByUid(uid);
        if (driverDoc) {
          dest = "/repartidor";
        } else {
          const role = await getUserRole(uid);
          if (role === "admin") dest = "/pedidos";
        }
      }

      navigate(dest, { replace: true });
    } catch (e) {
      setErr(e?.message || "No fue posible iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={go} className="w-full max-w-sm bg-white rounded-2xl border p-6 space-y-3">
        <h1 className="text-xl font-bold">Iniciar sesión</h1>

        <label className="block">
          <div className="text-sm text-slate-600">Correo</div>
          <input
            className="w-full border rounded-xl p-3"
            type="email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            placeholder="usuario@correo.com"
            required
          />
        </label>

        <label className="block">
          <div className="text-sm text-slate-600">Contraseña</div>
          <input
            className="w-full border rounded-xl p-3"
            type="password"
            value={pass}
            onChange={(e)=>setPass(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <button
          className="w-full rounded-xl bg-emerald-600 text-white py-3 font-semibold disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
