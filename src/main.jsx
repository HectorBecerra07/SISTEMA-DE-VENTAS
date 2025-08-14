// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import POS from "./components/POS";
import OrdersBoard from "./components/OrdersBoard";
import DriverApp from "./pages/DriverApp";
import Login from "./pages/Login";
import { AuthProvider, ProtectedRoute, useAuth } from "./lib/auth-context";
import "./index.css";

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="mb-4 flex gap-2">
      <Link className="px-3 py-2 rounded-xl bg-white border" to="/">POS</Link>
      <Link className="px-3 py-2 rounded-xl bg-white border" to="/pedidos">Pedidos</Link>
      <Link className="px-3 py-2 rounded-xl bg-white border" to="/repartidor">App Repartidor</Link>
      <span className="flex-1" />
      {user ? (
        <button className="px-3 py-2 rounded-xl bg-white border" onClick={logout}>
          Cerrar sesión
        </button>
      ) : (
        <Link className="px-3 py-2 rounded-xl bg-white border" to="/login">Login</Link>
      )}
    </nav>
  );
}

function Layout(){
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 max-w-7xl mx-auto">
      <Nav />
      <Routes>
        <Route path="/" element={<POS/>}/>
        {/* Admin (protegido) */}
        <Route path="/pedidos" element={
          <ProtectedRoute><OrdersBoard/></ProtectedRoute>
        }/>
        {/* Repartidor (protegido) */}
        <Route path="/repartidor" element={
          <ProtectedRoute><DriverApp/></ProtectedRoute>
        }/>
        <Route path="/login" element={<Login/>}/>
      </Routes>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter><Layout/></BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
