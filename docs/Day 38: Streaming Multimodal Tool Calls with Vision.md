Day 38 gives an agent the ability to look at an actual image - a screenshot, an error dialog, an architecture diagram - and return a structured, typed diagnosis, no separate OCR step needed.

---

## Multimodal Agents — Day 38: Streaming Multimodal Tool Calls with Vision

### The Problem We're Solving

Users frequently attach screenshots of broken UI, error messages, or architecture diagrams - information that's genuinely visual, not something that reduces cleanly to text first. A multimodal agent takes the raw image bytes directly as part of its input, alongside a text prompt, and returns a structured diagnosis - no separate OCR/description step needed before the model can reason about it.

Focus: sending raw image bytes into a vision-capable agent and getting back a typed, structured diagnosis
Time investment: 15 minutes

### Step 1: Build the Vision Agent

`apps/ai-engine/src/agents/multimodal_vision_agent.py` wraps raw image bytes in Pydantic AI's `BinaryContent` and passes it alongside the text prompt in the same message list:

```python
async def analyze_visual_defect(prompt: str, image_bytes: bytes, mime_type: str = "image/png") -> VisualDiagnostics:
    binary_attachment = BinaryContent(data=image_bytes, media_type=mime_type)
    result = await multimodal_agent.run([prompt, binary_attachment])
    return result.output
```

### Step 2: Run and Verify

Tested against a real, genuinely blank 1x1 transparent PNG (small enough to embed directly as base64 in the lesson, no binary asset file needed):

```
Processing visual diagnostic request: 'Analyze this system capture and report any layout or rendering issues.'...

=== Visual Diagnostic Report ===
Components Detected: []
Identified Defect: The image is completely black or blank, indicating that there may be a rendering problem or the file did not capture correctly.
Recommended Fix: Ensure that the graphics rendering pipeline is properly configured and that the image capture source is functional. Verify that the display drivers are up to date and check if there are any issues with the display settings or capture software.
Confidence: 95.0%
```

Real, correct diagnosis: GPT-4o's vision correctly identified the image as blank and gave a sensible fix. See the TS Port doc for a genuinely different (and more concerning) finding on the same test image via a different SDK code path.

---

## Best Practices

- **Test a vision agent against a KNOWN, verifiable image** (a blank 1x1 pixel here) so the correctness of the diagnosis can actually be checked - testing against a real screenshot of unknown ground truth would make it impossible to tell whether a wrong-sounding diagnosis is really wrong.
- **Pass the image as raw bytes in the same message list as the text prompt, not as a separate pre-processing step.** `BinaryContent` lets the model reason about the text prompt and the image together in one call, rather than describing the image in text first and losing whatever detail that description drops.
- **Run a vision check more than once before trusting a single confident-sounding answer.** See the TS Port doc for exactly why this matters here specifically.

## Why This Matters in Production

Screenshots of broken UI or system errors are some of the highest-value support inputs a user can provide - but only if the agent can actually reason about the image content directly rather than requiring a human to describe it in words first, which defeats the purpose of letting the user just paste a screenshot.
