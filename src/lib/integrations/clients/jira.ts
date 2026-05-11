export interface JiraProject {
  id: string;
  key: string;
  name: string;
  url: string;
}

export interface JiraIssue {
  id: string;
  key: string;
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

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });
    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async getCurrentUser(): Promise<{ accountId: string; displayName: string; emailAddress: string }> {
    return this.request<any>("/myself");
  }

  async createProject(options: {
    key: string;
    name: string;
    description?: string;
    leadAccountId?: string;
    projectTypeKey?: string;
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
        leadAccountId,
      }),
    });
    return {
      id: data.id,
      key: data.key,
      name: data.name ?? options.name,
      url: `${this.baseUrl}/browse/${data.key}`,
    };
  }

  async getProjects(): Promise<JiraProject[]> {
    const data = await this.request<any[]>("/project");
    return data.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      url: `${this.baseUrl}/browse/${p.key}`,
    }));
  }

  async getIssues(projectKey: string, jql?: string): Promise<JiraIssue[]> {
    const query = jql || `project = ${projectKey} ORDER BY updated DESC`;
    const data = await this.request<any>(`/search?jql=${encodeURIComponent(query)}&maxResults=50`);
    return data.issues.map((issue: any) => ({
      id: issue.id,
      key: issue.key,
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
    }));
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const issue = await this.request<any>(`/issue/${issueKey}`);
    return {
      id: issue.id,
      key: issue.key,
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

  async transitionIssue(issueKey: string, transitionId: string) {
    await this.request(`/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  async getSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.request<any>(
      `/board/${boardId}/sprint?state=active,future`
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
