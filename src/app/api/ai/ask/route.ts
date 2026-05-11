/**
 * Ask AI Route — Single agent with auto-generated entity tools
 *
 * No classifier routing. One agent gets all tools and picks the right ones
 * based on tool descriptions.
 */

import { streamText, stepCountIs } from "ai";
import { allTools } from "./tools";
import { enrichEntityContext } from "./context-enricher";
import { getActionContext } from "@/lib/auth/context";
import { askAssistantAgent } from "@/automations/agents/definitions/ask-assistant";
import { DEFAULT_MODEL, getModelInstance, type ModelId } from "@/lib/ai";

export const maxDuration = 60;

// -- Identity context ---------------------------------------------------------

function buildIdentityContext(
  user: { id?: string; name?: string } | null,
  organizationId: string | null,
  pageContext?: Record<string, unknown>,
): string {
  const now = new Date();
  const parts = [
    `You are assisting ${user?.name || "a recruiter"}.`,
    `Current date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
  ];

  // CRITICAL: Org isolation context - all data must be scoped to this org
  if (organizationId) {
    parts.push(
      `IMPORTANT: All data you access and return MUST be scoped to organization ID: ${organizationId}. Never return or query data from other organizations.`,
    );
  }

  if (pageContext) {
    const { entity, id: entityId } = pageContext as {
      entity?: string;
      id?: string;
    };
    if (entity) {
      parts.push(
        `The user is currently viewing: ${entity}${entityId ? ` (ID: ${entityId})` : ""}`,
      );
    }
  }

  return parts.join("\n");
}

// -- Route handler ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, context, history = [] } = body;

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // 1. Get auth context
    let user: { id?: string; name?: string } | null = null;
    let organizationId: string | null = null;
    try {
      const authContext = await getActionContext();
      if (authContext) {
        user = { id: authContext.userId, name: authContext.user?.name };
        organizationId = authContext.organizationId;
      }
    } catch {
      // Auth is optional — unauthenticated users get limited context (no org scoping)
    }

    // 2. Build context
    const identityBlock = buildIdentityContext(user, organizationId, context);

    let contextEnrichment = "";
    try {
      contextEnrichment = await enrichEntityContext(context ?? {}, organizationId ?? undefined);
    } catch (error) {
      console.error("Context enrichment error:", error);
    }

    const fullSystemPrompt = [identityBlock, contextEnrichment, askAssistantAgent.systemPrompt]
      .filter(Boolean)
      .join("\n\n");

    // 3. Build messages
    const messages = [
      { role: "system" as const, content: fullSystemPrompt },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    const model = ((askAssistantAgent as any).model as ModelId | undefined) ?? DEFAULT_MODEL;
    console.log(`[Ask AI] user=${user?.name ?? "anon"} org=${organizationId ?? "none"} model=${model} message="${message.slice(0, 100)}"`);
    console.log(`[Ask AI] context: entity=${context?.entity ?? "none"} id=${context?.id ?? "none"} view=${context?.view ?? "none"}`);

    // 4. Stream response
    const result = streamText({
      model: getModelInstance(model) as any,
      messages,
      tools: allTools,
      stopWhen: stepCountIs(10),
      onStepFinish: ({ toolCalls, toolResults }) => {
        if (toolCalls?.length) {
          for (const call of toolCalls) {
            console.log(`[Ask AI] tool call: ${call.toolName}(${JSON.stringify((call as any).args ?? {}).slice(0, 200)})`);
          }
        }
        if (toolResults?.length) {
          for (const result of toolResults) {
            const preview = JSON.stringify((result as any).result ?? {}).slice(0, 300);
            console.log(`[Ask AI] tool result: ${result.toolName} → ${preview}`);
          }
        }
      },
      onError: (error) => {
        console.error("[Ask AI] Stream error:", error);
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Ask AI error:", error);
    return Response.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
