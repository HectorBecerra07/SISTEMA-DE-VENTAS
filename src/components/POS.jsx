
import React, { useMemo, useState } from "react";
import { createOrderApi } from "../lib/api-firebase";

const DEFAULT_PRICES = {
  premium: { mostrador: { "1":5, "4":15, "10":20, "20":30 }, domicilio:{ "10":24, "20":35 } },
  alcalina: { mostrador: { "1":20, "4":28, "10":38, "20":55 }, domicilio:{ "10":39, "20":60 } }
};

const currency = (n) => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n||0);

export default function POS(){
  const [prices] = useState(DEFAULT_PRICES);
  const [agua, setAgua] = useState("premium");
  const [ventaTipo, setVentaTipo] = useState("domicilio");
  const [cart, setCart] = useState([]);
  const [cliente, setCliente] = useState({ nombre:"", direccion:"", telefono:"", notas:"" });
  const [coords, setCoords] = useState({ lat:null, lng:null });
  const total = cart.reduce((s, it) => s + it.precioUnit * it.qty, 0);

  const productos = useMemo(()=>{
    const tabla = prices[agua][ventaTipo] || {};
    return Object.entries(tabla).map(([litros, precio])=>({ litros, precio }));
  }, [agua, ventaTipo, prices]);

  const addItem = (litros, precioUnit) => {
    setCart(prev=>{
      const key = `${agua}-${ventaTipo}-${litros}`;
      const i = prev.findIndex(x=>x.key===key);
      if (i>=0){ const c=[...prev]; c[i]={...c[i], qty:c[i].qty+1}; return c; }
      return [...prev, { key, agua, ventaTipo, litros, precioUnit, qty:1 }];
    });
  };

  const generarPedido = async () => {
    if (!cart.length) return alert("Agrega productos.");
    if (!cliente.direccion.trim()) return alert("Captura la dirección.");
    try{
      const payload = {
        customer: { name: cliente.nombre, phone: cliente.telefono, address: cliente.direccion },
        notes: cliente.notas, lat: coords.lat, lng: coords.lng,
        total,
        items: cart.map(it => ({ agua: it.agua, liters: Number(it.litros), unit_price: Number(it.precioUnit), qty: it.qty }))
      };
      const order = await createOrderApi(payload);
      alert("Pedido creado: " + order.folio);
      setCart([]); setCliente({ nombre:"", direccion:"", telefono:"", notas:"" }); setCoords({lat:null,lng:null});
    }catch(e){ alert("Error: " + e.message); }
  };

  const pedirUbicacion = () => {
    if (!navigator.geolocation) return alert("Geolocalización no disponible.");
    navigator.geolocation.getCurrentPosition(
      (pos)=> setCoords({lat:pos.coords.latitude, lng:pos.coords.longitude}),
      ()=> alert("No fue posible obtener ubicación."));
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">DARMAX — POS</h1>
      <div className="grid grid-cols-2 gap-3">
        <Toggle value={ventaTipo} onChange={setVentaTipo} options={[["mostrador","Mostrador"],["domicilio","Domicilio"]]} label="Tipo de venta" />
        <Toggle value={agua} onChange={setAgua} options={[["premium","Premium (Ósmosis)"],["alcalina","Alcalina"]]} label="Tipo de agua" />
      </div>

      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Presentaciones</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {productos.map(p=>(
            <button key={p.litros} onClick={()=>addItem(p.litros, p.precio)} className="rounded-2xl border bg-slate-100 hover:bg-slate-200 p-4 text-center">
              <div className="text-3xl font-bold">{p.litros}L</div>
              <div className="text-xl">{currency(p.precio)}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Carrito</h2>
        {cart.length===0 ? <div className="text-slate-500">Toca para agregar productos.</div> : (
          <ul className="divide-y">
            {cart.map(it=>(
              <li key={it.key} className="py-2 flex justify-between">
                <div>{it.agua} {it.litros}L x{it.qty}</div>
                <div>{currency(it.qty*it.precioUnit)}</div>
              </li>
            ))}
          </ul>
        )}

        {ventaTipo==="domicilio" && (
          <div className="grid gap-2 mt-4">
            <Input label="Dirección" value={cliente.direccion} onChange={v=>setCliente({...cliente, direccion:v})} placeholder="Calle, número, colonia" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Nombre" value={cliente.nombre} onChange={v=>setCliente({...cliente, nombre:v})} />
              <Input label="Teléfono" value={cliente.telefono} onChange={v=>setCliente({...cliente, telefono:v})} />
            </div>
            <Input label="Notas" value={cliente.notas} onChange={v=>setCliente({...cliente, notas:v})} placeholder="Ej. dejar en portón" />
            <button className="px-3 py-2 rounded-xl bg-white border w-max" onClick={pedirUbicacion}>📍 Usar mi ubicación</button>
            <div className="text-xs text-slate-600">{coords.lat && coords.lng ? `(${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` : "Sin ubicación"}</div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <div className="text-lg"><b>Total:</b> {currency(total)}</div>
          <button className="rounded-xl bg-emerald-600 text-white py-3 px-4 font-semibold" onClick={generarPedido}>Crear pedido</button>
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, value, onChange, options }){
  return (
    <div>
      {label && <div className="text-sm text-slate-600 mb-1">{label}</div>}
      <div className="grid grid-cols-2 gap-2">
        {options.map(([val,text])=>(
          <button key={val} onClick={()=>onChange(val)} className={`rounded-2xl py-3 px-3 shadow-sm border ${value===val?"bg-emerald-600 text-white":"bg-white"}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}
function Input({ label, value, onChange, placeholder, type="text" }){
  return (<label className="block">
    <div className="text-sm text-slate-600 mb-1">{label}</div>
    <input className="w-full border rounded-xl p-3 bg-white" value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} type={type}/>
  </label>);
}
