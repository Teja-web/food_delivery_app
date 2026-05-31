import { z } from "zod";

export const taskStatuses = ["todo", "in_progress", "done"] as const;
export const taskPriorities = ["low", "med", "high"] as const;

const requiredTitle = z.string().trim().min(1, "title is required");
const optionalTitle = z.string().trim().min(1, "title cannot be blank");
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be an ISO date");

export const createTaskSchema = z
  .object({
    title: requiredTitle,
    description: z.string().nullable().optional(),
    status: z.enum(taskStatuses).optional(),
    priority: z.enum(taskPriorities).optional(),
    dueDate,
  })
  .strict();

export const patchTaskSchema = z
  .object({
    title: optionalTitle.optional(),
    description: z.string().nullable().optional(),
    status: z.enum(taskStatuses).optional(),
    priority: z.enum(taskPriorities).optional(),
    dueDate: dueDate.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "patch body must include at least one supported field",
  });

export const listTasksQuerySchema = z
  .object({
    status: z.enum(taskStatuses).optional(),
  })
  .strict();

export const taskIdSchema = z.string().uuid("task id must be a UUID");

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
