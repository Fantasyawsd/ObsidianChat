import { App, PluginSettingTab, Setting } from "obsidian";
import LocalAgentChatPlugin from "./main";

export class LocalAgentSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: LocalAgentChatPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Local Agent Chat Settings" });

    new Setting(containerEl)
      .setName("Codex executable path")
      .setDesc("Binary to execute (example: codex or full absolute path).")
      .addText((text) =>
        text
          .setPlaceholder("codex")
          .setValue(this.plugin.settings.codexExecutablePath)
          .onChange(async (value) => {
            this.plugin.settings.codexExecutablePath = value.trim() || "codex";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Codex args template")
      .setDesc("CLI args template. Placeholders: {prompt}, {vaultPath}, {cwd}, {sessionId}.")
      .addTextArea((text) =>
        text
          .setPlaceholder("exec \"{prompt}\"")
          .setValue(this.plugin.settings.codexArgsTemplate)
          .onChange(async (value) => {
            this.plugin.settings.codexArgsTemplate = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default working directory")
      .setDesc("Fallback CWD for command execution. Leave empty to use vault path.")
      .addText((text) =>
        text.setValue(this.plugin.settings.defaultCwd).onChange(async (value) => {
          this.plugin.settings.defaultCwd = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Chat folder")
      .setDesc("Vault folder path where session markdown files are stored.")
      .addText((text) =>
        text.setValue(this.plugin.settings.chatFolder).onChange(async (value) => {
          this.plugin.settings.chatFolder = value.trim() || "AI Chats";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Allow any command")
      .setDesc("If enabled, messages starting with `!cmd` can run arbitrary commands.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowAnyCommand).onChange(async (value) => {
          this.plugin.settings.allowAnyCommand = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Require danger confirmation")
      .setDesc("Show a blocking confirmation modal for risky commands.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.dangerousConfirmEnabled)
          .onChange(async (value) => {
            this.plugin.settings.dangerousConfirmEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Execution timeout (ms)")
      .setDesc("Maximum runtime for each CLI invocation before forced cancellation.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.executionTimeoutMs))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isNaN(parsed) && parsed > 0) {
              this.plugin.settings.executionTimeoutMs = parsed;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}

