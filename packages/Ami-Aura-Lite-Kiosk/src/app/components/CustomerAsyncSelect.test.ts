import { describe, expect, it } from "vitest";
import { shouldSearchCustomerKeyword } from "./CustomerAsyncSelect";

describe("shouldSearchCustomerKeyword", () => {
  it("allows one Chinese character for customer name search", () => {
    expect(shouldSearchCustomerKeyword("黄")).toBe(true);
  });

  it("keeps short phone and latin inputs from triggering noisy searches", () => {
    expect(shouldSearchCustomerKeyword("13")).toBe(false);
    expect(shouldSearchCustomerKeyword("138")).toBe(true);
    expect(shouldSearchCustomerKeyword("a")).toBe(false);
    expect(shouldSearchCustomerKeyword("amy")).toBe(true);
    expect(shouldSearchCustomerKeyword(" ")).toBe(false);
  });
});
