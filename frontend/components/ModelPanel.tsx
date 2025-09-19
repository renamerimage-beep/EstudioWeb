/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useContext } from 'react';
import ReferenceModelUploader from './ReferenceModelUploader';
import ReferenceSceneUploader from './ReferenceSceneUploader';
import ReferenceBottomUploader from './ReferenceBottomUploader';
import { LockClosedIcon, LockOpenIcon, CheckIcon } from './icons';
import type { ModelAge } from '../App';
import { SharedSettingsContext } from '../App';

interface ModelPanelProps {
  onGenerateModel: (customPrompt: string, modelNotes: string, negativePrompt: string) => void;
  isLoading: boolean;
  targetDimensions: { width: string, height: string };
  onTargetDimensionsChange: (dims: { width: string, height: string }) => void;
  modelNotes: string;
  onModelNotesChange: (notes: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (prompt: string) => void;
  modelAge: { male: string, female: string };
  onModelAgeChange: (age: { male: string, female: string }) => void;
  modelGender: 'male' | 'female';
  onModelGenderChange: (gender: 'male' | 'female') => void;
  isTrainingAgent: Set<string>;
  trainedAgeData: Map<string, string>;
}

const ModelPanel: React.FC<ModelPanelProps> = ({ 
    onGenerateModel, isLoading, 
    targetDimensions, onTargetDimensionsChange,
    modelNotes, onModelNotesChange,
    negativePrompt, onNegativePromptChange,
    modelAge, onModelAgeChange,
    modelGender, onModelGenderChange,
    isTrainingAgent, trainedAgeData
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [constrainProportions, setConstrainProportions] = useState(true);
  const sharedSettings = useContext(SharedSettingsContext);

  if (!sharedSettings) {
    // This should not happen if the component is rendered within the provider
    return <div>Erro: Contexto de configurações não encontrado.</div>;
  }
  
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
  
  const agePresets: { id: ModelAge; label: string; representativeAge: string }[] = [
      { id: 'adult', label: 'Adulto', representativeAge: '30 anos' },
      { id: 'teenager', label: 'Adolescente', representativeAge: '16 anos' },
      { id: 'child', label: 'Criança', representativeAge: '8 anos' },
      { id: 'baby', label: 'Bebê', representativeAge: '1 ano' },
      { id: 'newborn', label: 'Recém-Nascido', representativeAge: 'Recém-nascido' },
  ];
  
  const currentAgeForGender = modelAge[modelGender];

  const handleAgeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onModelAgeChange({ ...modelAge, [modelGender]: e.target.value });
  };

  const handleGenerate = () => {
    onGenerateModel(customPrompt, modelNotes, negativePrompt);
  };
  
  const hasReferenceScene = !!referenceSceneFile;

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onTargetDimensionsChange({
        width: value,
        height: constrainProportions ? value : targetDimensions.height
    });
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onTargetDimensionsChange({
        width: constrainProportions ? value : targetDimensions.width,
        height: value
    });
  };
  
  const referenceBottomFile = modelGender === 'male' ? maleReferenceBottomFile : femaleReferenceBottomFile;
  const onReferenceBottomChange = modelGender === 'male' ? setMaleReferenceBottomFile : setFemaleReferenceBottomFile;
  const isAnalyzingBottom = modelGender === 'male' ? isAnalyzingMaleBottom : isAnalyzingFemaleBottom;
  const referenceBottomDescription = modelGender === 'male' ? maleReferenceBottomDescription : femaleReferenceBottomDescription;

  const referenceModelFile = modelGender === 'male' ? maleReferenceModelFile : femaleReferenceModelFile;
  const onReferenceModelChange = modelGender === 'male' ? setMaleReferenceModelFile : setFemaleReferenceModelFile;
  const referenceModelLabel = `Modelo (${modelGender === 'male' ? 'Masculino' : 'Feminino'})`;


    const SmallSpinner: React.FC = () => (
        <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );

  return (
    <div className="w-full bg-white/80 border border-gray-200 rounded-lg p-6 flex flex-col gap-6 animate-fade-in backdrop-blur-sm">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-800">Gerar um Modelo</h3>
        <p className="text-sm text-gray-600">Crie um modelo realista vestindo a roupa ou use fotos de referência.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="w-full border border-gray-200 p-4 rounded-lg bg-white/50 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700 text-center">1. Escolha as Roupas</p>
          <div className="grid grid-cols-2 justify-items-center gap-4 text-center">
             <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Peça Principal</p>
                <div className="w-32 h-32 rounded-lg bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <p className="text-xs text-gray-500">Imagem<br/>Atual</p>
                </div>
            </div>
             <ReferenceBottomUploader 
                label="Peça Complementar"
                file={referenceBottomFile}
                onFileChange={onReferenceBottomChange} 
                disabled={isLoading}
                isLoading={isAnalyzingBottom}
                description={referenceBottomDescription ? Object.entries(referenceBottomDescription).map(([k, v]) => `${k}: ${v}`).join('\n') : null}
            />
          </div>
        </div>

        <div className="w-full border border-gray-200 p-4 rounded-lg bg-white/50 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700 text-center">2. Escolha o Tipo de Modelo</p>
           <div className="flex flex-col gap-3">
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
                                onClick={() => onModelAgeChange({ ...modelAge, [modelGender]: preset.representativeAge })}
                                disabled={isLoading}
                                className={`w-full text-center text-xs font-semibold py-2 px-1 rounded-md transition-all ${
                                    currentAgeForGender === preset.representativeAge
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
                        value={currentAgeForGender}
                        onChange={handleAgeInputChange}
                        placeholder="Ou digite uma idade customizada"
                        disabled={isLoading}
                        className="w-full bg-white border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 text-center"
                    />
                </div>

              <div className={`${currentAgeForGender === 'Recém-nascido' || currentAgeForGender === '1 ano' ? 'opacity-50' : ''}`}>
                  <label className="block text-xs font-medium text-center text-gray-500 mb-1">Gênero</label>
                  <div className={`flex items-center justify-center gap-1 bg-gray-200/70 p-1 rounded-lg transition-opacity ${currentAgeForGender === 'Recém-nascido' || currentAgeForGender === '1 ano' ? 'cursor-not-allowed' : ''}`}>
                      <button onClick={() => onModelGenderChange('female')} disabled={isLoading || currentAgeForGender === 'Recém-nascido' || currentAgeForGender === '1 ano'} className={`w-full px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed ${ modelGender === 'female' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Feminino</button>
                      <button onClick={() => onModelGenderChange('male')} disabled={isLoading || currentAgeForGender === 'Recém-nascido' || currentAgeForGender === '1 ano'} className={`w-full px-2 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed ${ modelGender === 'male' ? 'bg-blue-600 text-white shadow' : 'bg-transparent hover:bg-black/5 text-gray-700'}`}>Masculino</button>
                  </div>
              </div>
            </div>
          <div className="flex items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold text-gray-400">OU</span>
              <div className="flex-grow border-t border-gray-300"></div>
          </div>
          <div className="flex justify-center gap-4">
            <ReferenceModelUploader label={referenceModelLabel} file={referenceModelFile} onFileChange={onReferenceModelChange} disabled={isLoading} />
            <ReferenceSceneUploader label="Referência de Caimento" file={referenceFitFile} onFileChange={setReferenceFitFile} disabled={isLoading} />
          </div>
          <textarea
            value={modelNotes}
            onChange={(e) => onModelNotesChange(e.target.value)}
            placeholder="Observações (ex: cabelo loiro, sorrindo)"
            className="bg-white border border-gray-300 text-gray-800 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base mt-2"
            disabled={isLoading}
            rows={1}
          />
        </div>
        
        <div className="w-full border border-gray-200 p-4 rounded-lg bg-white/50 flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-700 text-center">3. Defina a Cena e Estilo</p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Descreva a cena (ex: 'numa praia')"
              className="bg-white border border-gray-300 text-gray-800 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
              disabled={isLoading || hasReferenceScene}
              rows={2}
            />
            <textarea
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder="Prompt Negativo (o que evitar, ex: 'sem chapéu')"
              className="bg-white border border-gray-300 text-gray-800 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
              disabled={isLoading}
              rows={2}
            />
            <div className="flex items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold text-gray-400">OU</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>
            <div className="flex justify-center">
                <ReferenceSceneUploader 
                    file={referenceSceneFile} 
                    onFileChange={setReferenceSceneFile} 
                    disabled={isLoading} 
                />
            </div>
        </div>

        <div className="w-full border border-gray-200 p-4 rounded-lg bg-white/50">
            <p className="text-sm font-semibold text-gray-700 text-center mb-3">4. Defina as Dimensões Finais</p>
            <div className="flex justify-center">
                <div className="flex items-end gap-2">
                    <div>
                        <label htmlFor="resize-width" className="block text-xs font-medium text-gray-500 mb-1 text-center">Largura (px)</label>
                        <input 
                            id="resize-width" type="number" value={targetDimensions.width} onChange={handleWidthChange}
                            disabled={isLoading}
                            className="w-28 bg-white border border-gray-300 text-gray-800 rounded-lg p-3 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                    <div className="pb-1">
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
                            id="resize-height" type="number" value={targetDimensions.height} onChange={handleHeightChange}
                            disabled={isLoading}
                            className="w-28 bg-white border border-gray-300 text-gray-800 rounded-lg p-3 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                </div>
            </div>
        </div>
      </div>
      
       <button
            onClick={handleGenerate}
            className="w-full mt-2 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            disabled={isLoading || isTrainingAgent.has(currentAgeForGender) || !currentAgeForGender.trim()}
            title={isTrainingAgent.has(currentAgeForGender) ? 'A IA está aprendendo sobre esta idade. Aguarde...' : !currentAgeForGender.trim() ? 'Por favor, especifique uma idade.' : ''}
        >
            Gerar Modelo
        </button>
    </div>
  );
};

export default ModelPanel;
