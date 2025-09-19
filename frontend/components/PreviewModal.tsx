/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, PlusIcon, MinusIcon } from './icons';
import { type StoredImage } from '../services/galleryService';
import Spinner from './Spinner';

interface PreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    images: StoredImage[];
    startIndex: number;
}

const ImageComparator: React.FC<{originalSrc: string, currentSrc: string, onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void, imgRef: React.RefObject<HTMLImageElement>}> = ({ originalSrc, currentSrc, onImageLoad, imgRef }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        let percentage = (x / rect.width) * 100;
        if (percentage < 0) percentage = 0;
        if (percentage > 100) percentage = 100;
        setSliderPosition(percentage);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        isDragging.current = true;
        handleMove(e.clientX);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging.current) {
            e.preventDefault();
            handleMove(e.clientX);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if(isDragging.current) {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            isDragging.current = false;
        }
    };


    return (
        <div 
            ref={containerRef}
            className="relative w-full h-full select-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <img
                src={originalSrc}
                alt="Original"
                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
            />
            <div 
                className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`}}
            >
                <img
                    ref={imgRef}
                    src={currentSrc}
                    alt="Atual"
                    onLoad={onImageLoad}
                    className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                />
            </div>
            <div 
                className="absolute top-0 h-full w-1 bg-white/80 cursor-ew-resize z-10"
                style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
                onPointerDown={handlePointerDown}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 shadow-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                </div>
            </div>
        </div>
    );
};

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, images, startIndex }) => {
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [isComparing, setIsComparing] = useState(false);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    
    const initialTransformState = { scale: 1, panX: 0, panY: 0 };
    const [transformState, setTransformState] = useState(initialTransformState);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

    // This function calculates the initial scale to fit the image inside the container.
    // No dependencies needed as it relies on refs which are always current.
    const getInitialState = useCallback(() => {
        if (!containerRef.current || !imageRef.current || !imageRef.current.complete || imageRef.current.naturalWidth === 0) {
            return initialTransformState;
        }
        const container = containerRef.current;
        const image = imageRef.current;
        const containerRect = container.getBoundingClientRect();
        const { naturalWidth, naturalHeight } = image;
        
        const PADDING_EACH_SIDE = 32;
        const availableWidth = containerRect.width - (PADDING_EACH_SIDE * 2);
        const availableHeight = containerRect.height - (PADDING_EACH_SIDE * 2);

        const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
        
        return { scale, panX: 0, panY: 0 };
    }, []);

    // This function ensures the user cannot pan the image out of view.
    const getConstrainedPan = useCallback((panX: number, panY: number, scale: number) => {
        if (!containerRef.current || !imageRef.current || !imageRef.current.complete || imageRef.current.naturalWidth === 0) return { panX, panY };
        const containerRect = containerRef.current.getBoundingClientRect();
        const { naturalWidth, naturalHeight } = imageRef.current;
        const scaledWidth = naturalWidth * scale;
        const scaledHeight = naturalHeight * scale;
        
        const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
        const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);

        const constrainedX = Math.max(-maxX, Math.min(panX, maxX));
        const constrainedY = Math.max(-maxY, Math.min(panY, maxY));
        
        return { panX: constrainedX, panY: constrainedY };
    }, []);

    // Effect to reset everything when the image changes (via currentIndex)
    useEffect(() => {
        if (isOpen) {
            setIsImageLoaded(false);
            setIsZoomed(false);
            setIsComparing(false);
            setTransformState(initialTransformState);
        }
    }, [currentIndex, isOpen]);

    // Effect to set the initial index when the modal is opened.
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(startIndex);
        }
    }, [isOpen, startIndex]);
    
    // This callback runs when the new image's `onLoad` event fires.
    const handleImageLoad = useCallback(() => {
        setIsImageLoaded(true);
        setTransformState(getInitialState());
    }, [getInitialState]);

    const currentImage = images[currentIndex];
    
    // Effect to handle cached images that might not fire onLoad.
    // This is a critical fix for the "works on second try" issue.
    useEffect(() => {
        if (isOpen && imageRef.current?.complete && !isImageLoaded) {
            handleImageLoad();
        }
    }, [isOpen, currentImage?.url, handleImageLoad, isImageLoaded]);

    // useLayoutEffect is now only for handling window resize.
    useLayoutEffect(() => {
        const handleResize = () => {
            if (isOpen && isImageLoaded) {
                if (isZoomed) {
                    setTransformState(current => ({ ...current, ...getConstrainedPan(current.panX, current.panY, current.scale) }));
                } else {
                    setTransformState(getInitialState());
                }
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isOpen, isImageLoaded, isZoomed, getInitialState, getConstrainedPan]);
    
    const handleZoom = useCallback((direction: 'in' | 'out', e?: React.MouseEvent) => {
        if(e) e.stopPropagation();
        if (!isImageLoaded || !containerRef.current || isComparing) return;
    
        const scaleFactor = 1.25;
    
        setTransformState(currentTransform => {
            const { scale: oldScale, panX: oldPanX, panY: oldPanY } = currentTransform;
            let newScale = direction === 'in' ? oldScale * scaleFactor : oldScale / scaleFactor;
            
            const minScale = getInitialState().scale;
            if (direction === 'out' && newScale < minScale) {
                newScale = minScale;
                if (Math.abs(newScale - oldScale) < 0.01) {
                    setIsZoomed(false);
                    return getInitialState();
                }
            }
            newScale = Math.min(newScale, 20); // Max zoom
            
            if (newScale === oldScale) return currentTransform;
    
            const scaleRatio = newScale / oldScale;
            const newPanX = oldPanX * scaleRatio;
            const newPanY = oldPanY * scaleRatio;
            
            return { scale: newScale, ...getConstrainedPan(newPanX, newPanY, newScale) };
        });
        
        if (!isZoomed) setIsZoomed(true);

    }, [isImageLoaded, getConstrainedPan, getInitialState, isZoomed, isComparing]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isImageLoaded || isComparing) return;
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX: transformState.panX, panY: transformState.panY, moved: false };
        if(isZoomed){
          setIsDragging(true);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !isZoomed || isComparing) return;
        const { x: startX, y: startY, panX: startPanX, panY: startPanY } = dragStartRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragStartRef.current.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            dragStartRef.current.moved = true;
        }
        setTransformState(prev => ({ scale: prev.scale, ...getConstrainedPan(startPanX + dx, startPanY + dy, prev.scale) }));
    };
    
    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDragging) {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            setIsDragging(false);
        }
        if (!isImageLoaded) return;

        if (!dragStartRef.current.moved) {
            if (isComparing) return;
             const newZoomState = !isZoomed;
             setIsZoomed(newZoomState);
             if (newZoomState) {
                const newScale = 1; // 100% natural size
                setTransformState({ scale: newScale, ...getConstrainedPan(0, 0, newScale) });
             } else {
                 setTransformState(getInitialState());
             }
        }
        dragStartRef.current.moved = false;
    };

    const goToPrevious = useCallback(() => {
        if (isZoomed) return;
        setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
    }, [isZoomed, images.length]);

    const goToNext = useCallback(() => {
        if (isZoomed) return;
        setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
    }, [isZoomed, images.length]);

    const toggleCompare = () => {
        if (isZoomed) {
            setTransformState(getInitialState());
            setIsZoomed(false);
        }
        setIsComparing(prev => !prev);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrevious();
            if (e.key === 'ArrowRight') goToNext();
            if (e.key === 'Escape') {
                if (isZoomed) {
                    setIsZoomed(false);
                    setTransformState(getInitialState());
                } else {
                    onClose();
                }
            }
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, goToPrevious, goToNext, onClose, isZoomed, getInitialState]);

    if (!isOpen || !currentImage) return null;

    const stripExtension = (filename: string) => filename.replace(/\.[^/.]+$/, "");
    const displayTitle = stripExtension(currentImage.name.replace('Original: ', ''));
    
    let cursorStyle = 'wait';
    if (isImageLoaded) {
      if (isComparing) {
        cursorStyle = 'default';
      } else if (isZoomed) {
        cursorStyle = isDragging ? 'cursor-grabbing' : 'cursor-grab';
      } else {
        cursorStyle = 'cursor-zoom-in';
      }
    }
    const hideMainControls = isZoomed || isDragging || !isImageLoaded;

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors z-[70]" aria-label="Fechar visualizador">
                <XMarkIcon className="w-8 h-8" />
            </button>
            
            <div
                ref={containerRef}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[85vh] max-w-[1400px] max-h-[90vh] bg-black/50 overflow-hidden rounded-lg shadow-2xl flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                 {!isImageLoaded && <Spinner />}
                <div
                    className={`absolute inset-0 ${cursorStyle}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    {isComparing && currentImage.originalUrl ? (
                        <div className="w-full h-full flex items-center justify-center p-8 pointer-events-auto" style={{visibility: isImageLoaded ? 'visible' : 'hidden'}}>
                            <ImageComparator
                                originalSrc={currentImage.originalUrl}
                                currentSrc={currentImage.url}
                                onImageLoad={handleImageLoad}
                                imgRef={imageRef}
                            />
                        </div>
                    ) : (
                        <img
                            ref={imageRef}
                            key={currentImage.id + currentImage.url}
                            src={currentImage.url}
                            alt={currentImage.name}
                            onLoad={handleImageLoad}
                            className="absolute max-w-none pointer-events-none"
                            style={{
                                left: '50%',
                                top: '50%',
                                transform: `translate(calc(-50% + ${transformState.panX}px), calc(-50% + ${transformState.panY}px)) scale(${transformState.scale})`,
                                transformOrigin: 'center',
                                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                                willChange: 'transform',
                                visibility: isImageLoaded ? 'visible' : 'hidden',
                            }}
                            draggable={false}
                        />
                    )}
                </div>
            </div>

            <div className="z-[65] w-full h-full pointer-events-none">
                <button onClick={(e) => { e.stopPropagation(); goToPrevious(); }} className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200 pointer-events-auto ${hideMainControls || images.length <= 1 ? 'opacity-0 !pointer-events-none' : 'opacity-100'}`} aria-label="Imagem anterior">
                    <ChevronLeftIcon className="w-10 h-10" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); goToNext(); }} className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200 pointer-events-auto ${hideMainControls || images.length <= 1 ? 'opacity-0 !pointer-events-none' : 'opacity-100'}`} aria-label="Próxima imagem">
                    <ChevronRightIcon className="w-10 h-10" />
                </button>

                <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full p-2 shadow-lg transition-opacity pointer-events-auto ${isZoomed ? 'opacity-100' : 'opacity-0 !pointer-events-none'}`}>
                    <button onClick={(e) => handleZoom('out', e)} className="p-2 text-white rounded-full hover:bg-white/20 transition"><MinusIcon className="w-6 h-6"/></button>
                    <div className="p-2 text-white text-sm font-bold w-16 text-center">{isImageLoaded ? Math.round(transformState.scale / getInitialState().scale * 100) : 100}%</div>
                    <button onClick={(e) => handleZoom('in', e)} className="p-2 text-white rounded-full hover:bg-white/20 transition"><PlusIcon className="w-6 h-6"/></button>
                </div>
            
                <div className={`absolute bottom-4 left-4 transition-opacity ${hideMainControls ? 'opacity-0' : 'opacity-100'}`}>
                    {currentImage?.originalUrl && (
                        <button onClick={(e) => { e.stopPropagation(); toggleCompare(); }} className={`flex items-center gap-2 pl-3 pr-4 py-2 rounded-full font-semibold text-sm transition-all duration-300 shadow-lg pointer-events-auto ${isComparing ? 'bg-blue-600 text-white' : 'bg-white/80 text-gray-800 backdrop-blur-sm hover:bg-white'}`} title={isComparing ? "Ver imagem editada" : "Ver imagem original"} aria-pressed={isComparing}>
                            <EyeIcon className="w-5 h-5" />
                            <span>{isComparing ? 'Comparando' : 'Comparar'}</span>
                        </button>
                    )}
                </div>
                
                <div className={`absolute bottom-4 w-auto max-w-4xl left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-6 py-3 rounded-lg text-center transition-opacity ${hideMainControls ? 'opacity-0' : 'opacity-100'}`}>
                    <p className="font-bold truncate" title={currentImage.name}>{isComparing ? `Comparando: ${displayTitle}` : displayTitle}</p>
                    {images.length > 1 && (<p className="text-sm text-gray-300">{`(${currentIndex + 1} de ${images.length})`}</p>)}
                    {currentImage.metadata && (
                        <>
                            <div className="w-full border-t border-white/20 my-2"></div>
                            <div className="text-xs text-gray-200 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1 text-left">
                                {Object.entries(currentImage.metadata).map(([key, value]) => (<div key={key} className="truncate"><span className="font-semibold capitalize text-gray-100">{key}:</span> {String(value)}</div>))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PreviewModal;
