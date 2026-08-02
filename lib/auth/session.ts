import 'server-only';

import { cookies, headers } from 'next/headers';

import { prisma } from '@/lib/database/client';
import type { WorkspaceRole } from '@/lib/database/generated/enums';
import { generateToken, hashIpAddress, sha256 } from '@/lib/encryption/crypto';

/**
 * Database-backed sessions.
 *
 * The cookie carries an opaque random token; the database stores only its
 * SHA-256. That means a database disclosure yields no usable session, and a
 * session can be revoked server-side immediately — neither of which is true of
 * a self-contained JWT. Tokens are never placed in localStorage, so an XSS
 * cannot read them.
 */

export const SESSION_COOKIE = 'omnirouter_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24; // refresh once a day

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isDemoAccount: boolean;
}

export interface SessionMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
  isDemoWorkspace: boolean;
  isProtected: boolean;
}

export interface AuthenticatedSession {
  user: SessionUser;
  memberships: SessionMembership[];
  sessionId: string;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    // Secure is required in production; omitted locally so http://localhost works.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? null;

  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ipHash: hashIpAddress(ip),
      userAgent: headerList.get('user-agent')?.slice(0, 255) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOptions(expiresAt));

  return token;
}

/**
 * Resolves the current session, or null.
 *
 * Loads memberships in the same query so downstream authorisation never has to
 * trust a client-supplied workspace claim.
 */
export async function getSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { workspace: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (session.user.status !== 'ACTIVE') return null;

  // Refresh lastSeenAt at most once a day to avoid a write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > RENEW_THRESHOLD_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isDemoAccount: session.user.isDemoAccount,
    },
    memberships: session.user.memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      workspaceSlug: membership.workspace.slug,
      role: membership.role,
      isDemoWorkspace: membership.workspace.isDemoWorkspace,
      isProtected: membership.workspace.isProtected,
    })),
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: sha256(token) } })
      .catch(() => {});
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user — used after a password change. */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Login throttling.
 *
 * Counters live on the user row so the limit survives a restart and cannot be
 * bypassed by rotating IP addresses.
 */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 1000 * 60 * 15;

export async function registerFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLogins: true },
  });

  const failedLogins = (user?.failedLogins ?? 0) + 1;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins,
      lockedUntil:
        failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
    },
  });
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

export function isLockedOut(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

export { MAX_FAILED_LOGINS, LOCKOUT_MS, SESSION_TTL_MS };
