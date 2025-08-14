// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Usa variables de entorno con fallbacks a tus valores actuales
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDbRe11Film814hormq14FCEcPJsVPmY68",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "darmax-fe29a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "darmax-fe29a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "darmax-fe29a.appspot.com", // ← corregido
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "32747838110",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:32747838110:web:ed09dd90828a16d4f5f98f",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
