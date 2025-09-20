/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { useAuth } from '../src/contexts/AuthContext';
import * as XLSX from 'xlsx';
import { generateModelImage, enhanceAndUpscaleImage, describeClothing, expandImage } from '../services/geminiService';
import { addImageToStorage, findOrCreateFolder, type StoredImage } from '../services/galleryService';
import { type User } from '../services/userService';
import { getEstimateMs, recordCompletion, formatDuration } from '../services/timingService';
import { type QueueItem, type ModelAge, SharedSettingsContext } from '../App';
import { dataURLtoFile } from "../src/utils/fileUtils.ts";
import { standardizeToPNG, resizeAndPadDataUrl } from "../src/utils/imageUtils.ts";
import { UploadIcon, TrashIcon, PhotoIcon, DocumentArrowUpIcon, LockClosedIcon, LockOpenIcon, ArrowPathIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, UserIcon, ArrowDownTrayIcon, PlusIcon, SparklesIcon, XMarkIcon } from './icons';
import Spinner from './Spinner';
import ReferenceModelUploader from './ReferenceModelUploader';
import ReferenceSceneUploader from './ReferenceSceneUploader';
import ReferenceBottomUploader from './ReferenceBottomUploader';
import PreviewModal from './PreviewModal';
import AddProductModal, { type AddProductData } from './AddProductModal';
import ImageComparator from './ImageComparator';


const CONCURRENCY_LIMIT = 3;

// HELPER: Normalizes a SKU string for reliable matching.
const normalizeSku = (sku: any): string => {
    if (sku === null || sku === undefined) return '';
    return String(sku)
        // 1. Trim leading/trailing whitespace (including non-breaking spaces like BOM)
        .replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '')
        // 2. Standardize various dash/hyphen characters and spaces to a single underscore
        .replace(/[\u2010-\u2015\s-]+/g, '_')
        // 3. Convert to uppercase for case-insensitive matching
        .toUpperCase();
};


// HELPER: Extracts the base name (potential SKU) from a file name by stripping view suffixes.
const getBaseName = (fileName: string): string => {
    let baseName = fileName.replace(/\.[^/.]+$/, '').trim();

    let hasChanged = true;
    while (hasChanged) {
        hasChanged = false;
        
        const originalBaseName = baseName;

        // Try removing text suffixes first
        const textSuffixes = ['_frente', '_costas', '_back', '_front', '_total_look', '_detalhe', '_side', '_lado'];
        for (const suffix of textSuffixes) {
            if (baseName.toLowerCase().endsWith(suffix)) {
                baseName = baseName.slice(0, -suffix.length);
                break;
            }
        }
        if (baseName !== originalBaseName) {
            hasChanged = true;
            continue;
        }

        // If no text suffix was removed, try removing a numeric suffix
        const numericMatch = baseName.match(/_(\d{1,2})$/);
        if (numericMatch) {
             baseName = baseName.slice(0, -numericMatch[0].length);
             hasChanged = true;
             continue;
        }
    }

    return baseName;
};

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Falha ao ler o arquivo para data URL: ${reader.error?.message || 'Erro desconhecido'}`));
        reader.readAsDataURL(file);
    });
};

interface BatchModelNotes {
    adult: { male: string; female: string; };
    teenager: { male: string; female: string; };
    child: { male: string; female: string; };
    baby: string;
    newborn: string;
}


interface BatchPreset {
    name: string;
    settings: {
        clothingNotes: string;
        sceneNotes: string;
        negativePrompt: string;
        sceneTheme: string;
        modelNotes: BatchModelNotes;
        modelAge: { male: string, female: string };
        modelGender: 'male' | 'female';
        targetDimensions: { width: string; height: string };
        generationStyle: 'ecommerce' | 'editorial';
        brand: string;
    }
}

interface BatchProcessorProps {
    currentUser: User;
    loading: boolean;
    onNavigateToGallery: () => void;
    queue: QueueItem[];
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
    isProcessing: boolean;
    setIsProcessing: (isProcessing: boolean) => void;
    clothingNotes: string;
    setClothingNotes: (notes: string) => void;
    sceneNotes: string;
    setSceneNotes: (notes: string) => void;
    batchModelNotes: BatchModelNotes;
    setBatchModelNotes: React.Dispatch<React.SetStateAction<BatchModelNotes>>;
    modelAge: { male: string, female: string };
    setModelAge: (age: { male: string, female: string }) => void;
    modelGender: 'male' | 'female';
    setModelGender: (gender: 'male' | 'female') => void;
    targetDimensions: { width: string; height: string };
    setTargetDimensions: React.Dispatch<React.SetStateAction<{ width: string; height: string }>>;
    excelData: Map<string, Record<string, string>> | null;
    setExcelData: (data: Map<string, Record<string, string>> | null) => void;
    excelFileName: string | null;
    setExcelFileName: (name: string | null) => void;
    isTrainingAgent: Set<string>;
    trainedAgeData: Map<string, string>;
    handleTrainAgeAgent: (age: string) => Promise<string>;
}

const AccordionSection: React.FC<{ title: string; icon: React.ComponentType<{className?: string}>; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, icon: Icon, children, defaultOpen = false }) => (
    <details className="group border border-gray-200 bg-white rounded-lg" open={defaultOpen}>
        <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
            <div className="flex items-center gap-3">
                <Icon className="w-6 h-6 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            </div>
            <ChevronRightIcon className="w-5 h-5 text-gray-500 transition-transform duration-200 group-open:rotate-90" />
        </summary>
        <div className="p-4 border-t border-gray-200">
            {children}
        </div>
    </details>
);



export const BatchProcessor: React.FC<BatchProcessorProps> = (props) => {
    const {
        currentUser, onNavigateToGallery,
        queue, setQueue, isProcessing, setIsProcessing, clothingNotes, setClothingNotes,
        sceneNotes, setSceneNotes, batchModelNotes, setBatchModelNotes, modelAge, setModelAge, 
        modelGender, setModelGender,
        targetDimensions, setTargetDimensions, excelData, setExcelData, excelFileName, setExcelFileName,
        isTrainingAgent, trainedAgeData, handleTrainAgeAgent
    } = props;

    const { getToken } = useAuth();
    const sharedSettings = useContext(SharedSettingsContext);

    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);
    const [previewState, setPreviewState] = useState<{isOpen: boolean, items: StoredImage[], index: number}>({isOpen: false, items: [], index: 0});
    const [processingTimes, setProcessingTimes] = useState<number[]>([]);
    const [etr, setEtr] = useState<string>('');
    const [sceneTheme, setSceneTheme] = useState('');
    const [presets, setPresets] = useState<BatchPreset[]>([]);
    const [newPresetName, setNewPresetName] = useState('');
    const [generationStyle, setGenerationStyle] = useState<'ecommerce' | 'editorial'>('ecommerce');
    const [brand, setBrand] = useState('');
    const [batchNegativePrompt, setBatchNegativePrompt] = useState('');
    const [selectedViews, setSelectedViews] = useState<string[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    const isBatchCancelled = useRef(false);
    const cancelledSingleItems = useRef(new Set<string>());
    const dragItem = useRef<string | null>(null);
    const dragOverItem = useRef<string | null>(null);
    
    if (!sharedSettings) return null; // Should not happen
    
    const { 
        maleReferenceModelFile, setMaleReferenceModelFile,
        femaleReferenceModelFile, setFemaleReferenceModelFile,
        referenceSceneFile, setReferenceSceneFile,
        referenceFitFile, setReferenceFitFile,
        maleReferenceBottomFile, setMaleReferenceBottomFile,
        femaleReferenceBottomFile, setFemaleReferenceBottomFile,
        isAnalyzingMaleBottom, maleReferenceBottomDescription,
        isAnalyzingFemaleBottom, femaleReferenceBottomDescription
    } = sharedSettings;
    
    const hasReferenceScene = !!referenceSceneFile;
    const agePresets: { id: ModelAge; label: string; representativeAge: string }[] = [
      { id: 'adult', label: 'Adulto', representativeAge: '30 anos' },
      { id: 'teenager', label: 'Adolescente', representativeAge: '16 anos' },
      { id: 'child', label: 'Criança', representativeAge: '8 anos' },
      { id: 'baby', label: 'Bebê', representativeAge: '1 ano' },
      { id: 'newborn', label: 'Recém-Nascido', representativeAge: 'Recém-nascido' },
    ];
    const currentAgeForGender = modelAge[modelGender];

    const handleAgeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setModelAge({ ...modelAge, [modelGender]: e.target.value });
    };

    const handleGlobalOrItemAgeChange = (age: string) => {
        if (selectedItemId) {
            setQueue(prevQueue => prevQueue.map(item =>
                item.id === selectedItemId ? { ...item, modelAge: age } : item
            ));
        } else {
            setModelAge(prev => ({ ...prev, [modelGender]: age }));
        }
    };

    const handleGlobalOrItemGenderChange = (gender: 'male' | 'female') => {
        if (selectedItemId) {
            setQueue(prevQueue => prevQueue.map(item =>
                item.id === selectedItemId ? { ...item, modelGender: gender } : item
            ));
        } else {
            setModelGender(gender);
        }
    };

    const analyzeItems = useCallback(async (itemsToAnalyze: QueueItem[]) => {
        const itemsWithPrimaryImage = itemsToAnalyze.filter(item => item.availableFiles.length > 0);
        if (itemsWithPrimaryImage.length === 0) return;

        setQueue(prev => prev.map(item => itemsWithPrimaryImage.find(i => i.id === item.id) ? { ...item, isDescribing: true } : item ));

        const results = await Promise.allSettled(
            itemsWithPrimaryImage.map(item => describeClothing(item.availableFiles, currentUser.id, getToken))
        );

        setQueue(prev => {
            const newQueue = [...prev];
            itemsWithPrimaryImage.forEach((item, index) => {
                const result = results[index];
                const queueIndex = newQueue.findIndex(q => q.id === item.id);
                if (queueIndex !== -1) {
                    if (result.status === 'fulfilled') {
                        newQueue[queueIndex] = { ...newQueue[queueIndex], aiStructuredDescription: result.value, isDescribing: false };
                    } else {
                        console.error(`Failed to describe item ${item.baseName}`, result.reason);
                        newQueue[queueIndex] = { ...newQueue[queueIndex], aiStructuredDescription: { "Erro": "Falha na análise." }, isDescribing: false };
                    }
                }
            });
            return newQueue;
        });
    }, [currentUser.id, setQueue]);

    const handleAddProduct = useCallback(async (data: AddProductData) => {
        const { baseName, fileFront, fileBack, fileTotalLook } = data;
        if (!baseName.trim() || (!fileFront && !fileBack && !fileTotalLook)) {
            return;
        }
        
        const normalizedBaseName = normalizeSku(baseName);
        const objectUrlFront = fileFront ? URL.createObjectURL(fileFront) : undefined;
        const objectUrlBack = fileBack ? URL.createObjectURL(fileBack) : undefined;
        const objectUrlTotalLook = fileTotalLook ? URL.createObjectURL(fileTotalLook) : undefined;


        const availableFiles: File[] = [];
        const availableUrls: string[] = [];

        if (fileFront) { availableFiles.push(fileFront); availableUrls.push(objectUrlFront!); }
        if (fileBack) { availableFiles.push(fileBack); availableUrls.push(objectUrlBack!); }
        if (fileTotalLook) { availableFiles.push(fileTotalLook); availableUrls.push(objectUrlTotalLook!); }

        const newItem: QueueItem = {
            id: `${normalizedBaseName}-${Date.now()}-${Math.random()}`,
            baseName: baseName.trim(), // Use original name for display
            status: 'queued',
            fileFront: fileFront || undefined,
            fileBack: fileBack || undefined,
            fileTotalLook: fileTotalLook || undefined,
            objectUrlFront,
            objectUrlBack,
            objectUrlTotalLook,
            availableFiles,
            availableUrls,
            metadata: excelData?.get(normalizedBaseName),
            excelMatch: excelData?.has(normalizedBaseName),
            isDescribing: availableFiles.length > 0,
            currentViewIndex: 0,
            isComparing: false,
        };

        setQueue(prev => [...prev, newItem]);
        if (newItem.isDescribing) {
            analyzeItems([newItem]);
        }
    }, [excelData, setQueue, analyzeItems]);
    
    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const fileGroups = new Map<string, { rawBaseName: string, files: File[] }>();
        for (const file of Array.from(files)) {
            const rawBaseName = getBaseName(file.name);
            const groupKey = normalizeSku(rawBaseName);

            if (!fileGroups.has(groupKey)) {
                fileGroups.set(groupKey, { rawBaseName, files: [] });
            }
            fileGroups.get(groupKey)!.files.push(file);
        }

        const newItems: QueueItem[] = [];
        for (const [groupKey, { rawBaseName, files: filesInGroup }] of fileGroups.entries()) {
            const availableUrls = await Promise.all(filesInGroup.map(file => URL.createObjectURL(file)));
            
            const newItem: QueueItem = {
                id: `${groupKey}-${Date.now()}-${Math.random()}`,
                baseName: rawBaseName,
                status: 'queued',
                availableFiles: filesInGroup,
                availableUrls: availableUrls,
                metadata: excelData?.get(groupKey),
                excelMatch: excelData?.has(groupKey),
                isDescribing: true,
                currentViewIndex: 0,
                isComparing: false,
            };
            newItems.push(newItem);
        }

        setQueue(prev => [...prev, ...newItems]);
        if (newItems.length > 0) {
            analyzeItems(newItems);
        }
    }, [excelData, setQueue, analyzeItems]);

    const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        handleFiles(e.dataTransfer.files);
    };


    useEffect(() => {
        try {
            const savedPresets = localStorage.getItem('pixshop-batch-presets');
            if (savedPresets) setPresets(JSON.parse(savedPresets));
        } catch (error) { console.error("Failed to load presets", error); }
    }, []);

    const savePresets = (newPresets: BatchPreset[]) => {
        try {
            localStorage.setItem('pixshop-batch-presets', JSON.stringify(newPresets));
            setPresets(newPresets);
        } catch (error) { console.error("Failed to save presets", error); }
    };

    const handleSavePreset = () => {
        if (!newPresetName.trim()) return;
        const newPreset: BatchPreset = {
            name: newPresetName.trim(),
            settings: { clothingNotes, sceneNotes, negativePrompt: batchNegativePrompt, sceneTheme, modelNotes: batchModelNotes, modelAge, modelGender, targetDimensions, generationStyle, brand }
        };
        savePresets([...presets, newPreset]);
        setNewPresetName('');
    };

    const handleLoadPreset = (presetName: string) => {
        const preset = presets.find(p => p.name === presetName);
        if (preset) {
            const { settings } = preset;
            setClothingNotes(settings.clothingNotes);
            setSceneNotes(settings.sceneNotes);
            setBatchNegativePrompt(settings.negativePrompt || '');
            setSceneTheme(settings.sceneTheme);
            setBatchModelNotes(settings.modelNotes);
            setModelAge(settings.modelAge);
            setModelGender(settings.modelGender);
            setTargetDimensions(settings.targetDimensions);
            setGenerationStyle(settings.generationStyle || 'ecommerce');
            setBrand(settings.brand || '');
        }
    };

    useEffect(() => {
        if (!isProcessing) {
            if (completedCount < queue.length) setEtr('');
            return;
        }
        if (processingTimes.length === 0) return;

        const averageTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
        const remainingCount = queue.length - completedCount;
        if (remainingCount <= 0) {
            setEtr('Finalizando...');
            return;
        }
        const estimatedRemainingMs = (averageTime * remainingCount) / Math.min(remainingCount, CONCURRENCY_LIMIT);
        setEtr(`Tempo estimado: ${formatDuration(estimatedRemainingMs)}`);
    }, [processingTimes, completedCount, queue, isProcessing]);

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = event.target?.result;
            if (data) {
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                // Use header: 1 to get array of arrays, which is easier to clean
                const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                const dataMap = new Map<string, Record<string, string>>();
                
                if (rows.length > 1) {
                    const headers: string[] = rows[0].map(h => String(h || '').trim());
                    const dataRows = rows.slice(1);

                    dataRows.forEach(row => {
                        const sku = normalizeSku(row[0]); // The first column is always the SKU
                        
                        if (sku) {
                            const rowData: Record<string, string> = {};
                            headers.forEach((header, index) => {
                                // Only add data for columns that have a header
                                if (header && row[index] !== null && row[index] !== undefined) {
                                    rowData[header] = String(row[index]).trim();
                                }
                            });
                            dataMap.set(sku, rowData);
                        }
                    });
                }
                
                setExcelData(dataMap);
                setExcelFileName(file.name);
                
                // After loading new Excel data, re-evaluate all items in the queue
                setQueue(prev => prev.map(item => {
                    const normalizedBaseName = normalizeSku(item.baseName);
                    const rowData = dataMap.get(normalizedBaseName);
                    const excelMatch = !!rowData;
                    
                    const findValue = (keys: string[], data: Record<string, string>): string | undefined => {
                        for (const key of keys) {
                            // Find the header in the row data, case-insensitively
                            const metaKey = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
                            if (metaKey && data[metaKey]) {
                                return String(data[metaKey]);
                            }
                        }
                        return undefined;
                    };

                    let newClothingNotes = item.clothingNotes || '';

                    if (rowData) {
                        const excelClothingNotes = findValue(['observacoes_roupa', 'clothing_notes', 'obs_roupa', 'observações', 'observacao', 'notas', 'detalhes'], rowData);
                        
                        // Keep manual notes, but remove any old spreadsheet notes before adding new ones
                        const manualNotes = (item.clothingNotes || '').split('\n').filter(line => !line.startsWith('[Planilha]:')).join('\n').trim();
                        newClothingNotes = manualNotes;

                        if (excelClothingNotes) {
                            const spreadsheetNote = `[Planilha]: ${excelClothingNotes}`;
                            newClothingNotes += (newClothingNotes ? '\n' : '') + spreadsheetNote;
                        }
                    }

                    return { 
                        ...item, 
                        metadata: rowData || item.metadata,
                        clothingNotes: newClothingNotes,
                        excelMatch: excelMatch,
                    };
                }));
            }
        };
        reader.readAsBinaryString(file);
    };
    
    const handleRemoveItem = useCallback((itemId: string) => {
        setQueue(prevQueue => {
            const itemToRemove = prevQueue.find(item => item.id === itemId);
            if (itemToRemove) {
                if (itemToRemove.objectUrlFront) URL.revokeObjectURL(itemToRemove.objectUrlFront);
                if (itemToRemove.objectUrlBack) URL.revokeObjectURL(itemToRemove.objectUrlBack);
                if (itemToRemove.objectUrlTotalLook) URL.revokeObjectURL(itemToRemove.objectUrlTotalLook);
                itemToRemove.resultObjectUrls?.forEach(url => URL.revokeObjectURL(url));
            }
            return prevQueue.filter(item => item.id !== itemId);
        });
    }, [setQueue]);

    const handleClothingNotesChange = (itemId: string, notes: string) => {
        setQueue(prevQueue =>
            prevQueue.map(item =>
                item.id === itemId ? { ...item, clothingNotes: notes } : item
            )
        );
    };

    const handleItemModelGenderChange = (itemId: string, gender: 'male' | 'female') => {
        setQueue(prev => prev.map(item => item.id === itemId ? { ...item, modelGender: gender } : item));
    };

    const handleItemModelAgeChange = (itemId: string, age: string) => {
        setQueue(prev => prev.map(item => item.id === itemId ? { ...item, modelAge: age } : item));
    };

    const processItem = async (item: QueueItem) => {
        const startTime = Date.now();
        const handleItemProgress = (status: string, percentage: number) => {
            if (isBatchCancelled.current || cancelledSingleItems.current.has(item.id)) {
                return;
            }
            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing', progressStatus: status, progressPercentage: percentage } : q));
        };
        handleItemProgress('Na fila...', 0);
        
        try {
            if (isBatchCancelled.current || cancelledSingleItems.current.has(item.id)) {
                console.log(`Processing for item ${item.id} was cancelled before starting.`);
                cancelledSingleItems.current.delete(item.id);
                return;
            }

            // Helper to find a value from metadata, case-insensitively
            const findMetaValue = (keys: string[]): string | undefined => {
                if (!item.metadata) return undefined;
                for (const key of keys) {
                    const metaKey = Object.keys(item.metadata).find(k => k.toLowerCase() === key.toLowerCase());
                    if (metaKey && item.metadata[metaKey]) {
                        return String(item.metadata[metaKey]);
                    }
                }
                return undefined;
            };

            // --- Start of Item-Specific Settings ---
            // Priority: 1. Item-specific UI override, 2. Excel metadata, 3. Global setting
            
            // Determine Gender. Priority: UI Override > Excel > Global
            let itemGender: 'male' | 'female' = modelGender; // Default to global
            const metaGender = findMetaValue(['gênero', 'genero', 'gender', 'sexo'])?.toLowerCase();
            if (metaGender === 'male' || metaGender === 'masculino') itemGender = 'male';
            else if (metaGender === 'female' || metaGender === 'feminino') itemGender = 'female';
            if (item.modelGender) itemGender = item.modelGender; // UI Override has highest priority

            // Determine Age. Priority: UI Override > Excel > Global (using the just-determined gender for the global fallback)
            let itemAge: string = modelAge[itemGender]; // Default to global for the correct gender
            const metaAge = findMetaValue(['idade', 'age', 'faixa etária', '(anos)']);
            if (metaAge) itemAge = metaAge;
            if (item.modelAge) itemAge = item.modelAge; // UI Override has highest priority

            let itemTargetDimensions = targetDimensions;
            let itemBrand = brand;
            let itemGenerationStyle = generationStyle;
            
            const metaWidth = findMetaValue(['largura', 'width']);
            const metaHeight = findMetaValue(['altura', 'height']);
            if (metaWidth && metaHeight) {
                itemTargetDimensions = { width: metaWidth, height: metaHeight };
            }

            itemBrand = findMetaValue(['marca', 'brand']) || itemBrand;
            
            const metaStyle = findMetaValue(['estilo', 'style', 'tipo'])?.toLowerCase();
            if (metaStyle === 'editorial') itemGenerationStyle = 'editorial';
            else if (metaStyle === 'ecommerce') itemGenerationStyle = 'ecommerce';

            let parentId = 'root';
            const trimmedBrand = itemBrand.trim();
            if (trimmedBrand) {
                console.log('currentUser.id before findOrCreateFolder:', currentUser.id);
                const token = await getToken(); // Get fresh token here
                if (!token) throw new Error("Token de autenticação não disponível.");
                const folder = await findOrCreateFolder(trimmedBrand, 'root', currentUser.id, token); // Pass token
                parentId = folder.id;
            }
            
            handleItemProgress(`Verificando treinamento de IA...`, 1);
            const ageCharacteristics = await handleTrainAgeAgent(itemAge);
            
            handleItemProgress('Aprimorando imagens...', 2);
            const enhancedFiles: File[] = await Promise.all(
                item.availableFiles.map(file => enhanceAndUpscaleImage(file, item.baseName, currentUser.id, undefined, parentId))
            );

            // --- Start of Prompt Construction ---
            const itemNegativePrompt = findMetaValue(['negativo', 'negative_prompt', 'prompt_negativo', 'prompt negativo', 'evitar']) || batchNegativePrompt;

            // Determine the base scene description
            let baseSceneDescription = findMetaValue(['cenário', 'cena', 'fundo', 'background', 'scene']);
            if (!baseSceneDescription) { // If no scene in Excel, use global settings
                baseSceneDescription = sceneNotes;
                if (sceneTheme) {
                    baseSceneDescription = `Tema: ${sceneTheme}. ${baseSceneDescription}`;
                }
            }

            // Apply the style template
            let itemScenePrompt = '';
            if (itemGenerationStyle === 'ecommerce') {
                itemScenePrompt = `Estilo E-commerce, fundo limpo e neutro. ${baseSceneDescription}`;
            } else {
                itemScenePrompt = `Estilo Editorial/Criativo, mais artístico. ${baseSceneDescription}`;
            }
            
            // Determine model notes
            let itemModelNotes = '';
            if (item.metadata) {
                // Combine all other metadata fields into model notes, excluding ones already used.
                const handledKeys = new Set(['sku', 'lista de referência', 'gênero', 'genero', 'gender', 'sexo', 'idade', 'age', 'faixa etária', '(anos)', 'largura', 'width', 'altura', 'height', 'estilo', 'style', 'tipo', 'negativo', 'negative_prompt', 'prompt_negativo', 'prompt negativo', 'evitar', 'cenário', 'cena', 'fundo', 'background', 'scene']);
                const allExcelNotes = Object.entries(item.metadata)
                    .filter(([key]) => !handledKeys.has(key.toLowerCase()))
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('. ');
                itemModelNotes = allExcelNotes;
            } else {
                // No metadata, fall back to global model notes
                const ageKey = agePresets.find(p => p.representativeAge.toLowerCase() === itemAge.toLowerCase())?.id || 'adult';
                let baseModelNotes = '';
                switch (ageKey) {
                    case 'newborn': baseModelNotes = batchModelNotes.newborn; break;
                    case 'baby': baseModelNotes = batchModelNotes.baby; break;
                    case 'child': baseModelNotes = batchModelNotes.child[itemGender]; break;
                    case 'teenager': baseModelNotes = batchModelNotes.teenager[itemGender]; break;
                    default: baseModelNotes = batchModelNotes.adult[itemGender]; break;
                }
                itemModelNotes = baseModelNotes;
            }
            // --- End of Prompt Construction ---


            // Combine descriptions
            const clothingDescriptionString = item.aiStructuredDescription && !item.aiStructuredDescription.Erro
                ? Object.entries(item.aiStructuredDescription).map(([key, value]) => `${key}: ${value}`).join(', ')
                : '';
            let combinedDescription = clothingDescriptionString;

            // item.clothingNotes now contains both manual and spreadsheet notes.
            if (item.clothingNotes) {
                combinedDescription += (combinedDescription ? '\n\n' : '') + `Observações Adicionais: ${item.clothingNotes}`;
            }

            const staticReferenceModelFile = itemGender === 'male' ? maleReferenceModelFile : femaleReferenceModelFile;
            const referenceBottomFile = itemGender === 'male' ? maleReferenceBottomFile : femaleReferenceBottomFile;
            const referenceBottomDescriptionObj = itemGender === 'male' ? maleReferenceBottomDescription : femaleReferenceBottomDescription;
            const referenceBottomDescriptionString = referenceBottomDescriptionObj
                ? Object.entries(referenceBottomDescriptionObj).map(([key, value]) => `${key}: ${value}`).join(', ')
                : undefined;
            
            const resultDataUrls: string[] = [];
            const viewsProcessed: string[] = [];
            let dynamicReferenceModelFile: File | null = null;
    
            const isManualEntry = !!(item.fileFront || item.fileBack || item.fileTotalLook);

            if (isManualEntry) {
                const enhancedFilesMap = new Map<string, File>();
                item.availableFiles.forEach((file, index) => {
                    enhancedFilesMap.set(file.name, enhancedFiles[index]);
                });
                
                const manualViewsToProcess: { viewName: string; file: File; enhancedFile: File }[] = [];
                if (item.fileFront && enhancedFilesMap.has(item.fileFront.name)) {
                    manualViewsToProcess.push({ viewName: 'Crop Frente', file: item.fileFront, enhancedFile: enhancedFilesMap.get(item.fileFront.name)! });
                }
                if (item.fileBack && enhancedFilesMap.has(item.fileBack.name)) {
                    manualViewsToProcess.push({ viewName: 'Crop Costas', file: item.fileBack, enhancedFile: enhancedFilesMap.get(item.fileBack.name)! });
                }
                if (item.fileTotalLook && enhancedFilesMap.has(item.fileTotalLook.name)) {
                    manualViewsToProcess.push({ viewName: 'Total Look', file: item.fileTotalLook, enhancedFile: enhancedFilesMap.get(item.fileTotalLook.name)! });
                }
    
                for (let i = 0; i < manualViewsToProcess.length; i++) {
                    const { viewName, enhancedFile } = manualViewsToProcess[i];
                    const progressPercentage = 20 + (i / manualViewsToProcess.length) * 60;
                    handleItemProgress(`Gerando vista manual: ${viewName}`, progressPercentage);
    
                    const resultDataUrl = await generateModelImage({
                        clothingImages: [enhancedFile],
                        age: itemAge,
                        gender: itemGender,
                        scenePrompt: itemScenePrompt,
                        clothingDescription: combinedDescription,
                        referenceModelFile: dynamicReferenceModelFile || staticReferenceModelFile,
                        referenceSceneFile,
                        modelNotes: itemModelNotes,
                        negativePrompt: itemNegativePrompt,
                        referenceBottomFile,
                        referenceBottomDescription: referenceBottomDescriptionString,
                        trainedCharacteristics: ageCharacteristics,
                        imageName: item.baseName,
                        photoFraming: viewName,
                        fitReferenceFile: referenceFitFile,
                        projectId: parentId,
                        userId: currentUser.id,
                    });
    
                    resultDataUrls.push(resultDataUrl);
                    viewsProcessed.push(viewName);
    
                    if (!dynamicReferenceModelFile) {
                        dynamicReferenceModelFile = dataURLtoFile(resultDataUrl, `ref-${item.baseName}.png`);
                    }
                }
            } else {
                if (selectedViews.length === 0) {
                    throw new Error("Nenhuma vista de geração foi selecionada para itens de arrastar e soltar. Marque ao menos uma opção em 'Saída e Estilo'.");
                }
                const viewsToProcess = selectedViews;
    
                for (let i = 0; i < viewsToProcess.length; i++) {
                    const view = viewsToProcess[i];
                    const progressPercentage = 20 + (i / viewsToProcess.length) * 60;
                    handleItemProgress(`Gerando vista: ${view} (${i + 1}/${viewsToProcess.length})`, progressPercentage);
                    
                    if (enhancedFiles.length === 0) {
                         console.warn(`Nenhuma imagem de roupa encontrada para o item ${item.baseName}. Pulando.`);
                         continue;
                    }
    
                    const resultDataUrl = await generateModelImage({
                        clothingImages: enhancedFiles,
                        age: itemAge,
                        gender: itemGender,
                        scenePrompt: itemScenePrompt,
                        clothingDescription: combinedDescription,
                        referenceModelFile: dynamicReferenceModelFile || staticReferenceModelFile,
                        referenceSceneFile,
                        modelNotes: itemModelNotes,
                        negativePrompt: itemNegativePrompt,
                        referenceBottomFile,
                        referenceBottomDescription: referenceBottomDescriptionString,
                        trainedCharacteristics: ageCharacteristics,
                        imageName: item.baseName,
                        photoFraming: view,
                        fitReferenceFile: referenceFitFile,
                        projectId: parentId,
                        userId: currentUser.id,
                    });
                    
                    resultDataUrls.push(resultDataUrl);
                    viewsProcessed.push(view);
    
                    if (!dynamicReferenceModelFile) {
                        dynamicReferenceModelFile = dataURLtoFile(resultDataUrl, `ref-${item.baseName}.png`);
                    }
                }
            }

            const finalWidth = parseInt(itemTargetDimensions.width, 10);
            const finalHeight = parseInt(itemTargetDimensions.height, 10);
            
            handleItemProgress('Finalizando e redimensionando...', 85);
            const finalResultUrls = (finalWidth > 0 && finalHeight > 0)
                ? await Promise.all(resultDataUrls.map(async (url, index) => {
                    const viewName = viewsProcessed[index] || 'result';
                    const isTotalLook = viewName.toLowerCase().includes('total look');
                    
                    // For Total Look, use a two-stage generative expand + crop to ensure exact dimensions
                    if (isTotalLook) {
                        const tempFile = dataURLtoFile(url, `temp-${index}.png`);
                        const expandedUrl = await expandImage(tempFile, finalWidth, finalHeight, item.baseName, currentUser.id, undefined, parentId);
                        // This second step ensures pixel-perfect dimensions by cropping any minor imperfections from the AI expansion
                        return resizeAndPadDataUrl(expandedUrl, finalWidth, finalHeight, 'crop');
                    }
                    // For other views (Crop, Detalhe), the 'crop' resize is correct.
                    else {
                        return resizeAndPadDataUrl(url, finalWidth, finalHeight, 'crop');
                    }
                }))
                : resultDataUrls;

            if (isBatchCancelled.current || cancelledSingleItems.current.has(item.id)) {
                console.log(`Discarding result for cancelled item ${item.id}.`);
                cancelledSingleItems.current.delete(item.id);
                return;
            }

            const metadataWithBrand = { ...(item.metadata || {}), marca: trimmedBrand };
            const resultFiles: File[] = [];
            const resultObjectUrls: string[] = [];

            for (let i = 0; i < finalResultUrls.length; i++) {
                const url = finalResultUrls[i];
                const viewName = viewsProcessed[i] || 'result';
                const resultName = `${item.baseName}-${viewName.replace(/\s+/g, '_')}-${i}.png`;
                const standardizedUrl = await standardizeToPNG(url);
                
                const originalDataUrl = (item.availableFiles.length > 0) ? await fileToDataURL(item.availableFiles[0]) : undefined;

                const resultFileToStore = dataURLtoFile(standardizedUrl, resultName);
                const token = await getToken();
                if (!token) {
                    throw new Error("Token de autenticação não disponível.");
                }
                await addImageToStorage(resultFileToStore, resultName, currentUser.id, token, originalDataUrl ? dataURLtoFile(originalDataUrl, `original-${resultName}`) : undefined, metadataWithBrand, parentId);
                const resultFile = dataURLtoFile(standardizedUrl, resultName);
                resultFiles.push(resultFile);
                resultObjectUrls.push(URL.createObjectURL(resultFile));
            }

            const duration = Date.now() - startTime;
            recordCompletion({ width: itemTargetDimensions.width, height: itemTargetDimensions.height }, duration);
            setProcessingTimes(prev => [...prev, duration]);

            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', resultFiles, resultObjectUrls, parentId } : q));
            setCompletedCount(prev => prev + 1);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            if (isBatchCancelled.current || cancelledSingleItems.current.has(item.id)) {
                console.log(`Suppressing error for cancelled item ${item.id}:`, err);
                cancelledSingleItems.current.delete(item.id);
                return;
            }
            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' as 'error', error: errorMessage } : q));
            console.error(`Failed to process ${item.baseName}:`, err);
        }
    };

    const handleCancelProcessing = () => {
        isBatchCancelled.current = true;
        setIsProcessing(false); // Stop UI processing state

        // Reset status for items that were in the middle of processing
        setQueue(prevQueue =>
            prevQueue.map(item =>
                item.status === 'processing'
                    ? {
                          ...item,
                          status: 'queued' as 'queued',
                          progressStatus: undefined,
                          progressPercentage: 0,
                      }
                    : item
            )
        );
    };

    const handleCancelSingleItem = (itemId: string) => {
        cancelledSingleItems.current.add(itemId);
        setQueue(prev => prev.map(q => 
            q.id === itemId ? { 
                ...q, 
                status: 'queued', 
                progressStatus: undefined, 
                progressPercentage: 0 
            } : q
        ));
    };

    const handleProcessSingleItem = async (itemId: string) => {
        cancelledSingleItems.current.delete(itemId); // Clear cancellation flag before starting
        const itemToProcess = queue.find(item => item.id === itemId);
        if (!itemToProcess) return;
    
        const itemToRun: QueueItem = (itemToProcess.status === 'error' || itemToProcess.status === 'done')
            ? {
                ...itemToProcess,
                status: 'queued',
                error: undefined,
                progressStatus: undefined,
                progressPercentage: 0,
                resultFiles: undefined,
                resultObjectUrls: undefined,
            }
            : { ...itemToProcess };
    
        if (itemToProcess.status !== 'queued') {
            setQueue(prevQueue =>
                prevQueue.map(item => (item.id === itemId ? itemToRun : item))
            );
        }
    
        await processItem(itemToRun);
    };

    const processQueue = async () => {
        isBatchCancelled.current = false;
        setIsProcessing(true);
        setCompletedCount(0);
        setProcessingTimes([]);

        // Force a token refresh at the start of the batch processing
        if (currentUser) {
            // The 'true' argument forces a refresh of the ID token.
            // This ensures that the subsequent getToken() calls within processItem
            // will have the freshest possible token.
            await currentUser.getIdToken(true);
        }
        
        const queueWithResetErrors = queue.map(item => item.status === 'error' ? { ...item, status: 'queued' as const, error: undefined } : item);
        setQueue(queueWithResetErrors);
        const itemsToProcess = queueWithResetErrors.filter(item => item.status === 'queued');
        
        if (itemsToProcess.length > 0) {
            const estimatePerItem = getEstimateMs({ width: targetDimensions.width, height: targetDimensions.height });
            const totalEstimateMs = (estimatePerItem * itemsToProcess.length) / Math.min(itemsToProcess.length, CONCURRENCY_LIMIT);
            setEtr(`Tempo estimado: ${formatDuration(totalEstimateMs)}`);
        }
        
        for (let i = 0; i < itemsToProcess.length; i += CONCURRENCY_LIMIT) {
            if (isBatchCancelled.current) {
                console.log("Processing cancelled by user.");
                break;
            }
            const chunk = itemsToProcess.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(item => processItem(item)));
        }

        setIsProcessing(false);
    };

    const handleDownload = useCallback(async (file: File) => {
        try {
            const dataUrl = await fileToDataURL(file);
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${file.name.split('.')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) { console.error(`Failed to download ${file.name}`, error); }
    }, []);

    const clearQueue = () => {
        queue.forEach(item => {
            if (item.objectUrlFront) URL.revokeObjectURL(item.objectUrlFront);
            if (item.objectUrlBack) URL.revokeObjectURL(item.objectUrlBack);
            if (item.objectUrlTotalLook) URL.revokeObjectURL(item.objectUrlTotalLook);
            item.resultObjectUrls?.forEach(url => URL.revokeObjectURL(url));
        });
        setQueue([]);
        setIsProcessing(false);
        setCompletedCount(0);
        setProcessingTimes([]);
    }

    const openPreview = (clickedItem: QueueItem) => {
        if (!clickedItem.resultFiles || clickedItem.resultFiles.length === 0) return;

        const previewableItems: StoredImage[] = clickedItem.resultFiles.map((file, index) => ({
            id: `${clickedItem.id}-result-${index}`,
            type: 'file',
            parentId: clickedItem.parentId || 'root',
            userId: currentUser.id,
            url: clickedItem.resultObjectUrls![index],
            storagePath: `generated/${file.name}`, // Placeholder path
            name: file.name,
            timestamp: file.lastModified,
            originalUrl: clickedItem.availableUrls[index] || clickedItem.availableUrls[0],
        }));

        setPreviewState({ isOpen: true, items: previewableItems, index: clickedItem.currentViewIndex });
    };

    
    const [constrainProportions, setConstrainProportions] = useState(true);

    const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setTargetDimensions({
            width: value,
            height: constrainProportions ? value : targetDimensions.height,
        });
    };

    const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setTargetDimensions({
            width: constrainProportions ? value : targetDimensions.width,
            height: value,
        });
    };

    const handleDragSort = () => {
        if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) return;
        setQueue(prevQueue => {
            const newQueue = [...prevQueue];
            const dragItemIndex = newQueue.findIndex(item => item.id === dragItem.current);
            const dragOverItemIndex = newQueue.findIndex(item => item.id === dragOverItem.current);
            if (dragItemIndex === -1 || dragOverItemIndex === -1) return prevQueue;
            const [draggedItem] = newQueue.splice(dragItemIndex, 1);
            newQueue.splice(dragOverItemIndex, 0, draggedItem);
            return newQueue;
        });
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleItemViewChange = (itemId: string, direction: number) => {
        setQueue(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            const filesArray = item.status === 'done' && item.resultFiles ? item.resultFiles : item.availableFiles;
            const maxIndex = filesArray.length - 1;
            if (maxIndex < 1) return item;
    
            let newIndex = item.currentViewIndex + direction;
            if (newIndex < 0) newIndex = maxIndex;
            if (newIndex > maxIndex) newIndex = 0;
            return { ...item, currentViewIndex: newIndex };
        }));
    };

    const toggleItemCompare = (itemId: string) => {
        setQueue(prev => prev.map(item => item.id === itemId ? { ...item, isComparing: !item.isComparing } : item));
    };
    
    const handleDescriptionChange = (itemId: string, field: string, value: string) => {
        setQueue(prevQueue =>
            prevQueue.map(item => {
                if (item.id === itemId && item.aiStructuredDescription) {
                    const newDescription = { ...item.aiStructuredDescription, [field]: value };
                    return { ...item, aiStructuredDescription: newDescription };
                }
                return item;
            })
        );
    };

    const renderStatusOverlay = (item: QueueItem) => {
        switch(item.status) {
            case 'processing': return (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-2 text-center text-white rounded-lg">
                    <p className="text-xs font-semibold leading-tight">{item.progressStatus || 'Processando...'}</p>
                    <div className="w-full bg-gray-500 rounded-full h-1.5 mt-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${item.progressPercentage || 0}%` }}></div></div>
                    <p className="text-sm font-bold mt-1">{item.progressPercentage || 0}%</p>
                </div>
            );
            default: return null;
        }
    }
    
    const viewsToGenerate: { id: string, label: string }[] = [
        { id: 'Total Look', label: 'Look Completo' },
        { id: 'Crop Frente', label: 'Crop Frente' },
        { id: 'Crop Costas', label: 'Crop Costas' },
        { id: 'Detalhe', label: 'Detalhe' },
    ];

    const handleViewSelectionChange = (view: string) => {
        setSelectedViews(prev =>
            prev.includes(view)
                ? prev.filter(v => v !== view)
                : [...prev, view]
        );
    };
    
    const referenceModelFile = modelGender === 'male' ? maleReferenceModelFile : femaleReferenceModelFile;
    const setReferenceModelFile = modelGender === 'male' ? setMaleReferenceModelFile : setFemaleReferenceModelFile;
    const referenceModelLabel = `Modelo (${modelGender === 'male' ? 'Masculino' : 'Feminino'})`;

    const referenceBottomFile = modelGender === 'male' ? maleReferenceBottomFile : femaleReferenceBottomFile;
    const setReferenceBottomFile = modelGender === 'male' ? setMaleReferenceBottomFile : setFemaleReferenceBottomFile;
    const isAnalyzingBottom = modelGender === 'male' ? isAnalyzingMaleBottom : isAnalyzingFemaleBottom;
    const referenceBottomDescription = modelGender === 'male' ? maleReferenceBottomDescription : femaleReferenceBottomDescription;
    const referenceBottomLabel = `Peça Comp. (${modelGender === 'male' ? 'Masculina' : 'Feminina'})`;

    const SmallSpinner: React.FC = () => (<svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>);

    const itemsToProcessCount = useMemo(() => queue.filter(i => i.status === 'queued' || i.status === 'error').length, [queue]);
    const isAnalyzingAny = useMemo(() => queue.some(item => item.isDescribing), [queue]);
    const buttonText = isProcessing ? 'Processando...' : `Iniciar Processamento (${itemsToProcessCount})`;

    return (
        <>
        <div className="w-full animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* --- Left Column: Configuration Sidebar --- */}
            <div className="lg:col-span-1 lg:sticky lg:top-24 self-start flex flex-col gap-4">
                <h2 className="text-2xl font-bold text-gray-800 text-center">Configurações de Geração</h2>
                
                 <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">Presets</h3>
                    <div className="flex items-center gap-2">
                        <select onChange={(e) => handleLoadPreset(e.target.value)} className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" disabled={isProcessing}>
                            <option value="">Carregar Preset...</option>
                            {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Nome do novo preset" className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" disabled={isProcessing} />
                        <button onClick={handleSavePreset} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 disabled:bg-gray-400" disabled={!newPresetName.trim() || isProcessing}>Salvar</button>
                    </div>
                </div>

                <AccordionSection title="1. Modelo e Roupas" icon={UserIcon} defaultOpen>
                   <div className="flex flex-col gap-4">
                        <div>
                           <div className="flex items-center justify-center gap-2 mb-2">
                               <label className="block text-sm font-medium text-center text-gray-600">Idade</label>
                               {isTrainingAgent.has(currentAgeForGender) && <SmallSpinner />}
                               {trainedAgeData.has(currentAgeForGender) && !isTrainingAgent.has(currentAgeForGender) && <CheckIcon className="w-4 h-4 text-green-500" />}
                           </div>
                           <div className="grid grid-cols-3 gap-2 mb-2">
                                {agePresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => handleGlobalOrItemAgeChange(preset.representativeAge)}
                                        disabled={isProcessing}
                                        className={`w-full text-center text-xs font-semibold py-2 px-1 rounded-md transition-all ${
                                            (selectedItemId ? queue.find(item => item.id === selectedItemId)?.modelAge : currentAgeForGender) === preset.representativeAge
                                                ? 'bg-blue-600 text-white shadow'
                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={selectedItemId ? queue.find(item => item.id === selectedItemId)?.modelAge || '' : currentAgeForGender}
                                onChange={(e) => handleGlobalOrItemAgeChange(e.target.value)}
                                placeholder="Ou digite uma idade customizada"
                                disabled={isProcessing}
                                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 text-center"
                            />
                       </div>
                       {(modelAge[modelGender] !== 'Recém-nascido' && modelAge[modelGender] !== '1 ano') && (
                           <div className="animate-fade-in">
                               <label className="block text-sm font-medium text-center text-gray-600 mb-2">Gênero</label>
                               <div className={`flex items-center justify-center gap-1 bg-gray-200/70 p-1 rounded-lg`}>
                                   <button onClick={() => handleGlobalOrItemGenderChange('female')} disabled={isProcessing} className={`w-full px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 active:scale-95 ${ (selectedItemId ? queue.find(item => item.id === selectedItemId)?.modelGender ?? modelGender : modelGender) === 'female' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Feminino</button>
                                   <button onClick={() => handleGlobalOrItemGenderChange('male')} disabled={isProcessing} className={`w-full px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 active:scale-95 ${ (selectedItemId ? queue.find(item => item.id === selectedItemId)?.modelGender ?? modelGender : modelGender) === 'male' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Masculino</button>
                               </div>
                           </div>
                       )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                           <ReferenceModelUploader label={referenceModelLabel} file={referenceModelFile} onFileChange={setReferenceModelFile} disabled={isProcessing} />
                           <ReferenceSceneUploader label="Referência de Caimento" file={referenceFitFile} onFileChange={setReferenceFitFile} disabled={isProcessing} />
                           <ReferenceBottomUploader label={referenceBottomLabel} file={referenceBottomFile} onFileChange={setReferenceBottomFile} disabled={isProcessing} isLoading={isAnalyzingBottom} description={referenceBottomDescription ? Object.entries(referenceBottomDescription).map(([k,v]) => `${k}: ${v}`).join('\n') : null} />
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-gray-600 mb-1">Observações do Modelo</label>
                           <textarea
                               value={(agePresets.some(p => p.representativeAge.toLowerCase() === modelAge[modelGender].toLowerCase()) && modelAge[modelGender] !== '1 ano' && modelAge[modelGender] !== 'Recém-nascido') ? batchModelNotes[agePresets.find(p=>p.representativeAge.toLowerCase() === modelAge[modelGender].toLowerCase())!.id as 'adult' | 'teenager' | 'child'][modelGender] : (modelAge[modelGender] === '1 ano' ? batchModelNotes.baby : (modelAge[modelGender] === 'Recém-nascido' ? batchModelNotes.newborn : batchModelNotes.adult[modelGender]))}
                               onChange={(e) => {
                                   const value = e.target.value;
                                   setBatchModelNotes(prev => {
                                       const ageKey = agePresets.find(p => p.representativeAge.toLowerCase() === modelAge[modelGender].toLowerCase())?.id;
                                       if (ageKey && (ageKey === 'adult' || ageKey === 'teenager' || ageKey === 'child')) {
                                           return { ...prev, [ageKey]: { ...prev[ageKey], [modelGender]: value }};
                                       }
                                       if (ageKey && (ageKey === 'baby' || ageKey === 'newborn')) {
                                           return { ...prev, [ageKey]: value };
                                       }
                                       // Fallback for custom ages - apply to adult for now
                                       return { ...prev, adult: { ...prev.adult, [modelGender]: value }};
                                   });
                               }}
                               placeholder="Ex: cabelo loiro, sorrindo"
                               className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                               rows={2}
                               disabled={isProcessing}
                           />
                       </div>
                   </div>
                </AccordionSection>

                <AccordionSection title="2. Cenário" icon={PhotoIcon}>
                    <div className="flex flex-col gap-4 items-center">
                        <ReferenceSceneUploader file={referenceSceneFile} onFileChange={setReferenceSceneFile} disabled={isProcessing || !!sceneTheme} />
                        <div className="flex items-center w-full"><div className="flex-grow border-t border-gray-300"></div><span className="flex-shrink mx-2 text-xs font-semibold text-gray-400">OU</span><div className="flex-grow border-t border-gray-300"></div></div>
                        <select value={sceneTheme} onChange={(e) => setSceneTheme(e.target.value)} className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" disabled={isProcessing || hasReferenceScene}><option value="">Tema de Cenário...</option><option value="Urbano">Urbano</option><option value="Praia">Praia</option><option value="Natureza">Natureza</option><option value="Estúdio Minimalista">Estúdio Minimalista</option><option value="Interior Aconchegante">Interior Aconchegante</option></select>
                        <textarea value={sceneNotes} onChange={(e) => setSceneNotes(e.target.value)} placeholder="Observações do cenário (ex: iluminação suave)" className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" rows={2} disabled={isProcessing}/>
                        <textarea value={batchNegativePrompt} onChange={(e) => setBatchNegativePrompt(e.target.value)} placeholder="Prompt Negativo (o que evitar)" className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" rows={2} disabled={isProcessing}/>
                    </div>
                </AccordionSection>

                <AccordionSection title="3. Saída e Estilo" icon={ArrowDownTrayIcon}>
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Estilo de Geração</label>
                            <select value={generationStyle} onChange={(e) => setGenerationStyle(e.target.value as 'ecommerce' | 'editorial')} className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" disabled={isProcessing}>
                                <option value="ecommerce">E-commerce Padrão</option>
                                <option value="editorial">Editorial/Criativo</option>
                            </select>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-700 text-center mb-2">Vistas a Gerar (para Arrastar e Soltar)</p>
                            <div className="grid grid-cols-2 gap-2">
                                {viewsToGenerate.map(view => (
                                    <label key={view.id} className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer p-2 rounded-md hover:bg-gray-100 transition">
                                        <input type="checkbox" checked={selectedViews.includes(view.id)} onChange={() => handleViewSelectionChange(view.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" disabled={isProcessing}/>
                                        {view.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="border-t border-gray-200 pt-4">
                             <p className="text-sm font-semibold text-gray-700 text-center mb-2">Dimensões Finais</p>
                            <div className="flex items-end justify-center gap-2">
                                <div><label htmlFor="batch-resize-width" className="block text-xs font-medium text-gray-500 mb-1 text-center">Largura</label><input id="batch-resize-width" type="number" value={targetDimensions.width} placeholder="px" onChange={handleWidthChange} disabled={isProcessing} className="w-full bg-white border p-2 text-sm text-center focus:ring-2 focus:ring-blue-500 rounded-lg" /></div>
                                <div className="pb-1"><button onClick={() => setConstrainProportions(!constrainProportions)} disabled={isProcessing} className="p-1 rounded-full text-gray-500 hover:bg-gray-200" title={constrainProportions ? "Manter proporção" : "Liberar proporção"}>{constrainProportions ? <LockClosedIcon className="w-4 h-4" /> : <LockOpenIcon className="w-4 h-4" />}</button></div>
                                <div><label htmlFor="batch-resize-height" className="block text-xs font-medium text-gray-500 mb-1 text-center">Altura</label><input id="batch-resize-height" type="number" value={targetDimensions.height} placeholder="px" onChange={handleHeightChange} disabled={isProcessing} className="w-full bg-white border p-2 text-sm text-center focus:ring-2 focus:ring-blue-500 rounded-lg" /></div>
                            </div>
                        </div>
                    </div>
                </AccordionSection>
                
                <AccordionSection title="Dados & Organização" icon={DocumentArrowUpIcon}>
                    <div className="flex flex-col gap-4">
                         <div>
                            <label htmlFor="batch-brand" className="block text-sm font-medium text-gray-600 mb-1">Marca</label>
                            <input id="batch-brand" type="text" value={brand} placeholder="Marca (para organizar na galeria)" onChange={e => setBrand(e.target.value)} disabled={isProcessing} className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label htmlFor="excel-upload" className="block text-sm font-medium text-gray-600 mb-1">Planilha de Dados</label>
                            <label htmlFor="excel-upload" className="flex items-center justify-center w-full gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg cursor-pointer hover:bg-green-700">
                                <DocumentArrowUpIcon className="w-5 h-5"/>
                                <span className="truncate max-w-[200px]">{excelFileName || 'Carregar Excel (SKU)'}</span>
                            </label>
                            <input id="excel-upload" type="file" onChange={handleExcelUpload} accept=".xlsx, .xls" className="hidden"/>
                        </div>
                    </div>
                </AccordionSection>

                <div className="mt-4 border-t pt-4">
                    {!isProcessing ? (
                        <button onClick={processQueue} disabled={itemsToProcessCount === 0 || isAnalyzingAny || !currentAgeForGender.trim()} className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl active:scale-95 text-base disabled:from-gray-500 disabled:shadow-none disabled:cursor-not-allowed">
                            <ArrowPathIcon className="w-5 h-5"/>
                            <span>{buttonText}</span>
                        </button>
                    ) : (
                        <div className="w-full flex flex-col items-center gap-4">
                             <button onClick={handleCancelProcessing} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                                <span>Cancelar Processamento</span>
                            </button>
                             <div className="w-full text-center">
                                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${queue.length > 0 ? (completedCount / queue.length) * 100 : 0}%` }}></div>
                                </div>
                                <p className="text-sm text-gray-600 mt-2">{`Processando... ${completedCount} de ${queue.length} concluídos.`}</p>
                                {etr && <p className="text-sm font-bold text-gray-800 mt-1">{etr}</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Right Column: Queue and Upload --- */}
            <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={clearQueue} disabled={isProcessing} className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 active:scale-95 disabled:bg-gray-400">Limpar Fila</button>
                        <button onClick={onNavigateToGallery} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700">Ver Galeria</button>
                    </div>
                </div>

                <div className="w-full p-4 border-2 border-dashed rounded-lg bg-white/80 border-gray-300">
                     <label
                        htmlFor="batch-file-upload"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative w-full h-64 flex flex-col items-center justify-center text-center p-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                            isDraggingOver ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-300'
                        }`}
                    >
                        <UploadIcon className="w-12 h-12 text-gray-400 mb-4" />
                        <h3 className="text-xl font-bold text-gray-700">Arraste e solte ou clique para enviar</h3>
                        <p className="text-gray-500 mt-2 text-sm">
                            Nomeie os arquivos com um prefixo comum para agrupá-los (ex: SKU_frente, SKU_costas).
                        </p>
                        <input 
                            id="batch-file-upload"
                            type="file" 
                            multiple
                            accept="image/*"
                            onChange={(e) => handleFiles(e.target.files)} 
                            className="absolute inset-0 w-full h-full opacity-0"
                        />
                    </label>
                    <div className="flex items-center my-4">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink mx-4 text-sm font-semibold text-gray-500">OU</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center text-gray-600">
                        <button 
                            onClick={() => setIsAddProductModalOpen(true)}
                            className="flex items-center gap-3 bg-white text-gray-800 font-bold py-3 px-6 rounded-lg shadow-md border border-gray-300 hover:bg-gray-100 transition-all active:scale-95"
                        >
                            <PlusIcon className="w-5 h-5" />
                            Adicionar Produto Manualmente
                        </button>
                    </div>
                </div>
                
                {queue.length > 0 && (
                    <div className="w-full space-y-4">
                        {queue.map(item => {
                            return (
                                <div
                                    key={item.id}
                                    className={`p-4 rounded-lg shadow-md border ${item.status === 'error' ? 'bg-red-50/80 border-red-300' : 'bg-white/80 border-gray-200'} ${selectedItemId === item.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                    onDragStart={() => dragItem.current = item.id}
                                    onDragEnter={() => dragOverItem.current = item.id}
                                    onDragEnd={handleDragSort}
                                    onDragOver={e => e.preventDefault()}
                                    onClick={() => setSelectedItemId(prevId => prevId === item.id ? null : item.id)}
                                >
                                    <div className="flex flex-col md:flex-row items-start gap-4">
                                        <div
                                            className={`relative aspect-square w-48 h-48 flex-shrink-0 rounded-lg border group bg-gray-100 ${isProcessing ? '' : 'cursor-grab'}`}
                                            draggable={!isProcessing}
                                        >
                                            <div
                                                className="absolute w-full h-full"
                                                onClick={(item.status === 'done' && !item.isComparing) ? () => openPreview(item) : undefined}
                                            >
                                                {item.isComparing && item.status === 'done' && item.resultObjectUrls?.[item.currentViewIndex] && (item.availableUrls[item.currentViewIndex] || item.availableUrls[0]) ? (
                                                    <ImageComparator 
                                                        originalSrc={item.availableUrls[item.currentViewIndex] || item.availableUrls[0]}
                                                        currentSrc={item.resultObjectUrls[item.currentViewIndex]}
                                                    />
                                                ) : (
                                                    <img
                                                        src={item.status === 'done' ? item.resultObjectUrls?.[item.currentViewIndex] : item.availableUrls[item.currentViewIndex]}
                                                        alt={item.baseName}
                                                        className={`w-full h-full object-contain rounded-lg ${item.status === 'processing' ? 'opacity-30' : ''} ${(item.status === 'done' && !item.isComparing) ? 'cursor-pointer' : ''}`}
                                                    />
                                                )}
                                            </div>
                                            <div className="absolute bottom-0 left-0 w-full p-1.5 bg-gradient-to-t from-black/70 to-transparent flex justify-between items-center rounded-b-lg">
                                                <p className="text-white text-[10px] font-semibold truncate">
                                                    {item.isComparing ? `Comparando: ${item.baseName}` : item.baseName}
                                                </p>
                                                {(item.availableFiles.length > 1 || (item.resultFiles && item.resultFiles.length > 1)) &&
                                                    <p className="text-white text-[10px] font-semibold bg-black/50 px-1 rounded">{item.currentViewIndex + 1}/{(item.status === 'done' ? item.resultFiles?.length : item.availableFiles.length) || 1}</p>
                                                }
                                            </div>
                                            {renderStatusOverlay(item)}
                                            {item.status === 'done' && <div className="absolute top-1 right-1 p-0.5 bg-green-500 text-white rounded-full shadow-md z-10"><CheckIcon className="w-4 h-4" /></div>}
                                            {item.status === 'done' && (
                                                <div className="absolute bottom-1 right-1 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); toggleItemCompare(item.id); }} className={`text-white p-1 rounded-full ${item.isComparing ? 'bg-blue-500' : 'bg-black/30 hover:bg-black/60'}`} title={item.isComparing ? "Ver Resultado" : "Comparar com Original"}><EyeIcon className="w-4 h-4" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownload(item.resultFiles![item.currentViewIndex]); }} className="text-white p-1 rounded-full bg-black/30 hover:bg-black/60" title="Baixar resultado"><ArrowDownTrayIcon className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                            {(item.availableFiles.length > 1 || (item.resultFiles && item.resultFiles.length > 1)) && (
                                                <>
                                                    <button onClick={() => handleItemViewChange(item.id, -1)} className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-black/30 text-white rounded-full opacity-0 group-hover:opacity-100 z-10 hover:bg-black/60"><ChevronLeftIcon className="w-5 h-5" /></button>
                                                    <button onClick={() => handleItemViewChange(item.id, 1)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-black/30 text-white rounded-full opacity-0 group-hover:opacity-100 z-10 hover:bg-black/60"><ChevronRightIcon className="w-5 h-5" /></button>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex-grow min-w-0 w-full">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <h4 className="font-bold text-gray-800 truncate" title={item.baseName}>{item.baseName}</h4>
                                                    {item.isDescribing && <SmallSpinner />}
                                                    {item.aiStructuredDescription && !item.aiStructuredDescription.Erro && (
                                                        <div className="relative group flex-shrink-0">
                                                            <SparklesIcon className="w-5 h-5 text-blue-500 cursor-help" />
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 text-sm text-white bg-gray-900 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 text-left">
                                                                <h5 className="font-bold mb-2 border-b border-gray-600 pb-1">Análise da IA</h5>
                                                                <div className="space-y-1 max-h-64 overflow-y-auto pr-2 text-xs">
                                                                    {Object.entries(item.aiStructuredDescription).map(([key, value]) => (
                                                                        <div key={key}>
                                                                            <span className="font-semibold text-gray-300 capitalize">{key.replace(/_/g, ' ')}:</span>
                                                                            <p className="text-gray-100 whitespace-normal pl-2">{String(value)}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!isProcessing && item.status !== 'processing' && (
                                                         <button onClick={() => handleRemoveItem(item.id)} className="p-1 text-gray-400 hover:text-red-500" title="Remover da fila">
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="mb-2">
                                                {excelData === null ? (
                                                    <div className="text-xs text-center text-gray-500 bg-gray-50 p-2 rounded-md border border-gray-200">
                                                        Aguardando planilha de dados...
                                                    </div>
                                                ) : item.excelMatch === true && item.metadata ? (
                                                    <div className="space-y-1 text-xs text-gray-600 bg-green-50 p-2 rounded-md border border-green-200 max-h-24 overflow-y-auto">
                                                        <h5 className="font-bold text-green-800 text-xs mb-1 pb-1 border-b border-green-200">Dados da Planilha Encontrados</h5>
                                                        {Object.entries(item.metadata).filter(([key]) => key.toLowerCase() !== 'sku' && key.toLowerCase() !== 'lista de referência').map(([key, value]) => (
                                                            <p key={key} className="truncate" title={`${key}: ${String(value)}`}>
                                                                <span className="font-semibold capitalize">{key.replace(/_/g, ' ')}:</span> {String(value)}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-center text-amber-800 bg-amber-50 p-2 rounded-md border border-amber-200">
                                                        SKU não encontrado na planilha.
                                                    </div>
                                                )}
                                            </div>

                                            {item.status === 'error' && (
                                                <div className="text-red-600 p-2 bg-red-50 rounded-md border border-red-200 mt-2">
                                                    <p className="font-bold text-sm">Erro!</p>
                                                    <p className="text-xs mt-1 break-all" title={item.error}>{item.error}</p>
                                                </div>
                                            )}
                                             {item.aiStructuredDescription?.Erro && (
                                                <div className="text-amber-700 p-2 bg-amber-50 rounded-md border border-amber-200 mt-2">
                                                    <p className="font-bold text-sm">Aviso de Análise</p>
                                                    <p className="text-xs mt-1">{item.aiStructuredDescription.Erro}</p>
                                                </div>
                                            )}
                                            <textarea
                                                placeholder="Observações manuais sobre a peça..."
                                                value={item.clothingNotes || ''}
                                                onChange={(e) => handleClothingNotesChange(item.id, e.target.value)}
                                                disabled={isProcessing}
                                                className="mt-2 w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                rows={2}
                                                onClick={e => e.stopPropagation()}
                                            />
                                            <div className="mt-2 pt-2 border-t border-gray-200">
                                                <div className="grid grid-cols-3 gap-4 items-end">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-1">Gênero Específico</label>
                                                        <div className={`flex items-center justify-center gap-1 bg-gray-200/70 p-1 rounded-lg`}>
                                                            <button onClick={() => handleItemModelGenderChange(item.id, 'female')} disabled={isProcessing} className={`w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${(item.modelGender ?? modelGender) === 'female' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Feminino</button>
                                                            <button onClick={() => handleItemModelGenderChange(item.id, 'male')} disabled={isProcessing} className={`w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${(item.modelGender ?? modelGender) === 'male' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Masculino</button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-1">Idade Específica</label>
                                                        <input
                                                            type="text"
                                                            value={item.modelAge || ''}
                                                            onChange={(e) => handleItemModelAgeChange(item.id, e.target.value)}
                                                            placeholder={`Padrão: ${modelAge[item.modelGender || modelGender]}`}
                                                            disabled={isProcessing}
                                                            className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    </div>
                                                    <div>
                                                        {item.status === 'processing' ? (
                                                            <button
                                                                onClick={() => handleCancelSingleItem(item.id)}
                                                                className="w-full flex items-center justify-center gap-2 bg-red-500 text-white font-bold py-2 px-2 rounded-lg hover:bg-red-600 transition-colors"
                                                                title="Cancelar geração deste item"
                                                            >
                                                                <XMarkIcon className="w-5 h-5" />
                                                                <span className="text-sm">Cancelar</span>
                                                            </button>
                                                        ) : (
                                                            <>
                                                                {(item.status === 'queued' || item.status === 'error') && (
                                                                    <button
                                                                        onClick={() => handleProcessSingleItem(item.id)}
                                                                        disabled={isProcessing || item.isDescribing}
                                                                        className="w-full flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-2 px-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-400"
                                                                        title={item.isDescribing ? "Analisando imagem..." : "Gerar este item"}
                                                                    >
                                                                        <SparklesIcon className="w-5 h-5" />
                                                                        <span className="text-sm">Gerar</span>
                                                                    </button>
                                                                )}
                                                                {item.status === 'done' && (
                                                                    <button
                                                                        onClick={() => handleProcessSingleItem(item.id)}
                                                                        disabled={isProcessing}
                                                                        className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white font-bold py-2 px-2 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                                                                        title="Gerar Novamente"
                                                                    >
                                                                        <ArrowPathIcon className="w-5 h-5" />
                                                                        <span className="text-sm">Gerar Novamente</span>
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
        <AddProductModal
            isOpen={isAddProductModalOpen}
            onClose={() => setIsAddProductModalOpen(false)}
            onAddProduct={handleAddProduct}
        />
        <PreviewModal
            isOpen={previewState.isOpen}
            onClose={() => setPreviewState({isOpen: false, items: [], index: 0})}
            images={previewState.items}
            startIndex={previewState.index}
        />
        </>
    );
};