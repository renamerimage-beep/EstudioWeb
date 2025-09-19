// src/controllers/gallery.controller.ts
import { Request, Response } from 'express';
import { db, storage } from '../services/firebase';
import { FieldValue, DocumentData } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

// Helper para gerar URL pública de um arquivo no Cloud Storage
const getPublicUrl = (bucketName: string, fileName: string) => `https://storage.googleapis.com/${bucketName}/${fileName}`;

// Lista itens de uma pasta
export const getGalleryItemsController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const parentId = req.query.parentId || null;

        const folderQuery = db.collection('gallery')
            .where('uid', '==', uid)
            .where('parentId', '==', parentId)
            .where('type', '==', 'folder')
            .orderBy('createdAt', 'asc');

        const fileQuery = db.collection('gallery')
            .where('uid', '==', uid)
            .where('parentId', '==', parentId)
            .where('type', 'in', ['file', 'image'])
            .orderBy('createdAt', 'asc');

        const [folderSnapshot, fileSnapshot] = await Promise.all([
            folderQuery.get(),
            fileQuery.get()
        ]);

        const folders = folderSnapshot.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() }));
        const filesRaw = fileSnapshot.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() }));

        // Verifica a existência dos arquivos no Storage
        const files = [];
        for (const file of filesRaw) {
            if (file.storagePath) {
                const [exists] = await storage.bucket().file(file.storagePath).exists();
                if (exists) {
                    files.push(file);
                } else {
                    // O arquivo não existe no Storage, então remove a referência do Firestore
                    console.warn(`Arquivo ${file.storagePath} não encontrado no Storage. Removendo do Firestore.`);
                    await db.collection('gallery').doc(file.id).delete();
                }
            } else {
                // Se não tem storagePath, é um registro inválido, remove também
                 await db.collection('gallery').doc(file.id).delete();
            }
        }

        // Combine and sort to have folders first, then files
        const items = [...folders, ...files];

        res.status(200).json(items);

    } catch (error) {
        console.error("Erro ao buscar itens da galeria:", error);
        res.status(500).json({ message: 'Erro ao buscar itens da galeria.' });
    }
};

// Cria uma nova pasta
export const createFolderController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const { name, parentId } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'O nome da pasta é obrigatório.' });
        }

        const newFolder = {
            uid,
            name,
            parentId: parentId || null,
            type: 'folder',
            createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('gallery').add(newFolder);

        res.status(201).json({ 
            id: docRef.id,
            ...newFolder
         });

    } catch (error) {
        console.error("Erro ao criar pasta:", error);
        res.status(500).json({ message: 'Erro ao criar pasta.' });
    }
};

// Lida com o upload de uma imagem
export const uploadImageController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const { parentId, name } = req.body;

        if (!req.files || !('image' in req.files)) {
            return res.status(400).json({ message: 'Nenhum arquivo de imagem enviado.' });
        }

        const imageFile = (req.files as any).image[0];
        const bucket = storage.bucket(); // Usa o bucket padrão configurado

        // Define o caminho do arquivo no Storage
        const fileName = `${uid}/${uuidv4()}-${imageFile.originalname.replace(/\s/g, '_')}`;
        const file = bucket.file(fileName);

        // Faz o upload do buffer da imagem
        await file.save(imageFile.buffer, {
            metadata: {
                contentType: imageFile.mimetype,
            },
        });
        await file.makePublic();

        // Cria o registro no Firestore
        const newImage = {
            uid,
            name: name || imageFile.originalname,
            parentId: parentId || 'root', // Default to 'root' if no parentId is provided
            type: 'file',
            url: getPublicUrl(bucket.name, fileName),
            storagePath: fileName,
            createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('gallery').add(newImage);

        res.status(201).json({ 
            id: docRef.id,
            ...newImage
        });

    } catch (error) {
        console.error("Erro no upload:", error);
        res.status(500).json({ message: 'Erro ao processar upload.' });
    }
};

// Helper function to get a single document
async function getGalleryItemById(itemId: string): Promise<DocumentData | null> {
    if (itemId === 'root') {
        return { id: 'root', name: 'Home', type: 'folder' }; // Virtual root folder
    }
    const doc = await db.collection('gallery').doc(itemId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Obtém o caminho de uma pasta (lista de ancestrais)
export const getPathController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const folderId = req.query.folderId as string;

        if (!folderId) {
            return res.status(400).json({ message: 'folderId é obrigatório.' });
        }

        const path: { id: string; name: string }[] = [];
        let currentId: string | null = folderId;

        while (currentId && currentId !== 'root') {
            const item = await getGalleryItemById(currentId);
            if (item && item.uid === uid && item.type === 'folder') { // Ensure it's a folder owned by the user
                path.unshift({ id: item.id, name: item.name });
                currentId = item.parentId;
            } else if (item && item.uid === uid && item.type !== 'folder') {
                // If it's a file, we should stop or handle differently. For path, we expect folders.
                return res.status(400).json({ message: 'folderId inválido: não é uma pasta.' });
            } else {
                // Item not found or not owned by user
                currentId = null; // Stop the loop
            }
        }
        path.unshift({ id: 'root', name: 'Home' }); // Add virtual root

        res.status(200).json(path);

    } catch (error) {
        console.error("Erro ao obter o caminho da pasta:", error);
        res.status(500).json({ message: 'Erro ao obter o caminho da pasta.' });
    }
};

// Obtém todos os arquivos da galeria para um usuário específico.
export const getAllFilesController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user; // Authenticated user
        const targetUserId = req.query.userId as string;
        const isAdmin = req.query.isAdmin === 'true'; // Query params are strings

        // A proper admin check should be implemented here, e.g., checking a 'role' claim from the token.
        // For now, we'll trust the 'isAdmin' flag from the frontend for demonstration.

        let query = db.collection('gallery')
            .where('type', 'in', ['file', 'image']);

        if (isAdmin && targetUserId && targetUserId !== 'undefined') {
            // If admin and a specific user is targeted, fetch that user's files.
            query = query.where('uid', '==', targetUserId);
        } else {
            // For all other cases (non-admins, or admins fetching their own files),
            // just fetch the files for the authenticated user.
            query = query.where('uid', '==', uid);
        }
        // If admin and no targetUserId, it would fetch all files for all users (might be too broad)

        const snapshot = await query.orderBy('createdAt', 'desc').get();

        const files = snapshot.docs.map((doc: DocumentData) => ({ id: doc.id, ...doc.data() }));

        res.status(200).json(files);

    } catch (error) {
        console.error("Erro ao buscar todos os arquivos da galeria:", error);
        res.status(500).json({ message: 'Erro ao buscar todos os arquivos da galeria.' });
    }
};

// Encontra ou cria a pasta da lixeira para o usuário
export const findOrCreateTrashFolderController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const trashFolderName = 'Lixeira';

        // Verifica se a pasta Lixeira já existe para este usuário
        const query = db.collection('gallery')
            .where('uid', '==', uid)
            .where('name', '==', trashFolderName)
            .where('type', '==', 'folder')
            .limit(1);

        const snapshot = await query.get();

        if (!snapshot.empty) {
            // Pasta encontrada, retorna-a
            const existingFolder = snapshot.docs[0];
            return res.status(200).json({ id: existingFolder.id, ...existingFolder.data() });
        }

        // Pasta não encontrada, cria uma nova
        const newFolder = {
            uid,
            name: trashFolderName,
            parentId: 'root', // Lixeira fica sempre na raiz
            type: 'folder',
            createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('gallery').add(newFolder);

        res.status(201).json({ 
            id: docRef.id,
            ...newFolder
         });

    } catch (error) {
        console.error("Erro ao encontrar ou criar a pasta da lixeira:", error);
        res.status(500).json({ message: 'Erro ao processar a pasta da lixeira.' });
    }
};

// Renomeia um item
export const renameItemController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const { itemId } = req.params;
        const { newName } = req.body;

        if (!newName) {
            return res.status(400).json({ message: 'O novo nome é obrigatório.' });
        }

        const itemRef = db.collection('gallery').doc(itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists || itemDoc.data()?.uid !== uid) {
            return res.status(404).json({ message: 'Item não encontrado ou não autorizado.' });
        }

        // Se for um arquivo, preserva a extensão
        const currentName = itemDoc.data()?.name || '';
        const extension = itemDoc.data()?.type === 'file' ? currentName.substring(currentName.lastIndexOf('.')) : '';
        const finalName = itemDoc.data()?.type === 'file' ? `${newName}${extension}` : newName;


        await itemRef.update({ name: finalName });

        res.status(200).json({ message: 'Item renomeado com sucesso.' });

    } catch (error) {
        console.error("Erro ao renomear item:", error);
        res.status(500).json({ message: 'Erro ao renomear item.' });
    }
};

// Move itens para uma nova pasta
export const moveItemsController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const { itemIds, destinationFolderId } = req.body;

        if (!itemIds || !destinationFolderId) {
            return res.status(400).json({ message: 'IDs dos itens e pasta de destino são obrigatórios.' });
        }

        const batch = db.batch();
        itemIds.forEach((itemId: string) => {
            const itemRef = db.collection('gallery').doc(itemId);
            batch.update(itemRef, { parentId: destinationFolderId });
        });

        await batch.commit();

        res.status(200).json({ message: 'Itens movidos com sucesso.' });

    } catch (error) {
        console.error("Erro ao mover itens:", error);
        res.status(500).json({ message: 'Erro ao mover itens.' });
    }
};

// Deleta uma pasta e todo o seu conteúdo recursivamente
const deleteFolderRecursive = async (folderId: string, uid: string) => {
    const batch = db.batch();
    const bucket = storage.bucket();

    // Encontra sub-pastas
    const subFoldersSnapshot = await db.collection('gallery')
        .where('uid', '==', uid)
        .where('parentId', '==', folderId)
        .where('type', '==', 'folder')
        .get();

    for (const doc of subFoldersSnapshot.docs) {
        await deleteFolderRecursive(doc.id, uid);
    }

    // Encontra e deleta arquivos na pasta atual
    const filesSnapshot = await db.collection('gallery')
        .where('uid', '==', uid)
        .where('parentId', '==', folderId)
        .where('type', 'in', ['file', 'image'])
        .get();

    for (const doc of filesSnapshot.docs) {
        const fileData = doc.data();
        if (fileData.storagePath) {
            // Deleta do Storage
            await bucket.file(fileData.storagePath).delete().catch(err => console.error(`Falha ao deletar arquivo do storage: ${fileData.storagePath}`, err));
        }
        // Deleta do Firestore
        batch.delete(doc.ref);
    }

    // Deleta a pasta atual do Firestore
    const folderRef = db.collection('gallery').doc(folderId);
    batch.delete(folderRef);

    await batch.commit();
};


// Deleta itens (arquivos ou pastas)
export const deleteItemsController = async (req: Request, res: Response) => {
    try {
        const { uid } = (req as any).user;
        const { itemIds } = req.body; // Espera um array de IDs

        if (!itemIds || !Array.isArray(itemIds)) {
            return res.status(400).json({ message: 'Array de IDs de itens é obrigatório.' });
        }

        const bucket = storage.bucket();

        for (const itemId of itemIds) {
            const itemRef = db.collection('gallery').doc(itemId);
            const itemDoc = await itemRef.get();

            if (!itemDoc.exists || itemDoc.data()?.uid !== uid) {
                console.warn(`Item ${itemId} não encontrado ou não autorizado para o usuário ${uid}. Pulando.`);
                continue; // Pula para o próximo item
            }

            const itemData = itemDoc.data();

            if (itemData?.type === 'folder') {
                // Se for uma pasta, deleta recursivamente
                await deleteFolderRecursive(itemId, uid);
            } else if (itemData?.type === 'file' || itemData?.type === 'image') {
                // Se for um arquivo, deleta do Storage e do Firestore
                if (itemData.storagePath) {
                    await bucket.file(itemData.storagePath).delete().catch(err => console.error(`Falha ao deletar arquivo do storage: ${itemData.storagePath}`, err));
                }
                await itemRef.delete();
            }
        }

        res.status(200).json({ message: 'Itens deletados com sucesso.' });

    } catch (error) {
        console.error("Erro ao deletar itens:", error);
        res.status(500).json({ message: 'Erro ao deletar itens.' });
    }
};