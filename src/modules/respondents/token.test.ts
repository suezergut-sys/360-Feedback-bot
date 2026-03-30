import { describe, expect, it } from "vitest";
import { isInviteTokenFormatValid, normalizeInviteToken } from "@/modules/respondents/token";

describe("invite token validation", () => {
  it("accepts valid uuid token", () => {
    expect(isInviteTokenFormatValid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects malformed token", () => {
    expect(isInviteTokenFormatValid("not-a-token")).toBe(false);
  });

  it("normalizes whitespace", () => {
    expect(normalizeInviteToken("  abc  ")).toBe("abc");
  });
});
