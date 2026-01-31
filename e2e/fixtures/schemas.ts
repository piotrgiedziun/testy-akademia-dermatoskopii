/**
 * Zod schemas for E2E test data validation.
 * These schemas match the app's TypeScript types in src/types/index.ts
 * to catch mismatches at seed time rather than runtime.
 */
import { z } from "zod";

// Shared schemas
export const LocalizedStringSchema = z.object({
  pl: z.string(),
  en: z.string(),
});

// Level schema (matches src/types/index.ts Level)
export const LevelSchema = z.object({
  id: z.string(),
  order: z.number(),
  title: LocalizedStringSchema,
  description: LocalizedStringSchema,
});

// TestAnswer schema (matches src/types/index.ts TestAnswer)
export const TestAnswerSchema = z.object({
  id: z.string(),
  name: LocalizedStringSchema, // NOT "text" - this is a common mistake
});

// Test schema (matches src/types/index.ts Test)
export const TestSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  order: z.number(),
  title: LocalizedStringSchema,
  timerMode: z.enum(["countdown", "stopwatch", "none"]),
  timePerQuestion: z.number(),
  pointsPerCorrect: z.number(),
  answerType: z.enum(["single", "multiple"]),
  answers: z.array(TestAnswerSchema),
});

// CaseImage schema (matches src/types/index.ts CaseImage)
export const CaseImageSchema = z.object({
  url: z.string(),
  type: z.enum(["polarized", "non-polarized"]),
});

// Annotation schema (matches src/types/index.ts Annotation)
export const AnnotationSchema = z.object({
  type: z.enum(["circle", "rect", "arrow"]),
  coords: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    radius: z.number().optional(),
    endX: z.number().optional(),
    endY: z.number().optional(),
  }),
  label: LocalizedStringSchema,
});

// Case schema (matches src/types/index.ts Case)
export const CaseSchema = z.object({
  id: z.string(),
  testId: z.string(),
  order: z.number(),
  images: z.array(CaseImageSchema),
  correctAnswers: z.array(z.string()),
  explanation: LocalizedStringSchema,
  features: z.array(LocalizedStringSchema).optional(),
  differentials: z.array(LocalizedStringSchema).optional(),
  pitfall: LocalizedStringSchema.nullable().optional(),
  annotations: z.array(AnnotationSchema).nullable().optional(),
});

// CommunityCaseImage schema (matches src/types/index.ts CommunityCaseImage)
export const CommunityCaseImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  type: z.enum(["dermatoscopic", "macro", "other"]),
  order: z.number(),
});

// CommunityCase schema (matches src/types/index.ts CommunityCase)
export const CommunityCaseSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  title: z.string(), // NOT LocalizedString - just a plain string
  description: z.string(), // NOT LocalizedString - just a plain string
  images: z.array(CommunityCaseImageSchema),
  diagnosis: z
    .object({
      text: z.string(),
      histopathologyResult: z.string().optional(),
      addedAt: z.date(),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  commentsCount: z.number(),
  status: z.enum(["active", "flagged", "hidden"]),
});

// User schema for seeding
export const TestUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  displayName: z.string(),
  role: z.enum(["user", "admin"]),
  permissions: z.object({
    casesAccess: z.boolean().optional(),
    moderator: z.boolean().optional(),
  }),
  termsAcceptedAt: z.boolean(),
});

// Validation helper
export function validateFixtures<T>(
  schema: z.ZodSchema<T>,
  data: unknown[],
  name: string
): T[] {
  const results: T[] = [];

  for (let i = 0; i < data.length; i++) {
    const result = schema.safeParse(data[i]);
    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(
        `Validation failed for ${name}[${i}]:\n${errors}\n\nReceived: ${JSON.stringify(data[i], null, 2)}`
      );
    }
    results.push(result.data);
  }

  return results;
}
