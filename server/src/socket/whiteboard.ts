import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@collab-space/shared';
import type { AuthenticatedSocket } from './index';

// ─── Input Validation Schemas ──────────────────────────────────────────────────

const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
});

const ShapeTypeSchema = z.union([
  z.literal('pen'),
  z.literal('rect'),
  z.literal('circle'),
  z.literal('arrow'),
  z.literal('text'),
]);

const ShapeSchema = z.object({
  id: z.string().uuid(),
  type: ShapeTypeSchema,
  points: z.array(z.number()).max(10000).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().max(1000).optional(),
  color: z.string().max(20),
  strokeWidth: z.number().int().min(1).max(50),
});

const ShapeAddSchema = z.object({
  roomId: z.string().min(1),
  shape: ShapeSchema,
});

const ShapeUpdateSchema = z.object({
  roomId: z.string().min(1),
  shape: ShapeSchema.partial().extend({
    id: z.string().uuid(),
  }),
});

const ShapeDeleteSchema = z.object({
  roomId: z.string().min(1),
  shapeId: z.string().uuid(),
});

export interface Shape {
  id: string;
  type: 'pen' | 'rect' | 'circle' | 'arrow' | 'text';
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  authorId: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const roomShapes = new Map<string, Shape[]>();

function getShapes(roomId: string): Shape[] {
  if (!roomShapes.has(roomId)) {
    roomShapes.set(roomId, []);
  }
  return roomShapes.get(roomId)!;
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerWhiteboardHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const { userId } = socket.user;

  // ── JOIN → hydrate the new client ──────────────────────────────────────────

  socket.on(SOCKET_EVENTS.JOIN_ROOM, (rawPayload: unknown) => {
    const parsed = JoinRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid join room payload' });
      return;
    }

    const { roomId } = parsed.data;
    const shapes = getShapes(roomId);

    socket.emit(SOCKET_EVENTS.WB_STATE, { roomId, shapes });
  });

  // ── SHAPE_ADD ──────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.SHAPE_ADD, (rawPayload: unknown) => {
    const parsed = ShapeAddSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid shape payload structure' });
      return;
    }

    const { roomId, shape } = parsed.data;
    const shapes = getShapes(roomId);

    // Limit max shapes per room to 5000 to prevent memory leak / OOM
    if (shapes.length >= 5000) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room whiteboard has reached maximum size limit (5000 shapes)' });
      return;
    }

    const safeShape: Shape = { ...shape, authorId: userId };
    shapes.push(safeShape);

    socket.to(roomId).emit(SOCKET_EVENTS.SHAPE_ADD, { roomId, shape: safeShape });
  });

  // ── SHAPE_UPDATE ───────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.SHAPE_UPDATE, (rawPayload: unknown) => {
    const parsed = ShapeUpdateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid shape update structure' });
      return;
    }

    const { roomId, shape } = parsed.data;
    const shapes = getShapes(roomId);
    const idx = shapes.findIndex((s) => s.id === shape.id);

    if (idx === -1) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: `Shape ${shape.id} not found` });
      return;
    }

    // Merge safety: prevent client from overriding authorId
    const updated: Shape = { ...shapes[idx], ...shape, authorId: shapes[idx].authorId };
    shapes[idx] = updated;

    socket.to(roomId).emit(SOCKET_EVENTS.SHAPE_UPDATE, { roomId, shape: updated });
  });

  // ── SHAPE_DELETE ───────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.SHAPE_DELETE, (rawPayload: unknown) => {
    const parsed = ShapeDeleteSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid shape delete structure' });
      return;
    }

    const { roomId, shapeId } = parsed.data;
    const shapes = getShapes(roomId);
    const idx = shapes.findIndex((s) => s.id === shapeId);

    if (idx !== -1) {
      shapes.splice(idx, 1);
    }

    socket.to(roomId).emit(SOCKET_EVENTS.SHAPE_DELETE, { roomId, shapeId });
  });
}
