import { describe, expect, it } from "vitest";
import { canTransition } from "./appointment-state.js";

describe("appointment state machine", () => {
  it("allows the normal visit path", () => {
    expect(canTransition("created", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("checked_in", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(canTransition("completed", "confirmed")).toBe(false);
    expect(canTransition("cancelled", "created")).toBe(false);
    expect(canTransition("no_show", "checked_in")).toBe(false);
  });
});
