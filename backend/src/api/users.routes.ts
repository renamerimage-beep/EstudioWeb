// src/api/users.routes.ts
import { Router } from 'express';
import { signupController, createUserController, getAllUsersController } from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = Router();

// Rota pública para criar o primeiro usuário.
// Em produção, você pode querer desabilitar isso após o primeiro uso.
router.post('/signup', signupController);

// As rotas abaixo só podem ser acessadas por administradores logados.
router.post('/users', authMiddleware, adminMiddleware, createUserController);
router.get('/users', authMiddleware, adminMiddleware, getAllUsersController);

export default router;