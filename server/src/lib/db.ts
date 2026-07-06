import { PrismaClient } from '@prisma/client';

// Singleton pattern — prevents multiple Prisma connections in development
// (ts-node watch restarts the module, so we cache on globalThis)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
