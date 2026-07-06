import { useAuthStore } from '../store/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (email: string, password: string, displayName: string) =>
      request<{ token: string; user: any }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      }),

    login: (email: string, password: string) =>
      request<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    me: () => request<{ user: any }>('/api/auth/me'),

    updateProfile: (body: any) =>
      request<{ user: any }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  },

  rooms: {
    list: () => request<{ rooms: any[] }>('/api/rooms'),

    create: (name: string, isPublic = false) =>
      request<{ room: any }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name, isPublic }),
      }),

    get: (slug: string) => request<{ room: any }>(`/api/rooms/${slug}`),

    delete: (slug: string) =>
      request<{ success: boolean }>(`/api/rooms/${slug}`, { method: 'DELETE' }),

    explorePublic: () =>
      request<{ rooms: any[] }>('/api/rooms/explore/public'),

    togglePrivacy: (slug: string) =>
      request<{ isPublic: boolean }>(`/api/rooms/${slug}/privacy`, { method: 'PUT' }),

    listVersions: (roomId: string) =>
      request<{ versions: any[] }>(`/api/rooms/${roomId}/versions`),

    saveVersion: (roomId: string, body: any) =>
      request<{ version: any }>(`/api/rooms/${roomId}/versions`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    revertVersion: (roomId: string, versionId: string) =>
      request<{ version: any }>(`/api/rooms/${roomId}/versions/${versionId}/revert`, {
        method: 'POST',
      }),

    summarizeVersions: (roomId: string, versionAId: string, versionBId: string) =>
      request<{ summary: string }>(`/api/rooms/${roomId}/versions/summarize`, {
        method: 'POST',
        body: JSON.stringify({ versionAId, versionBId }),
      }),
  },

  documents: {
    get: (id: string) => request<{ document: any }>(`/api/documents/${id}`),
    history: (id: string, since = 0) =>
      request<{ operations: any[] }>(`/api/documents/${id}/history?since=${since}`),
  },
};

