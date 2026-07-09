"use server";

import { randomBytes } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { account, member, organization, user } from "@/db/schema";
import { seedPlatformSkillsForOrganization } from "@/operations/skill/seed-platform-skills";

export interface SignupState {
  errors: string[];
}

const signupSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required."),
  orgSlug: z
    .string()
    .trim()
    .min(1, "Organization slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Organization slug can use lowercase letters, numbers, and hyphens."),
  ownerName: z.string().trim().min(1, "Owner full name is required."),
  ownerEmail: z.email("A valid owner email is required.").transform((value) => value.toLowerCase()),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    orgName: formData.get("orgName"),
    orgSlug: formData.get("orgSlug"),
    ownerName: formData.get("ownerName"),
    ownerEmail: formData.get("ownerEmail"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const input = parsed.data;
  const existingOrg = await db.query.organization.findFirst({
    where: eq(organization.slug, input.orgSlug),
  });
  if (existingOrg) {
    return { errors: [`Organization slug "${input.orgSlug}" is already taken.`] };
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, input.ownerEmail),
  });
  if (existingUser) {
    return { errors: [`A user with ${input.ownerEmail} already exists.`] };
  }

  const orgId = generateId("org");
  const userId = generateId("user");
  const now = new Date();
  const hashedPassword = await hashPassword(input.password);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: orgId,
        name: input.orgName,
        slug: input.orgSlug,
      });

      await tx.insert(user).values({
        id: userId,
        name: input.ownerName,
        email: input.ownerEmail,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(account).values({
        id: generateId("acc"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(member).values({
        id: generateId("mem"),
        organizationId: orgId,
        userId,
        role: "owner",
      });
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create organization.";
    if (message.toLowerCase().includes("duplicate")) {
      return { errors: ["That organization or user already exists."] };
    }
    return { errors: [message] };
  }

  try {
    await seedPlatformSkillsForOrganization(orgId);
  } catch (error) {
    console.warn(
      `[signup] platform skill seeding failed for ${orgId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  redirect(`/auth/sign-in?registered=1&email=${encodeURIComponent(input.ownerEmail)}`);
}
