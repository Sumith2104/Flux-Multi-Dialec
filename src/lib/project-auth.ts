import { getProjectById, ensureRole, type Project } from '@/lib/data';
import { type AuthContext } from '@/lib/auth';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

export type ProjectRole = 'admin' | 'developer' | 'viewer';

export function assertProjectScope(auth: AuthContext, projectId: string): void {
    if (auth.allowedProjectId && auth.allowedProjectId !== projectId) {
        throw new FluxbaseError('This API key is not allowed to access the requested project.', ERROR_CODES.FORBIDDEN, 403);
    }
}

export async function requireProjectAccess(
    projectId: string,
    auth: AuthContext | null,
    allowedRoles?: ProjectRole[]
): Promise<Project> {
    if (!auth?.userId) {
        throw new FluxbaseError('Unauthorized', ERROR_CODES.UNAUTHORIZED, 401);
    }

    assertProjectScope(auth, projectId);

    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        throw new FluxbaseError('Project not found', ERROR_CODES.PROJECT_NOT_FOUND, 404);
    }

    if (allowedRoles) {
        await ensureRole(project, allowedRoles);
    }

    return project;
}

export function jsonError(error: unknown): { body: any; status: number } {
    if (error instanceof FluxbaseError) {
        return { body: error.toJSON(), status: error.status };
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return {
        body: {
            success: false,
            error: {
                message,
                code: ERROR_CODES.INTERNAL_ERROR,
            },
        },
        status: 500,
    };
}
