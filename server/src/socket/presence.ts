import type { Server as SocketServer } from 'socket.io';
import { SOCKET_EVENTS, type PresenceUser, type CursorPosition } from '@collab-space/shared';
import type { AuthenticatedSocket } from './index';

// In-memory presence map: roomId → Map<userId, PresenceUser>
// For multi-instance deployments, this should move to Redis.
const roomPresence = new Map<string, Map<string, PresenceUser>>();

export function registerPresenceHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const { userId, displayName, avatarColor } = socket.user;

  // ── JOIN ROOM ─────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: { roomId: string }) => {
    const { roomId } = payload;

    // Leave any previous rooms first
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        leaveRoom(io, socket, room);
      }
    });

    // Join the Socket.IO room (broadcast channel)
    socket.join(roomId);

    // Register presence
    if (!roomPresence.has(roomId)) {
      roomPresence.set(roomId, new Map());
    }

    const presence = roomPresence.get(roomId)!;
    presence.set(userId, {
      userId,
      displayName,
      avatarColor: avatarColor ?? '#6366f1',
      cursor: null,
    });

    // Notify the joining client: "you successfully joined"
    socket.emit(SOCKET_EVENTS.ROOM_JOINED, { roomId });

    // Broadcast updated presence list to everyone in the room
    broadcastPresence(io, roomId, presence);

    console.log(`[presence] ${displayName} joined room ${roomId} (${presence.size} users)`);
  });

  // ── CURSOR MOVE ───────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.CURSOR_MOVE, (payload: { roomId: string; cursor: CursorPosition }) => {
    const { roomId, cursor } = payload;

    const presence = roomPresence.get(roomId);
    if (!presence?.has(userId)) return;

    // Update cursor position
    const user = presence.get(userId)!;
    presence.set(userId, { ...user, cursor });

    // Broadcast to everyone ELSE in the room (not sender — they already know)
    socket.to(roomId).emit(SOCKET_EVENTS.CURSOR_MOVE, {
      userId,
      cursor,
    });
  });

  // ── LEAVE ROOM ────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.LEAVE_ROOM, (payload: { roomId: string }) => {
    leaveRoom(io, socket, payload.roomId);
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    // Remove user from all rooms they were in
    socket.rooms.forEach((roomId) => {
      if (roomId !== socket.id) {
        leaveRoom(io, socket, roomId);
      }
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function leaveRoom(io: SocketServer, socket: AuthenticatedSocket, roomId: string): void {
  socket.leave(roomId);

  const presence = roomPresence.get(roomId);
  if (presence) {
    presence.delete(socket.user.userId);

    if (presence.size === 0) {
      roomPresence.delete(roomId);
    } else {
      broadcastPresence(io, roomId, presence);
    }
  }

  socket.emit(SOCKET_EVENTS.ROOM_LEFT, { roomId });
  console.log(`[presence] ${socket.user.displayName} left room ${roomId}`);
}

function broadcastPresence(
  io: SocketServer,
  roomId: string,
  presence: Map<string, PresenceUser>
): void {
  const users = Array.from(presence.values());
  io.to(roomId).emit(SOCKET_EVENTS.PRESENCE_UPDATE, { roomId, users });
}
