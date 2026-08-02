import { DashboardShell } from '@/components/dashboard/shell';
import { requireWorkspace } from '@/lib/auth/guard';

import { logoutAction } from '../(auth)/actions';

// Every dashboard route reads live workspace data, so none of it can be
// statically prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolves the session and membership server-side; redirects when absent.
  const { session, membership, role } = await requireWorkspace();

  return (
    <DashboardShell
      workspaceName={membership.workspaceName}
      role={role}
      userName={session.user.name}
      userEmail={session.user.email}
      isDemoWorkspace={membership.isDemoWorkspace}
      logout={logoutAction}
    >
      {children}
    </DashboardShell>
  );
}
