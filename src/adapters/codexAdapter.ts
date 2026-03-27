import { ChatContext, ChatInput, CommandSpec, IAgentCLIAdapter, PluginSettings, StreamEvent } from "../types";

type SettingsGetter = () => PluginSettings;

const PROMPT_PLACEHOLDER = "{prompt}";
const VAULT_PLACEHOLDER = "{vaultPath}";
const CWD_PLACEHOLDER = "{cwd}";
const SESSION_PLACEHOLDER = "{sessionId}";

export class CodexCLIAdapter implements IAgentCLIAdapter {
  constructor(private readonly getSettings: SettingsGetter) {}

  buildCommand(input: ChatInput, context: ChatContext): CommandSpec {
    const settings = this.getSettings();
    const cwd = settings.defaultCwd.trim() || context.cwd;

    if (input.commandOverride?.trim()) {
      if (!settings.allowAnyCommand) {
        throw new Error("Command override is disabled by settings.");
      }

      const tokens = splitArgs(input.commandOverride.trim());
      if (tokens.length === 0) {
        throw new Error("Command override is empty.");
      }

      const [command, ...args] = tokens;
      return {
        command,
        args,
        cwd,
        displayCommand: quoteCommand(command, args)
      };
    }

    const template = settings.codexArgsTemplate.trim();
    const rawArgs = template.length > 0 ? splitArgs(template) : [];
    const hasPromptPlaceholder = rawArgs.some((arg) => arg.includes(PROMPT_PLACEHOLDER));

    const renderedArgs = rawArgs.map((arg) =>
      arg
        .replaceAll(PROMPT_PLACEHOLDER, input.prompt)
        .replaceAll(VAULT_PLACEHOLDER, context.vaultPath)
        .replaceAll(CWD_PLACEHOLDER, cwd)
        .replaceAll(SESSION_PLACEHOLDER, context.sessionId)
    );

    if (!hasPromptPlaceholder) {
      renderedArgs.push(input.prompt);
    }

    return {
      command: settings.codexExecutablePath,
      args: renderedArgs,
      cwd,
      displayCommand: quoteCommand(settings.codexExecutablePath, renderedArgs)
    };
  }

  parseChunk(raw: string): StreamEvent {
    const lines = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      if (!line.startsWith("{") || !line.endsWith("}")) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const text = pickText(parsed);
        if (text) {
          return { kind: "delta", text, raw: parsed };
        }
      } catch {
        // Keep fallthrough as raw plain text output.
      }
    }

    return { kind: "delta", text: raw };
  }

  normalizeError(err: unknown) {
    if (err instanceof Error) {
      return {
        message: err.message,
        raw: err
      };
    }
    return {
      message: String(err),
      raw: err
    };
  }
}

function pickText(payload: Record<string, unknown>): string | null {
  const knownKeys = ["text", "delta", "content", "message"];
  for (const key of knownKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const nested = payload.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const key of knownKeys) {
      const value = (nested as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function quoteArg(arg: string): string {
  if (/^[a-zA-Z0-9._:/\\-]+$/.test(arg)) {
    return arg;
  }
  return JSON.stringify(arg);
}

function quoteCommand(command: string, args: string[]): string {
  return [quoteArg(command), ...args.map(quoteArg)].join(" ");
}

export function splitArgs(raw: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  const pushCurrent = () => {
    if (current.length > 0) {
      args.push(current);
      current = "";
    }
  };

  for (const char of raw) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }
  pushCurrent();
  return args;
}

