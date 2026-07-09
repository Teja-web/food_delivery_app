export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  url: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  version: number;
  url: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export class ConfluenceClient {
  private baseUrl: string;
  private email: string;
  private apiToken: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "").replace(/\/wiki$/, "");
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
    const response = await fetch(`${this.baseUrl}/wiki/rest/api${path}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });
    if (!response.ok) {
      let detail = "";
      try {
        const errJson = await response.json();
        detail = errJson.message || errJson.errorMessage || JSON.stringify(errJson).slice(0, 200);
      } catch {
        detail = response.statusText;
      }
      throw new Error(`Confluence API error: ${response.status} - ${detail}`);
    }
    return response.json() as Promise<T>;
  }

  async createSpace(options: {
    key: string;
    name: string;
    description?: string;
  }): Promise<ConfluenceSpace> {
    const key = options.key.toUpperCase();

    // Try v2 API first (Confluence Cloud)
    const v2Url = `${this.baseUrl}/wiki/api/v2/spaces`;
    const v2Res = await fetch(v2Url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        key,
        name: options.name,
        description: { plain: { value: options.description || "", representation: "plain" } },
      }),
    });

    if (v2Res.ok) {
      const data = await v2Res.json() as any;
      return {
        id: String(data.id),
        key: data.key,
        name: data.name,
        url: `${this.baseUrl}/wiki/spaces/${data.key}`,
      };
    }

    // Fall back to v1 API
    const v1Url = `${this.baseUrl}/wiki/rest/api/space`;
    const v1Res = await fetch(v1Url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        key,
        name: options.name,
        description: { plain: { value: options.description || "", representation: "plain" } },
      }),
    });

    if (v1Res.ok) {
      const data = await v1Res.json() as any;
      return {
        id: String(data.id),
        key: data.key,
        name: data.name,
        url: `${this.baseUrl}/wiki/spaces/${data.key}`,
      };
    }

    // Both failed — extract a safe error message
    let detail = `${v2Res.status}`;
    try {
      const errJson = await v2Res.json();
      detail = errJson.message || errJson.detail || errJson.errorMessage || detail;
    } catch {
      detail = v2Res.statusText || detail;
    }
    throw new Error(`Failed to create Confluence space: ${detail}`);
  }

  async getSpaces(): Promise<ConfluenceSpace[]> {
    const data = await this.request<any>("/space");
    return data.results.map((s: any) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      url: `${this.baseUrl}/wiki/spaces/${s.key}`,
    }));
  }

  async getPage(pageId: string): Promise<ConfluencePage> {
    const data = await this.request<any>(
      `/content/${pageId}?expand=body.storage,version,space`
    );
    return {
      id: data.id,
      title: data.title,
      spaceKey: data.space.key,
      version: data.version.number,
      url: `${this.baseUrl}/wiki${data._links.webui}`,
      body: data.body.storage.value,
      createdAt: data.version.when,
      updatedAt: data.version.when,
    };
  }

  async createPage(
    spaceKey: string,
    title: string,
    body: string,
    parentId?: string
  ): Promise<ConfluencePage> {
    const payload: any = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: {
        storage: { value: body, representation: "storage" },
      },
    };
    if (parentId) {
      payload.ancestors = [{ id: parentId }];
    }
    const data = await this.request<any>("/content", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      id: data.id,
      title: data.title,
      spaceKey,
      version: 1,
      url: `${this.baseUrl}/wiki${data._links.webui}`,
      body,
      createdAt: data.version.when,
      updatedAt: data.version.when,
    };
  }

  async updatePage(
    pageId: string,
    title: string,
    body: string,
    currentVersion: number
  ): Promise<ConfluencePage> {
    const data = await this.request<any>(`/content/${pageId}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "page",
        title,
        body: {
          storage: { value: body, representation: "storage" },
        },
        version: { number: currentVersion + 1 },
      }),
    });
    return {
      id: data.id,
      title: data.title,
      spaceKey: data.space?.key ?? "",
      version: currentVersion + 1,
      url: `${this.baseUrl}/wiki${data._links.webui}`,
      body,
      createdAt: data.version.when,
      updatedAt: data.version.when,
    };
  }

  async searchPages(spaceKey: string, query: string): Promise<ConfluencePage[]> {
    const cql = `space = "${spaceKey}" AND text ~ "${query}"`;
    const data = await this.request<any>(
      `/content/search?cql=${encodeURIComponent(cql)}&expand=body.storage,version`
    );
    return data.results.map((p: any) => ({
      id: p.id,
      title: p.title,
      spaceKey,
      version: p.version?.number ?? 1,
      url: `${this.baseUrl}/wiki${p._links.webui}`,
      body: p.body?.storage?.value ?? "",
      createdAt: p.version?.when ?? "",
      updatedAt: p.version?.when ?? "",
    }));
  }
}
