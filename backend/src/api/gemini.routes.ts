// src/api/gemini.routes.ts
import { Router } from 'express';
import { generateContentController, describeClothingController } from '../controllers/gemini.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Todas as rotas do gemini são protegidas
router.use(authMiddleware);

// Rota principal para geração de conteúdo
router.post('/gemini/generate', generateContentController);

// Rota para descrição de roupas
router.post('/gemini/describe', describeClothingController);

export default router;