/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Base properties for any item in the gallery
interface GalleryItemBase {
  id: string;
  parentId: string; // 'root' for top-level items
  name: string;
  timestamp: number;
  userId: string;
}

// Represents a folder
export interface GalleryFolder extends GalleryItemBase {
  type: 'folder';
}

// Represents a file, extending the old StoredImage concept
export interface GalleryFile extends GalleryItemBase {
  type: 'file';
  url: string; // URL do Firebase Storage
  storagePath: string; // Caminho no Firebase Storage
  originalUrl?: string; // URL da imagem original, se for uma edição
  metadata?: Record<string, string>;
}

export type GalleryItem = GalleryFile | GalleryFolder;
export type StoredImage = GalleryFile; // Para compatibilidade com App.tsx

/**
 * Adiciona uma nova imagem ao Firebase Storage e registra no Firestore.
 */
export const addImageToStorage = async (
    imageFile: File, 
    name: string, 
    userId: string,
    token: string,
    originalImageFile?: File, 
    metadata?: Record<string, string>, 
    parentId: string = 'root'
): Promise<StoredImage> => {
    const formData = new FormData();
    formData.append('image', imageFile, name);
    formData.append('name', name);
    formData.append('parentId', parentId);
    if (originalImageFile) {
        formData.append('originalImage', originalImageFile, `original-${name}`);
    }
    if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
    }

    const response = await fetch('/api/gallery/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao fazer upload da imagem.');
    }

    const result = await response.json();
    return result as StoredImage;
};

/**
 * Cria uma nova pasta no Firestore.
 */
export const createFolder = async (name: string, parentId: string, userId: string, token: string): Promise<GalleryFolder> => {
    const response = await fetch('/api/gallery/folder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, parentId, userId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao criar pasta.');
    }

    const result = await response.json();
    return result as GalleryFolder;
};

/**
 * Encontra uma pasta existente pelo nome e parentId, ou a cria se não existir.
 */
export const findOrCreateFolder = async (name: string, parentId: string, userId: string, token: string): Promise<GalleryFolder> => {
    // First, try to find the folder
    const items = await getGalleryItems(parentId, userId, token);
    const existingFolder = items.find(item => item.type === 'folder' && item.name === name) as GalleryFolder | undefined;

    if (existingFolder) {
        return existingFolder;
    } else {
        // If not found, create it
        return createFolder(name, parentId, userId, token);
    }
};

/**
 * Obtém itens da galeria (arquivos e pastas) de uma pasta específica.
 */
export const getGalleryItems = async (parentId: string, userId: string, token: string): Promise<GalleryItem[]> => {
    const response = await fetch(`/api/gallery?parentId=${parentId}&userId=${userId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao buscar itens da galeria.');
    }

    const result = await response.json();
    return result as GalleryItem[];
};

/**
 * Deleta itens da galeria (arquivos e pastas).
 */
export const deleteItems = async (itemIds: string[], userId: string, token: string): Promise<void> => {
    const response = await fetch('/api/gallery/items', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemIds, userId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao deletar itens.');
    }
};

/**
 * Renomeia um item da galeria (arquivo ou pasta).
 */
export const renameItem = async (itemId: string, newName: string, token: string): Promise<void> => {
    const response = await fetch(`/api/gallery/item/${itemId}/rename`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ newName }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao renomear item.');
    }
};

/**
 * Move itens da galeria para uma nova pasta.
 */
export const moveItems = async (itemIds: string[], destinationFolderId: string, token: string): Promise<void> => {
    const response = await fetch('/api/gallery/move', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemIds, destinationFolderId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao mover itens.');
    }
};

/**
 * Obtém o caminho de uma pasta (lista de ancestrais).
 */
export const getPath = async (folderId: string, token: string): Promise<{id: string, name: string}[]> => {
    const response = await fetch(`/api/gallery/path?folderId=${folderId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao obter o caminho da pasta.');
    }

    const result = await response.json();
    return result as {id: string, name: string}[];
};

/**
 * Obtém todos os arquivos da galeria para um usuário específico.
 */
export const getAllFiles = async (userId: string, isAdmin: boolean, token: string): Promise<GalleryFile[]> => {
    const response = await fetch(`/api/gallery/all-files?userId=${userId}&isAdmin=${isAdmin}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao buscar todos os arquivos.');
    }

    const result = await response.json();
    return result as GalleryFile[];
};

/**
 * Restaura itens da lixeira.
 */
export const restoreItems = async (itemIds: string[], token: string): Promise<void> => {
    const response = await fetch('/api/gallery/restore', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemIds }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao restaurar itens.');
    }
};

/**
 * Encontra ou cria a pasta da lixeira para um usuário.
 */
export const findOrCreateTrashFolder = async (userId: string, token: string): Promise<GalleryFolder> => {
    const response = await fetch('/api/gallery/trash-folder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao encontrar ou criar a lixeira.');
    }

    const result = await response.json();
    return result as GalleryFolder;
};
