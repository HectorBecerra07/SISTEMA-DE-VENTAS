// src/lib/auth-context.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const login = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
  const logout = () => signOut(auth);

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

/** Ruta protegida: si no hay user, redirige a /login */
export function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  const redirect = encodeURIComponent(location.pathname + location.search);
  if (!ready) return <div className="p-6">Cargando…</div>;
  if (!user) {
    location.href = `/login?redirect=${redirect}`;
    return null;
  }
  return children;
}
