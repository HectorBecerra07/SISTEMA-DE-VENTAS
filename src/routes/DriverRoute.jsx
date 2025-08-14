// src/routes/DriverRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { getDriverByUid } from "../lib/api-firebase";

export default function DriverRoute({ children }) {
  const { user } = useAuth();
  const [ok, setOk] = useState(null);

  useEffect(() => {
    (async () => {
      if (!user) return setOk(false);
      const d = await getDriverByUid(user.uid);
      setOk(!!d);
    })();
  }, [user]);

  if (ok === null) return <div className="p-4">Verificando acceso…</div>;
  return ok ? children : <Navigate to="/" replace />;
}
