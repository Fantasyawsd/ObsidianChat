import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { CommandSpec, ExecutionRequest, ExecutionResult, ProcessStreamEvent } from "../types";

interface ActiveRun {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
}

export class AgentRunner {
  private activeRun: ActiveRun | null = null;

  async run(
    request: ExecutionRequest,
    command: CommandSpec,
    onStream: (event: ProcessStreamEvent) => void
  ): Promise<ExecutionResult> {
    if (this.activeRun) {
      throw new Error("Runner is already executing a request.");
    }

    const startedAt = Date.now();
    let timedOut = false;
    let spawnError: Error | null = null;
    let stderr = "";

    return await new Promise<ExecutionResult>((resolve) => {
      const child = spawn(command.command, command.args, {
        cwd: command.cwd,
        env: {
          ...process.env,
          ...(command.env ?? {})
        },
        shell: command.shell ?? false,
        windowsHide: true
      });

      this.activeRun = {
        child,
        cancelled: false
      };

      const timeoutHandle =
        request.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              this.cancel("timeout");
            }, request.timeoutMs)
          : null;

      child.stdout.on("data", (chunk: Buffer) => {
        onStream({
          type: "stdout",
          text: chunk.toString("utf8"),
          at: new Date().toISOString()
        });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        onStream({
          type: "stderr",
          text,
          at: new Date().toISOString()
        });
      });

      child.on("error", (err) => {
        spawnError = err;
      });

      child.on("close", (code, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const activeRun = this.activeRun;
        this.activeRun = null;

        resolve({
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
          cancelled: activeRun?.cancelled ?? false,
          timedOut,
          stderr,
          error: spawnError
            ? {
                message: spawnError.message,
                code: "SPAWN_ERROR",
                raw: spawnError
              }
            : undefined
        });
      });
    });
  }

  cancel(reason: "user" | "timeout" = "user"): boolean {
    if (!this.activeRun) {
      return false;
    }

    this.activeRun.cancelled = true;
    const child = this.activeRun.child;

    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore and force kill below.
    }

    setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }, reason === "timeout" ? 500 : 900);

    return true;
  }

  isRunning(): boolean {
    return this.activeRun !== null;
  }
}

