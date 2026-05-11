import { z } from "zod/v4";
import { DEFAULT_MODEL } from "@/lib/ai";
import { roleSocialPostsPrompt } from "../prompts/role-social-posts";

export const roleSocialPostsSchema = z.object({
  linkedin: z.string().describe("LinkedIn post. Professional tone, 150-300 words. Include relevant hashtags."),
  twitter: z.string().describe("Twitter/X post. Concise, max 280 characters including hashtags."),
});

export type RoleSocialPosts = z.infer<typeof roleSocialPostsSchema>;

export const roleSocialPostsAgent = {
  slug: "role-social-posts" as const,
  name: "Role Social Posts",
  description: "Generates social media posts to share a job opening on LinkedIn and Twitter/X.",
  category: "system_readonly" as const,
  model: DEFAULT_MODEL,
  temperature: 0.7,
  functionId: "role-social-posts",
  systemPrompt: roleSocialPostsPrompt,
  outputSchema: roleSocialPostsSchema,
};
