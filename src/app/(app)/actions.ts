
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
        // Parallelize initial check and ID fetch
        const [isHealthy, userId] = await Promise.all([
            checkDatabaseHealthAction(),
            getCurrentUserId()
        ]);

        if (!isHealthy) {
            return { isOffline: true };
        }

        if (!userId) {
            return { userId: null, isOffline: false };
        }

        // Parallelize data fetching for the authenticated user
        const [user, planRes, projects, invitations] = await Promise.all([
            findUserById(userId),
            getUserPlanAction(),
            getProjectsForCurrentUser(),
            getPendingInvitationsForCurrentUser()
        ]);

        console.log(`[Bootstrap] User: ${userId}, Projects: ${projects?.length || 0}, Invites: ${invitations?.length || 0}`);

        return {
            userId,
            user,
            plan: planRes?.success ? { type: planRes.plan, status: planRes.status } : null,
            projects,
            invitations,
            isOffline: false
        };
    } catch (error) {
        console.error("[Bootstrap Action Error]:", error);
        return { error: "Failed to initialize application data" };
    }
}
