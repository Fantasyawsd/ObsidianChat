import path from "node:path";
import { CommandSpec, RiskAssessment } from "../types";

interface RiskRule {
  id: string;
  reason: string;
  regex: RegExp;
}

const RISK_RULES: RiskRule[] = [
  {
    id: "rm-rf",
    reason: "Detected recursive delete command (`rm -rf`).",
    regex: /\brm\s+-rf\b/i
  },
  {
    id: "windows-del-recursive",
    reason: "Detected Windows recursive delete command (`del /s` or `rmdir /s`).",
    regex: /\b(del\s+\/[^\n\r]*\bs\b|rmdir\s+\/s\b)/i
  },
  {
    id: "sudo-or-priv-escalation",
    reason: "Detected privilege escalation command (`sudo`/`doas`/`runas`).",
    regex: /\b(sudo|doas|runas)\b/i
  },
  {
    id: "git-destructive",
    reason: "Detected destructive git command (`git reset --hard` or `git clean -fdx`).",
    regex: /\bgit\s+(reset\s+--hard|clean\s+-f(d|x)+)\b/i
  },
  {
    id: "filesystem-destructive-tools",
    reason: "Detected low-level disk/filesystem command (`mkfs`/`format`/`dd if=`).",
    regex: /\b(mkfs|format\s+[a-z]:|dd\s+if=)\b/i
  },
  {
    id: "shell-chaining",
    reason: "Detected shell chaining/piping that can hide compound operations (`&&`, `||`, `;`, `|`).",
    regex: /(&&|\|\||;|\|)/i
  },
  {
    id: "output-redirection",
    reason: "Detected output redirection (`>`/`>>`) which may overwrite files.",
    regex: /(^|\s)(>{1,2})(\s|$)/i
  }
];

export class SafetyPolicy {
  assess(command: CommandSpec, vaultPath: string): RiskAssessment {
    const reasons: string[] = [];
    const matchedRules: string[] = [];
    const joinedCommand = [command.command, ...command.args].join(" ");

    for (const rule of RISK_RULES) {
      if (rule.regex.test(joinedCommand)) {
        matchedRules.push(rule.id);
        reasons.push(rule.reason);
      }
    }

    const resolvedVault = path.resolve(vaultPath);
    const resolvedCwd = path.resolve(command.cwd);
    if (!isInsidePath(resolvedVault, resolvedCwd)) {
      matchedRules.push("cwd-outside-vault");
      reasons.push(`Working directory is outside the vault: ${resolvedCwd}`);
    }

    const outsidePaths = extractAbsolutePaths(command.args).filter(
      (absolutePath) => !isInsidePath(resolvedVault, absolutePath)
    );
    if (outsidePaths.length > 0) {
      matchedRules.push("path-outside-vault");
      reasons.push(`Command references path(s) outside vault: ${outsidePaths.join(", ")}`);
    }

    return {
      isDangerous: reasons.length > 0,
      reasons,
      matchedRules
    };
  }
}

function extractAbsolutePaths(args: string[]): string[] {
  const paths: string[] = [];

  for (const arg of args) {
    const token = arg.trim().replace(/^['"]|['"]$/g, "");
    if (!token) {
      continue;
    }

    if (/^https?:\/\//i.test(token)) {
      continue;
    }

    if (path.isAbsolute(token)) {
      paths.push(path.resolve(token));
    }
  }

  return paths;
}

function isInsidePath(basePath: string, targetPath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(targetPath);

  if (process.platform === "win32") {
    const baseLower = normalizedBase.toLowerCase();
    const targetLower = normalizedTarget.toLowerCase();
    return targetLower === baseLower || targetLower.startsWith(`${baseLower}${path.sep}`);
  }

  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

