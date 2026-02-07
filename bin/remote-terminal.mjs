#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from '../lib/config.mjs';
import { createServer } from '../lib/server.mjs';
import { TailscaleManager } from '../lib/tailscale.mjs';
import { createTelegramBot } from '../lib/telegram.mjs';
import { createLogger } from '../lib/logger.mjs';

const log = createLogger('remote-terminal');

const program = new Command();

program
  .name('remote-terminal')
  .description('Access your workspace from anywhere — web terminal, Telegram bot with AI')
  .version('1.0.0');

program
  .command('start')
  .description('Start web terminal, Telegram bot, and Tailscale tunnels')
  .option('-w, --workspace <path>', 'Workspace directory')
  .option('-p, --port <number>', 'Web terminal port', '7860')
  .option('--no-tailscale', 'Skip Tailscale integration')
  .option('--no-telegram', 'Skip Telegram bot')
  .action(async (opts) => {
    const config = loadConfig({
      workspace: opts.workspace,
      port: opts.port,
      tailscale: opts.tailscale,
      telegram: opts.telegram,
    });

    log.info(`Workspace: ${config.workspace}`);

    let tailscale = null;
    let telegramBot = null;
    let server = null;

    // --- Start Express server ---
    try {
      server = createServer(config);
      await server.start();
    } catch (err) {
      log.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }

    // --- Start Tailscale ---
    if (config.tailscale.enabled) {
      try {
        tailscale = new TailscaleManager();
        await tailscale.init();
        config._hostname = tailscale.getHostname();

        // Serve web terminal on default HTTPS port
        const method = config.tailscale.useFunnel ? 'funnel' : 'serve';
        tailscale[method](config.server.port);

        // Expose additional pre-configured ports
        for (const port of config.tailscale.servePorts) {
          tailscale.expose(port, config.tailscale);
        }
      } catch (err) {
        log.error(`Tailscale: ${err.message}`);
        log.warn('Continuing without Tailscale. Use --no-tailscale to suppress this.');
      }
    } else {
      log.info('Tailscale disabled (--no-tailscale)');
    }

    // --- Start Telegram bot ---
    if (config.telegram.enabled && config.telegram.botToken) {
      try {
        telegramBot = createTelegramBot(config, { tailscale });
        await telegramBot.start();
      } catch (err) {
        log.error(`Telegram: ${err.message}`);
        log.warn('Continuing without Telegram bot.');
      }
    } else if (config.telegram.enabled && !config.telegram.botToken) {
      log.info('Telegram bot skipped (no TELEGRAM_BOT_TOKEN in .env)');
    } else {
      log.info('Telegram bot disabled (--no-telegram)');
    }

    // --- Print summary ---
    console.log('');
    log.success('=== remote-terminal is running ===');
    console.log('');
    log.info(`  Web terminal: http://localhost:${config.server.port}/`);
    if (tailscale?.getHostname()) {
      log.info(`  Tailscale:    https://${tailscale.getHostname()}/`);
      for (const port of config.tailscale.servePorts) {
        log.info(`  Dev server:   https://${tailscale.getHostname()}:${port}/`);
      }
    }
    if (telegramBot) {
      log.info(`  Telegram bot: active`);
    }
    console.log('');
    log.info('Press Ctrl+C to stop.');

    // --- Graceful shutdown ---
    const shutdown = async (signal) => {
      console.log('');
      log.info(`Received ${signal}, shutting down...`);

      if (server?.terminalManager) {
        server.terminalManager.destroyAll();
      }

      if (telegramBot) {
        telegramBot.stop();
      }

      if (tailscale) {
        tailscale.reset();
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  });

program
  .command('expose <port>')
  .description('Expose a localhost port via Tailscale')
  .option('--funnel', 'Use funnel (public internet) instead of serve (tailnet-only)')
  .action(async (port, opts) => {
    const config = loadConfig();
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      log.error('Invalid port number');
      process.exit(1);
    }

    try {
      const tailscale = new TailscaleManager();
      await tailscale.init();

      if (opts.funnel) {
        tailscale.funnel(portNum, { httpsPort: portNum });
      } else {
        tailscale.serve(portNum, { httpsPort: portNum });
      }
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }
  });

program
  .command('unexpose')
  .description('Remove all Tailscale serve/funnel configurations')
  .action(async () => {
    try {
      const tailscale = new TailscaleManager();
      await tailscale.init();
      tailscale.reset();
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current status')
  .action(async () => {
    const config = loadConfig();
    log.info(`Workspace: ${config.workspace}`);

    try {
      const tailscale = new TailscaleManager();
      await tailscale.init();
      console.log('');
      log.info('Tailscale serve status:');
      console.log(tailscale.serveStatus());
    } catch (err) {
      log.warn(`Tailscale: ${err.message}`);
    }
  });

program.parse();
