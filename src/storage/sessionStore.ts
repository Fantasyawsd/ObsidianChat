import { App, normalizePath, TFile, TFolder } from "obsidian";
import { ChatSession, ExecutionSummary, PluginSettings, SessionStatus, createId, nowIso } from "../types";
import { parseSessionFromMarkdown, serializeSessionToMarkdown } from "./sessionFormat";

type SettingsGetter = () => PluginSettings;

export class SessionStore {
  constructor(
    private readonly app: App,
    private readonly getSettings: SettingsGetter
  ) {}

  async createSession(initialPrompt = "New chat"): Promise<ChatSession> {
    const now = nowIso();
    const session: ChatSession = {
      id: createId("session"),
      title: makeTitle(initialPrompt),
      status: "idle",
      createdAt: now,
      updatedAt: now,
      messages: []
    };

    await this.saveSession(session);
    return session;
  }

  async saveSession(session: ChatSession): Promise<void> {
    session.updatedAt = nowIso();
    await this.ensureFolderExists(this.getChatFolderPath());

    if (!session.filePath) {
      const filename = `${formatTimestamp(session.createdAt)}-${slugify(session.title)}-${session.id}.md`;
      session.filePath = normalizePath(`${this.getChatFolderPath()}/${filename}`);
    }

    const content = serializeSessionToMarkdown(session);
    const existing = this.app.vault.getAbstractFileByPath(session.filePath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }

    await this.app.vault.create(session.filePath, content);
  }

  async loadSessions(): Promise<ChatSession[]> {
    const folderPath = this.getChatFolderPath();
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return [];
    }

    const sessions: ChatSession[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || !child.path.endsWith(".md")) {
        continue;
      }

      const content = await this.app.vault.read(child);
      const parsed = parseSessionFromMarkdown(content);
      if (!parsed) {
        continue;
      }
      parsed.filePath = child.path;
      sessions.push(parsed);
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateStatus(
    session: ChatSession,
    status: SessionStatus,
    lastRun?: ExecutionSummary
  ): Promise<ChatSession> {
    session.status = status;
    if (lastRun) {
      session.lastRun = lastRun;
    }
    await this.saveSession(session);
    return session;
  }

  private getChatFolderPath(): string {
    const configured = this.getSettings().chatFolder.trim();
    return normalizePath(configured.length > 0 ? configured : "AI Chats");
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const cleanPath = normalizePath(folderPath);
    if (this.app.vault.getAbstractFileByPath(cleanPath)) {
      return;
    }

    const segments = cleanPath.split("/").filter(Boolean);
    let current = "";

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

function makeTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) {
    return `Chat ${new Date().toLocaleString()}`;
  }
  return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
}

function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return cleaned || "session";
}

function formatTimestamp(isoTime: string): string {
  return isoTime.replace(/[:.]/g, "-");
}
