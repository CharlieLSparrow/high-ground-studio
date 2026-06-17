import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/firebase-admin';
import { getPrismaClient } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
    }

    // Verify the token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // Ensure User exists in Postgres
    const prisma = getPrismaClient();
    const email = decodedToken.email;
    
    if (email) {
      let user = await prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid }
      });

      if (!user) {
        // Fallback: look for a legacy user via email (e.g. from Patreon NextAuth days)
        user = await prisma.user.findUnique({
          where: { primaryEmail: email }
        });

        if (user) {
          // Found legacy user: securely attach their new Firebase UID to their existing account
          await prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid: decodedToken.uid }
          });
        } else {
          // Completely new user
          await prisma.user.create({
            data: {
              firebaseUid: decodedToken.uid,
              primaryEmail: email,
              name: decodedToken.name || 'New User',
              image: decodedToken.picture || null,
            }
          });
        }
      } else if (user.primaryEmail !== email) {
        // Keep their email synced if they change it in Firebase Auth
        await prisma.user.update({
          where: { id: user.id },
          data: { primaryEmail: email }
        });
      }
    }

    // Set session expiration to 5 days
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const cookieStore = await cookies();
    cookieStore.set('session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session creation failed', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (sessionCookie) {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      await adminAuth.revokeRefreshTokens(decodedClaims.sub);
    }
    
    cookieStore.delete('session');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
