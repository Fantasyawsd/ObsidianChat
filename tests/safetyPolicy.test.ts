import { describe, expect, it } from "vitest";
import { SafetyPolicy } from "../src/safety/safetyPolicy";

describe("SafetyPolicy", () => {
  it("flags destructive commands", () => {
    const policy = new SafetyPolicy();
    const risk = policy.assess(
      {
        command: "rm",
        args: ["-rf", "/tmp/test"],
        cwd: "/tmp",
        displayCommand: "rm -rf /tmp/test"
      },
      "/tmp/vault"
    );

    expect(risk.isDangerous).toBe(true);
    expect(risk.reasons.length).toBeGreaterThan(0);
  });

  it("does not flag safe command inside vault", () => {
    const policy = new SafetyPolicy();
    const risk = policy.assess(
      {
        command: "codex",
        args: ["exec", "hello"],
        cwd: "/tmp/vault",
        displayCommand: "codex exec hello"
      },
      "/tmp/vault"
    );

    expect(risk.isDangerous).toBe(false);
  });
});

