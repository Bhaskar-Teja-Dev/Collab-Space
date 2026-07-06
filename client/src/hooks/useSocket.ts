import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/auth';
import { useRoomStore } from '../store/room';

/**
 * useSocket — manages the Socket.IO connection lifecycle.
 *
 * Connects when the user is authenticated, disconnects on logout.
 * Returns the socket instance for use in other hooks.
 */
export function useSocket(): Socket | null {
  const token = useAuthStore((s) => s.token);
  const setConnected = useRoomStore((s) => s.setConnected);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setConnected(false);
      socketRef.current = null;
      return;
    }

    const socket = getSocket();
    socketRef.current = socket;

    connectSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [token, setConnected]);

  return socketRef.current;
}
