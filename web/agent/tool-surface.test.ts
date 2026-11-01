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
    "get-timeline.ts",
    "search-grounded-guidance.ts",
    "search-news.ts",
  ];

  for (const toolName of toolNames) {
    await access(new URL(`./tools/${toolName}`, import.meta.url));
    const source = await readFile(new URL(`./tools/${toolName}`, import.meta.url), "utf8");
    assert.match(source, /fetchNapasJson|fetchSourceManifest/);
  }
});

test("news and timeline stay out of the guidance tool and its corpus", async () => {
  const guidance = await readFile(new URL("./tools/search-grounded-guidance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(guidance, /\/news|\/timeline/);

  const news = await readFile(new URL("./tools/search-news.ts", import.meta.url), "utf8");
  const timeline = await readFile(new URL("./tools/get-timeline.ts", import.meta.url), "utf8");
  assert.match(news, /\/news\/search/);
  assert.match(timeline, /\/timeline\/query/);
  assert.doesNotMatch(`${news}${timeline}`, /\/guidance\/search/);
});
