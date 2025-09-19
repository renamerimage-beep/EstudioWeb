/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const DB_NAME = 'PixshopDB';
const DB_VERSION = 5; // Incremented version for new 'users' store and indexes
const GALLERY_STORE_NAME = 'gallery';
const COST_STORE_NAME = 'cost_logs';
const USERS_STORE_NAME = 'users';

let dbPromise: Promise<IDBDatabase> | null = null;

export const getDb = (): Promise<IDBDatabase> => {
    if (dbPromise) {
        return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(new Error('Failed to open IndexedDB.'));
            dbPromise = null;
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const transaction = (event.target as IDBOpenDBRequest).transaction;

            // Gallery Store
            if (!db.objectStoreNames.contains(GALLERY_STORE_NAME)) {
                const galleryStore = db.createObjectStore(GALLERY_STORE_NAME, { keyPath: 'id' });
                galleryStore.createIndex('parentId', 'parentId', { unique: false });
                galleryStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            if (event.oldVersion < 5) {
                 const galleryStore = transaction!.objectStore(GALLERY_STORE_NAME);
                 if (!galleryStore.indexNames.contains('userId')) {
                    galleryStore.createIndex('userId', 'userId', { unique: false });
                 }
            }

            // Cost Logs Store
            if (!db.objectStoreNames.contains(COST_STORE_NAME)) {
                const costStore = db.createObjectStore(COST_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                costStore.createIndex('imageName', 'imageName', { unique: false });
                costStore.createIndex('projectId', 'projectId', { unique: false });
            }
             if (event.oldVersion < 5) {
                 const costStore = transaction!.objectStore(COST_STORE_NAME);
                 if (!costStore.indexNames.contains('userId')) {
                    costStore.createIndex('userId', 'userId', { unique: false });
                 }
            }

            // Users Store
            if (!db.objectStoreNames.contains(USERS_STORE_NAME)) {
                const usersStore = db.createObjectStore(USERS_STORE_NAME, { keyPath: 'id' });
                usersStore.createIndex('username', 'username', { unique: true });
            }
        };
    });
    return dbPromise;
};
