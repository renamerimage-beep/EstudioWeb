// src/controllers/gemini.controller.ts
import { Request, Response } from 'express';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleAuth } from 'google-auth-library';

// Variável para cachear as credenciais da conta de serviço
let serviceAccountCredentials: any | null = null;

/**
 * Busca as credenciais da conta de serviço no Google Cloud Secret Manager.
 * Implementa um cache simples para evitar chamadas repetidas.
 */
async function getServiceAccountCredentials(): Promise<any> {
  if (serviceAccountCredentials) {
    return serviceAccountCredentials;
  }

  const secretName = process.env.GEMINI_SECRET_NAME || 'projects/estudioweb-ebc00/secrets/vitrine-web-api-key/versions/latest';

  try {
    console.log(`Buscando segredo: ${secretName}`);
    const secretClient = new SecretManagerServiceClient();
    const [version] = await secretClient.accessSecretVersion({ name: secretName }, { timeout: 120000 });
    const secretString = version.payload?.data?.toString();

    if (!secretString) {
      throw new Error('Credenciais da conta de serviço não encontradas no Secret Manager.');
    }

    serviceAccountCredentials = JSON.parse(secretString);
    console.log("Credenciais da conta de serviço carregadas com sucesso.");
    return serviceAccountCredentials;

  } catch (error) {
    console.error("Falha ao buscar as credenciais da conta de serviço:", error);
    throw new Error('Não foi possível carregar as credenciais da conta de serviço.');
  }
}

/**
 * Converte uma URL de imagem para o formato de dados que o Gemini entende.
 */
async function urlToGenerativePart(url: string, mimeType: string) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return {
        inlineData: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType
        },
    };
}

// Helper para converter base64 para Generative Part
function base64ToGenerativePart(base64Data: string, mimeType: string) {
    return {
        inlineData: {
            data: base64Data,
            mimeType
        }
    };
}

export const generateContentController = async (req: Request, res: Response) => {
    try {
        const { imageUrl, mimeType, prompt } = req.body;

        if (!imageUrl || !prompt || !mimeType) {
            return res.status(400).json({ message: 'imageUrl, mimeType, e prompt são obrigatórios.' });
        }

        const credentials = await getServiceAccountCredentials();

        const vertex_ai = new VertexAI({
            project: credentials.project_id,
            location: 'us-central1', // You might need to adjust this location
            googleAuthOptions: {
                credentials,
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            }
        });

        const model = vertex_ai.getGenerativeModel({ model: 'gemini-pro-vision' });

        const imagePart = await urlToGenerativePart(imageUrl, mimeType);

        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: prompt }, imagePart] }
            ]
        });
        const response = result.response;
        if (!response.candidates?.length) {
            return res.status(500).json({ message: 'Nenhum candidato encontrado na resposta da API.' });
        }
        const text = response.candidates[0].content.parts[0].text;

        res.status(200).json({ text });

    } catch (error: unknown) {
        console.error("Erro ao gerar conteúdo com Gemini:", error);
        let errorMessage = 'Detalhes do erro desconhecidos.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        res.status(500).json({ message: 'Erro ao se comunicar com a API do Gemini.', error: errorMessage });
    }
};

export const describeClothingController = async (req: Request, res: Response) => {
    try {
        const { imageData, mimeType } = req.body;
        const { uid } = (req as any).user; // User ID from auth middleware

        if (!imageData || !mimeType) {
            return res.status(400).json({ message: 'imageData e mimeType são obrigatórios.' });
        }

        const credentials = await getServiceAccountCredentials();

        const vertex_ai = new VertexAI({
            project: credentials.project_id,
            location: 'us-central1', // You might need to adjust this location
            googleAuthOptions: {
                credentials,
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            }
        });

        const model = vertex_ai.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Using Flash for faster response

        const imagePart = base64ToGenerativePart(imageData, mimeType);

        const prompt = `Analise detalhadamente as imagens da peça de roupa fornecida, focando em todos os aspectos relevantes para uma descrição completa de e-commerce. Extraia as informações em formato JSON estruturado com as seguintes chaves: "Tipo de Peça", "Cores Principais", "Estampa/Padrão", "Tipo de Tecido", "Caimento", "Detalhes de Bolsos", "Tipo de Fechamento", "Decote", "Comprimento da Manga", "Detalhes Adicionais", "Transparência", "Ocasião Recomendada".
- "Cores Principais": Liste todas as cores visíveis na peça, separadas por vírgula.
- "Estampa/Padrão": Descreva o padrão de forma detalhada (ex: 'Listras finas verticais', 'Estampa floral com fundo escuro', 'Xadrez vichy'). Se não houver, indique 'Liso'.
- "Tipo de Tecido": Identifique a textura e o material aparente (ex: 'Jeans com lavagem clara', 'Malha canelada de algodão', 'Seda sintética com brilho acetinado').
- "Caimento": Descreva como a peça veste no corpo (ex: 'Justo ao corpo (slim fit)', 'Modelagem reta e solta', 'Oversized').
- "Detalhes de Bolsos": Descreva a quantidade, tipo e localização dos bolsos (ex: 'Dois bolsos frontais tipo faca', 'Um bolso no peito com lapela', 'Nenhum bolso visível').
- "Tipo de Fechamento": Descreva o método de fechamento da peça (ex: 'Fechamento frontal por botões', 'Zíper lateral invisível', 'Sem fechamento, peça de vestir').
- "Detalhes Adicionais": Liste quaisquer outros detalhes relevantes como 'Babados na barra', 'Gola com nervuras', 'Bordado de logo no peito', 'Aplicações de lantejoulas'.
- "Transparência": Avalie a transparência do tecido (ex: 'Nenhuma transparência', 'Levemente transparente', 'Totalmente transparente').
- "Ocasião Recomendada": Sugira ocasiões de uso apropriadas (ex: 'Casual, dia a dia', 'Festa, eventos noturnos', 'Formal, ambiente de trabalho').`;

        console.log("Chamando Gemini API para descrever roupa com:", { imagePart, prompt });
        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [imagePart, { text: prompt }] }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        });

        if (!result.response.candidates?.length) {
            return res.status(500).json({ message: 'Nenhum candidato encontrado na resposta da API.' });
        }
        const responseText = result.response.candidates[0].content.parts[0].text;
        console.log("Resposta bruta da API do Gemini:", responseText);

        if (typeof responseText !== 'string') {
            throw new Error("A resposta da API Gemini não continha texto válido.");
        }
        const parsedResponse = JSON.parse(responseText);

        res.status(200).json(parsedResponse);

    } catch (error: unknown) {
        console.error("Erro ao descrever roupa com Gemini:", error);
        let errorMessage = 'Detalhes do erro desconhecidos.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        res.status(500).json({ message: 'Erro ao se comunicar com a API do Gemini.', error: errorMessage });
    }
};