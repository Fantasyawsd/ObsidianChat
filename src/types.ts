export type SessionStatus = "idle" | "running" | "completed" | "failed" | "cancelled";
export type MessageRole = "user" | "assistant" | "system";
export type StreamKind = "delta" | "info" | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ExecutionSummary {
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  cancelled: boolean;
  timedOut: boolean;
  stderr?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  filePath?: string;
  messages: ChatMessage[];
  lastRun?: ExecutionSummary;
}

export interface AgentError {
  message: string;
  code?: string;
  raw?: unknown;
}

export interface PluginSettings {
  codexExecutablePath: string;
  codexArgsTemplate: string;
  defaultCwd: string;
  chatFolder: string;
  allowAnyCommand: boolean;
  dangerousConfirmEnabled: boolean;
  executionTimeoutMs: number;
}

export interface ChatInput {
  prompt: string;
  commandOverride?: string;
}

export interface ChatContext {
  cwd: string;
  sessionId: string;
  vaultPath: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  stdinText?: string;
  shell?: boolean;
  displayCommand: string;
}

export interface ExecutionRequest {
  sessionId: string;
  input: ChatInput;
  timeoutMs: number;
}

export interface ExecutionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  cancelled: boolean;
  timedOut: boolean;
  stderr: string;
  error?: AgentError;
}

export interface StreamEvent {
  kind: StreamKind;
  text: string;
  raw?: unknown;
}

export interface ProcessStreamEvent {
  type: "stdout" | "stderr";
  text: string;
  at: string;
}

export interface IAgentCLIAdapter {
  buildCommand(input: ChatInput, context: ChatContext): CommandSpec;
  parseChunk(raw: string): StreamEvent;
  normalizeError(err: unknown): AgentError;
}

export interface RiskAssessment {
  isDangerous: boolean;
  reasons: string[];
  matchedRules: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  codexExecutablePath: "codex",
  codexArgsTemplate: "exec \"{prompt}\"",
  defaultCwd: "",
  chatFolder: "AI Chats",
  allowAnyCommand: true,
  dangerousConfirmEnabled: true,
  executionTimeoutMs: 300000
};

export function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

