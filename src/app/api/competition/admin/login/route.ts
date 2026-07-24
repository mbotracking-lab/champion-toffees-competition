import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (username === 'admin' && password === 'champion2026') {
      const existingAdmin = await db.adminUser.findUnique({
        where: { username: 'admin' },
      });

      if (!existingAdmin) {
        await db.adminUser.create({
          data: {
            username: 'admin',
            passwordHash: 'champion2026',
            role: 'admin',
          },
        });
      }

      return NextResponse.json({
        success: true,
        admin: {
          username: 'admin',
          role: 'admin',
        },
        token: 'champion-admin-session-token',
      });
    }

    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error logging in:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
