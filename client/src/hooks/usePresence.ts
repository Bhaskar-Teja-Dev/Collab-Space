import { useEffect, useCallback, useRef } from 'react';
import { SOCKET_EVENTS, type PresenceUser, type CursorPosition } from '@collab-space/shared';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/auth';
import { useRoomStore } from '../store/room';

const CURSOR_THROTTLE_MS = 33; // ~30fps

/**
 * usePresence — handles all presence functionality for a room.
 *
 * - Joins the room on mount, leaves on unmount
 * - Broadcasts cursor position at 30fps (throttled)
 * - Listens for presence updates from the server
 * - Listens for remote cursor moves
 */
export function usePresence(roomId: string | null) {
  const user = useAuthStore((s) => s.user);
  const setPresence = useRoomStore((s) => s.setPresence);
  const lastCursorSend = useRef(0);

  useEffect(() => {
    if (!roomId || !user) return;

    const socket = getSocket();

    // Join the room
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId });

    // Listen for presence updates (full list)
    const handlePresenceUpdate = (data: { roomId: string; users: PresenceUser[] }) => {
      if (data.roomId === roomId) {
        setPresence(data.users);
      }
    };

    // Listen for individual cursor moves (more efficient than full list broadcast)
    const handleCursorMove = (data: { userId: string; cursor: CursorPosition }) => {
      useRoomStore.setState((state) => ({
        presenceUsers: state.presenceUsers.map((u) =>
          u.userId === data.userId ? { ...u, cursor: data.cursor } : u
        ),
      }));
    };

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, handlePresenceUpdate);
    socket.on(SOCKET_EVENTS.CURSOR_MOVE, handleCursorMove);

    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId });
      socket.off(SOCKET_EVENTS.PRESENCE_UPDATE, handlePresenceUpdate);
      socket.off(SOCKET_EVENTS.CURSOR_MOVE, handleCursorMove);
    };
  }, [roomId, user, setPresence]);

  // Throttled cursor broadcaster
  const broadcastCursor = useCallback(
    (cursor: CursorPosition) => {
      if (!roomId) return;
      const now = Date.now();
      if (now - lastCursorSend.current < CURSOR_THROTTLE_MS) return;
      lastCursorSend.current = now;
      getSocket().emit(SOCKET_EVENTS.CURSOR_MOVE, { roomId, cursor });
    },
    [roomId]
  );

  return { broadcastCursor };
}
