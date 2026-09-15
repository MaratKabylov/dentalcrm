import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url().default("postgresql://dental:local-development-only@localhost:5432/dental"),
    DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).default("dental_app"),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    AUTH_MODE: z.enum(["development", "oidc"]).default("development"),
    OIDC_ISSUER_URL: optionalUrl,
    OIDC_JWKS_URL: optionalUrl,
    OIDC_AUDIENCE: z.string().min(1).default("dental-api"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.AUTH_MODE === "development") {
      context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "development auth is forbidden in production" });
    }
    if (env.AUTH_MODE === "oidc" && !env.OIDC_ISSUER_URL) {
      context.addIssue({ code: "custom", path: ["OIDC_ISSUER_URL"], message: "OIDC issuer is required" });
    }
    if (env.AUTH_MODE === "oidc" && !env.OIDC_JWKS_URL) {
      context.addIssue({ code: "custom", path: ["OIDC_JWKS_URL"], message: "OIDC JWKS URL is required" });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}
