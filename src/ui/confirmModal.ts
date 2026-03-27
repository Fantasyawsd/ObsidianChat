import { App, Modal, Setting } from "obsidian";
import { RiskAssessment } from "../types";

export class CommandConfirmModal extends Modal {
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(
    app: App,
    private readonly preview: {
      command: string;
      cwd: string;
      timeoutMs: number;
    },
    private readonly assessment: RiskAssessment
  ) {
    super(app);
  }

  async confirm(): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "Confirm risky command" });
    contentEl.createEl("p", {
      text: "This command was flagged as dangerous. Review before continuing."
    });

    const code = contentEl.createEl("pre");
    code.createEl("code", { text: this.preview.command });

    contentEl.createEl("p", { text: `Working directory: ${this.preview.cwd}` });
    contentEl.createEl("p", { text: `Timeout: ${this.preview.timeoutMs} ms` });

    contentEl.createEl("h4", { text: "Matched risk rules" });
    const list = contentEl.createEl("ul");
    for (const reason of this.assessment.reasons) {
      list.createEl("li", { text: reason });
    }

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Cancel")
          .setWarning()
          .onClick(() => this.finish(false))
      )
      .addButton((button) =>
        button
          .setButtonText("Run anyway")
          .setCta()
          .onClick(() => this.finish(true))
      );
  }

  onClose(): void {
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
    this.contentEl.empty();
  }

  private finish(value: boolean): void {
    if (!this.resolvePromise) {
      return;
    }
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    resolve(value);
    this.close();
  }
}
