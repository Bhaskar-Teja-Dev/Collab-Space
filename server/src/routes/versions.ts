import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { generateWithGemini, buildSummarizePrompt } from '../services/gemini';

export const versionsRouter = Router({ mergeParams: true }); // roomId from parent

// ─── Helper: verify room membership ──────────────────────────────────────────

async function getRoomOrFail(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { members: true },
  });
  if (!room) return null;
  const isMember = room.ownerId === userId || room.members.some(m => m.userId === userId);
  if (!isMember && !room.isPublic) return null;
  return room;
}

// ─── GET /api/rooms/:roomId/versions ─────────────────────────────────────────

versionsRouter.get('/', requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const room = await getRoomOrFail(roomId, req.user!.userId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  const versions = await prisma.roomVersion.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, name: true, createdAt: true,
      createdBy: { select: { displayName: true, avatarColor: true } },
    },
  });
  res.json({ versions });
});

// ─── POST /api/rooms/:roomId/versions ────────────────────────────────────────

const SaveVersionSchema = z.object({
  name:        z.string().min(1).max(80).default('Manual snapshot'),
  docContent:  z.string().max(500_000).default(''),
  whiteboard:  z.string().max(2_000_000).default('[]'),
  notes:       z.string().max(2_000_000).default('[]'),
  codeContent: z.string().max(200_000).default(''),
  codeLang:    z.string().max(32).default('javascript'),
});

versionsRouter.post('/', requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const room = await getRoomOrFail(roomId, req.user!.userId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  const parsed = SaveVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const version = await prisma.roomVersion.create({
    data: { roomId, createdById: req.user!.userId, ...parsed.data },
  });

  res.status(201).json({ version });
});

// ─── GET /api/rooms/:roomId/versions/:versionId ───────────────────────────────

versionsRouter.get('/:versionId', requireAuth, async (req, res) => {
  const { roomId, versionId } = req.params;
  const room = await getRoomOrFail(roomId, req.user!.userId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  const version = await prisma.roomVersion.findFirst({ where: { id: versionId, roomId } });
  if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

  res.json({ version });
});

// ─── POST /api/rooms/:roomId/versions/:versionId/revert ──────────────────────

versionsRouter.post('/:versionId/revert', requireAuth, async (req, res) => {
  const { roomId, versionId } = req.params;
  const room = await getRoomOrFail(roomId, req.user!.userId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  if (room.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'Only the room owner can revert versions' });
    return;
  }

  const version = await prisma.roomVersion.findFirst({ where: { id: versionId, roomId } });
  if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

  // Update the live document content to match the snapshot in DB
  await prisma.document.updateMany({
    where: { roomId },
    data: { content: version.docContent },
  });

  // Find document to force reload socket state
  const doc = await prisma.document.findFirst({ where: { roomId } });
  if (doc) {
    const { forceReloadDocumentState } = require('../socket/ot');
    forceReloadDocumentState(roomId, doc.id, version.docContent);
  }

  res.json({
    message: 'Reverted successfully',
    version: {
      docContent:  version.docContent,
      whiteboard:  version.whiteboard,
      notes:       version.notes,
      codeContent: version.codeContent,
      codeLang:    version.codeLang,
    },
  });
});

// ─── POST /api/rooms/:roomId/versions/summarize ───────────────────────────────

const SummarizeSchema = z.object({
  versionAId: z.string().cuid(),
  versionBId: z.string().cuid(),
});

versionsRouter.post('/summarize', requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const room = await getRoomOrFail(roomId, req.user!.userId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  const parsed = SummarizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide versionAId and versionBId' });
    return;
  }

  const [vA, vB] = await Promise.all([
    prisma.roomVersion.findFirst({ where: { id: parsed.data.versionAId, roomId } }),
    prisma.roomVersion.findFirst({ where: { id: parsed.data.versionBId, roomId } }),
  ]);

  if (!vA || !vB) { res.status(404).json({ error: 'One or both versions not found' }); return; }

  try {
    const prompt = buildSummarizePrompt(room.name, vA, vB);
    const summary = await generateWithGemini(prompt);
    res.json({ summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: msg });
  }
});
