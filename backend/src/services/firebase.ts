// src/services/firebase.ts
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
    throw new Error('A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não está definida no seu arquivo .env');
}

// Garante que o SDK não seja inicializado mais de uma vez
if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Vamos adicionar isso ao .env
    });
    console.log('Firebase Admin SDK inicializado com sucesso.');
}

export const auth = getAuth();
export const db = getFirestore();
export const storage = getStorage();