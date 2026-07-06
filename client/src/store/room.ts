import { create } from 'zustand';
import type { PresenceUser } from '@collab-space/shared';

interface RoomState {
  currentRoomId: string | null;
  currentRoomSlug: string | null;
  currentRoomName: string | null;
  presenceUsers: PresenceUser[];
  isConnected: boolean;
  activeModule: 'doc' | 'whiteboard' | 'notes' | 'code';

  setRoom: (id: string, slug: string, name: string) => void;
  clearRoom: () => void;
  setPresence: (users: PresenceUser[]) => void;
  setConnected: (connected: boolean) => void;
  setActiveModule: (module: RoomState['activeModule']) => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  currentRoomId: null,
  currentRoomSlug: null,
  currentRoomName: null,
  presenceUsers: [],
  isConnected: false,
  activeModule: 'doc',

  setRoom: (id, slug, name) => set({ currentRoomId: id, currentRoomSlug: slug, currentRoomName: name }),
  clearRoom: () => set({ currentRoomId: null, currentRoomSlug: null, currentRoomName: null, presenceUsers: [] }),
  setPresence: (presenceUsers) => set({ presenceUsers }),
  setConnected: (isConnected) => set({ isConnected }),
  setActiveModule: (activeModule) => set({ activeModule }),
}));
