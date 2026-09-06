import { detectDialect } from './dialect-detector';
import logger from '@/lib/logger';

export interface GitHubRepo {
    id: number;
    full_name: string;          // "owner/repo"
    name: string;
    private: boolean;
    description: string | null;
    default_branch: string;
    language: string | null;
    updated_at: string;
    html_url: string;
    stargazers_count: number;
}

export interface GitHubFileEntry {
    name: string;
    path: string;
    type: 'file' | 'dir';
    size: number;
    sha: string;
    download_url: string | null;
}

export interface FluxbaseManifest {
    projectName?: string;
    dialect?: 'postgresql' | 'mysql';
    executionOrder?: string[];
    description?: string;
    version?: string;
}

export interface FluxbaseModule {
    found: boolean;
    files: GitHubFileEntry[];          // .sql files sorted in execution order
    manifest: FluxbaseManifest | null;
    detectedDialect: 'postgresql' | 'mysql';
    dialectConfidence: number;         // 0-100
    totalSizeBytes: number;
    repoFullName: string;
    branch: string;
    modulePath: string;                // e.g. "fluxbase" or "packages/api/fluxbase"
}

export class GitHubClient {
    private headers: Record<string, string>;

    constructor(private accessToken: string) {
        this.headers = {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Fluxbase-Cloud',
        };
    }

    async getUser(): Promise<{ login: string; avatar_url: string; name: string }> {
        const res = await fetch('https://api.github.com/user', {
            headers: this.headers,
        });

        if (!res.ok) {
            throw new Error(`GitHub API error fetching user (${res.status}): ${await res.text()}`);
        }

        const data = await res.json();
        return {
            login: data.login,
            avatar_url: data.avatar_url,
            name: data.name || data.login,
        };
    }

    async listRepos(page: number = 1, perPage: number = 30, sort: string = 'updated'): Promise<GitHubRepo[]> {
        const url = `https://api.github.com/user/repos?sort=${encodeURIComponent(sort)}&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`;
        const res = await fetch(url, {
            headers: this.headers,
        });

        if (!res.ok) {
            throw new Error(`GitHub API error listing repos (${res.status}): ${await res.text()}`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map((r: any) => ({
            id: r.id,
            full_name: r.full_name,
            name: r.name,
            private: Boolean(r.private),
            description: r.description || null,
            default_branch: r.default_branch || 'main',
            language: r.language || null,
            updated_at: r.updated_at,
            html_url: r.html_url,
            stargazers_count: r.stargazers_count || 0,
        }));
    }

    async searchUserRepos(query: string): Promise<GitHubRepo[]> {
        // Fetch user repos and filter locally for responsiveness and rate-limit conservation
        const all = await this.listRepos(1, 100);
        const q = query.toLowerCase().trim();
        return all.filter(r => 
            r.name.toLowerCase().includes(q) || 
            r.full_name.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q))
        );
    }

    async getFileContent(
        owner: string,
        repo: string,
        path: string,
        branch: string = 'main'
    ): Promise<{ content: string; sha: string; size: number }> {
        const cleanPath = path.replace(/^\/+/, '');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
        const res = await fetch(url, {
            headers: this.headers,
        });

        if (!res.ok) {
            throw new Error(`GitHub API error fetching file ${cleanPath} (${res.status}): ${await res.text()}`);
        }

        const data = await res.json();
        if (data.type !== 'file' || !data.content) {
            throw new Error(`Item at ${cleanPath} is not a valid file or has empty content`);
        }

        const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
        return {
            content,
            sha: data.sha,
            size: data.size || content.length,
        };
    }

    async discoverFluxbaseModule(
        owner: string,
        repo: string,
        branch: string = 'main',
        modulePath: string = 'fluxbase'
    ): Promise<FluxbaseModule> {
        const cleanModulePath = modulePath.replace(/^\/+|\/+$/g, '') || 'fluxbase';
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanModulePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
        
        let entries: any[] = [];
        try {
            const res = await fetch(url, { headers: this.headers });
            if (res.status === 404) {
                return {
                    found: false,
                    files: [],
                    manifest: null,
                    detectedDialect: 'postgresql',
                    dialectConfidence: 0,
                    totalSizeBytes: 0,
                    repoFullName: `${owner}/${repo}`,
                    branch,
                    modulePath: cleanModulePath,
                };
            }
            if (!res.ok) {
                throw new Error(`GitHub API error discovering module (${res.status}): ${await res.text()}`);
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                entries = data;
            }
        } catch (e: any) {
            logger.warn(`[GitHubClient] Could not fetch ${url}:`, e.message);
            return {
                found: false,
                files: [],
                manifest: null,
                detectedDialect: 'postgresql',
                dialectConfidence: 0,
                totalSizeBytes: 0,
                repoFullName: `${owner}/${repo}`,
                branch,
                modulePath: cleanModulePath,
            };
        }

        // 1. Check for optional fluxbase.json manifest
        let manifest: FluxbaseManifest | null = null;
        const manifestEntry = entries.find(e => e.name.toLowerCase() === 'fluxbase.json' && e.type === 'file');
        if (manifestEntry) {
            try {
                const { content } = await this.getFileContent(owner, repo, manifestEntry.path, branch);
                manifest = JSON.parse(content);
            } catch (err) {
                logger.warn('[GitHubClient] Failed to parse fluxbase.json manifest:', err);
            }
        }

        // 2. Filter .sql files
        const sqlFiles: GitHubFileEntry[] = entries
            .filter(e => e.type === 'file' && e.name.toLowerCase().endsWith('.sql'))
            .map(e => ({
                name: e.name,
                path: e.path,
                type: 'file',
                size: e.size || 0,
                sha: e.sha,
                download_url: e.download_url || null,
            }));

        if (sqlFiles.length === 0) {
            return {
                found: false,
                files: [],
                manifest,
                detectedDialect: manifest?.dialect || 'postgresql',
                dialectConfidence: manifest?.dialect ? 100 : 0,
                totalSizeBytes: 0,
                repoFullName: `${owner}/${repo}`,
                branch,
                modulePath: cleanModulePath,
            };
        }

        // 3. Sort SQL files by execution order
        // If manifest has executionOrder, honor it. Otherwise alphabetical with seed*.sql last.
        let sortedFiles: GitHubFileEntry[] = [];
        if (manifest?.executionOrder && Array.isArray(manifest.executionOrder) && manifest.executionOrder.length > 0) {
            const orderMap = new Map<string, number>();
            manifest.executionOrder.forEach((name, idx) => {
                orderMap.set(name.toLowerCase(), idx);
            });

            sortedFiles = [...sqlFiles].sort((a, b) => {
                const orderA = orderMap.has(a.name.toLowerCase()) ? orderMap.get(a.name.toLowerCase())! : 9999;
                const orderB = orderMap.has(b.name.toLowerCase()) ? orderMap.get(b.name.toLowerCase())! : 9999;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
        } else {
            sortedFiles = [...sqlFiles].sort((a, b) => {
                const aIsSeed = a.name.toLowerCase().startsWith('seed');
                const bIsSeed = b.name.toLowerCase().startsWith('seed');
                if (aIsSeed && !bIsSeed) return 1;
                if (!aIsSeed && bIsSeed) return -1;
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });
        }

        // 4. Sample files content to detect dialect
        let sampleSqlContent = '';
        let totalSizeBytes = 0;

        for (const file of sortedFiles) {
            totalSizeBytes += file.size;
            // Sample up to first 3 files or 60KB for dialect detection
            if (sampleSqlContent.length < 60000) {
                try {
                    const { content } = await this.getFileContent(owner, repo, file.path, branch);
                    sampleSqlContent += '\n' + content.slice(0, 20000);
                } catch (e) {
                    logger.warn(`[GitHubClient] Could not sample ${file.path}:`, e);
                }
            }
        }

        const score = detectDialect(sampleSqlContent);
        const finalDialect = manifest?.dialect || score.winner;
        const confidence = manifest?.dialect ? 100 : score.confidence;

        return {
            found: true,
            files: sortedFiles,
            manifest,
            detectedDialect: finalDialect,
            dialectConfidence: confidence,
            totalSizeBytes,
            repoFullName: `${owner}/${repo}`,
            branch,
            modulePath: cleanModulePath,
        };
    }
}
