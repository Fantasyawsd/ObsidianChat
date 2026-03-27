import { Plugin, WorkspaceLeaf } from "obsidian";
import { CodexCLIAdapter } from "./adapters/codexAdapter";
import { SafetyPolicy } from "./safety/safetyPolicy";
import { LocalAgentSettingTab } from "./settings";
import { SessionStore } from "./storage/sessionStore";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { CHAT_VIEW_TYPE, ChatView } from "./ui/chatView";

export default class LocalAgentChatPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  sessionStore!: SessionStore;
  adapter!: CodexCLIAdapter;
  safetyPolicy!: SafetyPolicy;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.sessionStore = new SessionStore(this.app, () => this.settings);
    this.adapter = new CodexCLIAdapter(() => this.settings);
    this.safetyPolicy = new SafetyPolicy();

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addSettingTab(new LocalAgentSettingTab(this.app, this));

    this.addCommand({
      id: "open-local-agent-chat",
      name: "Open Local Agent Chat",
      callback: () => {
        void this.activateChatView();
      }
    });

    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        // Keeps plugin alive and allows future context hooks.
      })
    );
  }

  async onunload(): Promise<void> {
    await this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).reduce(async (prev, leaf) => {
      await prev;
      await leaf.setViewState({ type: "empty" });
    }, Promise.resolve());
  }

  async activateChatView(): Promise<void> {
    const existingLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    let leaf: WorkspaceLeaf | null = existingLeaves[0] ?? null;

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        return;
      }
      await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    }

    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    if (typeof adapter.getBasePath === "function") {
      return adapter.getBasePath();
    }
    return this.app.vault.configDir;
  }

  getDefaultCwd(): string {
    return this.settings.defaultCwd.trim() || this.getVaultPath();
  }
}

