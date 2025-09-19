/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { PhotoIcon, XMarkIcon } from './icons';

// Reusable simple uploader for the modal
const SimpleImageUploader: React.FC<{ file: File | null, onFileChange: (file: File | null) => void, label: string, disabled: boolean }> = ({ file, onFileChange, label, disabled }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    return (
        <div className="flex flex-col items-center gap-1">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <input type="file" accept="image/*" ref={inputRef} onChange={e => onFileChange(e.target.files?.[0] || null)} className="hidden" disabled={disabled} />
            <div
                onClick={() => inputRef.current?.click()}
                className={`relative w-32 h-32 rounded-lg border-2 border-dashed flex items-center justify-center text-center transition-colors ${
                    disabled ? 'cursor-not-allowed bg-gray-200' : 'cursor-pointer bg-gray-100 hover:border-blue-500 hover:bg-blue-50'
                }`}
            >
                {previewUrl ? (
                    <>
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-contain rounded-md p-1" />
                        <button onClick={e => { e.stopPropagation(); onFileChange(null); }} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md"><XMarkIcon className="w-4 h-4" /></button>
                    </>
                ) : (
                    <div className="text-gray-500 p-2">
                        <PhotoIcon className="w-8 h-8 mx-auto" />
                        <span className="text-xs mt-1 block">Selecionar Imagem</span>
                    </div>
                )}
            </div>
        </div>
    );
};


export interface AddProductData {
    baseName: string;
    fileFront: File | null;
    fileBack: File | null;
    fileTotalLook: File | null;
}

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddProduct: (data: AddProductData) => void;
}

const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onAddProduct }) => {
    const [baseName, setBaseName] = useState('');
    const [fileFront, setFileFront] = useState<File | null>(null);
    const [fileBack, setFileBack] = useState<File | null>(null);
    const [fileTotalLook, setFileTotalLook] = useState<File | null>(null);

    const resetState = () => {
        setBaseName('');
        setFileFront(null);
        setFileBack(null);
        setFileTotalLook(null);
    };

    const handleAdd = () => {
        if (!baseName.trim() || (!fileFront && !fileBack && !fileTotalLook)) {
            // Simple validation, could be improved with user feedback
            return;
        }
        onAddProduct({ baseName, fileFront, fileBack, fileTotalLook });
        resetState();
        onClose();
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleClose}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-gray-800 text-center">Adicionar Novo Produto à Fila</h2>
                <div>
                    <label htmlFor="baseName" className="block text-sm font-medium text-gray-700 mb-1">SKU / Nome Base do Produto</label>
                    <input
                        id="baseName"
                        type="text"
                        value={baseName}
                        onChange={e => setBaseName(e.target.value)}
                        placeholder="Ex: CAMISETA_LOGO_AZUL"
                        className="w-full bg-white border border-gray-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500"
                        required
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                    <SimpleImageUploader label="Imagem Crop Frente" file={fileFront} onFileChange={setFileFront} disabled={false} />
                    <SimpleImageUploader label="Imagem Crop Costas" file={fileBack} onFileChange={setFileBack} disabled={false} />
                    <SimpleImageUploader label="Imagem Total Look" file={fileTotalLook} onFileChange={setFileTotalLook} disabled={false} />
                </div>
                <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                    <button onClick={handleClose} className="bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition-colors">Cancelar</button>
                    <button
                        onClick={handleAdd}
                        disabled={!baseName.trim() || (!fileFront && !fileBack && !fileTotalLook)}
                        className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Adicionar à Fila
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddProductModal;