import pty from 'node-pty';
import { createLogger } from './logger.mjs';

const log = createLogger('terminal');

export class TerminalManager {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.nextId = 1;
  }

  create(ws) {
    const id = this.nextId++;
    const shell = this.config.terminal.shell || process.env.SHELL || '/bin/zsh';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.config.workspace,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    log.info(`Session ${id} started (pid: ${ptyProcess.pid}, shell: ${shell}, cwd: ${this.config.workspace})`);

    // PTY -> WebSocket
    ptyProcess.onData((data) => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(data);
        }
      } catch {
        // WebSocket might have closed
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      log.info(`Session ${id} exited (code: ${exitCode}, signal: ${signal})`);
      this.sessions.delete(id);
      try {
        if (ws.readyState === 1) {
          ws.send(`\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        }
      } catch {
        // ignore
      }
    });

    // WebSocket -> PTY
    ws.on('message', (msg) => {
      const data = msg.toString();

      // Try to parse as JSON control message
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          ptyProcess.resize(parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Not JSON, treat as raw input
      }

      ptyProcess.write(data);
    });

    ws.on('close', () => {
      log.info(`Session ${id} WebSocket closed`);
      this.destroy(id);
    });

    this.sessions.set(id, { pty: ptyProcess, ws });
    return id;
  }

  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  destroy(id) {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.pty.kill();
      } catch {
        // already dead
      }
      this.sessions.delete(id);
    }
  }

  destroyAll() {
    for (const [id] of this.sessions) {
      this.destroy(id);
    }
    log.info('All terminal sessions destroyed');
  }

  getSessionCount() {
    return this.sessions.size;
  }
}
