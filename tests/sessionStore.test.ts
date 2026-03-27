import { describe, expect, it } from "vitest";
import { parseSessionFromMarkdown, serializeSessionToMarkdown } from "../src/storage/sessionFormat";
import { ChatSession } from "../src/types";

describe("Session markdown serialization", () => {
  it("round-trips session JSON block", () => {
    const session: ChatSession = {
      id: "s1",
      title: "Round Trip",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      messages: [
        { id: "u1", role: "user", content: "hello", createdAt: "2026-01-01T00:00:01.000Z" },
        { id: "a1", role: "assistant", content: "world", createdAt: "2026-01-01T00:00:02.000Z" }
      ]
    };

    const markdown = serializeSessionToMarkdown(session);
    const parsed = parseSessionFromMarkdown(markdown);

    expect(parsed?.id).toBe("s1");
    expect(parsed?.messages.length).toBe(2);
    expect(parsed?.messages[1].content).toBe("world");
  });
});
