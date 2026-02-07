import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function resolvePath(p) {
  if (!p) return process.cwd();
  if (p.startsWith('~')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export function loadConfig(cliOptions = {}) {
  // Load .env file
  dotenv.config({ path: resolve(ROOT, '.env') });

  // Load default config
  let defaults = {};
  try {
    defaults = JSON.parse(readFileSync(resolve(ROOT, 'config', 'default.json'), 'utf-8'));
  } catch {
    // No default config file, use empty
  }

  // Build config
  const config = {
    workspace: resolvePath(cliOptions.workspace || process.env.WORKSPACE || process.cwd()),

    server: {
      port: parseInt(cliOptions.port, 10) || defaults.server?.port || 7860,
      host: defaults.server?.host || '127.0.0.1',
    },

    tailscale: {
      enabled: cliOptions.tailscale !== false && (defaults.tailscale?.enabled !== false),
      servePorts: defaults.tailscale?.servePorts || [],
      useFunnel: defaults.tailscale?.useFunnel || false,
    },

    telegram: {
      enabled: cliOptions.telegram !== false && (defaults.telegram?.enabled !== false),
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      allowedUserIds: (process.env.TELEGRAM_ALLOWED_USERS || '')
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id)),
      commands: defaults.telegram?.commands || {},
    },

    terminal: {
      shell: defaults.terminal?.shell || process.env.SHELL || '/bin/zsh',
      scrollback: defaults.terminal?.scrollback || 5000,
    },

    llm: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4.1-nano',
    },
  };

  return config;
}
