import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/db';
import { signToken } from '../middleware/auth';

export const authRouter = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Validation schemas ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2).max(32),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Generate a random HSL color for avatar backgrounds
function randomAvatarColor(): string {
  const hues = [221, 262, 142, 354, 32, 187, 48]; // indigo, violet, green, rose, orange, cyan, amber
  const hue = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${hue}, 70%, 60%)`;
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

authRouter.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    // Flatten Zod errors to a single human-readable string
    const firstError = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .find(Boolean) ?? 'Invalid input';
    res.status(400).json({ error: firstError });
    return;
  }

  const { email, password, displayName } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        avatarColor: randomAvatarColor(),
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
      },
    });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .find(Boolean) ?? 'Invalid input';
    res.status(400).json({ error: firstError });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // OAuth-only accounts have no password hash
    if (!user.passwordHash) {
      res.status(400).json({ error: 'This account uses Google Sign-In. Please sign in with Google.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/google ────────────────────────────────────────────────────
// Receives the Google `credential` (id_token) from the browser's GSI callback,
// verifies it server-side, then upserts the user and returns a CollabSpace JWT.

authRouter.post('/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'Missing Google credential' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const { sub: googleId, email, name, picture } = payload;
    const displayName = name ?? email.split('@')[0];

    // Try to find existing user by googleId first, then fall back to email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      // Link the Google account if not already linked
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: picture ?? user.avatarUrl },
        });
      }
    } else {
      // New user — create with no password (OAuth only)
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          avatarUrl: picture,
          displayName,
          avatarColor: randomAvatarColor(),
        },
      });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error('[auth/google]', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

import { requireAuth } from '../middleware/auth';

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarColor: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/auth/profile — update profile details ──────────────────────────

const UpdateProfileSchema = z.object({
  displayName:  z.string().min(2).max(32).optional(),
  avatarColor:  z.string().regex(/^(hsl|#)/).optional(),
  bio:          z.string().max(200).optional(),
  newPassword:  z.string().min(8).optional(),
  currentPassword: z.string().optional(),
});

authRouter.put('/profile', requireAuth, async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { displayName, avatarColor, bio, newPassword, currentPassword } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const updateData: Record<string, unknown> = {};
    if (displayName) updateData.displayName = displayName;
    if (avatarColor) updateData.avatarColor = avatarColor;
    if (bio !== undefined) updateData.bio = bio;

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required to change password' });
        return;
      }
      // OAuth-only users have no password to verify against
      if (!user.passwordHash) {
        res.status(400).json({ error: 'This account uses Google Sign-In and has no password to change.' });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: updateData,
      select: { id: true, email: true, displayName: true, avatarColor: true, avatarUrl: true, bio: true },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error('[auth/profile]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
