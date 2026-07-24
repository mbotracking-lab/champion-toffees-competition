import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Check if we're on Vercel (Postgres) or local (SQLite)
const isVercel = process.env.POSTGRES_URL_NON_POOLING || (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql'));

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
