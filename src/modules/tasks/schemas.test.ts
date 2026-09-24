import { describe, expect, it } from "vitest";

import { saveTaskSchema, taskFiltersSchema, taskRelationDefaultsSchema } from "./schemas";

const entityId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("task schemas", () => {
  it("normalizes optional task fields", () => {
    const parsed = saveTaskSchema.parse({
      title: "  Позвонить пациенту  ",
      description: "",
      priority: "normal",
      assignedTo: "",
      dueDate: "",
      dueTime: "",
      relatedEntityType: "",
      relatedEntityId: "",
    });

    expect(parsed.title).toBe("Позвонить пациенту");
    expect(parsed.description).toBeUndefined();
    expect(parsed.dueDate).toBeUndefined();
  });

  it("requires complete due date and relation pairs", () => {
    expect(saveTaskSchema.safeParse({
      title: "Позвонить",
      priority: "high",
      dueDate: "2026-09-25",
    }).success).toBe(false);
    expect(saveTaskSchema.safeParse({
      title: "Позвонить",
      priority: "high",
      relatedEntityType: "lead",
    }).success).toBe(false);
  });

  it("prefers a lead when both relation query parameters are present", () => {
    expect(taskRelationDefaultsSchema.parse({ leadId: entityId, patientId: entityId }))
      .toEqual({ type: "lead", id: entityId });
  });

  it("falls back safely for invalid filters", () => {
    const parsed = taskFiltersSchema.parse({ status: "broken", priority: "urgent" });
    expect(parsed.status).toBeUndefined();
    expect(parsed.priority).toBe("urgent");
  });
});
