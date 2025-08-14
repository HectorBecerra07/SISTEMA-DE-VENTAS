
# DARMAX POS + Repartos (Firebase Realtime)

## Variables (Vite)
Define en Netlify (o `.env.local`) tu config de Firebase (VITE_FIREBASE_*).

## Realtime
- `onOrders(params, cb)` se suscribe a pedidos con `onSnapshot` y te empuja cambios en vivo.
- `onDrivers(cb)` igual para repartidores.

## Scripts
```bash
npm install
npm run dev
```

## Rutas
- `/` POS
- `/pedidos` tablero con actualizaciones en vivo
- `/repartidor?driverId=<id>` app del repartidor en vivo
