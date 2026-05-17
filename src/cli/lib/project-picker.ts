/**
 * Project picker — calls `GET /api/v1/projects` to fetch the org's
 * project list, then either auto-selects (`--project=<slug>`) or
 * presents a numbered list.
 *
 * The picker accepts the API key inline (not via `.coznt/config.json`)
 * because at connect time the config doesn't exist yet.
 */

import { ask } from "./prompt.js";

export interface PickableProject {
  id: string;
  slug: string;
  name: string;
  phase?: string;
}

interface ListResponse {
  projects?: PickableProject[];
  items?: PickableProject[];
}

export async function fetchProjects(
  serverUrl: string,
  apiKey: string,
): Promise<PickableProject[]> {
  const url = `${serverUrl.replace(/\/$/, "")}/api/v1/projects`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not list projects: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as ListResponse | PickableProject[];
  if (Array.isArray(body)) return body;
  if (body.projects) return body.projects;
  if (body.items) return body.items;
  return [];
}

export async function pickProject(
  serverUrl: string,
  apiKey: string,
  prefer?: string,
): Promise<PickableProject> {
  const projects = await fetchProjects(serverUrl, apiKey);
  if (projects.length === 0) {
    throw new Error("No projects visible to this API key. Create one in coznt first.");
  }

  if (prefer) {
    const match = projects.find(
      (p) => p.id === prefer || p.slug === prefer || p.name === prefer,
    );
    if (match) return match;
    throw new Error(`No project matched '${prefer}' by id, slug, or name.`);
  }

  if (projects.length === 1) {
    console.log(`Auto-selecting only available project: ${projects[0].name} (${projects[0].slug})`);
    return projects[0];
  }

  console.log("Available projects:");
  projects.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.slug})${p.phase ? ` — ${p.phase}` : ""}`);
  });

  while (true) {
    const answer = await ask(`Pick one (1-${projects.length}, or slug): `);
    const asNumber = parseInt(answer, 10);
    if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= projects.length) {
      return projects[asNumber - 1];
    }
    const match = projects.find((p) => p.slug === answer || p.name === answer);
    if (match) return match;
    console.error(`Couldn't match '${answer}'. Enter a number 1-${projects.length} or an exact slug.`);
  }
}
