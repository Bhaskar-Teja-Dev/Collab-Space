import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import {
  SOCKET_EVENTS,
  type VersionedOperation,
  type Operation,
} from '@collab-space/shared';
import { transformAgainstHistory, applyOp } from '@collab-space/shared';
import { prisma } from '../lib/db';
import type { AuthenticatedSocket } from './index';

// ─── Input Validation Schemas ──────────────────────────────────────────────────

const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
});

const OperationSchema = z.union([
  z.object({
    type: z.literal('insert'),
    position: z.number().int().nonnegative(),
    chars: z.string(),
  }),
  z.object({
    type: z.literal('delete'),
    position: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('retain'),
    count: z.number().int().nonnegative(),
  }),
]);

const VersionedOperationSchema = z.object({
  clientId: z.string().uuid(),
  roomId: z.string().min(1),
  documentId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  operation: OperationSchema,
});

// In-memory OT server state per document.
interface DocState {
  content: string;   // current document string
  version: number;   // current version number
  history: { version: number; op: Operation }[]; // sliding window of ops
}

const docStates = new Map<string, DocState>();

export function registerOTHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  // ── JOIN → send document snapshot ────────────────────────────────────────

  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (rawPayload: unknown) => {
    const parsed = JoinRoomSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid join room payload' });
      return;
    }

    const { roomId } = parsed.data;

    try {
      // Load document state from DB if not already in memory
      const doc = await prisma.document.findUnique({ where: { roomId } });
      if (!doc) return; // Room has no document yet

      if (!docStates.has(doc.id)) {
        // Load only the last 500 history items to save memory
        const ops = await prisma.operation.findMany({
          where: { documentId: doc.id },
          orderBy: { version: 'desc' },
          take: 500,
        });

        ops.reverse();

        docStates.set(doc.id, {
          content: doc.content,
          version: doc.version,
          history: ops.map(o => ({
            version: o.version,
            op: dbOpToOperation(o),
          })),
        });
      }

      const state = docStates.get(doc.id)!;

      // Send the current snapshot to the joining client
      socket.emit(SOCKET_EVENTS.DOC_STATE, {
        documentId: doc.id,
        content: state.content,
        version: state.version,
      });
    } catch (err) {
      console.error('[ot/join]', err);
    }
  });

  // ── SUBMIT OP ─────────────────────────────────────────────────────────────

  socket.on(SOCKET_EVENTS.OP_SUBMIT, async (rawPayload: unknown) => {
    const parsed = VersionedOperationSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid operation payload structure' });
      return;
    }

    const { roomId, documentId, baseVersion, operation, clientId } = parsed.data;

    try {
      const state = docStates.get(documentId);
      if (!state) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Document not loaded' });
        return;
      }

      let historySince: Operation[];
      const oldestCached = state.history[0]?.version ?? state.version;

      if (baseVersion >= oldestCached) {
        // Cache hit: read directly from sliding window memory history
        historySince = state.history
          .filter(h => h.version > baseVersion)
          .map(h => h.op);
      } else {
        // Cache miss: load older historical operations from PostgreSQL
        const ops = await prisma.operation.findMany({
          where: {
            documentId,
            version: { gt: baseVersion },
          },
          orderBy: { version: 'asc' },
        });
        historySince = ops.map(dbOpToOperation);
      }

      // Transform the incoming op against everything applied since baseVersion
      const transformedOp = transformAgainstHistory(operation, historySince);

      // Apply the transformed op to current content
      const newContent = applyOp(state.content, transformedOp);
      const newVersion = state.version + 1;

      // Update in-memory state
      state.content = newContent;
      state.version = newVersion;
      state.history.push({ version: newVersion, op: transformedOp });

      // Keep sliding window history bounded at 500 items max to prevent OOM
      if (state.history.length > 500) {
        state.history = state.history.slice(-500);
      }

      // Persist to DB asynchronously with optimistic concurrency checks
      persistOp(documentId, socket.user.userId, newVersion, newContent, transformedOp).catch(
        err => console.error('[ot/persist]', err)
      );

      // ACK the submitting client
      socket.emit(SOCKET_EVENTS.OP_ACK, {
        documentId,
        newVersion,
        transformedOp,
      });

      // Broadcast to everyone ELSE in the room
      socket.to(roomId).emit(SOCKET_EVENTS.OP_BROADCAST, {
        clientId,
        documentId,
        version: newVersion,
        operation: transformedOp,
      });

    } catch (err) {
      console.error('[ot/submit]', err);
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to apply operation' });
    }
  });
}

// ─── DB Persistence with OCC ─────────────────────────────────────────────────

async function persistOp(
  documentId: string,
  authorId: string,
  version: number,
  newContent: string,
  op: Operation
): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId, version: version - 1 },
        data: { content: newContent, version },
      }),
      prisma.operation.create({
        data: {
          documentId,
          authorId,
          version,
          opType: op.type,
          position: op.type !== 'retain' ? op.position : 0,
          chars: op.type === 'insert' ? op.chars : null,
          count: op.type === 'delete' ? op.count : (op.type === 'retain' ? op.count : null),
        },
      }),
    ]);
  } catch (err) {
    console.warn(`[ot/persist] Concurrency write conflict: ${(err as Error).message}`);
    // Sync memory state back to DB state if DB version is newer
    const currentDoc = await prisma.document.findUnique({ where: { id: documentId } });
    if (currentDoc) {
      const state = docStates.get(documentId);
      if (state && currentDoc.version > state.version) {
        state.content = currentDoc.content;
        state.version = currentDoc.version;
        
        // Reload last 500 ops
        const ops = await prisma.operation.findMany({
          where: { documentId },
          orderBy: { version: 'desc' },
          take: 500,
        });
        ops.reverse();
        state.history = ops.map(o => ({
          version: o.version,
          op: dbOpToOperation(o),
        }));
        console.log(`[ot/persist] Reset local memory state to match DB version ${currentDoc.version}`);
      }
    }
  }
}

// ─── DB Op → Operation type ───────────────────────────────────────────────────

function dbOpToOperation(o: {
  opType: string;
  position: number;
  chars: string | null;
  count: number | null;
}): Operation {
  if (o.opType === 'insert') {
    return { type: 'insert', position: o.position, chars: o.chars ?? '' };
  }
  if (o.opType === 'delete') {
    return { type: 'delete', position: o.position, count: o.count ?? 0 };
  }
  return { type: 'retain', count: o.count ?? 0 };
}
