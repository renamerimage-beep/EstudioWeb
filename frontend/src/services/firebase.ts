// src/services/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDespF4jGyS6b2IhGavBmufcTU7HtRhdvQ",
  authDomain: "estudioweb-ebc00.firebaseapp.com",
  projectId: "estudioweb-ebc00",
  storageBucket: "estudioweb-ebc00.appspot.com", // Corrigido para o formato correto
  messagingSenderId: "1093425064137",
  appId: "1:1093425064137:web:052b6a046ad97ebaf78518",
  measurementId: "G-6V0Q7WHWKQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
