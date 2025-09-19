/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// FIX: Import HarmCategory and HarmBlockThreshold to use in safetySettings.
import { GoogleGenAI, GenerateContentResponse, Modality, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { calculateCost, logCost } from './costService.ts';

// FIX: Use HarmCategory and HarmBlockThreshold enums for safetySettings to match expected types.
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

// Helper to convert a data URL string to a File object (needed for enhanceAndUpscaleImage)
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new File([u8arr], filename, {type:mime});
};


// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${reader.error?.message || 'Erro desconhecido'}`));
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

const handleMultiImageApiResponse = (
    response: GenerateContentResponse,
    context: string
): string[] => {
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `A solicitação para ${context} foi bloqueada. Motivo: ${blockReason}. ${blockReasonMessage || ''}`;
        throw new Error(errorMessage);
    }

    const imageParts = response.candidates?.[0]?.content?.parts?.filter(part => part.inlineData);

    if (imageParts && imageParts.length > 0) {
        return imageParts.map(part => {
            const { mimeType, data } = part.inlineData!;
            return `data:${mimeType};base64,${data}`;
        });
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `A tarefa de ${context} parou inesperadamente. Motivo: ${finishReason}.`;
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `O modelo de IA não retornou imagens para a tarefa de ${context}. ` + 
        (textFeedback ? `O modelo respondeu com texto: "${textFeedback}"` : "Tente reformular seu comando.");
    throw new Error(errorMessage);
}

const handleApiResponse = (response: GenerateContentResponse, context: string /* e.g., "edit", "filter", "adjustment" */): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `A solicitação para ${context} foi bloqueada. Motivo: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }
    
    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `A tarefa de ${context} parou inesperadamente. Motivo: ${finishReason}. Isso geralmente está relacionado às configurações de segurança.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    const textFeedback = response.text?.trim();
    const errorMessage = `O modelo de IA não retornou uma imagem para a tarefa de ${context}. ` + 
        (textFeedback 
            ? `O modelo respondeu com texto: "${textFeedback}"` 
            : "Isso pode acontecer devido a filtros de segurança ou se a solicitação for muito complexa. Por favor, tente reformular seu comando para ser mais direto.");

    console.error(`Model did not return an image for ${context}`, { response });
    throw new Error(errorMessage);
};

const getAiClient = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY! });

const defaultProgress = (message: string, percentage: number) => {
    console.log(`Progress: ${percentage}% - ${message}`);
};

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
            URL.revokeObjectURL(objectUrl);
        };
        image.onerror = (err) => {
            reject(new Error("Falha ao carregar a imagem para obter dimensões."));
            URL.revokeObjectURL(objectUrl);
        };
        image.src = objectUrl;
    });
};

export const enhanceAndUpscaleImage = async (
    imageFile: File, 
    imageName: string, 
    userId: string,
    onProgress: (message: string, percentage: number) => void = defaultProgress,
    projectId: string = 'root',
): Promise<File> => {
    onProgress('Aprimorando imagem...', 5);
    const imagePart = await fileToPart(imageFile);
    const promptText = "Tarefa: Aprimorar imagem. Diretivas: Qualidade de estúdio profissional, alta resolução, pronto para e-commerce. Aumentar nitidez. Realçar cores. Detalhar texturas. Manter composição original. Não adicione ou remova elementos. Responda apenas com a imagem aprimorada, sem texto adicional.";
    
    const contents = {
        parts: [
            imagePart,
            { text: promptText }
        ]
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT], safetySettings }
    });

    const enhancedDataUrl = handleApiResponse(response, 'enhance');

    const cost = calculateCost({
        operation: 'enhance',
        inputImages: 1,
        outputImages: 1,
        inputChars: promptText.length
    });
    await logCost(imageName, 'enhance', cost, userId, `1 img in, 1 img out, ${promptText.length} chars`, projectId);

    onProgress('Aprimoramento concluído.', 100);
    return dataURLtoFile(enhancedDataUrl, `enhanced-${imageFile.name}`);
};

export const trainAgeCharacteristics = async (age: string, userId: string): Promise<string> => {
    const prompt = `Descreva em detalhes as características físicas e de proporção corporal para um modelo de e-commerce da idade "${age}". Foque em aspectos como formato do rosto, tipo de corpo, proporções dos membros, e características típicas da pele e cabelo. A descrição deve ser técnica e focada em gerar imagens realistas.`;
    
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    const cost = calculateCost({
        operation: 'training',
        inputChars: prompt.length,
        outputChars: response.text.length,
    });
    await logCost("AI Agent Training", 'training', cost, userId, `${prompt.length} chars in, ${response.text.length} chars out`, 'root');

    return response.text;
};

export const generateEditedImage = async (imageFile: File, prompt: string, hotspot: { x: number, y: number } | null, maskFile: File | null, imageName: string, userId: string, onProgress: (message: string, percentage: number) => void = defaultProgress, projectId: string = 'root'): Promise<string> => {
    onProgress('Preparando imagem...', 10);
    const imagePart = await fileToPart(imageFile);
    // FIX: Explicitly type `parts` to allow both text and image parts.
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string; } })[] = [imagePart];
    let fullPrompt = '';

    if (maskFile) {
        const maskPart = await fileToPart(maskFile);
        fullPrompt = `Na área mascarada, aplique a seguinte edição: ${prompt}`;
        parts.push({ text: 'A imagem a seguir é uma máscara. A área em vermelho indica a região a ser editada.' });
        parts.push(maskPart);
        parts.push({ text: fullPrompt });
    } else if (hotspot) {
        const { width, height } = await getImageDimensions(imageFile);
        fullPrompt = `A imagem fornecida tem ${width} pixels de largura por ${height} pixels de altura. Na coordenada x=${hotspot.x}, y=${hotspot.y} (contando a partir do canto superior esquerdo), aplique a seguinte edição: ${prompt}`;
        parts.push({ text: fullPrompt });
    } else {
        throw new Error("É necessário fornecer um hotspot ou uma máscara para a edição.");
    }

    const contents = { parts };

    onProgress('Gerando edição...', 50);
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT], safetySettings }
    });
    
    onProgress('Finalizando...', 90);
    const result = handleApiResponse(response, 'retouch');

    const inputImages = maskFile ? 2 : 1;
    const cost = calculateCost({
        operation: 'retouch',
        inputImages: inputImages,
        outputImages: 1,
        inputChars: fullPrompt.length
    });
    await logCost(imageName, 'retouch', cost, userId, `${inputImages} imgs in, 1 img out, ${fullPrompt.length} chars`, projectId);
    
    return result;
};

// FIX: Add missing generatePoseVariation function required by VariationsPanel.
export const generatePoseVariation = async (
    imageFile: File,
    imageName: string,
    userId: string,
    onProgress: (message: string, percentage: number) => void = defaultProgress,
    projectId: string = 'root'
): Promise<string> => {
    onProgress('Gerando variação de pose...', 10);
    const imagePart = await fileToPart(imageFile);
    const promptText = "Analise a imagem de entrada, que mostra um modelo vestindo uma peça de roupa. Sua tarefa é gerar uma nova imagem do mesmo modelo, vestindo a mesma roupa, com o mesmo fundo e iluminação, mas em uma pose ligeiramente diferente e realista. A roupa deve permanecer totalmente visível e ser o foco principal. Não altere o rosto do modelo ou as características da roupa.";

    const contents = {
        parts: [
            imagePart,
            { text: promptText }
        ]
    };

    onProgress('Gerando nova pose...', 50);
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT], safetySettings }
    });

    onProgress('Finalizando...', 90);
    const resultDataUrl = handleApiResponse(response, 'pose variation');

    const cost = calculateCost({
        operation: 'retouch', // Using 'retouch' as a proxy for cost calculation
        inputImages: 1,
        outputImages: 1,
        inputChars: promptText.length
    });
    await logCost(imageName, 'retouch', cost, userId, `1 img in, 1 img out, ${promptText.length} chars for pose variation`, projectId);

    return resultDataUrl;
};

const createMaskedImage = (
    originalImage: HTMLImageElement, 
    targetWidth: number, 
    targetHeight: number
): { baseImage: string, maskImage: string } => {
    const { naturalWidth: iw, naturalHeight: ih } = originalImage;
    
    // Calculate dimensions to fit inside target while maintaining aspect ratio
    const hRatio = targetWidth / iw;
    const vRatio = targetHeight / ih;
    const ratio = Math.min(hRatio, vRatio);
    const destWidth = iw * ratio;
    const destHeight = ih * ratio;
    const destX = (targetWidth - destWidth) / 2;
    const destY = (targetHeight - destHeight) / 2;

    // Create base canvas (image with padding)
    const canvasBase = document.createElement('canvas');
    canvasBase.width = targetWidth;
    canvasBase.height = targetHeight;
    const ctxBase = canvasBase.getContext('2d')!;
    ctxBase.fillStyle = '#FFFFFF'; // White background
    ctxBase.fillRect(0, 0, targetWidth, targetHeight);
    ctxBase.drawImage(originalImage, destX, destY, destWidth, destHeight);

    // Create mask canvas (red where padding is, transparent where image is)
    const canvasMask = document.createElement('canvas');
    canvasMask.width = targetWidth;
    canvasMask.height = targetHeight;
    const ctxMask = canvasMask.getContext('2d')!;
    ctxMask.fillStyle = 'red';
    ctxMask.fillRect(0, 0, targetWidth, targetHeight); // Fill with red
    ctxMask.clearRect(destX, destY, destWidth, destHeight); // Clear the area where the image is

    return { baseImage: canvasBase.toDataURL('image/png'), maskImage: canvasBase.toDataURL('image/png') };
};


export const expandImage = async (
    imageFile: File, 
    width: number, 
    height: number, 
    imageName: string, 
    userId: string,
    onProgress: (message: string, percentage: number) => void = defaultProgress,
    projectId: string = 'root'
): Promise<string> => {
    onProgress("Preparando para expandir...", 10);

    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });

    const originalImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });

    onProgress("Criando máscara de preenchimento...", 30);
    const { baseImage, maskImage } = createMaskedImage(originalImage, width, height);
    
    const baseFile = dataURLtoFile(baseImage, `base-${imageFile.name}`);
    const maskFile = dataURLtoFile(maskImage, `mask-${imageFile.name}`);

    const prompt = `Tarefa: Outpainting. A imagem fornecida contém o assunto principal e áreas brancas para preenchimento. A máscara vermelha indica exatamente essas áreas a serem preenchidas. Preencha as áreas da máscara estendendo o fundo existente de forma contínua e fotorrealista. NÃO altere a área da imagem que não está mascarada. O resultado final deve ser uma imagem totalmente preenchida, sem as áreas brancas ou a máscara vermelha.`;

    onProgress("Aplicando preenchimento com IA...", 50);
    
    const result = await generateEditedImage(baseFile, prompt, null, maskFile, imageName, userId, onProgress, projectId);
    
    const cost = calculateCost({
        operation: 'expand',
        inputImages: 2, // base + mask
        outputImages: 1,
        inputChars: prompt.length
    });
    await logCost(imageName, 'expand', cost, userId, `Expand to ${width}x${height}`, projectId);

    onProgress("Finalizando...", 95);

    return result;
};


export const describeClothing = async (imageFiles: File[], userId: string, getToken: () => Promise<string | null>, imageName: string = imageFiles[0].name, projectId: string = 'root'): Promise<Record<string, string>> => {
    if (imageFiles.length === 0) {
        throw new Error("Nenhuma imagem fornecida para descrever a roupa.");
    }

    const token = await getToken();
    if (!token) throw new Error('Authentication token not available.');

    const imageFile = imageFiles[0]; // Assuming only one image for description
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${reader.error?.message || 'Erro desconhecido'}`));
    });

    const [mimeType, base64Data] = dataUrl.split(';base64,');

    const response = await fetch('/api/gemini/describe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            imageData: base64Data,
            mimeType: mimeType.replace('data:', ''),
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido ao descrever roupa.' }));
        throw new Error(errorData.message || 'Falha ao descrever roupa.');
    }

    const result = await response.json();

    const cost = calculateCost({
        operation: 'describe',
        inputImages: imageFiles.length,
        inputChars: 0, // Prompt is now on backend
        outputChars: JSON.stringify(result).length,
    });
    await logCost(imageName, 'describe', cost, userId, `1 img in, ${JSON.stringify(result).length} chars out`, projectId);

    return result;
};

const describeFitAndStyle = async (fitReferenceFile: File): Promise<string> => {
    const imagePart = await fileToPart(fitReferenceFile);
    const prompt = `Descreva brevemente o caimento e o estilo da roupa nesta imagem. Foque em termos como 'justo', 'solto', 'oversized', 'fluido', 'estruturado', etc.`;
    const contents = { parts: [imagePart, { text: prompt }] };
    
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents
    });

    return response.text.trim();
}

interface GenerateModelImageParams {
    clothingImages?: File[];
    clothingImage?: File; // For backward compatibility
    age: string;
    gender: 'male' | 'female';
    scenePrompt: string;
    clothingDescription?: string;
    referenceModelFile?: File | null;
    referenceSceneFile?: File | null;
    fitReferenceFile?: File | null;
    modelNotes: string;
    negativePrompt?: string;
    referenceBottomFile?: File | null;
    referenceBottomDescription?: string;
    trainedCharacteristics: string;
    imageName: string;
    photoFraming?: string;
    onProgress?: (message: string, percentage: number) => void;
    startProgress?: number;
    projectId: string;
    userId: string;
}

export const generateModelImage = async (params: GenerateModelImageParams): Promise<string> => {
    const { 
        onProgress = defaultProgress, 
        startProgress = 0
    } = params;

    onProgress('Preparando imagens e prompts...', startProgress + 5);
    // FIX: Corrected type to not include `string` as a direct element.
    const parts: ({ inlineData: { mimeType: string; data: string; } } | { text: string })[] = [];

    parts.push({ text: `Gere uma imagem de um modelo de e-commerce vestindo a roupa fornecida. Requisitos:` });

    if (params.photoFraming) {
        parts.push({ text: `- Enquadramento da Foto: ${params.photoFraming}. Siga este enquadramento estritamente.` });
        if (params.photoFraming.toLowerCase().includes('costas')) {
            parts.push({ text: `- ATENÇÃO: A parte de trás da roupa é o foco. Se houver estampas, textos ou detalhes importantes nas costas da peça, a pose do modelo e o cabelo NÃO DEVEM cobri-los. A estampa traseira deve ser completamente visível e legível.` });
        }
    }
    
    parts.push({ text: `- Proporção da Imagem: 1:1 (quadrada).` });

    const allClothingImages = params.clothingImages || (params.clothingImage ? [params.clothingImage] : []);
    if (allClothingImages.length > 0) {
        if (allClothingImages.length > 1) {
            parts.push({ text: `- Roupa Principal (Múltiplas Vistas): As imagens a seguir mostram a mesma peça de roupa de diferentes ângulos para referência. Use todas para entender a peça completamente.` });
            for (const [index, imageFile] of allClothingImages.entries()) {
                parts.push({ text: `- Vista da Roupa ${index + 1}:` });
                parts.push(await fileToPart(imageFile));
            }
        } else {
            parts.push({ text: `- Roupa Principal:` });
            parts.push(await fileToPart(allClothingImages[0]));
        }
    }
    
    if (params.clothingDescription) {
        parts.push({ text: `- Descrição da Roupa (para referência): ${params.clothingDescription}. Use as imagens como fonte principal, mas esta descrição ajuda a entender os detalhes.` });
    }
    
    if (params.referenceBottomFile) {
        parts.push({ text: `- Peça Complementar:` });
        parts.push(await fileToPart(params.referenceBottomFile));
        if (params.referenceBottomDescription) {
            parts.push({ text: `- Descrição da Peça Complementar (para referência): ${params.referenceBottomDescription}. Use a imagem da peça complementar como fonte principal, mas esta descrição ajuda a entender os detalhes.` });
        }
    }
    
    if (params.fitReferenceFile) {
        onProgress('Analisando caimento...', startProgress + 8);
        const fitDescription = await describeFitAndStyle(params.fitReferenceFile);
        parts.push({ text: `- Descrição do Caimento e Estilo (baseado na imagem de referência): ${fitDescription}` });
    }

    parts.push({ text: `- Idade do Modelo: ${params.age}` });
    if (params.age !== 'newborn' && params.age !== 'baby') {
        parts.push({ text: `- Gênero do Modelo: ${params.gender}` });
    }
    parts.push({ text: `- Características do Modelo (Baseado no Treinamento de IA): ${params.trainedCharacteristics}` });

    if (params.modelNotes) {
        parts.push({ text: `- Observações Adicionais do Modelo: ${params.modelNotes}` });
    }
    if (params.negativePrompt) {
        parts.push({ text: `- Exclusões (NÃO inclua o seguinte): ${params.negativePrompt}` });
    }

    if (params.referenceModelFile) {
        parts.push({ text: `- Modelo de Referência (use como forte inspiração para o rosto e tipo físico):` });
        parts.push(await fileToPart(params.referenceModelFile));
    }
    
    if (params.referenceSceneFile) {
        parts.push({ text: `- Cenário de Referência (replique este ambiente e iluminação):` });
        parts.push(await fileToPart(params.referenceSceneFile));
    } else if (params.scenePrompt) {
        parts.push({ text: `- Descrição do Cenário: ${params.scenePrompt}` });
    }

    parts.push({ text: `Instruções Finais: A imagem deve ser de alta qualidade, hiper-realista, com iluminação de estúdio profissional e adequada para um catálogo de moda. O foco principal deve ser a roupa. Responda apenas com a imagem gerada, sem nenhum texto adicional.` });

    onProgress('Gerando modelo...', startProgress + 20);
    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT], safetySettings }
    });
    
    onProgress('Finalizando geração...', startProgress + 70);
    const result = handleApiResponse(response, 'model');

    const inputImagesCount = allClothingImages.length + (params.referenceBottomFile ? 1 : 0) + (params.referenceModelFile ? 1 : 0) + (params.referenceSceneFile ? 1 : 0) + (params.fitReferenceFile ? 1 : 0);
    // FIX: Use a type guard ('text' in part) to safely access the text property,
    // as it only exists on one part of the union type for `parts`.
    const totalInputChars = parts.reduce((sum, part) => sum + ('text' in part ? part.text.length : 0), 0);
    const cost = calculateCost({
        operation: 'model',
        inputImages: inputImagesCount,
        outputImages: 1,
        inputChars: totalInputChars
    });
    await logCost(params.imageName, 'model', cost, params.userId, `${inputImagesCount} imgs in, 1 img out, ${totalInputChars} chars`, params.projectId);

    return result;
};

// FIX: Add missing findClothingDifferences function required by CorrectionPanel.
export const findClothingDifferences = async (
    originalClothingFile: File,
    generatedImageFile: File,
    originalDescription: string,
    userId: string,
    projectId: string = 'root'
): Promise<{ plan: string, points: { x: number, y: number, description: string }[] }> => {
    const originalClothingPart = await fileToPart(originalClothingFile);
    const generatedImagePart = await fileToPart(generatedImageFile);
    const prompt = `Você é um especialista em controle de qualidade de moda. Compare a "Peça Original" com a roupa na "Imagem Gerada". Use a "Descrição Original" como referência.
    1. Identifique todas as discrepâncias (cores, padrões, forma, detalhes ausentes/adicionados).
    2. Crie um "Plano de Correção" em texto, descrevendo passo a passo como editar a "Imagem Gerada" para que a roupa corresponda perfeitamente à "Peça Original". O plano deve ser claro e acionável por outra IA.
    3. Crie uma lista de "Pontos de Anotação" para as 3 discrepâncias mais importantes. Forneça coordenadas (x, y) em pixels na "Imagem Gerada" e uma breve descrição do problema nesse ponto.
    
    Retorne a resposta em formato JSON.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            "plan": { type: Type.STRING, description: "O plano de correção passo a passo." },
            "points": {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        "x": { type: Type.INTEGER, description: "Coordenada X na imagem gerada." },
                        "y": { type: Type.INTEGER, description: "Coordenada Y na imagem gerada." },
                        "description": { type: Type.STRING, description: "Descrição curta da discrepância no ponto." },
                    },
                    required: ["x", "y", "description"],
                }
            }
        },
        required: ["plan", "points"],
    };
    
    const contents = {
        parts: [
            { text: 'Peça Original:' },
            originalClothingPart,
            { text: 'Imagem Gerada:' },
            generatedImagePart,
            { text: `Descrição Original:\n${originalDescription}` },
            { text: prompt }
        ]
    };

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            responseMimeType: 'application/json',
            responseSchema,
        }
    });

    const cost = calculateCost({
        operation: 'findDifferences',
        inputImages: 2,
        inputChars: prompt.length + originalDescription.length,
        outputChars: response.text.length,
    });
    await logCost(generatedImageFile.name, 'findDifferences', cost, userId, `Finding differences`, projectId);

    try {
        const text = response.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        return {
            plan: parsed.plan || '',
            points: parsed.points || []
        };
    } catch (e) {
        console.error("Failed to parse JSON from findClothingDifferences:", e, { text: response.text });
        throw new Error("A IA retornou uma análise de diferenças em formato inválido.");
    }
};

// FIX: Add missing applyClothingCorrection function required by CorrectionPanel.
export const applyClothingCorrection = async (
    originalClothingFile: File,
    generatedImageFile: File,
    correctionPlan: string,
    userId: string,
    onProgress: (message: string, percentage: number) => void = defaultProgress,
    projectId: string = 'root'
): Promise<string> => {
    onProgress("Preparando correção...", 10);
    const originalClothingPart = await fileToPart(originalClothingFile);
    const generatedImagePart = await fileToPart(generatedImageFile);

    const prompt = `Você é um editor de fotos de IA. Sua tarefa é corrigir a "Imagem Gerada" para que a roupa nela corresponda perfeitamente à "Peça Original".
    Siga estritamente o "Plano de Correção" fornecido para fazer as edições. O plano é:
    ---
    ${correctionPlan}
    ---
    O resultado final deve ser uma imagem fotorrealista com a roupa corrigida. Não altere o modelo, a pose ou o fundo, a menos que seja absolutamente necessário para a correção da roupa.`;

    const contents = {
        parts: [
            { text: 'Imagem a ser corrigida (Imagem Gerada):' },
            generatedImagePart,
            { text: 'Imagem de referência (Peça Original):' },
            originalClothingPart,
            { text: prompt },
        ]
    };

    onProgress("Aplicando correção...", 50);

    const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT], safetySettings }
    });

    onProgress("Finalizando...", 90);
    const result = handleApiResponse(response, 'correction');

    const cost = calculateCost({
        operation: 'correction',
        inputImages: 2,
        outputImages: 1,
        inputChars: prompt.length
    });
    await logCost(generatedImageFile.name, 'correction', cost, userId, `Applying correction`, projectId);
    
    return result;
};