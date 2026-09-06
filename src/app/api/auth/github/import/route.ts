import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getGitHubImportOAuthConfig, getBaseOrigin, encodeOAuthState } from '@/lib/oauth-config';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
    const currentOrigin = getBaseOrigin(request);
    const userId = await getCurrentUserId();

    if (!userId) {
        logger.warn('[GitHub Import Auth] User must be logged in before connecting GitHub for import');
        return NextResponse.redirect(new URL('/?error=LoginRequired', currentOrigin));
    }

    const { clientId, redirectUri } = getGitHubImportOAuthConfig(request);

    if (!clientId) {
        logger.error('[GitHub Import Auth] Missing GitHub Client ID in environment');
        return NextResponse.redirect(new URL('/dashboard/projects?error=GithubConfigMissing', currentOrigin));
    }

    const returnTo = request.nextUrl.searchParams.get('returnTo') || '/dashboard/projects';
    const state = encodeOAuthState(currentOrigin, returnTo, { isImport: true, userId });

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', clientId);
    githubAuthUrl.searchParams.set('redirect_uri', redirectUri);
    githubAuthUrl.searchParams.set('scope', 'repo read:user');
    githubAuthUrl.searchParams.set('state', state);
    githubAuthUrl.searchParams.set('allow_signup', 'true');

    return NextResponse.redirect(githubAuthUrl);
}
