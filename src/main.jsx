// src/main.jsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import POS from "./components/POS";
import OrdersBoard from "./components/OrdersBoard";
import DriverApp from "./pages/DriverApp";
import Login from "./pages/Login";
import { AuthProvider, ProtectedRoute, useAuth } from "./lib/auth-context";
import { getDriverByUid, getUserRole } from "./lib/api-firebase"; // 👈 roles + driver
import DriverRoute from "./routes/DriverRoute"; // 👈 nuevo guard
import AdminRoute from "./routes/AdminRoute";   // 👈 nuevo guard
import "./index.css";

function Nav() {
  const { user, logout } = useAuth();
  const [isDriver, setIsDriver] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.uid) { setIsDriver(false); setIsAdmin(false); return; }
      const [d, role] = await Promise.all([getDriverByUid(user.uid), getUserRole(user.uid)]);
      if (!alive) return;
      setIsDriver(!!d);
      setIsAdmin(role === "admin");
    })();
    return () => { alive = false; };
  }, [user?.uid, loc.pathname]);

  const Btn = ({ to, children }) => (
    <Link className="px-3 py-2 rounded-xl bg-white border text-sm" to={to}>
      {children}
    </Link>
  );

  return (
    <nav className="mb-4 flex gap-2 items-center">
      {/* Si NO es driver, mostramos POS y Pedidos; si es admin, también Roles (si luego lo agregas) */}
      {!isDriver && (
        <>
          <Btn to="/">POS</Btn>
          <Btn to="/pedidos">Pedidos</Btn>
          {/* {isAdmin && <Btn to="/admin/roles">Roles</Btn>}  // <- si luego agregas esta página */}
        </>
      )}

      {/* Todos ven la App de Repartidor (pero el guard protege la ruta) */}
      <Btn to="/repartidor">App Repartidor</Btn>

      <span className="flex-1" />
      {user ? (
        <>
          <span className="text-xs text-slate-600">{user.email}</span>
          <button className="px-3 py-2 rounded-xl bg-white border text-sm" onClick={logout}>
            Cerrar sesión
          </button>
        </>
      ) : (
        <Btn to="/login">Login</Btn>
      )}
    </nav>
  );
}

function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 max-w-7xl mx-auto">
      <Nav />
      <Routes>
        {/* POS: lo dejas público como ya lo tenías */}
        <Route path="/" element={<POS />} />

        {/* Admin (solo admin) */}
        <Route
          path="/pedidos"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <OrdersBoard />
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        {/* Repartidor (solo driver) */}
        <Route
          path="/repartidor"
          element={
            <ProtectedRoute>
              <DriverRoute>
                <DriverApp />
              </DriverRoute>
            </ProtectedRoute>
          }
        />

        {/* Login */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
