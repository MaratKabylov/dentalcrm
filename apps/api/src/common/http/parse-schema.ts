import { HttpStatus } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiException } from "./api.exception.js";

export function parseSchema<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed", {
      issues: parsed.error.issues
    });
  }
  return parsed.data;
}
