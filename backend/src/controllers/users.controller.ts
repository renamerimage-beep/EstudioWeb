// src/controllers/users.controller.ts
import { Request, Response } from 'express';
import { auth } from '../services/firebase';

// Cria o primeiro usuário administrador (rota de 'signup').
export const signupController = async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ message: 'Email, password, and username are required.' });
    }

    // Cria o usuário no Firebase Authentication
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: username,
    });

    // IMPORTANTE: Define uma permissão customizada (custom claim) para o usuário
    // É isso que nosso adminMiddleware vai verificar
    await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });

    console.log(`Usuário admin criado com sucesso: ${userRecord.email}`);
    
    // Retorna apenas informações seguras
    res.status(201).json({ 
      user: { 
        uid: userRecord.uid, 
        email: userRecord.email, 
        displayName: userRecord.displayName,
        role: 'admin' 
      } 
    });

  } catch (error: any) {
    console.error("Erro ao criar usuário admin:", error);
    // Melhora o feedback de erro
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ message: 'Este email já está em uso.' });
    }
    res.status(500).json({ message: 'Erro interno ao criar usuário admin.' });
  }
};

// Cria um novo usuário (rota de 'users'). Apenas para admins.
export const createUserController = async (req: Request, res: Response) => {
  try {
    const { email, password, username, role } = req.body;
     if (!email || !password || !username || !role) {
      return res.status(400).json({ message: 'Email, password, username, and role are required.' });
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: username,
    });

    await auth.setCustomUserClaims(userRecord.uid, { role });

    console.log(`Admin criando usuário: ${email} com permissão ${role}`);
    res.status(201).json({ uid: userRecord.uid, email, role });
  } catch (error: any) {
    console.error("Erro ao criar usuário:", error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ message: 'Este email já está em uso.' });
    }
    res.status(500).json({ message: 'Erro ao criar usuário.' });
  }
};

// Lista todos os usuários. Apenas para admins.
export const getAllUsersController = async (req: Request, res: Response) => {
  try {
    const listUsersResult = await auth.listUsers();
    const users = listUsersResult.users.map(userRecord => ({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        role: userRecord.customClaims?.role || 'user', // Pega a role do custom claim
        disabled: userRecord.disabled,
        lastSignInTime: userRecord.metadata.lastSignInTime,
    }));

    console.log('Admin listando todos os usuários.');
    res.status(200).json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ message: 'Erro ao buscar usuários.' });
  }
};
