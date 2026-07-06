// ─── User & Auth ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string; // CSS color string, e.g. "#6366f1"
  createdAt: string;   // ISO date string
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  displayName: string;
  avatarColor: string;
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  name: string;
  slug: string;         // URL-friendly, e.g. "my-room-abc123"
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
  memberCount?: number;
}

export interface CreateRoomDto {
  name: string;
  isPublic?: boolean;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarColor: string;
  cursor?: CursorPosition | null;
}

export interface CursorPosition {
  x: number; // 0-1 normalized (percentage of viewport)
  y: number; // 0-1 normalized
}

// ─── Document ─────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  roomId: string;
  content: string; // JSON string of Tiptap/ProseMirror doc
  version: number;
  updatedAt: string;
}

// ─── OT Operations ───────────────────────────────────────────────────────────
//
// We use a simple linear OT model (no retain for v1).
// Every operation acts on a plain string representation of document content.
//
// Reference: "Operational Transformation in Real-Time Group Editors"
//   Joseph Gentle's sharedb / ottypes/text is good reading.
//
// Op types:
//   insert — insert `chars` at `position` in the document string
//   delete — delete `count` characters starting at `position`
//   retain — (future) skip over `count` chars without changing them
//             used in composition; not needed for broadcast-only v1

export type OpType = 'insert' | 'delete' | 'retain';

export interface InsertOp {
  type: 'insert';
  position: number;
  chars: string;
}

export interface DeleteOp {
  type: 'delete';
  position: number;
  count: number;
}

export interface RetainOp {
  type: 'retain';
  count: number;
}

export type Operation = InsertOp | DeleteOp | RetainOp;

// A versioned operation — what travels over the wire
export interface VersionedOperation {
  clientId: string;       // unique per browser tab
  roomId: string;
  documentId: string;
  baseVersion: number;    // document version this op was based on
  operation: Operation;
}

// Server acknowledges the applied op with the new version
export interface OperationAck {
  documentId: string;
  newVersion: number;
  transformedOp: Operation; // what was actually applied (may differ from sent op)
}

// ─── Socket.IO Event Names ───────────────────────────────────────────────────
//
// Centralizing event names prevents typos and keeps client/server in sync.

export const SOCKET_EVENTS = {
  // Connection lifecycle
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  ROOM_JOINED: 'room:joined',
  ROOM_LEFT: 'room:left',

  // Presence
  PRESENCE_UPDATE: 'presence:update',   // server → clients: full presence list
  CURSOR_MOVE: 'presence:cursor',       // client → server: my cursor moved

  // OT Document (Phase 2)
  OP_SUBMIT: 'doc:op_submit',           // client → server: send an operation
  OP_BROADCAST: 'doc:op_broadcast',     // server → other clients: apply this op
  OP_ACK: 'doc:op_ack',                 // server → submitting client: op accepted
  DOC_STATE: 'doc:state',               // server → client: initial doc snapshot

  // Whiteboard (Phase 3)
  SHAPE_ADD: 'wb:shape_add',
  SHAPE_UPDATE: 'wb:shape_update',
  SHAPE_DELETE: 'wb:shape_delete',
  WB_STATE: 'wb:state',

  // Sticky Notes (Phase 3)
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_MOVE: 'note:move',
  NOTES_STATE: 'note:state',

  // Code Editor (Phase 4)
  CODE_STATE: 'code:state',
  CODE_UPDATE: 'code:update',

  // Errors
  ERROR: 'error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
