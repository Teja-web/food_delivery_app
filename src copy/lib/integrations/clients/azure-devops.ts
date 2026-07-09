export interface AzureDevOpsProject {
  id: string;
  name: string;
  url: string;
  state: string;
}

export interface AzureDevOpsPipeline {
  id: number;
  name: string;
  folder: string;
  url: string;
}

export interface AzureDevOpsBuild {
  id: number;
  buildNumber: string;
  status: string;
  result: string | null;
  sourceBranch: string;
  sourceVersion: string;
  queueTime: string;
  startTime: string | null;
  finishTime: string | null;
  url: string;
  requestedBy: string;
  pipelineName: string;
}

export interface AzureDevOpsRelease {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  environments: AzureDevOpsEnvironment[];
}

export interface AzureDevOpsEnvironment {
  id: number;
  name: string;
  status: string;
  deploySteps: { status: string; lastModifiedOn: string }[];
}

export interface AzureDevOpsWorkItem {
  id: number;
  rev: number;
  url: string;
  title: string;
  workItemType: string;
  state: string;
}

export class AzureDevOpsClient {
  private orgUrl: string;
  private pat: string;

  constructor(orgUrl: string, pat: string) {
    this.orgUrl = orgUrl.replace(/\/$/, "");
    this.pat = pat;
  }

  private get headers() {
    const auth = Buffer.from(`:${this.pat}`).toString("base64");
    return {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.orgUrl}${path}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });
    if (!response.ok) {
      throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async createProject(options: {
    name: string;
    description?: string;
  }): Promise<AzureDevOpsProject> {
    const data = await this.request<any>("/_apis/projects?api-version=7.0", {
      method: "POST",
      body: JSON.stringify({
        name: options.name,
        description: options.description || "",
        capabilities: {
          versioncontrol: { sourceControlType: "Git" },
          processTemplate: {
            templateTypeId: "6b724908-ef14-45cf-84f8-768b5384da45",
          },
        },
      }),
    });
    return {
      id: data.id,
      name: data.name ?? options.name,
      url: data.url ?? `${this.orgUrl}/${options.name}`,
      state: data.state ?? "creating",
    };
  }

  async getProjects(): Promise<AzureDevOpsProject[]> {
    const data = await this.request<any>("/_apis/projects?api-version=7.0");
    return data.value.map((p: any) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      state: p.state,
    }));
  }

  async getPipelines(project: string): Promise<AzureDevOpsPipeline[]> {
    const data = await this.request<any>(
      `/${project}/_apis/pipelines?api-version=7.0`
    );
    return data.value.map((p: any) => ({
      id: p.id,
      name: p.name,
      folder: p.folder ?? "/",
      url: p.url,
    }));
  }

  async getBuilds(project: string, top = 20): Promise<AzureDevOpsBuild[]> {
    const data = await this.request<any>(
      `/${project}/_apis/build/builds?$top=${top}&api-version=7.0`
    );
    return data.value.map((b: any) => ({
      id: b.id,
      buildNumber: b.buildNumber,
      status: b.status,
      result: b.result ?? null,
      sourceBranch: b.sourceBranch,
      sourceVersion: b.sourceVersion,
      queueTime: b.queueTime,
      startTime: b.startTime ?? null,
      finishTime: b.finishTime ?? null,
      url: b._links?.web?.href ?? b.url,
      requestedBy: b.requestedBy?.displayName ?? "Unknown",
      pipelineName: b.definition?.name ?? "Unknown",
    }));
  }

  /**
   * Create an ADO work item via the JSON-Patch API. `workItemType` is the
   * exact ADO type name ("User Story", "Task", "Bug"); the caller is
   * responsible for matching the process template configured on the
   * destination project.
   */
  async createWorkItem(
    project: string,
    options: {
      workItemType: string;
      title: string;
      description?: string;
      tags?: string[];
    },
  ): Promise<AzureDevOpsWorkItem> {
    const ops: Array<Record<string, unknown>> = [
      { op: "add", path: "/fields/System.Title", value: options.title },
    ];
    if (options.description) {
      ops.push({
        op: "add",
        path: "/fields/System.Description",
        value: options.description,
      });
    }
    if (options.tags && options.tags.length > 0) {
      ops.push({ op: "add", path: "/fields/System.Tags", value: options.tags.join("; ") });
    }
    const path = `/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(
      options.workItemType,
    )}?api-version=7.0`;
    const response = await fetch(`${this.orgUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json-patch+json" },
      body: JSON.stringify(ops),
    });
    if (!response.ok) {
      throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
    }
    const data: any = await response.json();
    return {
      id: data.id,
      rev: data.rev,
      url: data._links?.html?.href ?? data.url,
      title: data.fields?.["System.Title"] ?? options.title,
      workItemType: data.fields?.["System.WorkItemType"] ?? options.workItemType,
      state: data.fields?.["System.State"] ?? "New",
    };
  }

  async triggerPipeline(project: string, pipelineId: number, branch?: string) {
    const body: any = {};
    if (branch) {
      body.resources = { repositories: { self: { refName: `refs/heads/${branch}` } } };
    }
    return this.request(
      `/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.0`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  async getReleases(project: string, top = 20): Promise<AzureDevOpsRelease[]> {
    const data = await this.request<any>(
      `/${project}/_apis/release/releases?$top=${top}&api-version=7.0`
    );
    return data.value.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdOn: r.createdOn,
      environments: (r.environments ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        deploySteps: (e.deploySteps ?? []).map((s: any) => ({
          status: s.status,
          lastModifiedOn: s.lastModifiedOn,
        })),
      })),
    }));
  }
}
