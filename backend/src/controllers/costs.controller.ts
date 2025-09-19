// src/controllers/costs.controller.ts
import { Request, Response } from 'express';
import { db } from '../services/firebase';
import { Query, DocumentData } from 'firebase-admin/firestore';

export const getCostsController = async (req: Request, res: Response) => {
  try {
    const { uid } = (req as any).user; // Usuário logado
    const { projectId } = req.query; // Filtro opcional

    console.log(`Buscando custos para o usuário ${uid}`);

    let query: Query<DocumentData> = db.collection('costs').where('uid', '==', uid);

    if (projectId) {
      console.log(`Filtrando por projeto: ${projectId}`);
      query = query.where('projectId', '==', projectId as string);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const costs = snapshot.docs.map((doc: DocumentData) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(costs);

  } catch (error) {
    console.error("Erro ao buscar custos:", error);
    res.status(500).json({ message: 'Erro ao buscar custos.' });
  }
};