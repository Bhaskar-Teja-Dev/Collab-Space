import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { requireAuth } from '../middleware/auth';

// Simple random ID generator (avoids nanoid ESM/CJS complexity)
function randomId(len = 6): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

export const roomsRouter = Router();

// All room routes require auth
roomsRouter.use(requireAuth);

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(64),
  isPublic: z.boolean().optional().default(false),
});

// ─── GET /api/rooms — list rooms the current user owns or is member of ───────

roomsRouter.get('/', async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { ownerId: req.user!.userId },
          { members: { some: { userId: req.user!.userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, displayName: true, avatarColor: true } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ rooms });
  } catch (err) {
    console.error('[rooms/list]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/rooms — create a new room ──────────────────────────────────────

roomsRouter.post('/', async (req, res) => {
  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, isPublic } = parsed.data;

  try {
    // Generate a short URL-safe slug: e.g. "my-room-ab12cd"
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${randomId(6)}`;

    const room = await prisma.room.create({
      data: {
        name,
        slug,
        isPublic,
        ownerId: req.user!.userId,
        // Create the default document for this room
        documents: {
          create: {
            title: `${name} — Document`,
            content: '',
            version: 0,
          },
        },
        // Add owner as first member
        members: {
          create: { userId: req.user!.userId },
        },
      },
      include: {
        owner: { select: { id: true, displayName: true, avatarColor: true } },
        _count: { select: { members: true } },
      },
    });

    res.status(201).json({ room });
  } catch (err) {
    console.error('[rooms/create]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/rooms/:slug — get a single room by slug ────────────────────────

roomsRouter.get('/:slug', async (req, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { id: true, displayName: true, avatarColor: true } },
        members: {
          include: { user: { select: { id: true, displayName: true, avatarColor: true } } },
        },
        documents: { select: { id: true, title: true, version: true } },
      },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Check access: public rooms anyone can view; private only members/owner
    const isMember = room.members.some((m: { userId: string }) => m.userId === req.user!.userId);
    const isOwner = room.ownerId === req.user!.userId;

    if (!room.isPublic && !isMember && !isOwner) {
      res.status(403).json({ error: 'You do not have access to this room' });
      return;
    }

    // Auto-join if public and not already a member
    if (room.isPublic && !isMember && !isOwner) {
      await prisma.roomMember.create({
        data: { roomId: room.id, userId: req.user!.userId },
      });
    }

    res.json({ room });
  } catch (err) {
    console.error('[rooms/get]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/rooms/:slug — delete a room (owner only) ────────────────────

roomsRouter.delete('/:slug', async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { slug: req.params.slug } });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.ownerId !== req.user!.userId) {
      res.status(403).json({ error: 'Only the room owner can delete this room' });
      return;
    }

    await prisma.room.delete({ where: { id: room.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[rooms/delete]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/rooms/explore/public — list all public rooms ───────────────────

roomsRouter.get('/explore/public', async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isPublic: true },
      include: {
        owner: { select: { id: true, displayName: true, avatarColor: true } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    res.json({ rooms });
  } catch (err) {
    console.error('[rooms/public]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/rooms/:slug/privacy — toggle isPublic (owner only) ─────────────

roomsRouter.put('/:slug/privacy', async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { slug: req.params.slug } });
    if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
    if (room.ownerId !== req.user!.userId) {
      res.status(403).json({ error: 'Only the room owner can change privacy' });
      return;
    }
    const updated = await prisma.room.update({
      where: { id: room.id },
      data: { isPublic: !room.isPublic },
    });
    res.json({ isPublic: updated.isPublic });
  } catch (err) {
    console.error('[rooms/privacy]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
