
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logout } from '@/lib/auth';

/**
 * Server action to log out the current user.
 */
export async function logoutAction() {
    await logout();
    // Also clear the selected project cookie on logout.
    (await cookies()).delete('selectedProject');
    redirect('/');
}
