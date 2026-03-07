import { describe, it, expect } from "vitest";
import { getPasswordStrength } from "@/lib/passwordStrength";

describe("getPasswordStrength", () => {
  it("returns weak for empty string", () => {
    const result = getPasswordStrength("");
    expect(result.label).toBe("weak");
    expect(result.score).toBe(0);
  });

  it("returns weak for short lowercase-only password", () => {
    const result = getPasswordStrength("abc");
    expect(result.label).toBe("weak");
  });

  it("returns fair for password meeting 3 criteria", () => {
    const result = getPasswordStrength("Abcdefghijkl");
    expect(result.score).toBe(3);
    expect(result.label).toBe("fair");
  });

  it("returns good for password meeting 4 criteria", () => {
    const result = getPasswordStrength("Abcdefghijk1");
    expect(result.score).toBe(4);
    expect(result.label).toBe("good");
  });

  it("returns strong for password meeting all 5 criteria", () => {
    const result = getPasswordStrength("Abcdefghij1!");
    expect(result.score).toBe(5);
    expect(result.label).toBe("strong");
  });
});
