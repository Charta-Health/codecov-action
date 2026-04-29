import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import AdmZip from "adm-zip";
import { ArtifactManager } from "../utils/artifact-manager.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/artifact", () => ({
  DefaultArtifactClient: class {
    uploadArtifact = vi.fn();
  },
}));

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(),
}));

type WorkflowRun = {
  id: number;
  run_number: number;
  conclusion: string;
  head_branch?: string;
};

describe("ArtifactManager base SHA lookup", () => {
  const listWorkflowRunsForRepo = vi.fn();
  const listWorkflowRunArtifacts = vi.fn();
  const downloadArtifact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_REPOSITORY = "owner/repo";
    delete process.env.GITHUB_JOB;

    vi.mocked(getOctokit).mockReturnValue({
      rest: {
        actions: {
          listWorkflowRunsForRepo,
          listWorkflowRunArtifacts,
          downloadArtifact,
        },
      },
    } as never);
  });

  function artifactZip(fileName: string, payload: unknown): Buffer {
    const zip = new AdmZip();
    zip.addFile(fileName, Buffer.from(JSON.stringify(payload)));
    return zip.toBuffer();
  }

  it("falls back to base branch for test results when base SHA has no completed runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: { workflow_runs: [] as WorkflowRun[] },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 101, run_number: 7, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults(
      "main",
      undefined,
      "abc123",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "abc123",
      status: "completed",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "completed",
      per_page: 10,
    });
  });

  it("falls back to base branch for test results when SHA run has no usable artifact", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 201, run_number: 8, conclusion: "success" } as WorkflowRun,
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 202, run_number: 9, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults(
      "main",
      undefined,
      "def456",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(2);
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "def456",
      status: "completed",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "completed",
      per_page: 10,
    });
  });

  it("uses branch lookup only for test results when base SHA is not provided", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          { id: 301, run_number: 9, conclusion: "success" } as WorkflowRun,
        ],
      },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults("develop");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "develop",
      status: "completed",
      per_page: 10,
    });
  });

  it("falls back to base branch for coverage when base SHA has no completed runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: { workflow_runs: [] as WorkflowRun[] },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 401, run_number: 10, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      ["unit"],
      undefined,
      "ghi789",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "ghi789",
      status: "completed",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "completed",
      per_page: 10,
    });
  });

  it("falls back to base branch for coverage when SHA run has no usable artifact", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 501, run_number: 11, conclusion: "success" } as WorkflowRun,
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 502, run_number: 12, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      ["unit"],
      undefined,
      "jkl012",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(2);
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "jkl012",
      status: "completed",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "completed",
      per_page: 10,
    });
  });

  it("finds merge-queue-named coverage artifacts in exact SHA runs", async () => {
    const coveragePayload = {
      totalStatements: 1,
      coveredStatements: 1,
      totalConditionals: 0,
      coveredConditionals: 0,
      totalMethods: 0,
      coveredMethods: 0,
      lineRate: 100,
      branchRate: 100,
      files: [],
    };
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          {
            id: 801,
            run_number: 16,
            conclusion: "success",
            head_branch:
              "gh-readonly-queue/main/pr-10129-a6d12a4f753450acb0c722fadacddb1a40aea202",
          } as WorkflowRun,
        ],
      },
    });
    listWorkflowRunArtifacts.mockResolvedValueOnce({
      data: {
        artifacts: [
          {
            id: 9001,
            name: "codecov-coverage-results-gh-readonly-queue-main-pr-10129-a6d12a4f753450acb0c722fadacddb1a40aea202-coverage-report",
            expired: false,
          },
        ],
      },
    });
    downloadArtifact.mockResolvedValueOnce({
      data: artifactZip("coverage-results.json", coveragePayload),
    });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      undefined,
      undefined,
      "queue-sha",
    );

    expect(result).toEqual(coveragePayload);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(downloadArtifact).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      artifact_id: 9001,
      archive_format: "zip",
    });
  });

  it("falls back to branch coverage when a SHA artifact is not readable", async () => {
    const coveragePayload = {
      totalStatements: 1,
      coveredStatements: 1,
      totalConditionals: 0,
      coveredConditionals: 0,
      totalMethods: 0,
      coveredMethods: 0,
      lineRate: 100,
      branchRate: 100,
      files: [],
    };
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 1001, run_number: 21, conclusion: "success" } as WorkflowRun,
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 1002, run_number: 22, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts
      .mockResolvedValueOnce({
        data: {
          artifacts: [
            {
              id: 9101,
              name: "codecov-coverage-results-main-coverage-report",
              expired: false,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          artifacts: [
            {
              id: 9102,
              name: "codecov-coverage-results-main-coverage-report",
              expired: false,
            },
          ],
        },
      });
    downloadArtifact
      .mockResolvedValueOnce({
        data: artifactZip("not-coverage-results.json", {}),
      })
      .mockResolvedValueOnce({
        data: artifactZip("coverage-results.json", coveragePayload),
      });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      undefined,
      undefined,
      "sha-with-bad-artifact",
    );

    expect(result).toEqual(coveragePayload);
    expect(downloadArtifact).toHaveBeenCalledTimes(2);
    expect(downloadArtifact).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      artifact_id: 9102,
      archive_format: "zip",
    });
  });

  it("uses branch lookup only for coverage when base SHA is not provided", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          { id: 601, run_number: 12, conclusion: "failure" } as WorkflowRun,
        ],
      },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults("release");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "release",
      status: "completed",
      per_page: 10,
    });
  });

  it("filters out cancelled/timed_out runs even when SHA matches", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 701, run_number: 13, conclusion: "cancelled" } as WorkflowRun,
            { id: 702, run_number: 14, conclusion: "timed_out" } as WorkflowRun,
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          workflow_runs: [
            { id: 703, run_number: 15, conclusion: "success" } as WorkflowRun,
          ],
        },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    await manager.downloadBaseResults("main", undefined, "bad-sha");

    // SHA runs were all invalid conclusions, so it should fall back to branch
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(2);
    expect(vi.mocked(core.info)).toHaveBeenCalledWith(
      "ℹ️ No completed workflow runs found for SHA 'bad-sha'. Falling back to branch 'main'",
    );
  });

  it("logs SHA fallback info when SHA has no completed runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } })
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults(
      "main",
      undefined,
      "zzz999",
    );

    expect(result).toBeNull();
    expect(vi.mocked(core.info)).toHaveBeenCalledWith(
      "ℹ️ No completed workflow runs found for SHA 'zzz999'. Falling back to branch 'main'",
    );
  });
});
