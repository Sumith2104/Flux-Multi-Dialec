import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.fluxbase');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface FluxbaseConfig {
  apiUrl: string;
  apiKey: string;
}

export function getConfig(): FluxbaseConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveConfig(config: FluxbaseConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const config = getConfig();
  if (!config) {
    throw new Error('Not logged in. Run `fluxbase login <url> --key <key>` first.');
  }

  const url = `${config.apiUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/plain')) {
    return res.text();
  }
  return res.json();
}
