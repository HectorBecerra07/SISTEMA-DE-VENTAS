// src/components/Navbar.jsx
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { getDriverByUid, getUserRole } from "../lib/api-firebase";

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [isDriver, setIsDriver] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.uid) {
        setIsDriver(false);
        setIsAdmin(false);
        return;
      }
      const driverDoc = await getDriverByUid(user.uid);
      const role = await getUserRole(user.uid);
      if (!active) return;
      setIsDriver(!!driverDoc);
      setIsAdmin(role === "admin");
    })();
    return () => { active = false; };
  }, [user?.uid, location.pathname]);

  const NavBtn = ({ to, children }) => (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-xl border bg-white hover:bg-slate-50 text-sm"
    >
      {children}
    </Link>
  );

  return (
    <nav className="flex items-center gap-2 p-2 border-b bg-slate-50">
      {/* Opciones visibles solo para NO drivers */}
      {!isDriver && (
        <>
          <NavBtn to="/pos">POS</NavBtn>
          <NavBtn to="/pedidos">Pedidos</NavBtn>
          {isAdmin && <NavBtn to="/admin/roles">Roles</NavBtn>}
        </>
      )}

      {/* Todos ven la app de repartidor */}
      <NavBtn to="/repartidor">App Repartidor</NavBtn>

      {/* Info de usuario y logout */}
      <div className="ml-auto flex items-center gap-2">
        {user && <span className="text-sm text-slate-600">{user.email}</span>}
        <button
          className="px-3 py-1.5 rounded-xl border bg-white hover:bg-slate-100 text-sm"
          onClick={signOut}
        >
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
