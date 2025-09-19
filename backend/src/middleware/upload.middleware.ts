// src/middleware/upload.middleware.ts
import multer from 'multer';

// Configura o multer para armazenar arquivos na memória.
// Isso é eficiente para que possamos encaminhá-los diretamente para o Cloud Storage.
const storage = multer.memoryStorage();

export const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // Limite de 15MB por arquivo
    }
});