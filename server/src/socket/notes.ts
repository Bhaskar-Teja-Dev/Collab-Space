import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@collab-space/shared';
import type { AuthenticatedSocket } from './index';

// ─── Input Validation Schemas ──────────────────────────────────────────────────

const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
});

const NoteColorSchema = z.union([
  z.literal('yellow'),
  z.literal('blue'),
  z.literal('green'),
  z.literal('pink'),
  z.literal('purple'),
]);

const NoteSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(2000),
  color: NoteColorSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().int().min(50).max(500),
  authorName: z.string().max(100),
  createdAt: z.string().optional(),
});

const NoteCreateSchema = z.object({
  roomId: z.string().min(1),
  note: NoteSchema,
});

const NoteUpdateSchema = z.object({
  roomId: z.string().min(1),
  noteId: z.string().uuid(),
  content: z.string().max(2000),
});

const NoteDeleteSchema = z.object({
  roomId: z.string().min(1),
  noteId: z.string().uuid(),
});

const NoteMoveSchema = z.object({
  roomId: z.string().min(1),
  noteId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple';

export interface Note {
  id: string;
  content: string;
  color: NoteColor;
  x: number;
  y: number;
  width: number;
  authorId: string;
  authorName: string;
  createdAt: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const roomNotes = new Map<string, Note[]>();

function getNotes(roomId: string): Note[] {
  if (!roomNotes.has(roomId)) {
    roomNotes.set(roomId, []);
  }
  return roomNotes.get(roomId)!;
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerNotesHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const { userId, displayName } = socket.user;

  // ── JOIN ────────────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.JOIN_ROOM, (rawPayload: unknown) => {
    const parsed = JoinRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid join room payload' });
      return;
    }

    const { roomId } = parsed.data;
    const notes = getNotes(roomId);

    socket.emit(SOCKET_EVENTS.NOTES_STATE, { roomId, notes });
  });

  // ── NOTE_CREATE ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.NOTE_CREATE, (rawPayload: unknown) => {
    const parsed = NoteCreateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid note payload structure' });
      return;
    }

    const { roomId, note } = parsed.data;
    const notes = getNotes(roomId);

    // Limit maximum sticky notes per room to 500 to avoid memory/rendering issues
    if (notes.length >= 500) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Notes board size limit reached (500 notes)' });
      return;
    }

    const safeNote: Note = {
      ...note,
      authorId: userId,
      authorName: displayName,
      createdAt: note.createdAt ?? new Date().toISOString(),
    };

    notes.push(safeNote);

    socket.to(roomId).emit(SOCKET_EVENTS.NOTE_CREATE, { roomId, note: safeNote });
  });

  // ── NOTE_UPDATE ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.NOTE_UPDATE, (rawPayload: unknown) => {
    const parsed = NoteUpdateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid note update structure' });
      return;
    }

    const { roomId, noteId, content } = parsed.data;
    const notes = getNotes(roomId);
    const idx = notes.findIndex((n) => n.id === noteId);

    if (idx === -1) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: `Note ${noteId} not found` });
      return;
    }

    notes[idx] = { ...notes[idx], content };

    socket.to(roomId).emit(SOCKET_EVENTS.NOTE_UPDATE, { roomId, noteId, content });
  });

  // ── NOTE_DELETE ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.NOTE_DELETE, (rawPayload: unknown) => {
    const parsed = NoteDeleteSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid note delete structure' });
      return;
    }

    const { roomId, noteId } = parsed.data;
    const notes = getNotes(roomId);
    const idx = notes.findIndex((n) => n.id === noteId);

    if (idx !== -1) {
      notes.splice(idx, 1);
    }

    socket.to(roomId).emit(SOCKET_EVENTS.NOTE_DELETE, { roomId, noteId });
  });

  // ── NOTE_MOVE ──────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.NOTE_MOVE, (rawPayload: unknown) => {
    const parsed = NoteMoveSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid note move structure' });
      return;
    }

    const { roomId, noteId, x, y } = parsed.data;
    const notes = getNotes(roomId);
    const idx = notes.findIndex((n) => n.id === noteId);

    if (idx === -1) {
      return;
    }

    notes[idx] = { ...notes[idx], x, y };

    socket.to(roomId).emit(SOCKET_EVENTS.NOTE_MOVE, { roomId, noteId, x, y });
  });
}
