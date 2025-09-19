// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { auth } from '../services/firebase'; // Importa do nosso arquivo de inicialização do firebase-admin

// Interface para estender o objeto Request do Express
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role?: string;
  };
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Não autorizado: Token não fornecido.' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    // Adiciona as informações decodificadas do usuário à requisição
    req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.role, // A 'role' que definimos no signup
    };
    next(); // Se o token for válido, continua para a próxima função (o controller)
  } catch (error) {
    console.error("Erro ao verificar o token:", error);
    return res.status(403).send({ message: 'Não autorizado: Token inválido ou expirado.' });
  }
};