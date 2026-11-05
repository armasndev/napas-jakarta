import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the public Napas agent disables Eve's optional default tools", async () => {
  const source = await readFile(new URL("./agent.ts", import.meta.url), "utf8");

  assert.match(source, /defaultTools:\s*false/);
});

test("the grounded retrieval tools are present in the authored Eve surface", async () => {
  const toolNames = [
    "compare-air-quality-locations.ts",
    "compare-with-standard.ts",
    "get-air-quality-history.ts",
    "get-current-air-quality.ts",
    "get-evidence-findings.ts",
    "get-policy-status.ts",
    "search-grounded-guidance.ts",
  ];

  for (const toolName of toolNames) {
    await access(new URL(`./tools/${toolName}`, import.meta.url));
    const source = await readFile(new URL(`./tools/${toolName}`, import.meta.url), "utf8");
    assert.match(source, /fetchNapasJson|fetchSourceManifest/);
  }
});
