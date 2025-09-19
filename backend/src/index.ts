// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './api/auth.routes';
import costRoutes from './api/costs.routes';
import userRoutes from './api/users.routes';
import galleryRoutes from './api/gallery.routes';
import geminiRoutes from './api/gemini.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
// FIX: Explicitly specify path '/' to help TypeScript resolve the correct app.use overload.
app.use('/', express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log('Request received:', req.method, req.url);
  next();
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Adicionando nossas rotas da API
app.use('/api', authRoutes);
app.use('/api', costRoutes);
app.use('/api', userRoutes);
app.use('/api', galleryRoutes);
app.use('/api', geminiRoutes);


app.listen(port, () => {
  console.log(`Servidor Pixshop rodando em http://localhost:${port}`);
});