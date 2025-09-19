/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { getGalleryItems, type StoredImage } from '../services/galleryService';
import { type User } from '../services/userService';
import { UploadIcon } from './icons';

interface EditorGalleryPlaceholderProps {
  onLoadImageFromGallery: (image: StoredImage) => void;
  onLoadImage: (file: File) => void;
  currentUser: User;
  getToken: () => Promise<string | null>;
}

const EditorGalleryPlaceholder: React.FC<EditorGalleryPlaceholderProps> = ({ onLoadImageFromGallery, onLoadImage, currentUser, getToken }) => {
    const [images, setImages] = useState<StoredImage[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    useEffect(() => {
        const fetchImages = async () => {
            const token = await getToken();
            if (!token || !currentUser) return;
            getGalleryItems('root', currentUser.uid, token).then(items => {
                const imageFiles = items.filter(item => item.type === 'file') as StoredImage[];
                setImages(imageFiles);
            });
        };
        fetchImages();
    }, [currentUser, getToken]);

    const handleFiles = (files: FileList | null) => {
        if (files && files.length > 0) {
            onLoadImage(files[0]);
        }
    };
    
    return (
        <div className="w-full bg-gray-100 p-4 rounded-xl border border-gray-200 flex flex-col gap-4">
            <div 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); handleFiles(e.dataTransfer.files); }}
                className={`relative w-full aspect-video flex flex-col items-center justify-center text-center p-8 rounded-xl border-2 border-dashed transition-colors ${isDraggingOver ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-300'}`}
            >
                <UploadIcon className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-bold text-gray-700">Começar a Editar ou Gerar</h3>
                <p className="text-gray-500 mt-2">Arraste e solte uma imagem para editar ou para usar como base para um novo modelo.</p>
                 <input 
                    type="file" 
                    onChange={(e) => handleFiles(e.target.files)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>

            {images.length > 0 && (
                 <>
                    <div className="flex items-center">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink mx-4 text-sm font-semibold text-gray-500">OU</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Edite uma Imagem da Galeria</h3>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[40vh] overflow-y-auto">
                            {images.map(image => (
                                <div
                                    key={image.id}
                                    className="relative aspect-square bg-gray-200 rounded-lg shadow-sm overflow-hidden group cursor-pointer"
                                    onClick={() => onLoadImageFromGallery(image)}
                                >
                                    <img src={image.url} alt={image.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                                        <p className="text-white text-xs font-bold text-center truncate">{image.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                 </>
            )}
        </div>
    );
};

export default EditorGalleryPlaceholder;
