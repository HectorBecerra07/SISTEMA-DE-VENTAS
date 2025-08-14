// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "darmax-fe29a.firebaseapp.com",
  projectId: "darmax-fe29a",
  storageBucket: "darmax-fe29a.appspot.com",   // <- corrige aquí
  messagingSenderId: "32747838110",
  appId: "1:32747838110:web:ed09dd90828a16d4f5f98f"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
