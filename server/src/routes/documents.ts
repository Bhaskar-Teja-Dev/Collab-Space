import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth } from '../middleware/auth';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

// ─── GET /api/documents/:id — fetch document snapshot ────────────────────────

documentsRouter.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { room: true },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Check room access
    const isMember = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId: doc.roomId, userId: req.user!.userId },
      },
    });
    const isOwner = doc.room.ownerId === req.user!.userId;

    if (!doc.room.isPublic && !isMember && !isOwner) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ document: { id: doc.id, content: doc.content, version: doc.version, title: doc.title } });
  } catch (err) {
    console.error('[documents/get]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/documents/:id/history — get ops since a version ────────────────
// Used by OT client to catch up if it falls behind

documentsRouter.get('/:id/history', async (req, res) => {
  const sinceVersion = parseInt(req.query['since'] as string ?? '0', 10);

  try {
    const ops = await prisma.operation.findMany({
      where: {
        documentId: req.params.id,
        version: { gt: sinceVersion },
      },
      orderBy: { version: 'asc' },
    });

    res.json({ operations: ops });
  } catch (err) {
    console.error('[documents/history]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
