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
    let stderr = "";
    const timeoutHandle =
      request.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            this.cancel("timeout");
          }, request.timeoutMs)
        : null;

    try {
      let first = await this.runOnce(command, onStream, (text) => {
        stderr += text;
      });

      // On Windows, direct spawn of *.cmd often fails with ENOENT in Electron apps.
      // Fallback to cmd.exe shell for the same command so users don't need PowerShell.
      if (
        process.platform === "win32" &&
        !timedOut &&
        !first.cancelled &&
        first.error &&
        isEnoentError(first.error)
      ) {
        onStream({
          type: "stderr",
          text: "Direct spawn failed on Windows, retrying via cmd.exe...\n",
          at: new Date().toISOString()
        });

        first = await this.runOnce(
          command,
          onStream,
          (text) => {
            stderr += text;
          },
          "cmd.exe"
        );
      }

      return {
        exitCode: first.exitCode,
        signal: first.signal,
        durationMs: Date.now() - startedAt,
        cancelled: first.cancelled,
        timedOut,
        stderr,
        error: first.error
          ? {
              message: first.error.message,
              code: isEnoentError(first.error) ? "SPAWN_ENOENT" : "SPAWN_ERROR",
              raw: first.error
            }
          : undefined
      };
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
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

  private async runOnce(
    command: CommandSpec,
    onStream: (event: ProcessStreamEvent) => void,
    onStderr: (text: string) => void,
    shellOverride?: string | boolean
  ): Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    cancelled: boolean;
    error: Error | null;
  }> {
    let spawnError: Error | null = null;

    return await new Promise((resolve) => {
      const child = spawn(command.command, command.args, {
        cwd: command.cwd,
        env: {
          ...process.env,
          ...(command.env ?? {})
        },
        shell: shellOverride ?? command.shell ?? false,
        windowsHide: true
      });

      this.activeRun = {
        child,
        cancelled: false
      };

      child.stdout.on("data", (chunk: Buffer) => {
        onStream({
          type: "stdout",
          text: chunk.toString("utf8"),
          at: new Date().toISOString()
        });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        onStderr(text);
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
        const activeRun = this.activeRun;
        this.activeRun = null;
        resolve({
          exitCode: code,
          signal,
          cancelled: activeRun?.cancelled ?? false,
          error: spawnError
        });
      });
    });
  }
}

function isEnoentError(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
