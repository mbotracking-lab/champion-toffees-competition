import { PrismaClient } from '@prisma/client';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// On Vercel (Neon PostgreSQL), use the Neon HTTP adapter with connection string
// Locally, fall back to regular PrismaClient
function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL;

  // If DATABASE_URL is a Neon PostgreSQL URL, use the Neon HTTP adapter
  if (dbUrl && (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://'))) {
    const adapter = new PrismaNeonHTTP(dbUrl, { arrayMode: true });
    return new PrismaClient({ adapter });
  }

  // Fallback: regular PrismaClient (for local SQLite or any other DB)
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
