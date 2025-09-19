// src/middleware/admin.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user; // Obtém o usuário que o authMiddleware anexou

  if (user && user.role === 'admin') {
    next(); // O usuário é um admin, pode prosseguir
  } else {
    return res.status(403).send({ message: 'Acesso negado: Requer permissão de administrador.' });
  }
};