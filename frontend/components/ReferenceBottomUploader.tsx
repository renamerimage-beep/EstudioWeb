// components/ReferenceBottomUploader.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../src/contexts/AuthContext';

const ReferenceBottomUploader: React.FC = () => {
  const { getToken, currentUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUploadStatus('idle');
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleUpload = async () => {
    if (!file) return;
    if (!currentUser) {
      setError('Você precisa estar logado para fazer o upload.');
      setUploadStatus('error');
      return;
    }

    setUploadStatus('uploading');
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('name', 'reference-bottom'); // Identificador para o backend

    try {
      const token = await getToken();
      if (!token) throw new Error('Token de autenticação não encontrado.');

      const response = await fetch('/api/gallery/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha no upload');
      }

      setUploadStatus('success');
    } catch (err: any) {
      setUploadStatus('error');
      setError(err.message);
    }
  };

  return (
    <div className="border-dashed border-2 p-4 rounded-md text-center bg-gray-50">
      <div {...getRootProps()} className="cursor-pointer">
        <input {...getInputProps()} />
        {file ? (
          <p className="text-sm text-gray-700">{file.name}</p>
        ) : (
          <p className="text-sm text-gray-500">Referência de Peça (Inferior)</p>
        )}
      </div>
      {file && (
        <div className="mt-2">
          <button onClick={handleUpload} disabled={uploadStatus === 'uploading'} className="text-xs bg-blue-500 text-white py-1 px-2 rounded hover:bg-blue-600 disabled:bg-gray-300">
            {uploadStatus === 'uploading' ? 'Enviando...' : 'Upload'}
          </button>
        </div>
      )}
      {uploadStatus === 'success' && <p className="text-xs text-green-600 mt-1">Enviado!</p>}
      {uploadStatus === 'error' && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
};

export default ReferenceBottomUploader;
