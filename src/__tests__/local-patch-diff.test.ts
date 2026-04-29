import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalPatchDiff,
  resolveLocalPatchBaseSha,
} from "../utils/local-patch-diff.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("local patch diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses explicit base-sha without deriving a merge base", () => {
    const result = resolveLocalPatchBaseSha("abc123", "main");

    expect(result).toBe("abc123");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("derives merge base from fetched origin base branch when base-sha is missing", () => {
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      expect(command).toBe("git");
      const gitArgs = args as string[];
      if (gitArgs[0] === "fetch") {
        return "";
      }
      if (gitArgs[0] === "rev-parse" && gitArgs[2] === "origin/main^{commit}") {
        return "base-commit\n";
      }
      if (gitArgs[0] === "merge-base" && gitArgs[2] === "base-commit") {
        return "merge-base-sha\n";
      }
      throw new Error(`Unexpected git args: ${gitArgs.join(" ")}`);
    });

    const result = resolveLocalPatchBaseSha(undefined, "main");

    expect(result).toBe("merge-base-sha");
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      "git",
      [
        "fetch",
        "--no-tags",
        "--prune",
        "--depth=100",
        "origin",
        "+refs/heads/main:refs/remotes/origin/main",
      ],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it("falls back to a local branch ref if origin branch cannot resolve", () => {
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      expect(command).toBe("git");
      const gitArgs = args as string[];
      if (gitArgs[0] === "fetch") {
        throw new Error("fetch failed");
      }
      if (gitArgs[0] === "rev-parse" && gitArgs[2] === "origin/main^{commit}") {
        throw new Error("missing origin ref");
      }
      if (gitArgs[0] === "rev-parse" && gitArgs[2] === "main^{commit}") {
        return "local-base-commit\n";
      }
      if (gitArgs[0] === "merge-base" && gitArgs[2] === "local-base-commit") {
        return "local-merge-base-sha\n";
      }
      throw new Error(`Unexpected git args: ${gitArgs.join(" ")}`);
    });

    const result = resolveLocalPatchBaseSha(undefined, "origin/main");

    expect(result).toBe("local-merge-base-sha");
  });

  it("uses the derived base SHA for local diff", () => {
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      expect(command).toBe("git");
      const gitArgs = args as string[];
      if (gitArgs[0] === "fetch") {
        return "";
      }
      if (gitArgs[0] === "rev-parse") {
        return "base-commit\n";
      }
      if (gitArgs[0] === "merge-base") {
        return "merge-base-sha\n";
      }
      if (gitArgs.join(" ") === "diff --unified=0 merge-base-sha HEAD") {
        return "diff-content";
      }
      throw new Error(`Unexpected git args: ${gitArgs.join(" ")}`);
    });

    const result = getLocalPatchDiff(undefined, "main");

    expect(result).toBe("diff-content");
  });

  it("throws when neither base-sha nor a local base branch can be resolved", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("missing ref");
    });

    expect(() => resolveLocalPatchBaseSha(undefined, "main")).toThrow(
      "Unable to derive local patch base from base-branch 'main'",
    );
  });
});
