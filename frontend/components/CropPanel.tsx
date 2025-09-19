/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import type { Crop, PixelCrop } from 'react-image-crop';
import { LockClosedIcon, LockOpenIcon } from './icons';

interface CropPanelProps {
  onApplyCrop: () => void;
  onApplyResize: (width: number, height: number) => void;
  onSetAspect: (aspect: number | undefined) => void;
  isLoading: boolean;
  isCropping: boolean;
  completedCrop?: PixelCrop;
  setCrop: (crop: Crop) => void;
  imageDimensions: { width: number, height: number } | null;
}

type PanelMode = 'crop' | 'resize';
type AspectRatio = 'free' | '1:1' | '16:9';
type CropMode = 'ratio' | 'pixels';

const CropPanel: React.FC<CropPanelProps> = ({ 
    onApplyCrop, onApplyResize, onSetAspect, isLoading, 
    isCropping, completedCrop, setCrop, imageDimensions 
}) => {
  const [mode, setMode] = useState<PanelMode>('crop');
  
  // Crop state
  const [cropMode, setCropMode] = useState<CropMode>('ratio');
  const [activeAspect, setActiveAspect] = useState<AspectRatio>('free');
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [isRatioLocked, setIsRatioLocked] = useState(false);

  // Resize state
  const [resizeWidth, setResizeWidth] = useState('');
  const [resizeHeight, setResizeHeight] = useState('');
  const [constrainProportions, setConstrainProportions] = useState(true);
  const originalAspectRatio = useRef(1);


  useEffect(() => {
    if (completedCrop?.width && completedCrop.width > 0) {
        setWidthInput(String(Math.round(completedCrop.width)));
        setHeightInput(String(Math.round(completedCrop.height)));
    } else {
        setWidthInput('');
        setHeightInput('');
    }
  }, [completedCrop]);

  useEffect(() => {
    if (mode === 'resize' && imageDimensions) {
        setResizeWidth(String(imageDimensions.width));
        setResizeHeight(String(imageDimensions.height));
        if (imageDimensions.height > 0) {
            originalAspectRatio.current = imageDimensions.width / imageDimensions.height;
        }
    }
  }, [imageDimensions, mode]);


  const handleCropModeChange = (mode: CropMode) => {
    setCropMode(mode);
    if (mode === 'pixels') {
        onSetAspect(undefined);
        setActiveAspect('free');
    }
  };
  
  const handleDimensionChange = () => {
    const newWidth = parseInt(widthInput, 10);
    const newHeight = parseInt(heightInput, 10);

    if (!isNaN(newWidth) && !isNaN(newHeight) && newWidth > 0 && newHeight > 0 && completedCrop) {
        const centerX = completedCrop.x + completedCrop.width / 2;
        const centerY = completedCrop.y + completedCrop.height / 2;
        const newX = centerX - newWidth / 2;
        const newY = centerY - newHeight / 2;

        setCrop({ unit: 'px', x: newX, y: newY, width: newWidth, height: newHeight });
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        handleDimensionChange();
        (e.target as HTMLInputElement).blur();
    }
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWidthStr = e.target.value;
    setWidthInput(newWidthStr);

    if (isRatioLocked && completedCrop?.width && completedCrop.width > 0) {
        const ratio = completedCrop.height / completedCrop.width;
        const newWidth = parseInt(newWidthStr, 10);
        if (!isNaN(newWidth)) {
            setHeightInput(String(Math.round(newWidth * ratio)));
        }
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHeightStr = e.target.value;
    setHeightInput(newHeightStr);

    if (isRatioLocked && completedCrop?.height && completedCrop.height > 0) {
        const ratio = completedCrop.width / completedCrop.height;
        const newHeight = parseInt(newHeightStr, 10);
        if (!isNaN(newHeight)) {
            setWidthInput(String(Math.round(newHeight * ratio)));
        }
    }
  };
  
  const handleResizeWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWidthStr = e.target.value;
    setResizeWidth(newWidthStr);
    if (constrainProportions && originalAspectRatio.current > 0) {
        const newWidth = parseInt(newWidthStr, 10);
        if (!isNaN(newWidth)) {
            setResizeHeight(String(Math.round(newWidth / originalAspectRatio.current)));
        }
    }
  };

  const handleResizeHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHeightStr = e.target.value;
    setResizeHeight(newHeightStr);
    if (constrainProportions && originalAspectRatio.current > 0) {
        const newHeight = parseInt(newHeightStr, 10);
        if (!isNaN(newHeight)) {
            setResizeWidth(String(Math.round(newHeight * originalAspectRatio.current)));
        }
    }
  };
  
  const handleApplyResizeClick = () => {
    const newWidth = parseInt(resizeWidth, 10);
    const newHeight = parseInt(resizeHeight, 10);
    if (!isNaN(newWidth) && !isNaN(newHeight) && newWidth > 0 && newHeight > 0) {
        onApplyResize(newWidth, newHeight);
    }
  };

  const handleAspectChange = (aspect: AspectRatio, value: number | undefined) => {
    setActiveAspect(aspect);
    onSetAspect(value);
  }

  const aspects: { name: AspectRatio, value: number | undefined, label: string }[] = [
    { name: 'free', value: undefined, label: 'Livre' },
    { name: '1:1', value: 1 / 1, label: '1:1' },
    { name: '16:9', value: 16 / 9, label: '16:9' },
  ];

  return (
    <div className="w-full bg-white/80 border border-gray-200 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-gray-800">Tamanho da Imagem</h3>
      
      <div className="flex items-center gap-2 p-1 bg-gray-200/70 rounded-lg">
          <button
              onClick={() => setMode('crop')}
              className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 ${
                  mode === 'crop'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
          >
              Cortar
          </button>
          <button
              onClick={() => setMode('resize')}
              className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 ${
                  mode === 'resize'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
          >
              Redimensionar
          </button>
      </div>

      {mode === 'crop' && (
        <div className="w-full flex flex-col items-center gap-4 animate-fade-in">
            <div className="flex items-center gap-2 p-1 bg-gray-200/70 rounded-lg">
                <button
                    onClick={() => handleCropModeChange('ratio')}
                    className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 ${
                        cropMode === 'ratio'
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                    Proporção
                </button>
                <button
                    onClick={() => handleCropModeChange('pixels')}
                    className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 ${
                        cropMode === 'pixels'
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                    Pixels (px)
                </button>
            </div>

            {cropMode === 'ratio' && (
                <div className="animate-fade-in mt-2 flex items-center gap-2">
                    {aspects.map(({ name, value, label }) => (
                        <button
                        key={name}
                        onClick={() => handleAspectChange(name, value)}
                        disabled={isLoading}
                        className={`px-4 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 ${
                            activeAspect === name 
                            ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20' 
                            : 'bg-black/5 hover:bg-black/10 text-gray-700'
                        }`}
                        >
                        {label}
                        </button>
                    ))}
                </div>
            )}

            {cropMode === 'pixels' && (
                <div className="animate-fade-in mt-2 flex flex-col items-center gap-4">
                    <p className="text-sm text-gray-600">Insira as dimensões exatas.</p>
                    <div className="flex items-center gap-2">
                        <div>
                            <label htmlFor="crop-width" className="block text-xs font-medium text-gray-500 mb-1 text-center">Largura (px)</label>
                            <input 
                                id="crop-width" type="number" value={widthInput} onChange={handleWidthChange}
                                onBlur={handleDimensionChange} onKeyDown={handleInputKeyDown}
                                disabled={isLoading || !isCropping}
                                className="w-24 bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                        <div className="self-end pb-2 pt-5">
                            <button
                                onClick={() => setIsRatioLocked(!isRatioLocked)} disabled={isLoading || !isCropping}
                                className="p-2 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition disabled:opacity-50"
                                title={isRatioLocked ? "Desbloquear proporção" : "Bloquear proporção"}
                            >
                                {isRatioLocked ? <LockClosedIcon className="w-5 h-5" /> : <LockOpenIcon className="w-5 h-5" />}
                            </button>
                        </div>
                        <div>
                            <label htmlFor="crop-height" className="block text-xs font-medium text-gray-500 mb-1 text-center">Altura (px)</label>
                            <input 
                                id="crop-height" type="number" value={heightInput} onChange={handleHeightChange}
                                onBlur={handleDimensionChange} onKeyDown={handleInputKeyDown}
                                disabled={isLoading || !isCropping}
                                className="w-24 bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={onApplyCrop} disabled={isLoading || !isCropping}
                className="w-full max-w-xs mt-2 bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            >
                Aplicar Corte
            </button>
        </div>
      )}

      {mode === 'resize' && (
        <div className="w-full flex flex-col items-center gap-4 animate-fade-in">
            <div className="mt-2 flex flex-col items-center gap-4">
              <p className="text-sm text-gray-600">Insira as novas dimensões da imagem.</p>
              <div className="flex items-center gap-2">
                  <div>
                      <label htmlFor="resize-width" className="block text-xs font-medium text-gray-500 mb-1 text-center">Largura (px)</label>
                      <input 
                          id="resize-width" type="number" value={resizeWidth} onChange={handleResizeWidthChange}
                          disabled={isLoading}
                          className="w-28 bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                      />
                  </div>
                  <div className="self-end pb-2 pt-5">
                      <button
                          onClick={() => setConstrainProportions(!constrainProportions)}
                          disabled={isLoading}
                          className="p-2 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition disabled:opacity-50"
                          title={constrainProportions ? "Desbloquear proporção" : "Bloquear proporção"}
                      >
                          {constrainProportions ? <LockClosedIcon className="w-5 h-5" /> : <LockOpenIcon className="w-5 h-5" />}
                      </button>
                  </div>
                  <div>
                      <label htmlFor="resize-height" className="block text-xs font-medium text-gray-500 mb-1 text-center">Altura (px)</label>
                      <input 
                          id="resize-height" type="number" value={resizeHeight} onChange={handleResizeHeightChange}
                          disabled={isLoading}
                          className="w-28 bg-white border border-gray-300 text-gray-800 rounded-lg p-2 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                      />
                  </div>
              </div>
          </div>
          <button
            onClick={handleApplyResizeClick}
            disabled={isLoading || !resizeWidth || !resizeHeight}
            className="w-full max-w-xs mt-2 bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          >
            Aplicar Redimensionamento
          </button>
        </div>
      )}
    </div>
  );
};

export default CropPanel;