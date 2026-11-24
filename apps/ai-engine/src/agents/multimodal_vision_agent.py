"""Multimodal vision agent for visual defect diagnosis - Day 38.

Users frequently attach screenshots of broken UI, error dialogs, or
architecture diagrams. A multimodal agent takes an image directly (as raw
bytes, no separate OCR step) and returns a structured, typed diagnosis.
"""

import asyncio
import base64

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent

load_dotenv()


class VisualDiagnostics(BaseModel):
    detected_components: list[str] = Field(description="UI or system components recognized in image.")
    identified_defect: str | None = Field(description="Description of any error, bug, or layout anomaly.")
    recommended_fix: str = Field(description="Direct technical instruction to remediate the defect.")
    confidence_score: float = Field(description="Confidence rating between 0.0 and 1.0.")


multimodal_agent = Agent(
    "openai:gpt-4o",
    output_type=VisualDiagnostics,
    system_prompt=(
        "We are an expert visual software diagnostic engineer. "
        "Inspect screenshots of error messages, UI layouts, or architecture diagrams. "
        "Provide direct, type-safe diagnostic assessments with actionable fixes."
    ),
)


async def analyze_visual_defect(prompt: str, image_bytes: bytes, mime_type: str = "image/png") -> VisualDiagnostics:
    print(f"\nProcessing visual diagnostic request: '{prompt}'...")

    # Wrap raw bytes in Pydantic AI's BinaryContent for vision processing -
    # no separate upload step or URL needed, the bytes go straight into the
    # same message list as the text prompt.
    binary_attachment = BinaryContent(data=image_bytes, media_type=mime_type)

    result = await multimodal_agent.run([prompt, binary_attachment])
    diagnostics: VisualDiagnostics = result.output
    return diagnostics


if __name__ == "__main__":
    # A real 1x1 transparent PNG, decoded from base64 - small enough to keep
    # this lesson self-contained without shipping a binary asset file.
    sample_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    sample_image_data = base64.b64decode(sample_png_b64)

    async def main() -> None:
        report = await analyze_visual_defect(
            prompt="Analyze this system capture and report any layout or rendering issues.",
            image_bytes=sample_image_data,
            mime_type="image/png",
        )
        print("\n=== Visual Diagnostic Report ===")
        print(f"Components Detected: {report.detected_components}")
        print(f"Identified Defect: {report.identified_defect}")
        print(f"Recommended Fix: {report.recommended_fix}")
        print(f"Confidence: {report.confidence_score * 100:.1f}%")

    asyncio.run(main())
