import { describe, expect, it } from "vitest";
import { chapters } from "../src/data/chapters";

describe("Round 1 chapter map", () => {
  it("keeps the four planned chapters in order with unique identifiers", () => {
    expect(chapters.map(({ id }) => id)).toEqual(["inbox", "trail", "insider", "containment"]);
    expect(new Set(chapters.map(({ id }) => id)).size).toBe(chapters.length);
  });
});
