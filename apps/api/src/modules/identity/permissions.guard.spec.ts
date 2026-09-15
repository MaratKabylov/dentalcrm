import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard.js";

describe("PermissionsGuard", () => {
  it("rejects a context without the requested permission", () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(["settings.manage"]) };
    const guard = new PermissionsGuard(reflector as never);
    const executionContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({ auth: { permissions: new Set<string>() } }) })
    };
    expect(() => guard.canActivate(executionContext as never)).toThrow(ForbiddenException);
  });
});
