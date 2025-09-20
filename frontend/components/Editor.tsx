/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import Spinner from './Spinner';
import CropPanel from './CropPanel';
import ModelPanel from './ModelPanel';
import MaskingCanvas from './MaskingCanvas';
import { UndoIcon, RedoIcon, EyeIcon, PhotoIcon, ArrowPathIcon, ScaleIcon, SparklesIcon, MagicWandIcon, TrashIcon } from './icons';
import EditorGalleryPlaceholder from './EditorGalleryPlaceholder';
import type { StoredImage } from '../services/galleryService';
import type { User } from '../services/userService';
import type { EditorTab } from '../App';


// A large props interface. This could be broken down, but for now it's explicit.
interface EditorProps {
    // State
    currentImage: File | null;
    originalImage: File | null;
    currentImageUrl: string | null;
    isLoading: boolean;
    prompt: string;
    editHotspot: { x: number, y: number } | null;
    displayHotspot: { x: number, y: number } | null;
    activeTab: EditorTab;
    crop?: Crop;
    completedCrop?: PixelCrop;
    aspect?: number;
    isComparing: boolean;
    canUndo: boolean;
    canRedo: boolean;
    loadingStatus: { message: string; percentage: number, estimate?: string } | null;
    targetDimensions: { width: string, height: string };
    modelNotes: string;
    editorNegativePrompt: string;
    editorModelAge: { male: string, female: string };
    editorModelGender: 'male' | 'female';
    isTrainingAgent: Set<string>;
    trainedAgeData: Map<string, string>;
    currentImageProjectId: string;
    currentUser: User;
    maskDataUrl: string | null;
    brushSize: number;
    maskMode: 'brush' | 'eraser';
    getToken: () => Promise<string | null>;
    
    // Handlers
    setPrompt: (p: string) => void;
    setEditHotspot: (h: { x: number, y: number } | null) => void;
    setDisplayHotspot: (h: { x: number, y: number } | null) => void;
    setActiveTab: (t: EditorTab) => void;
    setCrop: (c: Crop) => void;
    setCompletedCrop: (c: PixelCrop) => void;
    setAspect: (a: number | undefined) => void;
    setIsComparing: (b: boolean) => void;
    setTargetDimensions: (dims: { width: string, height: string }) => void;
    setModelNotes: (notes: string) => void;
    setEditorNegativePrompt: (prompt: string) => void;
    setEditorModelAge: (age: { male: string, female: string }) => void;
    setEditorModelGender: (gender: 'male' | 'female') => void;
    setMaskDataUrl: (dataUrl: string | null) => void;
    setBrushSize: (size: number) => void;
    setMaskMode: (mode: 'brush' | 'eraser') => void;
    handleGenerate: () => void;
    handleGenerateModel: (p: string, notes: string, negativePrompt: string) => void;
    handleApplyCrop: () => void;
    handleApplyResize: (width: number, height: number) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleReset: () => void;
    handleSelectAnother: () => void;
    handleDownload: () => void;
    onNavigateToGallery: () => void;
    onOpenPreview: () => void;
    onLoadImage: (file: File) => void;
    onLoadImageFromGallery: (image: StoredImage) => void;

    // Refs
    imgRef: React.RefObject<HTMLImageElement>;
    
    // Mode
    isGeneratorMode: boolean;
    onStartOver?: () => void;
}

import ImageComparator from './ImageComparator';


const Editor: React.FC<EditorProps> = (props) => {
    const {
        currentImage, originalImage, currentImageUrl, isLoading, prompt, editHotspot, displayHotspot,
        activeTab, crop, completedCrop, aspect, isComparing, canUndo, canRedo, 
        loadingStatus, targetDimensions, modelNotes, editorNegativePrompt,
        editorModelAge, editorModelGender, isTrainingAgent, trainedAgeData, currentImageProjectId, currentUser,
        maskDataUrl, brushSize, maskMode, getToken,
        setPrompt, setDisplayHotspot, setEditHotspot, setActiveTab, setCrop, setCompletedCrop, setAspect,
        setIsComparing,
        setTargetDimensions,
        setModelNotes,
        setEditorNegativePrompt,
        setEditorModelAge, setEditorModelGender,
        setMaskDataUrl, setBrushSize, setMaskMode,
        handleGenerate,
        handleGenerateModel, handleApplyCrop, handleApplyResize, handleUndo, handleRedo, handleReset, handleSelectAnother,
        handleDownload, onNavigateToGallery, onOpenPreview, onLoadImage, onLoadImageFromGallery,
        imgRef, isGeneratorMode, onStartOver
    } = props;

    const [imageDimensions, setImageDimensions] = useState<{ width: number, height: number } | null>(null);
    const [showComparator, setShowComparator] = useState(false);
    const [originalViewUrl, setOriginalViewUrl] = useState<string | null>(null);

    useEffect(() => {
      let objectUrl: string | null = null;
      if (showComparator && originalImage) {
        objectUrl = URL.createObjectURL(originalImage);
        setOriginalViewUrl(objectUrl);
      }
      return () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [showComparator, originalImage]);
    
    useEffect(() => {
        if (!isGeneratorMode && activeTab === 'model') {
            setActiveTab('retouch');
        }
    }, [isGeneratorMode, activeTab, setActiveTab]);
    
    useEffect(() => {
        if (maskDataUrl && editHotspot) {
            setEditHotspot(null);
            setDisplayHotspot(null);
        }
    }, [maskDataUrl, editHotspot, setEditHotspot, setDisplayHotspot]);

    const tabNames: Record<EditorTab, { name: string, icon: React.ComponentType<{className?: string}> }> = {
        retouch: { name: 'Retocar', icon: MagicWandIcon },
        model: { name: 'Modelo', icon: SparklesIcon },
        crop: { name: 'Tamanho', icon: ScaleIcon },
    };
    
    const availableTabs = isGeneratorMode
        ? canUndo
            ? (['model', 'retouch', 'crop'] as const)
            : (['model'] as const)
        : (['retouch', 'crop'] as const);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        setImageDimensions({
            width: e.currentTarget.naturalWidth,
            height: e.currentTarget.naturalHeight
        });
    };

    const handleHotspotClick = (pos: { x: number; y: number; }) => {
        const img = imgRef.current;
        if (!img) return;
        
        const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
        const scaleX = naturalWidth / clientWidth;
        const scaleY = naturalHeight / clientHeight;
        const originalX = Math.round(pos.x * scaleX);
        const originalY = Math.round(pos.y * scaleY);
        
        setMaskDataUrl(null); // A click clears any mask.
        setDisplayHotspot(pos);
        setEditHotspot({ x: originalX, y: originalY });
    };

    const handleMaskUpdate = (dataUrl: string | null) => {
        // Drawing a mask clears any hotspot.
        if (dataUrl) {
            setEditHotspot(null);
            setDisplayHotspot(null);
        }
        setMaskDataUrl(dataUrl);
    };

    const isPreviewMode = activeTab !== 'crop' && activeTab !== 'retouch';
    
    if (!currentImage) {
        return (
            <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 animate-fade-in">
                <div className="w-full lg:sticky lg:top-24 self-start">
                    <EditorGalleryPlaceholder onLoadImageFromGallery={onLoadImageFromGallery} onLoadImage={onLoadImage} currentUser={currentUser} getToken={getToken} />
                </div>
                
                <div className="w-full flex flex-col gap-4">
                    <div className="w-full bg-gray-100/80 border border-gray-200/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm opacity-50">
                        {(['retouch', 'crop'] as const).map(tab => (
                             <button
                                key={tab}
                                disabled
                                className="w-full capitalize font-semibold py-3 px-5 rounded-md text-base text-gray-500 cursor-not-allowed"
                            >
                                {tabNames[tab].name}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-grow items-center justify-center p-8 bg-white/80 border border-gray-200 rounded-lg text-center backdrop-blur-sm shadow-sm">
                        <p className="text-gray-600 font-semibold">
                            Selecione uma imagem da galeria à esquerda para começar.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const imageDisplay = (
      <div className="relative group w-full h-full aspect-auto flex items-center justify-center">
        {activeTab === 'retouch' && (
            <MaskingCanvas 
                imageElement={imgRef.current}
                brushSize={brushSize}
                maskMode={maskMode}
                onMaskUpdate={handleMaskUpdate}
                maskDataUrl={maskDataUrl}
                onHotspotClick={handleHotspotClick}
            />
        )}
        {showComparator && originalViewUrl && currentImageUrl ? (
            <ImageComparator originalSrc={originalViewUrl} currentSrc={currentImageUrl} onImageLoad={handleImageLoad} imgRef={imgRef} />
        ) : (
            <img
                ref={imgRef}
                key={currentImage ? `${currentImage.name}-${currentImage.size}-${currentImage.lastModified}` : 'no-image'}
                src={currentImageUrl!}
                alt="Atual"
                onLoad={handleImageLoad}
                onClick={isPreviewMode ? onOpenPreview : undefined}
                className={`w-full h-auto object-contain max-h-[75vh] rounded-xl ${isPreviewMode ? 'cursor-zoom-in' : ''} ${activeTab === 'retouch' ? 'pointer-events-none' : ''}`}
            />
        )}

        {originalImage && (
          <button
              onClick={() => setShowComparator(!showComparator)}
              className={`absolute bottom-4 right-4 z-20 flex items-center gap-2 pl-3 pr-4 py-2 rounded-full font-semibold text-sm transition-all duration-300 shadow-lg ${showComparator ? 'bg-blue-600 text-white' : 'bg-white/80 text-gray-800 backdrop-blur-sm hover:bg-white'}`}
              title={showComparator ? "Sair da comparação" : "Comparar com original"}
              aria-pressed={showComparator}
          >
              <EyeIcon className="w-5 h-5" />
              <span>{showComparator ? 'Comparando' : 'Comparar'}</span>
          </button>
        )}
      </div>
    );
    
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={currentImage ? `crop-${currentImage.name}-${currentImage.size}-${currentImage.lastModified}` : 'no-crop-image'}
        src={currentImageUrl!} 
        alt="Cortar esta imagem"
        onLoad={handleImageLoad}
        className="w-full h-auto object-contain max-h-[75vh] rounded-xl"
      />
    );
    
    return (
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 animate-fade-in">
        {/* --- Left Column: Image Preview --- */}
        <div className="w-full lg:sticky lg:top-24 self-start">
            <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/80 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in backdrop-blur-sm">
                        <Spinner />
                        {loadingStatus ? (
                            <div className="text-center w-full max-w-xs px-4">
                                <p className="text-gray-700 font-semibold">{loadingStatus.message}</p>
                                {loadingStatus.estimate && <p className="text-sm text-gray-500 mt-1">Tempo estimado: {loadingStatus.estimate}</p>}
                                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${loadingStatus.percentage}%` }}></div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-700">A IA está fazendo sua mágica...</p>
                        )}
                    </div>
                )}
                
                {activeTab === 'crop' ? (
                  <ReactCrop 
                    crop={crop} 
                    onChange={c => setCrop(c)} 
                    onComplete={c => setCompletedCrop(c)}
                    aspect={aspect}
                    className="flex justify-center max-h-[75vh]"
                  >
                    {cropImageElement}
                  </ReactCrop>
                ) : imageDisplay }

                {displayHotspot && !isLoading && activeTab === 'retouch' && !maskDataUrl && (
                    <div 
                        className="absolute rounded-full w-6 h-6 bg-blue-500/50 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                        style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                    >
                        <div className="absolute inset-0 rounded-full w-6 h-6 animate-ping bg-blue-400"></div>
                    </div>
                )}
            </div>
        </div>
        
        {/* --- Right Column: Controls --- */}
        <div className="w-full flex flex-col gap-4">
            <div className="w-full bg-gray-100/80 border border-gray-200/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
                {availableTabs.map(tab => {
                    const TabIcon = tabNames[tab].icon;
                    return (
                     <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-shrink-0 flex items-center justify-center gap-2 capitalize font-semibold py-2 px-4 rounded-md transition-all duration-200 text-sm ${
                            activeTab === tab 
                            ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-black/5'
                        }`}
                    >
                        <TabIcon className="w-5 h-5" />
                        <span>{tabNames[tab].name}</span>
                    </button>
                )})}
            </div>

            {!isGeneratorMode && (
                <div className="flex items-center justify-center gap-2 p-2 bg-white/80 border border-gray-200 rounded-lg backdrop-blur-sm animate-fade-in shadow-sm">
                    <button 
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="flex items-center justify-center gap-2 flex-1 text-center bg-white border border-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-gray-100 hover:border-gray-400 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Desfazer (Ctrl+Z)"
                    >
                        <UndoIcon className="w-5 h-5" />
                        <span>Desfazer</span>
                    </button>
                    <button 
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="flex items-center justify-center gap-2 flex-1 text-center bg-white border border-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-gray-100 hover:border-gray-400 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refazer (Ctrl+Y)"
                    >
                        <RedoIcon className="w-5 h-5" />
                        <span>Refazer</span>
                    </button>
                    <div className="h-8 w-px bg-gray-300 mx-1"></div>
                    <button 
                        onClick={handleReset}
                        disabled={!canUndo}
                        className="flex items-center justify-center gap-2 flex-1 text-center bg-white border border-transparent text-red-600 font-semibold py-2 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-red-50 hover:border-red-200 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Resetar para a imagem original"
                    >
                        <ArrowPathIcon className="w-5 h-5" />
                        <span>Resetar</span>
                    </button>
                </div>
            )}
            
            <div className="w-full">
                {activeTab === 'retouch' && (
                    <div className="w-full bg-white/80 border border-gray-200 rounded-lg p-6 flex flex-col gap-6 animate-fade-in backdrop-blur-sm">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-800">Edição com IA</h3>
                             <p className="text-sm text-gray-600">
                                {maskDataUrl ? 'Máscara ativa.' : editHotspot ? 'Ponto de edição ativo.' : 'Clique para uma edição pontual ou arraste para criar uma máscara.'}
                            </p>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Descreva sua edição..."
                                className="flex-grow bg-white border border-gray-300 text-gray-900 rounded-lg p-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isLoading || (!editHotspot && !maskDataUrl)}
                            />
                            <button 
                                type="submit"
                                className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 text-base rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                                disabled={isLoading || !prompt.trim() || (!editHotspot && !maskDataUrl)}
                            >
                                Gerar
                            </button>
                        </form>

                        <div className="flex flex-col gap-4 border-t border-gray-200 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 text-center mb-2">Ferramenta de Máscara</label>
                                <div className="flex items-center gap-2 p-1 bg-gray-200/70 rounded-lg">
                                    <button onClick={() => setMaskMode('brush')} disabled={isLoading} className={`w-full text-center font-semibold py-2 px-4 rounded-md transition-all text-sm ${maskMode === 'brush' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}>
                                    Pincel
                                    </button>
                                    <button onClick={() => setMaskMode('eraser')} disabled={isLoading} className={`w-full text-center font-semibold py-2 px-4 rounded-md transition-all text-sm ${maskMode === 'eraser' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'}`}>
                                    Borracha
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="brushSize" className="block text-sm font-medium text-gray-700 text-center mb-2">Tamanho: {brushSize}px</label>
                                <input id="brushSize" type="range" min="5" max="100" step="1" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} disabled={isLoading} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
                            </div>
                            <button onClick={() => setMaskDataUrl(null)} disabled={isLoading || !maskDataUrl} className="flex items-center justify-center gap-2 text-sm bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                <TrashIcon className="w-4 h-4" />
                                Limpar Máscara
                            </button>
                        </div>
                    </div>
                )}
                {activeTab === 'crop' && <CropPanel 
                                            onApplyCrop={handleApplyCrop} 
                                            onSetAspect={setAspect} 
                                            isLoading={isLoading} 
                                            isCropping={!!completedCrop?.width && completedCrop.width > 0}
                                            completedCrop={completedCrop}
                                            setCrop={setCrop}
                                            onApplyResize={handleApplyResize}
                                            imageDimensions={imageDimensions}
                                        />}
                {activeTab === 'model' && isGeneratorMode && 
                    <ModelPanel 
                        onGenerateModel={handleGenerateModel} 
                        isLoading={isLoading}
                        targetDimensions={targetDimensions}
                        onTargetDimensionsChange={setTargetDimensions}
                        modelNotes={modelNotes}
                        onModelNotesChange={setModelNotes}
                        negativePrompt={editorNegativePrompt}
                        onNegativePromptChange={setEditorNegativePrompt}
                        modelAge={editorModelAge}
                        onModelAgeChange={setEditorModelAge}
                        modelGender={editorModelGender}
                        onModelGenderChange={setEditorModelGender}
                        isTrainingAgent={isTrainingAgent}
                        trainedAgeData={trainedAgeData}
                    />
                }
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                {!isGeneratorMode && (
                    <>
                        <button
                            onClick={onNavigateToGallery}
                            className="flex items-center justify-center text-center bg-white border border-gray-300 text-gray-800 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-gray-100 hover:border-gray-400 active:scale-95 text-base"
                        >
                            <PhotoIcon className="w-5 h-5 mr-2" />
                            Galeria
                        </button>
                        <button 
                            onClick={handleSelectAnother}
                            className="text-center bg-white border border-gray-300 text-gray-800 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-gray-100 hover:border-gray-400 active:scale-95 text-base"
                        >
                            Selecionar Outra Imagem
                        </button>
                    </>
                )}
                {isGeneratorMode && (
                     <button 
                        onClick={onStartOver}
                        className="text-center bg-white border border-gray-300 text-gray-800 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-gray-100 hover:border-gray-400 active:scale-95 text-base"
                    >
                        Começar de Novo
                    </button>
                )}
                <button 
                    onClick={handleDownload}
                    disabled={!currentImage}
                    className="flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                    Baixar Imagem
                </button>
            </div>
        </div>
      </div>
    );
};

export default Editor;
