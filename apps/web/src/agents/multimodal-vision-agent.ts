import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Multimodal vision agent for visual defect diagnosis - Day 38 TS port.
 *
 * Takes an image directly (as raw bytes, no separate OCR step) and returns
 * a structured, typed diagnosis - using the Vercel AI SDK's native support
 * for image content parts in a message.
 */

const VisualDiagnosticsSchema = z.object({
  detectedComponents: z.array(z.string()).describe("UI or system components recognized in image."),
  identifiedDefect: z
    .string()
    .nullable()
    .describe("Description of any error, bug, or layout anomaly."),
  recommendedFix: z.string().describe("Direct technical instruction to remediate the defect."),
  confidenceScore: z.number().describe("Confidence rating between 0.0 and 1.0."),
});

async function analyzeVisualDefect(prompt: string, imageBytes: Uint8Array, mimeType = "image/png") {
  console.log(`\nProcessing visual diagnostic request: '${prompt}'...`);

  const { object: diagnostics } = await generateObject({
    model: openai("gpt-4o"),
    schema: VisualDiagnosticsSchema,
    system:
      "We are an expert visual software diagnostic engineer. Inspect screenshots of error messages, " +
      "UI layouts, or architecture diagrams. Provide direct, type-safe diagnostic assessments with actionable fixes.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "file", data: imageBytes, mediaType: mimeType },
        ],
      },
    ],
  });

  return diagnostics;
}

async function main(): Promise<void> {
  // The same real 1x1 transparent PNG used on the Python side, decoded from
  // base64 - small enough to keep this lesson self-contained.
  const samplePngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const sampleImageData = new Uint8Array(Buffer.from(samplePngB64, "base64"));

  const report = await analyzeVisualDefect(
    "Analyze this system capture and report any layout or rendering issues.",
    sampleImageData,
    "image/png",
  );

  console.log("\n=== Visual Diagnostic Report ===");
  console.log(`Components Detected: ${JSON.stringify(report.detectedComponents)}`);
  console.log(`Identified Defect: ${report.identifiedDefect}`);
  console.log(`Recommended Fix: ${report.recommendedFix}`);
  console.log(`Confidence: ${(report.confidenceScore * 100).toFixed(1)}%`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
