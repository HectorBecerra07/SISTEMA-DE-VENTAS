// src/pages/AutoRedirect.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { getUserRole, getDriverByUid } from "../lib/api-firebase";

export default function AutoRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // 1) Si es driver (existe en /drivers)
        const driverDoc = await getDriverByUid(user.uid);
        if (driverDoc) {
          navigate("/repartidor", { replace: true });
          return;
        }

        // 2) Si es admin
        const role = await getUserRole(user.uid);
        if (role === "admin") {
          navigate("/pedidos", { replace: true });
          return;
        }

        // 3) Rol desconocido → lo mandamos al home
        navigate("/", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, navigate]);

  if (loading) return <div className="p-4">Cargando…</div>;
  return null;
}
