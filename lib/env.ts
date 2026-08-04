import { z } from "zod";

/**
 * Public env — safe to read from Client Components.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Server-only env. Never import `serverEnv` from a Client Component — these
 * values must not reach the browser bundle.
 */
const serverSchema = z.object({
  /**
   * Optional by design. This key bypasses RLS entirely, so nothing in the
   * request path uses it — every query runs as the signed-in user. Only add it
   * if an admin/maintenance task genuinely needs to read across users.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

/**
 * On a CI/host build there is no .env.local to copy — telling someone to
 * create one is the wrong instruction. Detect the common hosts so the message
 * points at their dashboard instead.
 */
function howToFix(): string {
  if (process.env.VERCEL) {
    return (
      "Set these in Vercel: Project > Settings > Environment Variables " +
      "(tick Production, Preview and Development), then redeploy — " +
      "environment variables only apply to new builds."
    );
  }
  if (process.env.CI) {
    return "Set these as environment variables or secrets in your CI configuration.";
  }
  return "Copy .env.example to .env.local and fill it in.";
}

// Referenced with explicit literal keys so the Next.js bundler can inline them.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsedPublic.success) {
  throw new Error(
    `Missing or invalid public environment variables:\n${format(parsedPublic.error)}\n\n${howToFix()}`,
  );
}

export const env = parsedPublic.data;

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Validates and returns server-only env. Called lazily so that a missing AI key
 * fails the analyze route rather than the entire build.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Missing or invalid server environment variables:\n${format(parsed.error)}\n\n${howToFix()}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
