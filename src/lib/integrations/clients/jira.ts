export interface JiraProject {
  id: string;
  key: string;
  name: string;
  url: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: "scrum" | "kanban" | "simple" | string;
  url: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  url: string;
  summary: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  labels: string[];
  epicKey: string | null;
  storyPoints: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

const JIRA_SEARCH_FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "parent",
  "customfield_10016",
  "created",
  "updated",
  "resolutiondate",
];

export class JiraClient {
  private baseUrl: string;
  private email: string;
  private apiToken: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.apiToken = apiToken;
  }

  private get headers() {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
    return {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
    api: "platform" | "agile" = "platform",
  ): Promise<T> {
    const prefix = api === "agile" ? "/rest/agile/1.0" : "/rest/api/3";
    const response = await fetch(`${this.baseUrl}${prefix}${path}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });
    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}: ${await readDetail(response)}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  async getCurrentUser(): Promise<{ accountId: string; displayName: string; emailAddress: string }> {
    return this.request<any>("/myself");
  }

  issueBrowseUrl(issueKey: string): string {
    return `${this.baseUrl}/browse/${issueKey}`;
  }

  projectBrowseUrl(projectKey: string): string {
    return `${this.baseUrl}/jira/software/projects/${projectKey.trim().toUpperCase()}`;
  }

  async createProject(options: {
    key: string;
    name: string;
    description?: string;
    leadAccountId?: string;
    projectTypeKey?: string;
    projectTemplateKey?: string;
  }): Promise<JiraProject> {
    let leadAccountId = options.leadAccountId;
    if (!leadAccountId) {
      const me = await this.getCurrentUser();
      leadAccountId = me.accountId;
    }

    const data = await this.request<any>("/project", {
      method: "POST",
      body: JSON.stringify({
        key: options.key.toUpperCase(),
        name: options.name,
        description: options.description || "",
        projectTypeKey: options.projectTypeKey || "software",
        projectTemplateKey:
          options.projectTemplateKey || "com.pyxis.greenhopper.jira:gh-kanban-template",
        leadAccountId,
        assigneeType: "UNASSIGNED",
      }),
    });
    return {
      id: data.id,
      key: data.key,
      name: data.name ?? options.name,
      url: this.projectBrowseUrl(data.key),
    };
  }

  async getProjects(): Promise<JiraProject[]> {
    const data = await this.request<any[]>("/project");
    return data.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      url: this.projectBrowseUrl(p.key),
    }));
  }

  async getProject(projectKey: string): Promise<JiraProject | null> {
    const key = projectKey.trim().toUpperCase();
    const response = await fetch(`${this.baseUrl}/rest/api/3/project/${encodeURIComponent(key)}`, {
      headers: this.headers,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}: ${await readDetail(response)}`);
    }
    const data = await response.json();
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      url: this.projectBrowseUrl(data.key),
    };
  }

  async validateProjectKey(projectKey: string): Promise<{ valid: boolean; errors: string[] }> {
    const key = projectKey.trim().toUpperCase();
    const data = await this.request<{ errorMessages?: string[]; errors?: Record<string, string> }>(
      `/projectvalidate/key?key=${encodeURIComponent(key)}`,
    );
    const errors = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})];
    return { valid: errors.length === 0, errors };
  }

  async getBoardsForProject(projectKey: string): Promise<JiraBoard[]> {
    const key = projectKey.trim().toUpperCase();
    const data = await this.request<{ values?: any[] }>(
      `/board?projectKeyOrId=${encodeURIComponent(key)}&maxResults=50`,
      undefined,
      "agile",
    );
    return (data.values ?? []).map((board: any) => ({
      id: board.id,
      name: board.name,
      type: board.type,
      url: `${this.baseUrl}/jira/software/projects/${key}/boards/${board.id}`,
    }));
  }

  async getIssues(projectKey: string, jql?: string): Promise<JiraIssue[]> {
    const key = projectKey.trim().toUpperCase();
    const query = jql || `project = ${key} ORDER BY updated DESC`;
    const issues: any[] = [];
    let nextPageToken: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const data = await this.request<{
        issues?: any[];
        isLast?: boolean;
        nextPageToken?: string;
      }>("/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql: query,
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
          fields: JIRA_SEARCH_FIELDS,
        }),
      });
      issues.push(...(data.issues ?? []));
      nextPageToken = data.nextPageToken;
      if (data.isLast === true || !nextPageToken) break;
    }

    return issues.map((issue: any) => this.toJiraIssue(issue));
  }

  private toJiraIssue(issue: any): JiraIssue {
    return {
      id: issue.id,
      key: issue.key,
      url: this.issueBrowseUrl(issue.key),
      summary: issue.fields.summary,
      description: issue.fields.description
        ? this.extractText(issue.fields.description)
        : null,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name ?? "None",
      assignee: issue.fields.assignee?.displayName ?? null,
      reporter: issue.fields.reporter?.displayName ?? "Unknown",
      labels: issue.fields.labels ?? [],
      epicKey: issue.fields.parent?.key ?? null,
      storyPoints: issue.fields.customfield_10016 ?? null,
      createdAt: issue.fields.created,
      updatedAt: issue.fields.updated,
      resolvedAt: issue.fields.resolutiondate ?? null,
    };
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const issue = await this.request<any>(`/issue/${issueKey}`);
    return this.toJiraIssue(issue);
  }

  async createIssue(
    projectKey: string,
    options: { summary: string; description: string; issueType: string; labels?: string[] }
  ): Promise<{ id: string; key: string; self: string }> {
    const fields: any = {
      project: { key: projectKey },
      summary: options.summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: options.description }],
          },
        ],
      },
      issuetype: { name: options.issueType },
    };
    if (options.labels && options.labels.length > 0) {
      fields.labels = options.labels;
    }
    return this.request<{ id: string; key: string; self: string }>("/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  async updateIssue(
    issueKey: string,
    options: { summary?: string; description?: string; labels?: string[] },
  ): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (options.summary !== undefined) fields.summary = options.summary;
    if (options.description !== undefined) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", content: [{ type: "text", text: options.description }] },
        ],
      };
    }
    if (options.labels !== undefined) fields.labels = options.labels;
    if (Object.keys(fields).length === 0) return;
    await this.request(`/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async transitionIssue(issueKey: string, transitionId: string) {
    await this.request(`/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  async getTransitions(issueKey: string): Promise<{ id: string; name: string; toStatusName: string }[]> {
    const data = await this.request<any>(`/issue/${issueKey}/transitions`);
    return (data.transitions ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      toStatusName: t.to?.name ?? "",
    }));
  }

  /**
   * Transition by target-status name. Callers pass human names ("In Progress",
   * "Done") rather than learning Jira's per-project numeric transition IDs.
   * Matches `toStatusName` case-insensitively, falling back to `name`.
   * Returns the chosen transition or null if no match.
   */
  async transitionIssueByName(
    issueKey: string,
    target: string,
  ): Promise<{ id: string; name: string } | null> {
    const transitions = await this.getTransitions(issueKey);
    const needle = target.trim().toLowerCase();
    const match =
      transitions.find((t) => t.toStatusName.toLowerCase() === needle) ??
      transitions.find((t) => t.name.toLowerCase() === needle);
    if (!match) return null;
    await this.transitionIssue(issueKey, match.id);
    return { id: match.id, name: match.name };
  }

  async getSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.request<any>(
      `/board/${boardId}/sprint?state=active,future`,
      undefined,
      "agile",
    );
    return data.values.map((s: any) => ({
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      goal: s.goal ?? null,
    }));
  }

  private extractText(adfContent: any): string {
    if (!adfContent || !adfContent.content) return "";
    return adfContent.content
      .map((block: any) => {
        if (block.content) {
          return block.content
            .map((inline: any) => inline.text || "")
            .join("");
        }
        return "";
      })
      .join("\n");
  }
}

async function readDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return response.statusText;
  }
}
