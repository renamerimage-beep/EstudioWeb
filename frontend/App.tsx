/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Crop, PixelCrop } from 'react-image-crop';
import { getAuth, signOut, type User } from 'firebase/auth';
import { 
    generateEditedImage, generateModelImage, expandImage, 
    describeClothing, trainAgeCharacteristics, enhanceAndUpscaleImage 
} from './services/geminiService';
import { addImageToStorage, type StoredImage, createFolder, getGalleryItems } from './services/galleryService';
import { recordCompletion, getEstimateString } from './services/timingService';
import Header from './components/Header';
import GalleryView from './components/GalleryModal';
import PreviewModal from './components/PreviewModal';
import Editor from './components/Editor';
import { BatchProcessor } from './components/BatchProcessor';
import { PhotoIcon } from './components/icons';
import ReferenceBottomUploader from './components/ReferenceBottomUploader';
import CostCenter from './components/CostCenter';
import Login from './components/Login';
import UserManagementView from './components/UserManagementView';
import Spinner from './components/Spinner';

import { dataURLtoFile, fileToDataURL } from './src/utils/fileUtils.ts';
import { resizeAndPadDataUrl, standardizeToPNG } from './src/utils/imageUtils.ts';
import { useAuth } from "./src/contexts/AuthContext.tsx";
import { auth } from './src/services/firebase';

export type AppView = 'upload' | 'editor' | 'gallery' | 'costs' | 'users';

export type Gender = 'male' | 'female' | 'baby' | 'newborn';
export type Status = 'queued' | 'processing' | 'done' | 'error';
export type EditorTab = 'retouch' | 'crop' | 'model';
export type ModelAge = 'adult' | 'teenager' | 'child' | 'baby' | 'newborn';

export interface QueueItem {
    id: string;
    baseName: string;
    status: Status;
    fileFront?: File;
    fileBack?: File;
    fileTotalLook?: File;
    objectUrlFront?: string;
    objectUrlBack?: string;
    objectUrlTotalLook?: string;
    availableFiles: File[];
    availableUrls: string[];
    resultFiles?: File[];
    error?: string;
    resultObjectUrls?: string[];
    metadata?: Record<string, string>;
    parentId?: string;
    progressStatus?: string;
    progressPercentage?: number;
    isDescribing?: boolean;
    aiStructuredDescription?: Record<string, string>;
    clothingNotes?: string;
    currentViewIndex: number;
    isComparing: boolean;
    excelMatch?: boolean;
    modelGender?: 'male' | 'female';
    modelAge?: string;
}

export interface CorrectionComparison {
    before: File;
    after: File;
    points: { x: number; y: number; description: string }[];
}

interface SharedSettingsContextType {
    maleReferenceModelFile: File | null;
    setMaleReferenceModelFile: React.Dispatch<React.SetStateAction<File | null>>;
    femaleReferenceModelFile: File | null;
    setFemaleReferenceModelFile: React.Dispatch<React.SetStateAction<File | null>>;
    referenceSceneFile: File | null;
    setReferenceSceneFile: React.Dispatch<React.SetStateAction<File | null>>;
    referenceFitFile: File | null;
    setReferenceFitFile: React.Dispatch<React.SetStateAction<File | null>>;
    maleReferenceBottomFile: File | null;
    setMaleReferenceBottomFile: React.Dispatch<React.SetStateAction<File | null>>;
    femaleReferenceBottomFile: File | null;
    setFemaleReferenceBottomFile: React.Dispatch<React.SetStateAction<File | null>>;
    isAnalyzingMaleBottom: boolean;
    maleReferenceBottomDescription: Record<string, string> | null;
    isAnalyzingFemaleBottom: boolean;
    femaleReferenceBottomDescription: Record<string, string> | null;
}

export const SharedSettingsContext = React.createContext<SharedSettingsContextType | null>(null);


const App: React.FC = () => {
  const { currentUser, loading, getToken } = useAuth();

  // Common State (shared between Editor and Batch)
  const [maleReferenceModelFile, setMaleReferenceModelFile] = useState<File | null>(null);
  const [femaleReferenceModelFile, setFemaleReferenceModelFile] = useState<File | null>(null);
  const [referenceSceneFile, setReferenceSceneFile] = useState<File | null>(null);
  const [referenceFitFile, setReferenceFitFile] = useState<File | null>(null);
  const [maleReferenceBottomFile, setMaleReferenceBottomFile] = useState<File | null>(null);
  const [femaleReferenceBottomFile, setFemaleReferenceBottomFile] = useState<File | null>(null);
  const [isAnalyzingMaleBottom, setIsAnalyzingMaleBottom] = useState(false);
  const [isAnalyzingFemaleBottom, setIsAnalyzingFemaleBottom] = useState(false);
  const [maleReferenceBottomDescription, setMaleReferenceBottomDescription] = useState<Record<string, string> | null>(null);
  const [femaleReferenceBottomDescription, setFemaleReferenceBottomDescription] = useState<Record<string, string> | null>(null);
  const [descriptionCache, setDescriptionCache] = useState(new Map<string, Record<string, string>>());
  
  // Editor State (Single Image Focus)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('retouch');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<{ message: string; percentage: number, estimate?: string } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [targetDimensions, setTargetDimensions] = useState({ width: '2000', height: '2000' });
  const [modelNotes, setModelNotes] = useState('');
  const [editorNegativePrompt, setEditorNegativePrompt] = useState('');
  const [editorModelAge, setEditorModelAge] = useState<{ male: string, female: string }>({ male: 'adult', female: 'adult' });
  const [editorModelGender, setEditorModelGender] = useState<'male' | 'female'>('female');
  const [currentImageProjectId, setCurrentImageProjectId] = useState<string>('root');
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [maskMode, setMaskMode] = useState<'brush' | 'eraser'>('brush');
  
  // App-level State
  const [view, setView] = useState<AppView>('upload');
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isGeneratorSession, setIsGeneratorSession] = useState(false);

  // Batch Processor State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [batchClothingNotes, setBatchClothingNotes] = useState('');
  const [batchSceneNotes, setBatchSceneNotes] = useState('');
  const [batchModelNotes, setBatchModelNotes] = useState({
    adult: { male: '', female: '' },
    teenager: { male: '', female: '' },
    child: { male: '', female: '' },
    baby: '',
    newborn: '',
  });
  const [batchModelAge, setBatchModelAge] = useState<{ male: string, female: string }>({ male: '30 anos', female: '30 anos' });
  const [batchModelGender, setBatchModelGender] = useState<'male' | 'female'>('female');
  const [batchTargetDimensions, setBatchTargetDimensions] = useState({ width: '2000', height: '2000' });
  const [excelData, setExcelData] = useState<Map<string, Record<string, string>> | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);

  // AI Agent State
  const [trainedAgeData, setTrainedAgeData] = useState(new Map<string, string>());
  const [isTrainingAgent, setIsTrainingAgent] = useState<Set<string>>(new Set());

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;
  
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  const [previewableImage, setPreviewableImage] = useState<StoredImage | null>(null);
  
  useEffect(() => {
    let active = true;
    const generatePreviewableImage = async () => {
        if (currentImage && currentUser) {
            const dataUrl = await fileToDataURL(currentImage);
            const originalUrl = originalImage ? await fileToDataURL(originalImage) : undefined;
            const storedImage: StoredImage = {
                id: `preview-${historyIndex}`,
                type: 'file',
                parentId: currentImageProjectId,
                userId: currentUser.uid,
                url: dataUrl, // Not a stored image
                storagePath: '',
                name: currentImage.name,
                size: currentImage.size,
                timestamp: currentImage.lastModified,
                originalUrl,
            };
            if (active) setPreviewableImage(storedImage);
        } else {
            if (active) setPreviewableImage(null);
        }
    };
    generatePreviewableImage();
    return () => { active = false; };
  }, [currentImage, originalImage, historyIndex, currentImageProjectId, currentUser]);


  useEffect(() => {
    if (femaleReferenceBottomFile && currentUser) {
        const fileKey = `${femaleReferenceBottomFile.name}-${femaleReferenceBottomFile.size}-${femaleReferenceBottomFile.lastModified}`;

        if (descriptionCache.has(fileKey)) {
            setFemaleReferenceBottomDescription(descriptionCache.get(fileKey)!);
            setIsAnalyzingFemaleBottom(false);
            return;
        }

        const analyze = async () => {
            setIsAnalyzingFemaleBottom(true);
            setFemaleReferenceBottomDescription(null);
            try {
                const desc = await describeClothing([femaleReferenceBottomFile], currentUser.uid);
                setFemaleReferenceBottomDescription(desc);
                setDescriptionCache(prevCache => new Map(prevCache).set(fileKey, desc));
            } catch (error) {
                console.error("Failed to analyze female complementary piece:", error);
                const errorMessage = { "Erro": "Falha ao analisar a imagem." };
                setFemaleReferenceBottomDescription(errorMessage);
                setDescriptionCache(prevCache => new Map(prevCache).set(fileKey, errorMessage));
            } finally {
                setIsAnalyzingFemaleBottom(false);
            }
        };
        analyze();
    } else {
        setIsAnalyzingFemaleBottom(false);
        setFemaleReferenceBottomDescription(null);
    }
  }, [femaleReferenceBottomFile, descriptionCache, currentUser]);

  useEffect(() => {
    if (maleReferenceBottomFile && currentUser) {
        const fileKey = `${maleReferenceBottomFile.name}-${maleReferenceBottomFile.size}-${maleReferenceBottomFile.lastModified}`;

        if (descriptionCache.has(fileKey)) {
            setMaleReferenceBottomDescription(descriptionCache.get(fileKey)!);
            setIsAnalyzingMaleBottom(false);
            return;
        }

        const analyze = async () => {
            setIsAnalyzingMaleBottom(true);
            setMaleReferenceBottomDescription(null);
            try {
                const desc = await describeClothing([maleReferenceBottomFile], currentUser.uid);
                setMaleReferenceBottomDescription(desc);
                setDescriptionCache(prevCache => new Map(prevCache).set(fileKey, desc));
            } catch (error) {
                console.error("Failed to analyze male complementary piece:", error);
                const errorMessage = { "Erro": "Falha ao analisar a imagem." };
                setMaleReferenceBottomDescription(errorMessage);
                setDescriptionCache(prevCache => new Map(prevCache).set(fileKey, errorMessage));
            } finally {
                setIsAnalyzingMaleBottom(false);
            }
        };
        analyze();
    } else {
        setIsAnalyzingMaleBottom(false);
        setMaleReferenceBottomDescription(null);
    }
  }, [maleReferenceBottomFile, descriptionCache, currentUser]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const addImageToHistory = useCallback((newImageFile: File) => {
    if (!newImageFile) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setIsComparing(false);
  }, [history, historyIndex]);

  const resetEditorState = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    setError(null);
    setPrompt('');
    setEditHotspot(null);
    setDisplayHotspot(null);
    setIsComparing(false);
    setActiveTab('retouch');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setMaleReferenceModelFile(null);
    setFemaleReferenceModelFile(null);
    setReferenceSceneFile(null);
    setReferenceFitFile(null);
    setMaleReferenceBottomFile(null);
    setFemaleReferenceBottomFile(null);
    setTargetDimensions({ width: '2000', height: '2000' });
    setModelNotes('');
    setEditorNegativePrompt('');
    setEditorModelAge({ male: '30 anos', female: '30 anos' });
    setLoadingStatus(null);
    setIsGeneratorSession(false);
    setCurrentImageProjectId('root');
    setMaskDataUrl(null);
    setBrushSize(30);
    setMaskMode('brush');
  }, []);

  const startEditorSession = useCallback((file: File, isGenerator: boolean) => {
    resetEditorState();
    setHistory([file]);
    setHistoryIndex(0);
    setIsGeneratorSession(isGenerator);
    if (isGenerator) {
        setActiveTab('model');
    }
    setView('editor');
  }, [resetEditorState]);

  const handleProgress = (message: string, percentage: number) => {
    setLoadingStatus(prev => ({ ...(prev!), message, percentage }));
  };

  const handleTrainAgeAgent = useCallback(async (ageToTrain: string): Promise<string> => {
    if (!currentUser) throw new Error("Usuário não autenticado.");
    if (!ageToTrain.trim()) return "Características de idade não especificadas.";


    // Return from cache if available
    const existingData = trainedAgeData.get(ageToTrain);
    if (existingData) {
        return existingData;
    }

    // Prevent concurrent training for the same age
    if (isTrainingAgent.has(ageToTrain)) {
        // This part is tricky in React without a proper queuing system. For now, we'll just wait.
        // A better implementation would involve a promise map.
        await new Promise(resolve => setTimeout(resolve, 1000));
        return handleTrainAgeAgent(ageToTrain);
    }

    setIsTrainingAgent(prev => new Set(prev).add(ageToTrain));
    setError(null);
    try {
        console.log(`Training agent for age: ${ageToTrain}`);
        const characteristics = await trainAgeCharacteristics(ageToTrain, currentUser.uid);
        setTrainedAgeData(prev => new Map(prev).set(ageToTrain, characteristics));
        console.log(`Training complete for age: ${ageToTrain}`);
        return characteristics;
    } catch (err) {
        const errorMessage = `Falha ao treinar IA para a idade: ${ageToTrain}.`;
        console.error(errorMessage, err);
        setError(errorMessage);
        throw new Error(errorMessage);
    } finally {
        setIsTrainingAgent(prev => {
            const newSet = new Set(prev);
            newSet.delete(ageToTrain);
            return newSet;
        });
    }
  }, [currentUser, trainedAgeData, isTrainingAgent]);

  const handleGenerate = useCallback(async () => {
    if (!currentImage || !originalImage || !currentUser) return;
    if (!prompt.trim() || (!editHotspot && !maskDataUrl)) return;

    const startTime = Date.now();
    setIsLoading(true);
    setError(null);
    const estimate = getEstimateString({});
    setLoadingStatus({ message: 'Iniciando...', percentage: 0, estimate });
    
    try {
        const imageName = originalImage.name.replace(/\.[^/.]+$/, "");
        const originalImageUrl = await fileToDataURL(originalImage);
        const maskFile = maskDataUrl ? dataURLtoFile(maskDataUrl, 'mask.png') : null;
        
        const rawEditedImageUrl = await generateEditedImage(
            currentImage, prompt, editHotspot, maskFile, originalImage.name, currentUser.uid, handleProgress, currentImageProjectId
        );
        const editedImageUrl = await standardizeToPNG(rawEditedImageUrl);
        const newFileName = `${imageName}.png`;
        const token = await getToken();
        if (!token) throw new Error('Authentication token not available.');
        const editedImageFile = dataURLtoFile(editedImageUrl, newFileName);
        const originalImageFile = originalImage ? dataURLtoFile(originalImageUrl, originalImage.name) : undefined;
        console.log("Objeto File (editedImageFile) antes do upload:", editedImageFile);
        console.log("Mimetype do arquivo (editedImageFile):", editedImageFile.type);
        await addImageToStorage(editedImageFile, newFileName, currentUser.uid, token, originalImageFile, undefined, 'root');
        const newImageFile = dataURLtoFile(editedImageUrl, newFileName);

        const duration = Date.now() - startTime;
        recordCompletion({}, duration);
        
        addImageToHistory(newImageFile);

        setEditHotspot(null);
        setDisplayHotspot(null);
        setMaskDataUrl(null);
    } catch (err) {
        let errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        if (typeof errorMessage === 'string' && errorMessage.includes('RESOURCE_EXHAUSTED')) {
            errorMessage = 'Você excedeu sua cota de uso atual. Por favor, verifique seu plano e detalhes de faturamento. Pode ser necessário aguardar a redefinição do seu limite.';
        }
        setError(`Falha ao gerar o modelo. ${errorMessage}`);
    } finally {
        setTimeout(() => {
            setIsLoading(false);
            setLoadingStatus(null);
        }, 500);
    }
  }, [currentImage, originalImage, prompt, editHotspot, maskDataUrl, addImageToHistory, currentImageProjectId, currentUser, getToken]);
  
  const handleGenerateModel = useCallback(async (customPrompt: string, modelNotes: string, negativePrompt: string) => {
    if (!currentImage || !originalImage || !currentUser) return;
    
    const startTime = Date.now();
    setIsLoading(true);
    setError(null);
    const estimateParams = { width: targetDimensions.width, height: targetDimensions.height };
    const estimate = getEstimateString(estimateParams);
    setLoadingStatus({ message: 'Iniciando geração de modelo...', percentage: 0, estimate });
    
    try {
        const ageToGenerate = editorModelAge[editorModelGender];
        handleProgress('Verificando treinamento de IA...', 1);
        const ageCharacteristics = await handleTrainAgeAgent(ageToGenerate);
        
        handleProgress('Aprimorando imagem...', 2);
        const enhancedFile = await enhanceAndUpscaleImage(currentImage, originalImage.name, currentUser.uid, undefined, currentImageProjectId);

        const imageName = originalImage.name.replace(/\.[^/.]+$/, "");
        const referenceModelFile = editorModelGender === 'male' ? maleReferenceModelFile : femaleReferenceModelFile;
        const referenceBottomFile = editorModelGender === 'male' ? maleReferenceBottomFile : femaleReferenceBottomFile;
        const referenceBottomDescriptionObj = editorModelGender === 'male' ? maleReferenceBottomDescription : femaleReferenceBottomDescription;
        const referenceBottomDescriptionString = referenceBottomDescriptionObj
            ? Object.entries(referenceBottomDescriptionObj).map(([key, value]) => `${key}: ${value}`).join(', ')
            : undefined;
        
        const generatedImageUrl = await generateModelImage({
            clothingImage: enhancedFile,
            age: ageToGenerate,
            gender: editorModelGender,
            scenePrompt: customPrompt,
            referenceModelFile, 
            fitReferenceFile: referenceFitFile,
            referenceSceneFile,
            modelNotes: modelNotes,
            negativePrompt: negativePrompt,
            referenceBottomFile,
            referenceBottomDescription: referenceBottomDescriptionString,
            trainedCharacteristics: ageCharacteristics,
            imageName: originalImage.name,
            onProgress: handleProgress,
            startProgress: 20,
            projectId: currentImageProjectId,
            userId: currentUser.uid
        });
        
        let finalImageUrl = generatedImageUrl;
        const finalWidth = parseInt(targetDimensions.width, 10);
        const finalHeight = parseInt(targetDimensions.height, 10);

        if (!isNaN(finalWidth) && finalWidth > 0 && !isNaN(finalHeight) && finalHeight > 0) {
            handleProgress('Expandindo para o tamanho final...', 90);
            const tempGeneratedFile = dataURLtoFile(generatedImageUrl, `temp-${imageName}.png`);
            const expandedUrl = await expandImage(
                tempGeneratedFile, 
                finalWidth, 
                finalHeight, 
                originalImage.name, 
                currentUser.uid, 
                undefined, 
                currentImageProjectId
            );
            finalImageUrl = await resizeAndPadDataUrl(expandedUrl, finalWidth, finalHeight, 'crop');
        }
        
        const standardizedUrl = await standardizeToPNG(finalImageUrl);
        const originalImageUrl = await fileToDataURL(originalImage);
        const newFileName = `${imageName}.png`;
        const token = await getToken();
        if (!token) throw new Error('Authentication token not available.');
        const standardizedImageFile = dataURLtoFile(standardizedUrl, newFileName);
        const originalImageFile = originalImage ? dataURLtoFile(originalImageUrl, originalImage.name) : undefined;
        console.log("Objeto File (standardizedImageFile) antes do upload:", standardizedImageFile);
        console.log("Mimetype do arquivo (standardizedImageFile):", standardizedImageFile.type);
        await addImageToStorage(standardizedImageFile, newFileName, currentUser.uid, token, originalImageFile, undefined, 'root');
        const newImageFile = dataURLtoFile(standardizedUrl, newFileName);

        const duration = Date.now() - startTime;
        recordCompletion(estimateParams, duration);
        
        addImageToHistory(newImageFile);
    } catch (err) {
        let errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        if (typeof errorMessage === 'string' && errorMessage.includes('RESOURCE_EXHAUSTED')) {
            errorMessage = 'Você excedeu sua cota de uso atual. Por favor, verifique seu plano e detalhes de faturamento. Pode ser necessário aguardar a redefinição do seu limite.';
        }
        setError(`Falha ao gerar o modelo. ${errorMessage}`);
    } finally {
        setTimeout(() => {
            setIsLoading(false);
            setLoadingStatus(null);
        }, 500);
    }
}, [currentImage, originalImage, addImageToHistory, maleReferenceModelFile, femaleReferenceModelFile, referenceSceneFile, referenceFitFile, maleReferenceBottomFile, femaleReferenceBottomFile, targetDimensions, editorModelAge, editorModelGender, modelNotes, currentImageProjectId, currentUser, handleTrainAgeAgent, maleReferenceBottomDescription, femaleReferenceBottomDescription, editorNegativePrompt, getToken]);

  const handleApplyCrop = useCallback(async () => {
    if (!completedCrop || !imgRef.current || !originalImage || !currentUser || !currentImage) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, completedCrop.width, completedCrop.height,
    );
    
    const imageName = originalImage.name.replace(/\.[^/.]+$/, "");
    const originalImageUrl = await fileToDataURL(originalImage);
    const croppedImageUrl = canvas.toDataURL('image/png'); // Already PNG
    const newFileName = `${imageName}.png`;
    const token = await getToken();
    if (!token) throw new Error('Authentication token not available.');
    const croppedImageFile = dataURLtoFile(croppedImageUrl, newFileName);
    const originalImageFile = originalImage ? dataURLtoFile(originalImageUrl, originalImage.name) : undefined;
    await addImageToStorage(croppedImageFile, newFileName, currentUser.uid, token, originalImageFile, undefined, 'root');
    const newImageFile = dataURLtoFile(croppedImageUrl, newFileName);
    
    addImageToHistory(newImageFile);

  }, [completedCrop, originalImage, currentImage, addImageToHistory, currentUser, getToken]);

  const handleApplyResize = useCallback(async (width: number, height: number) => {
    if (!currentImage || !originalImage || !currentUser) return;

    const startTime = Date.now();
    setIsLoading(true);
    setError(null);
    const estimateParams = { width, height };
    const estimate = getEstimateString(estimateParams);
    setLoadingStatus({ message: 'Redimensionando com IA...', percentage: 0, estimate });

    try {
        const imageName = originalImage.name.replace(/\.[^/.]+$/, "");
        const originalImageUrl = await fileToDataURL(originalImage);

        // Always use expandImage for consistent, high-quality, non-cropping resize
        const expandedUrl = await expandImage(currentImage, width, height, originalImage.name, currentUser.uid, handleProgress, currentImageProjectId);
        const finalImageUrl = await resizeAndPadDataUrl(expandedUrl, width, height, 'crop');
        
        const newFileName = `${imageName}.png`;
        const token = await getToken();
        if (!token) throw new Error('Authentication token not available.');
        const finalImageFile = dataURLtoFile(finalImageUrl, newFileName);
        const originalImageFile = originalImage ? dataURLtoFile(originalImageUrl, originalImage.name) : undefined;
        await addImageToStorage(finalImageFile, newFileName, currentUser.uid, token, originalImageFile, undefined, 'root');
        const newImageFile = dataURLtoFile(finalImageUrl, newFileName);
        
        const duration = Date.now() - startTime;
        recordCompletion(estimateParams, duration);
        
        addImageToHistory(newImageFile);
    } catch (err) {
        let errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
        setError(`Falha ao redimensionar a imagem. ${errorMessage}`);
    } finally {
        setTimeout(() => {
            setIsLoading(false);
            setLoadingStatus(null);
        }, 500);
    }
}, [currentImage, originalImage, addImageToHistory, currentImageProjectId, currentUser, getToken]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setIsComparing(false);
    }
  }, [canUndo, historyIndex]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setIsComparing(false);
    }
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    if (canUndo) {
        setHistory([history[0]]);
        setHistoryIndex(0);
        setEditHotspot(null);
        setDisplayHotspot(null);
        setIsComparing(false);
        setCrop(undefined);
        setCompletedCrop(undefined);
    }
  }, [canUndo, history]);

  const handleSelectAnotherFromEditor = useCallback(() => {
      resetEditorState();
      // We stay on the 'editor' view, which will now show the placeholder
  }, [resetEditorState]);

  const handleDownload = useCallback(async (imageToDownload?: File | null) => {
    if (imageToDownload) {
        setLoadingStatus({ message: 'Preparando download...', percentage: 50 });
        try {
            const dataUrl = await fileToDataURL(imageToDownload);
            
            const link = document.createElement('a');
            link.href = dataUrl;
            const originalName = imageToDownload.name.replace(/\.[^/.]+$/, "");
            link.download = `${originalName}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setLoadingStatus({ message: 'Download iniciado!', percentage: 100 });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.';
            setError(`Falha ao preparar o download. ${errorMessage}`);
        } finally {
            setTimeout(() => {
              setLoadingStatus(null);
              setIsLoading(false);
            }, 1000);
        }
    }
  }, []);
  
  const handleLoadImageFromGallery = async (image: StoredImage) => {
    if (!currentUser) return;
    try {
        // We need to fetch the image data from the URL to create a File object
        const response = await fetch(image.url);
        const blob = await response.blob();
        const currentFile = new File([blob], image.name, { type: blob.type });
        
        startEditorSession(currentFile, false);
        setCurrentImageProjectId(image.parentId || 'root');
    } catch(err) {
        console.error("Failed to load image from gallery", err);
        setError("Não foi possível carregar a imagem da galeria.");
    }
  };

  const handleNavigate = (newView: AppView) => {
    setView(newView);
  }
  
  const handleLogout = () => {
    signOut(auth);
    resetEditorState();
    setQueue([]);
    setView('upload');
  };
  
  const onStartOver = useCallback(() => {
    resetEditorState();
    setView('upload');
  }, [resetEditorState]);

  const sharedSettings: SharedSettingsContextType = {
    maleReferenceModelFile, setMaleReferenceModelFile,
    femaleReferenceModelFile, setFemaleReferenceModelFile,
    referenceSceneFile, setReferenceSceneFile,
    referenceFitFile, setReferenceFitFile,
    maleReferenceBottomFile, setMaleReferenceBottomFile,
    femaleReferenceBottomFile, setFemaleReferenceBottomFile,
    isAnalyzingMaleBottom, maleReferenceBottomDescription,
    isAnalyzingFemaleBottom, femaleReferenceBottomDescription
  };

  const renderContent = () => {
    if (loading) {
        return <div className="flex-grow flex items-center justify-center"><Spinner /></div>;
    }

    if (!currentUser) {
        return <Login />;
    }

    if (error) {
        const isQuotaError = error.includes('excedeu sua cota');
        return (
           <div className="text-center animate-fade-in bg-red-100 border border-red-200 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-800">{isQuotaError ? 'Limite de Uso Atingido' : 'Ocorreu um Erro'}</h2>
            <p className="text-md text-red-700 whitespace-pre-line">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Tentar Novamente
            </button>
          </div>
        );
    }
    
    const editorProps = {
        // State
        currentImage, originalImage, isLoading, prompt, editHotspot, 
        displayHotspot, activeTab, crop, completedCrop, aspect, isComparing, canUndo, canRedo, 
        loadingStatus, targetDimensions, modelNotes,
        editorModelAge, editorModelGender, isTrainingAgent, trainedAgeData, currentImageProjectId,
        currentUser, currentImageUrl, editorNegativePrompt, getToken,
        maskDataUrl, brushSize, maskMode,
        // Handlers
        setPrompt, setEditHotspot, setDisplayHotspot, setActiveTab, setCrop, setCompletedCrop,
        setAspect, setIsComparing,
        setTargetDimensions, setModelNotes, 
        setEditorModelAge, setEditorModelGender,
        setEditorNegativePrompt,
        setMaskDataUrl, setBrushSize, setMaskMode,
        handleGenerate,
        handleGenerateModel, handleApplyCrop, handleApplyResize, handleUndo, handleRedo, handleReset,
        handleSelectAnother: handleSelectAnotherFromEditor,
        handleDownload: () => handleDownload(currentImage), onNavigateToGallery: () => setView('gallery'),
        onOpenPreview: () => setIsPreviewOpen(true),
        onLoadImage: (file: File) => startEditorSession(file, false),
        onLoadImageFromGallery: handleLoadImageFromGallery,
        // Refs
        imgRef,
    };

    switch (view) {
        case 'upload':
            return (
                <BatchProcessor 
                    currentUser={currentUser}
                    loading={isLoading}
                    onNavigateToGallery={() => setView('gallery')}
                    queue={queue}
                    setQueue={setQueue}
                    isProcessing={isBatchProcessing}
                    setIsProcessing={setIsBatchProcessing}
                    clothingNotes={batchClothingNotes}
                    setClothingNotes={setBatchClothingNotes}
                    sceneNotes={batchSceneNotes}
                    setSceneNotes={setBatchSceneNotes}
                    batchModelNotes={batchModelNotes}
                    setBatchModelNotes={setBatchModelNotes}
                    modelAge={batchModelAge}
                    setModelAge={setBatchModelAge}
                    modelGender={batchModelGender}
                    setModelGender={setBatchModelGender}
                    targetDimensions={batchTargetDimensions}
                    setTargetDimensions={setBatchTargetDimensions}
                    excelData={excelData}
                    setExcelData={setExcelData}
                    excelFileName={excelFileName}
                    setExcelFileName={setExcelFileName}
                    isTrainingAgent={isTrainingAgent}
                    trainedAgeData={trainedAgeData}
                    handleTrainAgeAgent={handleTrainAgeAgent}
                    getToken={getToken}
                />
            );
        case 'gallery':
            return <GalleryView onLoadImage={handleLoadImageFromGallery} currentUser={currentUser} currentView={view} getToken={getToken} />;
        case 'editor':
            return <Editor {...editorProps} isGeneratorMode={isGeneratorSession} onStartOver={onStartOver} />;
        case 'costs':
            return <CostCenter currentUser={currentUser} getToken={getToken} />;
        case 'users':
            return <UserManagementView getToken={getToken} />;
    }
  };
  
  return (
    <SharedSettingsContext.Provider value={sharedSettings}>
        <div className="min-h-screen text-gray-900 flex flex-col">
          {currentUser && <Header currentView={view} onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />}
          <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center items-start`}>
            {renderContent()}
          </main>
          {currentImage && previewableImage && (
              <PreviewModal
                  isOpen={isPreviewOpen}
                  onClose={() => setIsPreviewOpen(false)}
                  images={[previewableImage]}
                  startIndex={0}
              />
          )}
        </div>
    </SharedSettingsContext.Provider>
  );
};

export default App;