// src/api/costs.routes.ts
import { Router } from 'express';
import { getCostsController } from '../controllers/costs.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Esta linha define a rota e a protege.
router.get('/costs', authMiddleware, getCostsController);

export default router;