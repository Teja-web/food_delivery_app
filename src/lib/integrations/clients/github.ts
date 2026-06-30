// @ts-nocheck
// Lifted from /Users/ram/Projects/SDLC/packages/integrations/src/github.ts.
// Requires `@octokit/rest` — install before first use:
//   pnpm add @octokit/rest
// Loaded lazily by ../clients/index.ts so the rest of the project builds
// even when octokit isn't installed yet. Drop the @ts-nocheck after install.
import { Octokit } from "@octokit/rest";

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  headBranch: string;
  baseBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  headBranch: string;
  event: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
  workflowName: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  async getUser() {
    const { data } = await this.octokit.users.getAuthenticated();
    return data;
  }

  async createRepo(options: {
    name: string;
    description?: string;
    isPrivate?: boolean;
    org?: string;
  }): Promise<GitHubRepo> {
    const createFn = options.org
      ? () =>
          this.octokit.repos.createInOrg({
            org: options.org!,
            name: options.name,
            description: options.description,
            private: options.isPrivate ?? true,
            auto_init: true,
          })
      : () =>
          this.octokit.repos.createForAuthenticatedUser({
            name: options.name,
            description: options.description,
            private: options.isPrivate ?? true,
            auto_init: true,
          });

    const { data } = await createFn();
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      description: data.description ?? null,
      url: data.html_url,
      defaultBranch: data.default_branch,
      language: data.language ?? null,
      private: data.private,
    };
  }

  async listRepos(): Promise<GitHubRepo[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
    });

    return data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      private: repo.private,
    }));
  }

  async listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "all"): Promise<GitHubPR[]> {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: 50,
      sort: "updated",
    });

    return data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      url: pr.html_url,
      author: pr.user?.login ?? "unknown",
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      additions: (pr as any).additions ?? 0,
      deletions: (pr as any).deletions ?? 0,
      changedFiles: (pr as any).changed_files ?? 0,
    }));
  }

  async listIssues(owner: string, repo: string, state: "open" | "closed" | "all" = "all"): Promise<GitHubIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: 50,
      sort: "updated",
    });

    return data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        state: issue.state,
        url: issue.html_url,
        author: issue.user?.login ?? "unknown",
        labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
      }));
  }

  async getRepoContent(owner: string, repo: string, path: string, ref?: string) {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    return data;
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
    branch?: string
  ) {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
      branch,
    });
    return data;
  }

  async getBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      return data.object?.sha ?? null;
    } catch (error: any) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async createBranchRef(owner: string, repo: string, branch: string, sha: string): Promise<boolean> {
    try {
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha,
      });
      return true;
    } catch (error: any) {
      if (error?.status === 422) return false;
      throw error;
    }
  }

  async createIssue(
    owner: string,
    repo: string,
    options: { title: string; body: string; labels?: string[]; assignees?: string[] }
  ): Promise<GitHubIssue> {
    const { data } = await this.octokit.issues.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      labels: options.labels,
      assignees: options.assignees,
    });
    return {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body ?? null,
      state: data.state ?? "open",
      url: data.html_url,
      author: data.user?.login ?? "unknown",
      labels: (data.labels ?? []).map((l) => (typeof l === "string" ? l : l.name ?? "")),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      closedAt: data.closed_at,
    };
  }

  async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string) {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    return data;
  }

  async listWorkflowRuns(
    owner: string,
    repo: string,
    options?: { branch?: string; limit?: number }
  ): Promise<GitHubWorkflowRun[]> {
    const params: any = {
      owner,
      repo,
      per_page: options?.limit ?? 10,
    };
    if (options?.branch) {
      params.branch = options.branch;
    }

    const { data } = await this.octokit.actions.listWorkflowRunsForRepo(params);

    return data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name ?? "unknown",
      status: run.status ?? "unknown",
      conclusion: run.conclusion ?? null,
      headBranch: run.head_branch ?? "",
      event: run.event,
      url: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      runNumber: run.run_number,
      workflowName: run.name ?? "unknown",
    }));
  }

  /**
   * Trigger a workflow_dispatch event for a `workflow_id` (filename or
   * numeric id). Backs the `trigger_pipeline` MCP verb. Returns no run id
   * because GitHub's dispatch API doesn't return one; the caller can poll
   * `listWorkflowRuns` if it needs to correlate.
   */
  async dispatchWorkflow(options: {
    owner: string;
    repo: string;
    workflowId: string;
    ref?: string;
    inputs?: Record<string, string>;
  }): Promise<{ status: "queued" }> {
    await this.octokit.actions.createWorkflowDispatch({
      owner: options.owner,
      repo: options.repo,
      workflow_id: options.workflowId,
      ref: options.ref ?? "main",
      inputs: options.inputs,
    });
    return { status: "queued" };
  }
}
