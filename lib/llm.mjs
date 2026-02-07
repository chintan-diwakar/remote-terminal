import OpenAI from 'openai';
import { exec } from 'child_process';
import { createLogger } from './logger.mjs';

const log = createLogger('llm');
const MAX_TURNS = 10;
const MAX_OUTPUT_LENGTH = 8000;

const SYSTEM_PROMPT = `You are a helpful command-line assistant running on a user's machine via Telegram.
You have access to run shell commands in their workspace directory.

Your job is to:
1. Understand what the user wants to do
2. Run the appropriate shell commands to accomplish the task
3. Report back the results in a clear, concise way

Guidelines:
- Run commands to gather information before making changes
- For destructive operations, confirm with the user first
- Keep responses concise since this is Telegram
- If a command fails, try to diagnose and fix the issue
- You can run multiple commands in sequence to accomplish complex tasks

The workspace is a coding project. You can help with:
- Git operations (status, commit, push, pull, branches)
- File operations (list, read, create, edit)
- Package management (npm, pip, etc.)
- Running builds, tests, dev servers
- Exploring and understanding the codebase
- Debugging issues`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace directory. Returns stdout and stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a question or request confirmation before proceeding',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the user',
          },
        },
        required: ['question'],
      },
    },
  },
];

export class LLMSession {
  constructor(apiKey, workspace, model = 'gpt-4.1-nano') {
    this.client = new OpenAI({ apiKey });
    this.workspace = workspace;
    this.model = model;
    this.conversationHistory = [];
    this.pendingQuestion = null;
  }

  async runCommand(command) {
    return new Promise((resolve) => {
      log.info(`Running: ${command}`);
      exec(command, {
        cwd: this.workspace,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      }, (err, stdout, stderr) => {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;
        if (err && !output) output = err.message;
        if (!output) output = '(no output)';

        // Truncate if too long
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)';
        }

        resolve(output);
      });
    });
  }

  async processMessage(userMessage, onUpdate) {
    // If there's a pending question, treat this as the answer
    if (this.pendingQuestion) {
      this.conversationHistory.push({
        role: 'user',
        content: `[Answer to "${this.pendingQuestion}"]: ${userMessage}`,
      });
      this.pendingQuestion = null;
    } else {
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });
    }

    let turns = 0;
    let finalResponse = '';

    while (turns < MAX_TURNS) {
      turns++;

      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...this.conversationHistory,
          ],
          tools: TOOLS,
          tool_choice: 'auto',
        });

        const message = response.choices[0].message;

        // Add assistant message to history
        this.conversationHistory.push(message);

        // Check if there are tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolResults = [];

          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            if (functionName === 'run_command') {
              const cmd = args.command;
              if (onUpdate) {
                await onUpdate(`Running: \`${cmd}\``);
              }
              const output = await this.runCommand(cmd);
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: output,
              });
            } else if (functionName === 'ask_user') {
              this.pendingQuestion = args.question;
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: '[Waiting for user response...]',
              });
              // Add tool results so far
              this.conversationHistory.push(...toolResults);
              // Return the question to the user
              return {
                type: 'question',
                question: args.question,
              };
            }
          }

          // Add tool results to conversation
          this.conversationHistory.push(...toolResults);

        } else {
          // No tool calls, we have a final response
          finalResponse = message.content || '';
          break;
        }

        // Check finish reason
        if (response.choices[0].finish_reason === 'stop') {
          finalResponse = message.content || finalResponse;
          break;
        }

      } catch (err) {
        log.error(`LLM error: ${err.message}`);
        return {
          type: 'error',
          error: `LLM error: ${err.message}`,
        };
      }
    }

    if (turns >= MAX_TURNS) {
      finalResponse += '\n(Reached maximum turns)';
    }

    return {
      type: 'response',
      text: finalResponse || '(Done)',
    };
  }

  clearHistory() {
    this.conversationHistory = [];
    this.pendingQuestion = null;
  }
}

export function createLLMSession(apiKey, workspace, model) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in .env file');
  }
  return new LLMSession(apiKey, workspace, model);
}
