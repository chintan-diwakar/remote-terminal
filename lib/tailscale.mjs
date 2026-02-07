import { execSync, execFileSync } from 'child_process';
import { createLogger } from './logger.mjs';

const log = createLogger('tailscale');

function findBinary() {
  const candidates = [
    'tailscale',
    '/usr/local/bin/tailscale',
    '/opt/homebrew/bin/tailscale',
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  ];

  for (const bin of candidates) {
    try {
      execSync(`"${bin}" version`, { stdio: 'pipe', env: { ...process.env, TERM: 'xterm-256color' } });
      return bin;
    } catch {
      // try next
    }
  }

  throw new Error(
    'Tailscale CLI not found. Install it:\n' +
    '  macOS: brew install tailscale  (or install the App Store version)\n' +
    '  Linux: curl -fsSL https://tailscale.com/install.sh | sh'
  );
}

export class TailscaleManager {
  constructor() {
    this.binary = null;
    this.hostname = null;
    this.exposedPorts = new Set();
  }

  async init() {
    this.binary = findBinary();
    log.info(`Using binary: ${this.binary}`);

    // Verify connection
    const status = this.getStatus();
    if (status.BackendState !== 'Running') {
      throw new Error(
        `Tailscale is not connected (state: ${status.BackendState}).\n` +
        'Run: tailscale up'
      );
    }

    this.hostname = status.Self.DNSName.replace(/\.$/, '');
    log.success(`Connected as ${this.hostname}`);
    return this;
  }

  getStatus() {
    const output = execSync(`"${this.binary}" status --json`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    return JSON.parse(output.toString());
  }

  getHostname() {
    return this.hostname;
  }

  serve(localPort, opts = {}) {
    const args = ['serve', '--bg'];

    if (opts.httpsPort && opts.httpsPort !== 443) {
      args.push(`--https=${opts.httpsPort}`);
    }

    const target = `http://localhost:${localPort}`;
    args.push(target);

    try {
      execFileSync(this.binary, args, {
        stdio: 'pipe',
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      const externalPort = opts.httpsPort || 443;
      const url = externalPort === 443
        ? `https://${this.hostname}/`
        : `https://${this.hostname}:${externalPort}/`;

      this.exposedPorts.add(localPort);
      log.success(`Serving localhost:${localPort} at ${url}`);
      return url;
    } catch (err) {
      log.error(`Failed to serve port ${localPort}: ${err.message}`);
      throw err;
    }
  }

  funnel(localPort, opts = {}) {
    const args = ['funnel', '--bg'];

    if (opts.httpsPort && opts.httpsPort !== 443) {
      args.push(`--https=${opts.httpsPort}`);
    }

    const target = `http://localhost:${localPort}`;
    args.push(target);

    try {
      execFileSync(this.binary, args, {
        stdio: 'pipe',
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      const externalPort = opts.httpsPort || 443;
      const url = externalPort === 443
        ? `https://${this.hostname}/`
        : `https://${this.hostname}:${externalPort}/`;

      this.exposedPorts.add(localPort);
      log.success(`Funneling localhost:${localPort} at ${url} (public)`);
      return url;
    } catch (err) {
      log.error(`Failed to funnel port ${localPort}: ${err.message}`);
      throw err;
    }
  }

  expose(localPort, config = {}) {
    const method = config.useFunnel ? 'funnel' : 'serve';
    return this[method](localPort, { httpsPort: localPort });
  }

  reset() {
    try {
      execFileSync(this.binary, ['serve', 'reset'], {
        stdio: 'pipe',
        env: { ...process.env, TERM: 'xterm-256color' },
      });
      this.exposedPorts.clear();
      log.info('All serve/funnel configurations reset');
    } catch (err) {
      log.warn(`Failed to reset serve config: ${err.message}`);
    }
  }

  serveStatus() {
    try {
      const output = execFileSync(this.binary, ['serve', 'status'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color' },
      });
      return output.toString().trim();
    } catch {
      return '(no active serve configurations)';
    }
  }
}
