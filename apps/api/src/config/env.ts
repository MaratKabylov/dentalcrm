import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
const optionalSecret = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url().default("postgresql://dental:local-development-only@localhost:5432/dental"),
    DATABASE_ADMIN_URL: optionalUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(4),
    DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).default("dental_app"),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    AUTH_MODE: z.enum(["development", "local", "oidc", "supabase"]).default("local"),
    OIDC_ISSUER_URL: optionalUrl,
    OIDC_JWKS_URL: optionalUrl,
    OIDC_AUDIENCE: z.string().min(1).default("dental-api"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    SUPABASE_SECRET_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default("dental-private"),
    LOCAL_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && !["oidc", "supabase"].includes(env.AUTH_MODE)) {
      context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "OIDC or Supabase authentication is required in production" });
    }
    if (env.AUTH_MODE === "oidc" && !env.OIDC_ISSUER_URL) {
      context.addIssue({ code: "custom", path: ["OIDC_ISSUER_URL"], message: "OIDC issuer is required" });
    }
    if (env.AUTH_MODE === "oidc" && !env.OIDC_JWKS_URL) {
      context.addIssue({ code: "custom", path: ["OIDC_JWKS_URL"], message: "OIDC JWKS URL is required" });
    }
    if ((env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY) && !env.NEXT_PUBLIC_SUPABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SUPABASE_URL"],
        message: "Supabase URL is required when a server key is configured"
      });
    }
    if (env.AUTH_MODE === "supabase") {
      if (!env.NEXT_PUBLIC_SUPABASE_URL) {
        context.addIssue({ code: "custom", path: ["NEXT_PUBLIC_SUPABASE_URL"], message: "Supabase URL is required" });
      }
      if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
        context.addIssue({ code: "custom", path: ["SUPABASE_SECRET_KEY"], message: "Supabase server key is required" });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}
