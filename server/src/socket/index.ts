import type { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { SOCKET_EVENTS } from '@collab-space/shared';
import { extractSocketUser } from '../middleware/auth';
import type { AuthTokenPayload } from '@collab-space/shared';
import { registerPresenceHandlers } from './presence';
import { registerOTHandlers } from './ot';
import { registerWhiteboardHandlers } from './whiteboard';
import { registerNotesHandlers } from './notes';
import { registerCodeHandlers } from './code';
import { getRedis } from '../lib/redis';

// Extend Socket to carry the authenticated user
export interface AuthenticatedSocket extends Socket {
  user: AuthTokenPayload;
}

export function initSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    },
    connectionStateRecovery: {
      // Allow clients to recover their state after a brief disconnect
      // (e.g. mobile switching networks)
      maxDisconnectionDuration: 30_000,
    },
  });

  // ── Redis adapter for multi-instance scaling ────────────────────────────────
  // Enables Socket.IO to broadcast across multiple server instances.
  // Automatically skips if REDIS_URL is not set (single-instance dev mode).
  if (process.env.REDIS_URL) {
    const pubClient = getRedis();
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter enabled (Upstash)');
  } else {
    console.log('ℹ️  No REDIS_URL set — running single-instance (no Redis adapter)');
  }

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const user = extractSocketUser(token);
    if (!user) {
      return next(new Error('Invalid token'));
    }

    (socket as AuthenticatedSocket).user = user;
    next();
  });

  // ── Per-connection setup ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const authedSocket = socket as AuthenticatedSocket;

    console.log(`[socket] ${authedSocket.user.displayName} connected (${socket.id})`);

    registerPresenceHandlers(io, authedSocket);
    registerOTHandlers(io, authedSocket);
    registerWhiteboardHandlers(io, authedSocket);
    registerNotesHandlers(io, authedSocket);
    registerCodeHandlers(io, authedSocket);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] ${authedSocket.user.displayName} disconnected (${reason})`);
    });

    socket.on(SOCKET_EVENTS.ERROR, (err: Error) => {
      console.error(`[socket] error from ${authedSocket.user.displayName}:`, err);
    });
  });

  return io;
}
