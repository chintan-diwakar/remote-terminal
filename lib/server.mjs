import express from 'express';
import expressWs from 'express-ws';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TerminalManager } from './terminal.mjs';
import { createLogger } from './logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const log = createLogger('server');

export function createServer(config) {
  const app = express();
  expressWs(app);

  const terminalManager = new TerminalManager(config);

  // Serve xterm.js assets from node_modules
  app.get('/vendor/xterm.js', (req, res) => {
    res.sendFile(resolve(ROOT, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'));
  });
  app.get('/vendor/xterm.css', (req, res) => {
    res.type('text/css').sendFile(resolve(ROOT, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'));
  });
  app.get('/vendor/xterm-addon-fit.js', (req, res) => {
    res.sendFile(resolve(ROOT, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'));
  });
  app.get('/vendor/xterm-addon-web-links.js', (req, res) => {
    res.sendFile(resolve(ROOT, 'node_modules', '@xterm', 'addon-web-links', 'lib', 'addon-web-links.js'));
  });

  // Serve web terminal static files
  app.use(express.static(resolve(ROOT, 'web')));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      workspace: config.workspace,
      sessions: terminalManager.getSessionCount(),
      uptime: process.uptime(),
    });
  });

  // API: workspace info
  app.get('/api/info', (req, res) => {
    res.json({
      workspace: config.workspace,
      hostname: config._hostname || 'localhost',
    });
  });

  // WebSocket terminal endpoint
  app.ws('/ws/terminal', (ws, req) => {
    log.info('New terminal connection');
    terminalManager.create(ws);
  });

  function start() {
    return new Promise((resolve, reject) => {
      const server = app.listen(config.server.port, config.server.host, () => {
        log.success(`Web terminal at http://${config.server.host}:${config.server.port}/`);
        resolve(server);
      });
      server.on('error', reject);
    });
  }

  return { app, start, terminalManager };
}
