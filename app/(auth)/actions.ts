'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { recordAuditSafely } from '@/lib/audit/log';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  clearFailedLogins,
  createSession,
  destroySession,
  isLockedOut,
  registerFailedLogin,
} from '@/lib/auth/session';
import { prisma } from '@/lib/database/client';
import { hashIpAddress } from '@/lib/encryption/crypto';
import { slugify } from '@/lib/utils';
import { loginSchema, registerSchema } from '@/lib/validation/schemas';

/**
 * Authentication server actions.
 *
 * Failures return a generic message regardless of cause. Distinguishing
 * "no such account" from "wrong password" would turn the login form into an
 * account-enumeration oracle.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const GENERIC_FAILURE = 'Those credentials were not recognised.';

async function currentIpHash(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return hashIpAddress(forwarded?.split(',')[0]?.trim() ?? null);
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Enter a valid email address and password.' };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user) {
    // Hash anyway so a missing account and a wrong password take similar time.
    await hashPassword('timing-equalisation-placeholder');
    return { error: GENERIC_FAILURE };
  }

  if (isLockedOut(user.lockedUntil)) {
    return {
      error:
        'This account is temporarily locked after repeated failed attempts. Try again shortly.',
    };
  }

  if (user.status !== 'ACTIVE') {
    return { error: 'This account is not active.' };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  if (!valid) {
    await registerFailedLogin(user.id);

    if (membership) {
      await recordAuditSafely({
        workspaceId: membership.workspaceId,
        actorId: user.id,
        actorLabel: user.email,
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        ipHash: await currentIpHash(),
      });
    }

    return { error: GENERIC_FAILURE };
  }

  await clearFailedLogins(user.id);
  await createSession(user.id);

  if (membership) {
    await recordAuditSafely({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      actorLabel: user.email,
      action: 'auth.login_succeeded',
      resourceType: 'user',
      resourceId: user.id,
      ipHash: await currentIpHash(),
    });
  }

  redirect('/dashboard');
}

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    workspaceName: formData.get('workspaceName'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: 'Check the highlighted fields.', fieldErrors };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existing) {
    return {
      error: 'That email address cannot be used to register.',
      fieldErrors: { email: 'Already registered.' },
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // A unique slug is required; append a suffix when the base is taken.
  const baseSlug = slugify(parsed.data.workspaceName) || 'workspace';
  let slug = baseSlug;
  let suffix = 1;

  while (await prisma.workspace.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  // The user, workspace and ownership membership must all exist or none of
  // them should — an account with no workspace is unusable.
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: parsed.data.workspaceName,
        slug,
        contentLoggingMode: 'METADATA_ONLY',
      },
    });

    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
    });

    return { userId: user.id, email: user.email, workspaceId: workspace.id };
  });

  await recordAuditSafely({
    workspaceId: created.workspaceId,
    actorId: created.userId,
    actorLabel: created.email,
    action: 'auth.registered',
    resourceType: 'user',
    resourceId: created.userId,
    newState: { email: created.email, workspace: parsed.data.workspaceName },
    ipHash: await currentIpHash(),
  });

  await createSession(created.userId);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
