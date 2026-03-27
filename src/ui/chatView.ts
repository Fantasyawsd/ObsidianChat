import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import LocalAgentChatPlugin from "../main";
import { AgentRunner } from "../runner/agentRunner";
import { createMessage } from "../storage/sessionFormat";
import { ChatInput, ChatSession, ExecutionSummary, SessionStatus } from "../types";
import { CommandConfirmModal } from "./confirmModal";

export const CHAT_VIEW_TYPE = "local-agent-chat-view";

export class ChatView extends ItemView {
  private readonly runner = new AgentRunner();
  private sessionSelectEl: HTMLSelectElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private messagesEl: HTMLDivElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendButtonEl: HTMLButtonElement | null = null;
  private stopButtonEl: HTMLButtonElement | null = null;
  private sessions: ChatSession[] = [];
  private currentSession: ChatSession | null = null;
  private saveTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: LocalAgentChatPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Local Agent Chat";
  }

  getIcon(): string {
    return "messages-square";
  }

  async onOpen(): Promise<void> {
    this.buildLayout();
    await this.refreshSessions();
    if (!this.currentSession) {
      await this.createSession("New chat");
    } else {
      this.renderMessages();
    }
  }

  async onClose(): Promise<void> {
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.runner.cancel();
  }

  private buildLayout(): void {
    this.contentEl.empty();
    this.contentEl.addClass("local-agent-chat");

    const header = this.contentEl.createDiv({ cls: "local-agent-chat__header" });
    this.sessionSelectEl = header.createEl("select", { cls: "local-agent-chat__session-select" });
    this.sessionSelectEl.addEventListener("change", () => {
      void this.handleSessionChange();
    });

    const refreshButton = header.createEl("button", {
      text: "Refresh",
      cls: "mod-muted"
    });
    refreshButton.addEventListener("click", () => {
      void this.refreshSessions();
    });

    const newButton = header.createEl("button", {
      text: "New Chat",
      cls: "mod-cta"
    });
    newButton.addEventListener("click", () => {
      void this.createSession("New chat");
    });

    this.statusEl = this.contentEl.createDiv({ cls: "local-agent-chat__status" });
    this.messagesEl = this.contentEl.createDiv({ cls: "local-agent-chat__messages" });

    const composer = this.contentEl.createDiv({ cls: "local-agent-chat__composer" });
    this.inputEl = composer.createEl("textarea", {
      cls: "local-agent-chat__input",
      attr: {
        placeholder: "Type a prompt. Optional: !cmd <command> on first line to run raw command."
      }
    });

    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.handleSend();
      }
    });

    const buttonRow = composer.createDiv({ cls: "local-agent-chat__buttons" });
    this.sendButtonEl = buttonRow.createEl("button", {
      text: "Send",
      cls: "mod-cta"
    });
    this.sendButtonEl.addEventListener("click", () => {
      void this.handleSend();
    });

    this.stopButtonEl = buttonRow.createEl("button", {
      text: "Stop",
      cls: "mod-warning"
    });
    this.stopButtonEl.addEventListener("click", () => {
      const cancelled = this.runner.cancel("user");
      if (cancelled) {
        this.setStatus("Cancelling current run...");
      }
    });

    this.syncUiState();
  }

  private async refreshSessions(): Promise<void> {
    this.sessions = await this.plugin.sessionStore.loadSessions();

    if (this.sessions.length === 0) {
      this.currentSession = null;
    } else if (!this.currentSession) {
      this.currentSession = this.sessions[0];
    } else {
      const matched = this.sessions.find((session) => session.id === this.currentSession?.id) ?? null;
      this.currentSession = matched ?? this.sessions[0];
    }

    this.renderSessionOptions();
    this.renderMessages();
  }

  private async createSession(seedPrompt: string): Promise<void> {
    const session = await this.plugin.sessionStore.createSession(seedPrompt);
    this.sessions.unshift(session);
    this.currentSession = session;
    this.renderSessionOptions();
    this.renderMessages();
    this.setStatus("Created new session.");
  }

  private async handleSessionChange(): Promise<void> {
    if (!this.sessionSelectEl) {
      return;
    }

    const id = this.sessionSelectEl.value;
    const matched = this.sessions.find((session) => session.id === id);
    if (!matched) {
      return;
    }

    this.currentSession = matched;
    this.renderMessages();
    this.setStatus(`Loaded session: ${matched.title}`);
  }

  private renderSessionOptions(): void {
    if (!this.sessionSelectEl) {
      return;
    }

    this.sessionSelectEl.empty();
    if (this.sessions.length === 0) {
      const option = this.sessionSelectEl.createEl("option", {
        text: "No session"
      });
      option.value = "";
      return;
    }

    for (const session of this.sessions) {
      const option = this.sessionSelectEl.createEl("option", {
        text: `${session.title} (${shortTime(session.updatedAt)})`
      });
      option.value = session.id;
      if (this.currentSession && session.id === this.currentSession.id) {
        option.selected = true;
      }
    }
  }

  private renderMessages(): void {
    if (!this.messagesEl) {
      return;
    }
    this.messagesEl.empty();

    if (!this.currentSession) {
      this.messagesEl.createDiv({ text: "No active session." });
      this.syncUiState();
      return;
    }

    for (const message of this.currentSession.messages) {
      const wrapper = this.messagesEl.createDiv({
        cls: `local-agent-chat__message local-agent-chat__message--${message.role}`
      });
      wrapper.createDiv({
        cls: "local-agent-chat__message-meta",
        text: `${message.role.toUpperCase()} • ${shortTime(message.createdAt)}`
      });
      const body = wrapper.createEl("pre", { cls: "local-agent-chat__message-body" });
      body.setText(message.content || "(empty)");
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.syncUiState();
  }

  private async handleSend(): Promise<void> {
    const inputEl = this.inputEl;
    if (!inputEl) {
      return;
    }

    const rawText = inputEl.value.trim();
    if (!rawText) {
      return;
    }

    if (this.runner.isRunning()) {
      new Notice("Another request is already running in this view.");
      return;
    }

    if (!this.currentSession) {
      await this.createSession(rawText);
      if (!this.currentSession) {
        return;
      }
    }

    const parsedInput = parseUserInput(rawText, this.plugin.settings.allowAnyCommand);
    inputEl.value = "";
    const session = this.currentSession;

    session.messages.push(createMessage("user", rawText));
    const assistantMessage = createMessage("assistant", "");
    session.messages.push(assistantMessage);
    session.status = "running";
    await this.plugin.sessionStore.saveSession(session);
    this.renderMessages();
    this.setStatus("Running command...");

    const context = {
      cwd: this.plugin.getDefaultCwd(),
      sessionId: session.id,
      vaultPath: this.plugin.getVaultPath()
    };

    let commandSpec;
    try {
      commandSpec = this.plugin.adapter.buildCommand(parsedInput, context);
    } catch (err) {
      session.status = "failed";
      session.messages.push(createMessage("system", `Command build failed: ${String(err)}`));
      await this.plugin.sessionStore.saveSession(session);
      this.renderMessages();
      this.setStatus("Failed to build command.");
      return;
    }

    session.messages.push(
      createMessage(
        "system",
        `Command preview:\n${commandSpec.displayCommand}\nCWD: ${commandSpec.cwd}\nTimeout: ${this.plugin.settings.executionTimeoutMs}ms`
      )
    );
    await this.plugin.sessionStore.saveSession(session);
    this.renderMessages();

    const assessment = this.plugin.safetyPolicy.assess(commandSpec, context.vaultPath);
    if (assessment.isDangerous && this.plugin.settings.dangerousConfirmEnabled) {
      const modal = new CommandConfirmModal(this.app, {
        command: commandSpec.displayCommand,
        cwd: commandSpec.cwd,
        timeoutMs: this.plugin.settings.executionTimeoutMs
      }, assessment);

      const confirmed = await modal.confirm();
      if (!confirmed) {
        session.status = "cancelled";
        assistantMessage.content = "Execution cancelled by safety confirmation.";
        await this.plugin.sessionStore.saveSession(session);
        this.renderMessages();
        this.setStatus("Cancelled by safety confirmation.");
        return;
      }
    }

    this.syncUiState();
    let stderrBuffer = "";

    const result = await this.runner.run(
      {
        sessionId: session.id,
        input: parsedInput,
        timeoutMs: this.plugin.settings.executionTimeoutMs
      },
      commandSpec,
      (event) => {
        if (event.type === "stderr") {
          stderrBuffer += event.text;
          return;
        }

        const parsed = this.plugin.adapter.parseChunk(event.text);
        if (parsed.kind === "delta") {
          assistantMessage.content += parsed.text;
        } else if (parsed.text.length > 0) {
          assistantMessage.content += `\n${parsed.text}`;
        }
        this.renderMessages();
        this.scheduleSave();
      }
    );

    if (stderrBuffer.trim().length > 0) {
      session.messages.push(createMessage("system", `stderr:\n${stderrBuffer.trim()}`));
    }

    const status = resolveStatus(result.exitCode, result.cancelled, result.timedOut, result.error);
    session.status = status;
    if (!assistantMessage.content.trim()) {
      assistantMessage.content = result.cancelled ? "(cancelled)" : "(no output)";
    }

    const summary: ExecutionSummary = {
      command: commandSpec.displayCommand,
      cwd: commandSpec.cwd,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cancelled: result.cancelled,
      timedOut: result.timedOut,
      stderr: result.stderr || undefined
    };

    session.lastRun = summary;

    if (result.error) {
      session.messages.push(createMessage("system", `Execution error: ${result.error.message}`));
    } else if (status === "failed") {
      session.messages.push(
        createMessage(
          "system",
          `Command exited with non-zero status ${String(result.exitCode)} after ${result.durationMs}ms.`
        )
      );
    }

    await this.plugin.sessionStore.saveSession(session);
    this.sessions = this.sessions.map((item) => (item.id === session.id ? session : item));
    this.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.renderSessionOptions();
    this.renderMessages();
    this.setStatus(formatStatusMessage(status, result.durationMs));
  }

  private scheduleSave(): void {
    if (!this.currentSession) {
      return;
    }
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      if (this.currentSession) {
        void this.plugin.sessionStore.saveSession(this.currentSession);
      }
    }, 350);
  }

  private syncUiState(): void {
    const running = this.runner.isRunning();
    if (this.sendButtonEl) {
      this.sendButtonEl.disabled = running;
    }
    if (this.stopButtonEl) {
      this.stopButtonEl.disabled = !running;
    }
    if (this.sessionSelectEl) {
      this.sessionSelectEl.disabled = running;
    }
  }

  private setStatus(text: string): void {
    if (!this.statusEl) {
      return;
    }
    this.statusEl.setText(text);
    this.syncUiState();
  }
}

function parseUserInput(raw: string, allowAnyCommand: boolean): ChatInput {
  if (!allowAnyCommand || !raw.startsWith("!cmd ")) {
    return { prompt: raw };
  }

  const lines = raw.split(/\r?\n/g);
  const firstLine = lines[0].slice("!cmd ".length).trim();
  const prompt = lines.slice(1).join("\n").trim();

  return {
    prompt: prompt || "Run the command and summarize output.",
    commandOverride: firstLine
  };
}

function shortTime(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return isoTime;
  }
  return date.toLocaleString();
}

function resolveStatus(
  exitCode: number | null,
  cancelled: boolean,
  timedOut: boolean,
  error?: unknown
): SessionStatus {
  if (cancelled || timedOut) {
    return "cancelled";
  }
  if (error) {
    return "failed";
  }
  if (exitCode === 0 || exitCode === null) {
    return "completed";
  }
  return "failed";
}

function formatStatusMessage(status: SessionStatus, durationMs: number): string {
  if (status === "completed") {
    return `Completed in ${durationMs} ms`;
  }
  if (status === "cancelled") {
    return `Cancelled after ${durationMs} ms`;
  }
  if (status === "failed") {
    return `Failed after ${durationMs} ms`;
  }
  return status;
}
