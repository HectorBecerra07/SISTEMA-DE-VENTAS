// src/routes/AdminRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { onUserRole } from "../lib/api-firebase";

export default function AdminRoute({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allow, setAllow] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setAllow(false);
      return;
    }
    const unsub = onUserRole(
      user.uid,
      (role) => { setAllow(role === "admin"); setLoading(false); },
      () => { setAllow(false); setLoading(false); }
    );
    return () => unsub && unsub();
  }, [user?.uid]);

  if (loading) return <div className="p-4">Verificando acceso…</div>;
  return allow ? children : <Navigate to="/" replace />;
}
