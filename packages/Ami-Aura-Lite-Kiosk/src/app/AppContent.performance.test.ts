import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = join(process.cwd(), "packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx");
const source = readFileSync(sourcePath, "utf8");

function extractConstAsyncFunctionBody(functionName: string) {
  const signature = `const ${functionName} = async`;
  const start = source.indexOf(signature);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const arrowStart = source.indexOf(") => {", start);
  expect(arrowStart, `${functionName} should be an arrow function`).toBeGreaterThanOrEqual(0);

  const bodyStart = source.indexOf("{", arrowStart);
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

describe("Ami Aura Lite role home loading performance", () => {
  it("uses the terminal query cache before loading a role homepage", () => {
    const body = extractConstAsyncFunctionBody("loadRoleHome");

    expect(body).toContain("getTerminalQuerySnapshot");
    expect(body).toContain("terminalQuery({");
    expect(body).toContain("state.refresh");
    expect(body).not.toContain("renderDashboard(");
  });

  it("keeps terminal persona suggestions refreshable at runtime", () => {
    expect(source).toContain("const PERSONA_REFRESH_INTERVAL_MS = 60_000");
    expect(source).toContain("const refreshAgentPersonas = useCallback");
    expect(source).toContain("window.setInterval");
    expect(source).toContain("window.clearInterval");
    expect(source).toContain("const suggestedQuestionPool = useMemo");
    expect(source).toContain("suggestedQuestions={suggestedQuestionPool}");
    expect(source).toContain("showPersonaSwitcher && availableTerminalPersonas.length > 1");
  });
});
