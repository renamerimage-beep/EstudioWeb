// src/api/gallery.routes.ts
import { Router } from 'express';
import { getGalleryItemsController, createFolderController, uploadImageController, getPathController, getAllFilesController, findOrCreateTrashFolderController, deleteItemsController, renameItemController, moveItemsController } from '../controllers/gallery.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Todas as rotas da galeria são protegidas
router.use(authMiddleware);

// Obter itens de uma pasta
router.get('/gallery', getGalleryItemsController);

// Criar uma nova pasta
router.post('/gallery/folder', createFolderController);

// Fazer upload de uma nova imagem
// O middleware 'upload' processa os arquivos antes de chegarem ao controller.
router.post('/gallery/upload', 
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'originalImage', maxCount: 1 }
    ]), 
    uploadImageController
);

// Obter o caminho de uma pasta
router.get('/gallery/path', getPathController);

// Obter todos os arquivos da galeria
router.get('/gallery/all-files', getAllFilesController);

// Encontrar ou criar a pasta da lixeira
router.post('/gallery/trash-folder', findOrCreateTrashFolderController);

// Deletar itens
router.delete('/gallery/items', deleteItemsController);

// Renomear um item
router.put('/gallery/item/:itemId/rename', renameItemController);

// Mover itens
router.put('/gallery/move', moveItemsController);

export default router;