import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getGitHubImportOAuthConfig, getBaseOrigin, decodeOAuthState, isAllowedOrigin } from '@/lib/oauth-config';
import { storeGitHubToken } from '@/lib/github-token';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');

    const decoded = decodeOAuthState(stateParam);
    const currentOrigin = getBaseOrigin(request);
    const destinationOrigin = decoded.origin && isAllowedOrigin(decoded.origin) ? decoded.origin : currentOrigin;
    const redirectPath = decoded.returnTo || '/dashboard/projects';

    const userId = (await getCurrentUserId()) || decoded.userId;

    if (!userId) {
        logger.error('[GitHub Import Callback] No authenticated user found');
        return NextResponse.redirect(new URL('/?error=LoginRequired', destinationOrigin));
    }

    const { clientId, clientSecret, redirectUri } = getGitHubImportOAuthConfig(request);

    if (!code || !clientId || !clientSecret) {
        logger.error('[GitHub Import Callback] Missing code or GitHub credentials');
        return NextResponse.redirect(new URL(`${redirectPath}?error=GithubImportFailed`, destinationOrigin));
    }

    try {
        // 1. Exchange code for access token with repo scope
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            logger.error('[GitHub Import Callback] Failed to get access token:', tokenData);
            return NextResponse.redirect(new URL(`${redirectPath}?error=GithubTokenExchangeFailed`, destinationOrigin));
        }

        // 2. Fetch GitHub username
        let githubUsername = '';
        try {
            const userRes = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'Fluxbase-Cloud',
                },
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                githubUsername = userData.login || '';
            }
        } catch (uErr) {
            logger.warn('[GitHub Import Callback] Failed to fetch user profile:', uErr);
        }

        // 3. Store encrypted token in DB for this user
        await storeGitHubToken(userId, accessToken, tokenData.scope || 'repo', githubUsername);

        logger.info(`[GitHub Import Callback] Successfully connected GitHub repo access for user ${userId} (@${githubUsername})`);

        // 4. Redirect back to destination with github_connected=true
        const successUrl = new URL(redirectPath, destinationOrigin);
        successUrl.searchParams.set('github_connected', 'true');
        if (githubUsername) {
            successUrl.searchParams.set('github_username', githubUsername);
        }
        return NextResponse.redirect(successUrl);

    } catch (error) {
        logger.error('[GitHub Import Callback] Exception:', error);
        return NextResponse.redirect(new URL(`${redirectPath}?error=GithubImportException`, destinationOrigin));
    }
}
