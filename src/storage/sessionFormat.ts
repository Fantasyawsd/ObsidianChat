import { ChatMessage, ChatSession } from "../types";

const METADATA_HEADER = "## Metadata (JSON)";

export function serializeSessionToMarkdown(session: ChatSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`- Session ID: \`${session.id}\``);
  lines.push(`- Status: \`${session.status}\``);
  lines.push(`- Created: ${session.createdAt}`);
  lines.push(`- Updated: ${session.updatedAt}`);

  if (session.lastRun) {
    lines.push(`- Last Command: \`${session.lastRun.command}\``);
    lines.push(`- Last CWD: \`${session.lastRun.cwd}\``);
    lines.push(`- Last Exit Code: \`${String(session.lastRun.exitCode)}\``);
    lines.push(`- Last Duration (ms): \`${session.lastRun.durationMs}\``);
    lines.push(`- Last Cancelled: \`${String(session.lastRun.cancelled)}\``);
    lines.push(`- Last Timed Out: \`${String(session.lastRun.timedOut)}\``);
  }

  lines.push("");
  lines.push("## Transcript");
  lines.push("");

  for (const message of session.messages) {
    lines.push(`### ${message.role.toUpperCase()} (${message.createdAt})`);
    lines.push(message.content.length > 0 ? message.content : "_(empty)_");
    lines.push("");
  }

  lines.push(METADATA_HEADER);
  lines.push("```json");
  lines.push(JSON.stringify(session, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

export function parseSessionFromMarkdown(markdown: string): ChatSession | null {
  const regex = new RegExp(`${escapeRegex(METADATA_HEADER)}\\s*\\n\`\`\`json\\s*\\n([\\s\\S]*?)\\n\`\`\``);
  const match = markdown.match(regex);
  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as ChatSession;
    if (!parsed.id || !parsed.createdAt || !parsed.updatedAt || !Array.isArray(parsed.messages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createMessage(role: ChatMessage["role"], content = ""): ChatMessage {
  return {
    id: createId(`msg-${role}`),
    role,
    content,
    createdAt: nowIso()
  };
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

