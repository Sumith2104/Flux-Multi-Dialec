
'use server';

import { cookies } from 'next/headers';
import { logout, getCurrentUserId } from '@/lib/auth';
import { findUserById } from '@/lib/auth-actions';
import { getProjectsForCurrentUser, checkDatabaseHealthAction, getPendingInvitationsForCurrentUser } from '@/lib/data';
import { getUserPlanAction } from './settings/actions';

/**
 * Server action to log out the current user.
 */
export async function logoutAction() {
    await logout();
    // Also clear the selected project cookie on logout.
    (await cookies()).delete('selectedProject');
    return { success: true };
}

/**
 * Consolidates all necessary layout data into a single parallelized round-trip.
 * This is the primary optimization to fix the 'Initializing' waterfall.
 */
export async function getAppLayoutBootstrapData() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return { userId: null, isOffline: false };
        }

        // Parallelize data fetching for the authenticated user
        const [user, planRes, projects, invitations] = await Promise.all([
            findUserById(userId).catch(() => null),
            getUserPlanAction().catch(() => null),
            getProjectsForCurrentUser().catch(() => []),
            getPendingInvitationsForCurrentUser().catch(() => [])
        ]);

        // If user query failed completely, perform a fallback database health check
        if (!user && (!projects || projects.length === 0)) {
            const isHealthy = await checkDatabaseHealthAction();
            if (!isHealthy) {
                return { isOffline: true };
            }
        }

        console.log(`[Bootstrap] User: ${userId}, Projects: ${projects?.length || 0}, Invites: ${invitations?.length || 0}`);

        return {
            userId,
            user,
            plan: planRes?.success ? { type: planRes.plan, status: planRes.status } : null,
            projects: projects || [],
            invitations: invitations || [],
            isOffline: false
        };
    } catch (error) {
        console.error("[Bootstrap Action Error]:", error);
        return { isOffline: false, userId: null, error: "Failed to initialize application data" };
    }
}
