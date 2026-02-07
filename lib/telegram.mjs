import { Telegraf } from 'telegraf';
import { exec, spawn } from 'child_process';
import { createLogger } from './logger.mjs';
import { createLLMSession } from './llm.mjs';

const log = createLogger('telegram');
const MAX_MESSAGE_LENGTH = 4000;

// Track LLM sessions per user
const llmSessions = new Map();
const llmModeEnabled = new Map();

export function createTelegramBot(config, context = {}) {
  if (!config.telegram.botToken) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN not set.\n' +
      '1. Message @BotFather on Telegram\n' +
      '2. Create a new bot with /newbot\n' +
      '3. Copy the token to your .env file'
    );
  }

  if (config.telegram.allowedUserIds.length === 0) {
    log.warn('No TELEGRAM_ALLOWED_USERS set. Bot will reject all messages.');
    log.warn('Message @userinfobot on Telegram to get your user ID.');
  }

  const bot = new Telegraf(config.telegram.botToken);
  const longRunningProcesses = new Map();

  // Auth middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (config.telegram.allowedUserIds.includes(userId)) {
      return next();
    }
    log.warn(`Unauthorized access attempt from user ${userId}`);
    await ctx.reply(
      `Unauthorized. Your user ID is: ${userId}\n` +
      'Add this ID to TELEGRAM_ALLOWED_USERS in your .env file to grant access.'
    );
  });

  // /start - show help
  bot.command('start', async (ctx) => {
    const commands = Object.entries(config.telegram.commands)
      .map(([name, { description }]) => `/${name} - ${description}`)
      .join('\n');

    await ctx.reply(
      `remote-terminal bot\n` +
      `Workspace: ${config.workspace}\n\n` +
      `Commands:\n${commands}\n\n` +
      `/url - Show web terminal URL\n` +
      `/stop_proc - Stop background process\n` +
      `/llm - Toggle LLM mode (AI assistant)\n` +
      `/help - Show this message\n\n` +
      `Tip: Send raw shell commands directly, or use /llm for natural language mode.`
    );
  });

  bot.command('help', async (ctx) => {
    const commands = Object.entries(config.telegram.commands)
      .map(([name, { description }]) => `/${name} - ${description}`)
      .join('\n');

    await ctx.reply(
      `Available commands:\n${commands}\n\n` +
      `/url - Show web terminal URL\n` +
      `/stop_proc - Stop background process\n\n` +
      `LLM Mode:\n` +
      `/llm - Toggle LLM mode (natural language)\n` +
      `/llm_clear - Clear conversation history\n\n` +
      `You can also send raw shell commands directly.`
    );
  });

  // /url - show web terminal URL
  bot.command('url', async (ctx) => {
    const hostname = context.tailscale?.getHostname();
    if (hostname) {
      await ctx.reply(`Web terminal:\nhttps://${hostname}/`);
    } else {
      await ctx.reply(`Web terminal:\nhttp://localhost:${config.server.port}/`);
    }
  });

  // /stop_proc - kill long-running background process
  bot.command('stop_proc', async (ctx) => {
    if (longRunningProcesses.size === 0) {
      await ctx.reply('No background processes running.');
      return;
    }
    for (const [name, child] of longRunningProcesses) {
      try {
        child.kill('SIGTERM');
        longRunningProcesses.delete(name);
        await ctx.reply(`Stopped: ${name}`);
      } catch {
        await ctx.reply(`Failed to stop: ${name}`);
      }
    }
  });

  // /llm - toggle LLM mode
  bot.command('llm', async (ctx) => {
    const userId = ctx.from.id;
    const isEnabled = llmModeEnabled.get(userId);

    if (isEnabled) {
      llmModeEnabled.set(userId, false);
      await ctx.reply('LLM mode disabled. Back to raw command mode.');
    } else {
      // Check if API key is configured
      if (!config.llm?.apiKey) {
        await ctx.reply(
          'LLM mode requires OPENAI_API_KEY in .env file.\n' +
          'Get your API key at: https://platform.openai.com/api-keys'
        );
        return;
      }

      // Create or get session
      if (!llmSessions.has(userId)) {
        try {
          const session = createLLMSession(config.llm.apiKey, config.workspace, config.llm.model);
          llmSessions.set(userId, session);
        } catch (err) {
          await ctx.reply(`Failed to start LLM: ${err.message}`);
          return;
        }
      }

      llmModeEnabled.set(userId, true);
      await ctx.reply(
        'LLM mode enabled! Send natural language commands.\n\n' +
        'Examples:\n' +
        '- "show me the git status"\n' +
        '- "list all files in src folder"\n' +
        '- "create a new branch called feature-x"\n' +
        '- "what does the main function do?"\n\n' +
        '/llm - toggle off\n' +
        '/llm_clear - clear conversation history'
      );
    }
  });

  // /llm_clear - clear LLM conversation history
  bot.command('llm_clear', async (ctx) => {
    const userId = ctx.from.id;
    const session = llmSessions.get(userId);
    if (session) {
      session.clearHistory();
      await ctx.reply('Conversation history cleared.');
    } else {
      await ctx.reply('No active LLM session.');
    }
  });

  // Register each predefined command
  for (const [name, cmdConfig] of Object.entries(config.telegram.commands)) {
    bot.command(name, async (ctx) => {
      const { cmd, long } = cmdConfig;
      log.info(`User ${ctx.from.id} executing: ${cmd}`);

      if (long) {
        await handleLongCommand(ctx, name, cmd, config.workspace, longRunningProcesses);
      } else {
        await handleShortCommand(ctx, cmd, config.workspace);
      }
    });
  }

  // Handle raw commands (any text message that's not a command)
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Skip if it's a command (starts with /)
    if (text.startsWith('/')) return;

    const userId = ctx.from.id;
    const input = text.trim();
    if (!input) return;

    // Check if LLM mode is enabled for this user
    if (llmModeEnabled.get(userId)) {
      const session = llmSessions.get(userId);
      if (!session) {
        await ctx.reply('LLM session not found. Use /llm to restart.');
        llmModeEnabled.set(userId, false);
        return;
      }

      log.info(`User ${userId} LLM message: ${input}`);

      // Send typing indicator
      await ctx.sendChatAction('typing');

      try {
        const result = await session.processMessage(input, async (update) => {
          // Send intermediate updates
          try {
            await ctx.reply(update, { parse_mode: 'Markdown' });
          } catch {
            await ctx.reply(update);
          }
          await ctx.sendChatAction('typing');
        });

        if (result.type === 'question') {
          await ctx.reply(`${result.question}`);
        } else if (result.type === 'error') {
          await ctx.reply(`Error: ${result.error}`);
        } else {
          const response = truncate(result.text);
          try {
            await ctx.reply(response, { parse_mode: 'Markdown' });
          } catch {
            await ctx.reply(response);
          }
        }
      } catch (err) {
        log.error(`LLM processing error: ${err.message}`);
        await ctx.reply(`Error: ${err.message}`);
      }
    } else {
      // Raw command mode
      log.info(`User ${userId} raw command: ${input}`);
      await handleShortCommand(ctx, input, config.workspace);
    }
  });

  async function start() {
    await bot.launch();
    log.success(`Bot started (@${bot.botInfo?.username || 'unknown'})`);
  }

  function stop() {
    for (const [, child] of longRunningProcesses) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
    longRunningProcesses.clear();
    bot.stop('SIGINT');
    log.info('Bot stopped');
  }

  return { bot, start, stop };
}

function truncate(text) {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return text.slice(0, MAX_MESSAGE_LENGTH) + '\n... (truncated)';
  }
  return text;
}

function escapeMarkdown(text) {
  // Escape characters that break Telegram Markdown
  return text.replace(/[`]/g, "'");
}

async function handleShortCommand(ctx, cmd, cwd) {
  await ctx.reply(`Running: \`${cmd}\`...`, { parse_mode: 'Markdown' });

  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 60000, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
      let output = (stdout + stderr).trim();
      if (err && !output) {
        output = err.message;
      }
      if (!output) {
        output = '(no output)';
      }

      output = escapeMarkdown(output);
      const msg = truncate(output);

      try {
        await ctx.reply(`\`\`\`\n${msg}\n\`\`\``, { parse_mode: 'Markdown' });
      } catch {
        // If markdown fails, send as plain text
        await ctx.reply(msg);
      }
      resolve();
    });
  });
}

async function handleLongCommand(ctx, name, cmd, cwd, processMap) {
  // Kill existing process with same name if any
  if (processMap.has(name)) {
    try { processMap.get(name).kill('SIGTERM'); } catch { /* ignore */ }
    processMap.delete(name);
  }

  await ctx.reply(`Starting: \`${cmd}\`...\nUse /stop_proc to stop it.`, { parse_mode: 'Markdown' });

  const child = spawn('sh', ['-c', cmd], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  processMap.set(name, child);

  // Collect initial output for a few seconds
  let output = '';
  let sent = false;

  const sendInitialOutput = async () => {
    if (sent) return;
    sent = true;
    const text = output.trim() || '(process started, no output yet)';
    const msg = escapeMarkdown(truncate(text));
    try {
      await ctx.reply(`\`\`\`\n${msg}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(msg);
    }
  };

  child.stdout.on('data', (data) => { output += data.toString(); });
  child.stderr.on('data', (data) => { output += data.toString(); });

  // Send initial output after 5 seconds
  setTimeout(sendInitialOutput, 5000);

  child.on('close', async (code) => {
    processMap.delete(name);
    await sendInitialOutput();
    try {
      await ctx.reply(`Process \`${name}\` exited (code: ${code})`, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(`Process ${name} exited (code: ${code})`);
    }
  });
}
