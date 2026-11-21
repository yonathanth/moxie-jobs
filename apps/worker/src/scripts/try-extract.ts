/**
 * Runs the extractor on a pasted post without touching the database's jobs:
 *   pnpm --filter @ethio/worker extract:try path/to/post.txt [sourceTitle]
 * Prints the model's structured output, token usage and latency. Use it to
 * build the golden test set (docs/ingestion-spec.md §7.3).
 */
import { readFileSync } from "node:fs";
import { createAiClient } from "../ai/client";
import { Extractor } from "../ai/extract";
import { prisma } from "../db";
import { formatEat } from "../pipeline/process";
import { loadTaxonomy } from "../pipeline/taxonomy";

async function main() {
  const [file, sourceTitle = "Test channel"] = process.argv.slice(2);
  if (!file) throw new Error("Usage: extract:try <post.txt> [sourceTitle]");
  const text = readFileSync(file, "utf8");
  const { client, model } = createAiClient();
  const taxonomy = await loadTaxonomy();
  const result = await new Extractor(client, model).extract(
    { postedAtEat: formatEat(new Date()), sourceTitle, sourceType: "original", text, buttons: [], pageText: null },
    taxonomy.prompt,
  );
  console.log(JSON.stringify(result.extraction, null, 2));
  console.log(`\nmodel=${result.model} latency=${result.latencyMs}ms tokens in=${result.usage.inputTokens} (cached ${result.usage.cachedTokens}) out=${result.usage.outputTokens}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
