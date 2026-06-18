import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = join(process.cwd(), "packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts");
const source = readFileSync(sourcePath, "utf8");

function extractAsyncFunctionBody(functionName: string) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const bodyStart = source.indexOf("{", start);
  expect(bodyStart, `${functionName} should have a body`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(bodyStart + 1, index);
    }
  }

  throw new Error(`${functionName} body is not closed`);
}

describe("Aura Core high-frequency query entrypoints", () => {
  it("do not fall back to full core snapshot queries", () => {
    const highFrequencyEntrypoints = [
      "getManagerDashboard",
      "getReceptionDashboard",
      "getBeauticianDashboard",
      "getStaffSchedules",
      "getCustomerGrowthCandidates",
      "getInventoryAlerts",
    ];

    highFrequencyEntrypoints.forEach((functionName) => {
      expect(extractAsyncFunctionBody(functionName), `${functionName} should stay on lightweight queries`).not.toContain(
        "loadCoreSnapshot(",
      );
    });
  });

  it("uses cached lightweight customer search before customer card snapshot fallback", () => {
    const body = extractAsyncFunctionBody("getCustomerCard");
    const lightweightQueryIndex = body.indexOf("terminalQuery({");
    const lightweightContextIndex = body.indexOf("getTerminalCardVerificationContext");
    const snapshotFallbackIndex = body.indexOf("loadCoreSnapshot(");

    expect(lightweightQueryIndex).toBeGreaterThanOrEqual(0);
    expect(lightweightContextIndex).toBeGreaterThan(lightweightQueryIndex);
    expect(snapshotFallbackIndex).toBeGreaterThan(lightweightContextIndex);
  });
});
