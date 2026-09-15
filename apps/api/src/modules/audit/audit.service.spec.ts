import { describe, expect, it } from "vitest";
import { createAuditHash } from "./audit.service.js";

describe("createAuditHash", () => {
  it("is deterministic regardless of object key order", () => {
    expect(createAuditHash({ a: 1, b: { c: 2 } })).toBe(createAuditHash({ b: { c: 2 }, a: 1 }));
  });

  it("changes when audited data changes", () => {
    expect(createAuditHash({ status: "active" })).not.toBe(createAuditHash({ status: "archived" }));
  });
});
