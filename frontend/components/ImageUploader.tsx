// components/ImageUploader.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../src/contexts/AuthContext'; // Importa nosso hook

const ImageUploader: React.FC = () => {
  const { getToken, currentUser } = useAuth(); // Usa o contexto de autenticação
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadedFile(acceptedFiles[0]);
      setUploadStatus('idle');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleUpload = async () => {
    if (!uploadedFile) return;

    if (!currentUser) {
      setError('Você precisa estar logado para fazer o upload.');
      setUploadStatus('error');
      return;
    }

    setUploadStatus('uploading');
    setError(null);

    const formData = new FormData();
    formData.append('image', uploadedFile);

    try {
      const token = await getToken(); // Pega o token real do usuário logado
      if (!token) {
        throw new Error('Não foi possível obter o token de autenticação.');
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
        throw new Error(errorData.message || 'Falha no upload');
      }

      setUploadStatus('success');
      console.log('Upload bem-sucedido!', await response.json());

    } catch (err: any) {
      setUploadStatus('error');
      setError(err.message || 'Ocorreu um erro desconhecido.');
      console.error(err);
    }
  };

  return (
    <div>
      <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}>
        <input {...getInputProps()} />
        {
          uploadedFile ? (
            <div>
              <p className="font-semibold">{uploadedFile.name}</p>
              <img src={URL.createObjectURL(uploadedFile)} alt="Preview" className="mt-4 max-h-40 mx-auto" />
            </div>
          ) : (
            <p>{isDragActive ? "Solte a imagem aqui..." : "Arraste e solte a imagem aqui, ou clique para selecionar"}</p>
          )
        }
      </div>

      {uploadedFile && (
        <div className="mt-4 text-center">
          <button 
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading'}
            className="bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {uploadStatus === 'uploading' ? 'Enviando...' : 'Fazer Upload'}
          </button>
        </div>
      )}

      {uploadStatus === 'success' && <p className="text-green-600 mt-2 text-center">Upload realizado com sucesso!</p>}
      {uploadStatus === 'error' && <p className="text-red-600 mt-2 text-center">Erro: {error}</p>}
    </div>
  );
};

export default ImageUploader;