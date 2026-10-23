import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadStaff } from './auth.js';
import { HttpError } from './http.js';
import admin from './routes/admin.js';
import pub from './routes/public.js';
import store, { UPLOAD_DIR } from './routes/store.js';

const dist = fileURLToPath(new URL('../web/dist/', import.meta.url));

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.id = randomUUID();
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  });
  next();
});

app.post('/api/admin/uploads', express.json({ limit: '6mb' })); // foto em base64
app.use(express.json({ limit: '100kb' }));
// Respostas da API nunca ficam em cache (navegador nem CDN da Hostinger).
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', loadStaff, pub, admin, store);
app.use('/api', (req, res) => res.status(404).json({ error: 'Não encontrado.' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(dist, { maxAge: '7d', setHeaders: (res, file) => { if (file.endsWith('index.html')) res.set('Cache-Control', 'no-cache'); } }));
// Arquivo inexistente (ex.: imagem ainda não enviada) = 404; o resto é rota do React.
app.get(/\.[a-z0-9]+$/i, (req, res) => res.status(404).end());
app.get('/{*path}', (req, res, next) => res.sendFile('index.html', { root: dist, headers: { 'Cache-Control': 'no-cache' } }, (e) => e && next()));

app.use((err, req, res, next) => {
  if (err instanceof HttpError || (err.status && err.expose)) return res.status(err.status).json({ error: err.message });
  console.error(req.id, err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});
