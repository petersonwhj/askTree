import { describe, it, expect } from "vitest";
import { scrollFraction, scrollTopForFraction, scrollTopForMark } from "../scroll";

describe("scroll helpers", () => {
  it("maps scroll position to a clamped fraction", () => {
    expect(scrollFraction(0, 1000, 200)).toBe(0);
    expect(scrollFraction(400, 1000, 200)).toBe(0.5);
    expect(scrollFraction(800, 1000, 200)).toBe(1);
    expect(scrollFraction(999, 1000, 200)).toBe(1);
    expect(scrollFraction(-10, 1000, 200)).toBe(0);
  });

  it("returns 0 when there is nothing to scroll", () => {
    expect(scrollFraction(50, 200, 200)).toBe(0);
    expect(scrollTopForFraction(0.5, 200, 200)).toBe(0);
  });

  it("maps a fraction back to a scroll position", () => {
    expect(scrollTopForFraction(0.5, 1000, 200)).toBe(400);
    expect(scrollTopForFraction(2, 1000, 200)).toBe(800);
    expect(scrollTopForFraction(-1, 1000, 200)).toBe(0);
  });

  it("centers a quoted mark in the viewport", () => {
    expect(scrollTopForMark(900, 400)).toBe(700);
    expect(scrollTopForMark(50, 400)).toBe(0);
  });
});
