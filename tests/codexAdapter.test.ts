import { describe, expect, it } from "vitest";
import { CodexCLIAdapter } from "../src/adapters/codexAdapter";
import { DEFAULT_SETTINGS } from "../src/types";

describe("CodexCLIAdapter", () => {
  it("renders placeholders and keeps prompt in a single arg", () => {
    const adapter = new CodexCLIAdapter(() => ({
      ...DEFAULT_SETTINGS,
      codexExecutablePath: "codex",
      codexArgsTemplate: "exec --cwd {cwd} \"{prompt}\""
    }));

    const spec = adapter.buildCommand(
      { prompt: "hello world" },
      { cwd: "/vault", sessionId: "s1", vaultPath: "/vault" }
    );

    expect(spec.command).toBe("codex");
    expect(spec.args).toEqual(["exec", "--cwd", "/vault", "hello world"]);
  });

  it("supports override command when allowAnyCommand is enabled", () => {
    const adapter = new CodexCLIAdapter(() => ({
      ...DEFAULT_SETTINGS,
      allowAnyCommand: true
    }));

    const spec = adapter.buildCommand(
      { prompt: "ignored", commandOverride: "echo test" },
      { cwd: "/vault", sessionId: "s1", vaultPath: "/vault" }
    );

    expect(spec.command).toBe("echo");
    expect(spec.args).toEqual(["test"]);
  });
});

