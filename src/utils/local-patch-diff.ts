import { execFileSync } from "node:child_process";
import * as core from "@actions/core";

const GIT_MAX_BUFFER = 100 * 1024 * 1024;

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
  }).trim();
}

function fetchBaseBranch(baseBranch: string): void {
  execFileSync(
    "git",
    [
      "fetch",
      "--no-tags",
      "--prune",
      "--depth=100",
      "origin",
      `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`,
    ],
    {
      encoding: "utf8",
      maxBuffer: GIT_MAX_BUFFER,
    },
  );
}

function normalizeBranchName(baseBranch: string): string {
  return baseBranch
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "");
}

export function resolveLocalPatchBaseSha(
  baseSha: string | undefined,
  baseBranch: string,
): string {
  const explicitBaseSha = baseSha?.trim();
  if (explicitBaseSha) {
    core.info(
      `   Using explicit base-sha for local patch diff: ${explicitBaseSha}`,
    );
    return explicitBaseSha;
  }

  const normalizedBaseBranch = normalizeBranchName(baseBranch);
  if (!normalizedBaseBranch) {
    throw new Error(
      "base-sha input is missing and base-branch could not be resolved",
    );
  }

  const remoteBaseRef = `origin/${normalizedBaseBranch}`;
  core.info(
    `   base-sha input not provided; deriving local patch base from ${remoteBaseRef}`,
  );

  try {
    fetchBaseBranch(normalizedBaseBranch);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.warning(
      `Unable to fetch base branch '${normalizedBaseBranch}' before local patch diff: ${message}`,
    );
  }

  for (const ref of [remoteBaseRef, normalizedBaseBranch]) {
    try {
      const baseCommit = runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
      const mergeBase = runGit(["merge-base", "HEAD", baseCommit]);
      if (mergeBase) {
        core.info(`   Derived local patch base ${mergeBase} from ${ref}`);
        return mergeBase;
      }
    } catch {
      core.info(`   Could not derive local patch base from ${ref}`);
    }
  }

  throw new Error(
    `Unable to derive local patch base from base-branch '${baseBranch}'. Provide base-sha or ensure '${remoteBaseRef}' is available locally.`,
  );
}

export function getLocalPatchDiff(
  baseSha: string | undefined,
  baseBranch: string,
): string {
  const patchBaseSha = resolveLocalPatchBaseSha(baseSha, baseBranch);

  core.info(`   Using local git diff from ${patchBaseSha} to HEAD`);
  return execFileSync("git", ["diff", "--unified=0", patchBaseSha, "HEAD"], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
  });
}
