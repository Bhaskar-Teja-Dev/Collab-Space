import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@collab-space/shared';
import type { AuthenticatedSocket } from './index';

// ─── Input Validation Schemas ──────────────────────────────────────────────────

const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
});

const CodeUpdateSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().max(100000), // Protect server memory from massive code payloads
  language: z.string().max(30),
});

interface CodeState {
  content: string;
  language: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const roomCode = new Map<string, CodeState>();

function getCodeState(roomId: string): CodeState {
  if (!roomCode.has(roomId)) {
    roomCode.set(roomId, { content: '', language: 'javascript' });
  }
  return roomCode.get(roomId)!;
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerCodeHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  // ── JOIN ────────────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.JOIN_ROOM, (rawPayload: unknown) => {
    const parsed = JoinRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid join room payload' });
      return;
    }

    const { roomId } = parsed.data;
    const state = getCodeState(roomId);

    socket.emit(SOCKET_EVENTS.CODE_STATE, {
      roomId,
      content: state.content,
      language: state.language,
    });
  });

  // ── CODE_UPDATE ─────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.CODE_UPDATE, (rawPayload: unknown) => {
    const parsed = CodeUpdateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid code update structure' });
      return;
    }

    const { roomId, content, language } = parsed.data;

    roomCode.set(roomId, { content, language });

    socket.to(roomId).emit(SOCKET_EVENTS.CODE_UPDATE, {
      roomId,
      content,
      language,
    });
  });
}
