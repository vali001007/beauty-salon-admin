import { describe, expect, it } from "vitest";
import { formatUserFacingRequestError, isRequestOutcomeUncertain } from "./userFacingError";

describe("formatUserFacingRequestError", () => {
  it("replaces raw HTTP 500 messages with a business-facing retry message", () => {
    expect(formatUserFacingRequestError(new Error("Request failed with status code 500"))).toBe(
      "Ami_Core 暂时无法完成本次操作，请稍后重试",
    );
  });

  it("explains expired authentication without exposing transport details", () => {
    const error = Object.assign(new Error("设备令牌无效或已过期"), { // ami-brain-unit-only: transport auth fixture, not a Brain product question.
      payload: { status: 401, message: "设备令牌无效或已过期" }, // ami-brain-unit-only: transport auth fixture, not a Brain product question.
    });
    expect(formatUserFacingRequestError(error)).toContain("系统会自动恢复登录状态");
  });

  it("keeps actionable business validation messages", () => {
    expect(formatUserFacingRequestError(new Error("请选择服务人员"))).toBe("请选择服务人员");
  });

  it("marks only network and timeout failures as an uncertain write outcome", () => {
    expect(isRequestOutcomeUncertain({ payload: { code: "ERR_NETWORK" }, message: "Network Error" })).toBe(true); // ami-brain-unit-only: transport error fixture, not a Brain product question.
    expect(isRequestOutcomeUncertain({ payload: { status: 409 }, message: "幂等键冲突" })).toBe(false); // ami-brain-unit-only: idempotency error fixture, not a Brain product question.
  });
});
