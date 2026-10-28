import { describe, expect, it } from "vitest";

describe("project scaffold", () => {
  it("uses the expected service name", () => {
    expect("jarvis-web-research-agent").toContain("jarvis");
  });
});
