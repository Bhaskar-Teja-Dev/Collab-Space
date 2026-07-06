import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
// Load .env from the monorepo root (Collab-Space/.env)
// CWD when running workspace scripts is server/, so we go one level up
dotenvConfig({ path: resolve(process.cwd(), '../.env') });
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { initSocketServer } from './socket/index';
import { authRouter } from './routes/auth';
import { roomsRouter } from './routes/rooms';
import { documentsRouter } from './routes/documents';
import { versionsRouter } from './routes/versions';

const app = express();
const httpServer = createServer(app);

// ─── Middleware ───────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowed => origin === allowed || allowed.replace(/\/$/, '') === origin);
    const isVercel = /\.vercel\.app$/.test(origin);
    if (isAllowed || isVercel) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());

// ─── REST Routes ──────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/rooms/:roomId/versions', versionsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────

initSocketServer(httpServer);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);

httpServer.listen(PORT, () => {
  console.log(`\n🚀 CollabSpace server running`);
  console.log(`   REST  → http://localhost:${PORT}/api`);
  console.log(`   WS    → ws://localhost:${PORT}`);
  console.log(`   Env   → ${process.env.NODE_ENV ?? 'development'}\n`);
});
