import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Admin Login
 * Credentials are read from environment variables.
 * Falls back to defaults ONLY in development mode.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'development' ? 'champion2026' : '');

    if (!ADMIN_PASSWORD) {
      console.error('[admin-login] ADMIN_PASSWORD env var is not set');
      return NextResponse.json(
        { error: 'Server not configured. Set ADMIN_PASSWORD env var.' },
        { status: 500 }
      );
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Ensure admin exists in DB (for Prisma relations)
    try {
      const existingAdmin = await db.adminUser.findUnique({
        where: { username: ADMIN_USERNAME },
      });
      if (!existingAdmin) {
        await db.adminUser.create({
          data: {
            username: ADMIN_USERNAME,
            passwordHash: '[env-var]', // actual password is never stored in DB
            role: 'admin',
          },
        });
      }
    } catch {
      // Non-critical: DB might not be ready yet
    }

    return NextResponse.json({
      success: true,
      admin: { username: ADMIN_USERNAME, role: 'admin' },
      token: 'champion-admin-session-token',
    });
  } catch (error) {
    console.error('[admin-login] Error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
