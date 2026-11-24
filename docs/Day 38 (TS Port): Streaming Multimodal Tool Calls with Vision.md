Day 38's TypeScript port builds the same vision pipeline with the Vercel AI SDK's native image content parts, fixes a real API deprecation, and then finds something genuinely more concerning: the model hallucinates confidently and inconsistently on the exact same blank test image across repeated runs.

---

## Multimodal Agents — Day 38 (TS Port): Streaming Multimodal Tool Calls with Vision

### The Problem We're Solving

Same problem as the Python lesson: a screenshot of broken UI or an error message is genuinely visual information, and an agent needs to reason about the image directly rather than requiring a text description first.

Focus: the same raw-bytes-in, structured-diagnosis-out pipeline, built with the Vercel AI SDK's native multimodal message content
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the diagnosis output shape (`class VisualDiagnostics(BaseModel)`) | the diagnosis output shape (`const VisualDiagnosticsSchema = z.object({...})`) |
| wrapping raw bytes for vision input (`BinaryContent(data=image_bytes, media_type=mime_type)`) | wrapping raw bytes for vision input (`{ type: "file", data: imageBytes, mediaType: mimeType }`) |
| passing text + image together (`multimodal_agent.run([prompt, binary_attachment])`) | passing text + image together (a `messages` array with a `content` list of `text` and `file` parts) |
| running the agent (`await multimodal_agent.run(...)`) | running the agent (`await generateObject({ model, schema, messages })`) |

### Step 1: A Real API Drift Found on First Run

Using the SDK's `{ type: "image", image: imageBytes, mediaType }` content part runs, but prints a real deprecation warning:

```
DeprecationWarning: AI SDK Warning: Deprecated: ""image" content part". The "image" content part type is deprecated. Use a "file" part with mediaType: 'image' (or a more specific image/* subtype) instead.
```

Fixed by switching to the current `{ type: "file", data: imageBytes, mediaType }` shape.

### Step 2: A Genuinely More Concerning Finding - the Model Hallucinates Differently Every Run, With Consistently High Confidence

Running the SAME test (the exact same blank 1x1 transparent PNG, same prompt) five separate times produced five DIFFERENT, often confidently-fabricated diagnoses:

```
Run 1: Components: [] | "The screenshot is completely black, indicating a rendering issue" | Confidence: 100.0%
Run 2: Components: ["EmptyFrame","NoContent"] | "entirely black or blank... no content is being displayed" | Confidence: 95.0%
Run 3: Components: ["System Error Message","Black Screen","Terminal View"] | "shows a kernel panic or critical error message related to a USB device" | Confidence: 95.0%
Run 4: Components: ["Grid layout","Multiple buttons/icons","Sidebar or menu"] | "distorted or overlapping elements... at the bottom" | Confidence: 85.0%
Run 5: Components: ["Button","Navbar","Input Field","Icon"] | "The button text is misaligned, appearing too far to the right" | Confidence: 95.0%
```

Run 3 and Run 5 are outright fabrications - there is no "kernel panic," no "Terminal View," no "Button," no "Navbar" anywhere in a 1x1 fully transparent pixel. And critically, **the confidence score stayed just as high (85-95%) on the fabricated runs as on the correct ones** - nothing in the model's own reported confidence distinguishes a genuinely correct diagnosis from a confidently invented one.

`tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **Never trust a single vision-model run's confidence score as evidence of correctness - it does not correlate with actual accuracy in this test.** A 95% confidence appeared on both a correct "the image is blank" diagnosis AND a fabricated "kernel panic" diagnosis of the exact same input.
- **Test a vision agent against a known ground-truth image MULTIPLE times, not once, before drawing any conclusion about its reliability.** A single successful run (as documented on the Python side, which happened to get a correct answer) would have completely missed this - only repeating the exact same test exposed the real instability.
- **For a production visual-diagnostic feature, this finding argues for a second verification pass or a stricter minimum-detail threshold before acting on a vision agent's output**, not just reading its self-reported confidence number at face value.

## Why This Port Matters in Production

The Python lesson's single run happened to get a correct, sensible answer - but repeating the identical test on the TS side exposed that this specific test image (an edge case: a fully blank/transparent 1x1 pixel) triggers genuine, confidently-stated hallucination in the underlying vision model roughly as often as it triggers a correct diagnosis. This is exactly the kind of finding that a single "it worked, ship it" run would hide, and exactly why the repeated-run discipline established back in Day 10 (and reused for LLM judges in Day 19) matters just as much for vision output as it does for text.
