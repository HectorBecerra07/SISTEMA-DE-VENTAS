// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const go = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await login(email, pass);
      const dest = new URLSearchParams(location.search).get("redirect") || "/";
      location.href = dest;
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={go} className="w-full max-w-sm bg-white rounded-2xl border p-6 space-y-3">
        <h1 className="text-xl font-bold">Iniciar sesión</h1>
        <label className="block">
          <div className="text-sm text-slate-600">Correo</div>
          <input className="w-full border rounded-xl p-3" value={email} onChange={e=>setEmail(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm text-slate-600">Contraseña</div>
          <input className="w-full border rounded-xl p-3" type="password" value={pass} onChange={e=>setPass(e.target.value)} />
        </label>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="w-full rounded-xl bg-emerald-600 text-white py-3 font-semibold">Entrar</button>
      </form>
    </div>
  );
}
