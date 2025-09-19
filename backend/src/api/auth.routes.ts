// src/api/auth.routes.ts
import { Router } from 'express';
import { loginController } from '../controllers/auth.controller';

const router = Router();

// Rota pública para login
router.post('/login', loginController);

export default router;
