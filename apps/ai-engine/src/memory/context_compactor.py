"""Hierarchical memory compaction for long agent conversations - Day 42.

As an agent's conversation history grows, passing the entire raw message
list into every prompt raises latency, cost, and attention degradation.
This compacts older turns into a structured digest once a threshold is
reached, while keeping the most recent turns verbatim - so active intent
is never lost even as history compresses.
"""

import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class CompactedMemorySummary(BaseModel):
    key_decisions: list[str] = Field(description="Architecture choices or commitments made.")
    active_constraints: list[str] = Field(description="Active technical constraints (e.g. framework, ports, DB).")
    condensed_narrative: str = Field(description="Ultra-concise summary of historical discussion.")


class ChatTurn(BaseModel):
    role: str
    content: str


compactor_agent = Agent(
    "openai:gpt-4o-mini",
    output_type=CompactedMemorySummary,
    system_prompt=(
        "We are a principal systems context engineer. "
        "Summarize conversation history into structured key decisions, constraints, "
        "and an ultra-dense narrative. Discard conversational filler."
    ),
)


class CompactableSessionMemory:
    def __init__(self, compaction_threshold: int = 6):
        self.history: list[ChatTurn] = []
        self.compaction_threshold = compaction_threshold
        self.active_summary: str = "Initial session state."

    def add_message(self, role: str, content: str) -> None:
        self.history.append(ChatTurn(role=role, content=content))

    async def get_effective_prompt_context(self) -> str:
        """Returns compacted summary + recent turns to keep prompt token size minimal."""
        if len(self.history) >= self.compaction_threshold:
            print(f"\n[COMPACTION TRIGGERED] Turn count ({len(self.history)}) reached threshold ({self.compaction_threshold}).")

            # Compact older turns, preserve the last 2 turns verbatim so
            # active intent is never lost even as history compresses.
            turns_to_compact = self.history[:-2]
            recent_turns = self.history[-2:]

            raw_text = "\n".join(f"{t.role}: {t.content}" for t in turns_to_compact)

            compaction_run = await compactor_agent.run(
                f"Previous Context Digest: {self.active_summary}\n\nNew Messages to Compact:\n{raw_text}"
            )
            data: CompactedMemorySummary = compaction_run.output

            self.active_summary = (
                f"Narrative: {data.condensed_narrative} | "
                f"Decisions: {'; '.join(data.key_decisions)} | "
                f"Constraints: {'; '.join(data.active_constraints)}"
            )
            self.history = recent_turns
            print(f" [COMPACTED CONTEXT] New digest length: {len(self.active_summary)} chars")

        recent_context = "\n".join(f"{t.role}: {t.content}" for t in self.history)
        return f"=== HISTORICAL DIGEST ===\n{self.active_summary}\n\n=== RECENT DIALOGUE ===\n{recent_context}"


async def main() -> None:
    session = CompactableSessionMemory(compaction_threshold=4)

    turns = [
        ("user", "We are building the Sovereign Intelligence Hub on cloud container infrastructure."),
        ("assistant", "Configured the deployment scripts for container orchestration."),
        ("user", "We decided to enforce Pydantic AI for type safety and FastMCP for tools."),
        ("assistant", "Updated schemas to enforce BaseModel output validation."),
        ("user", "Ensure all database connections go to Qdrant on port 6333."),
        ("assistant", "Configured Qdrant hybrid retrieval client on port 6333."),
    ]

    for role, text in turns:
        session.add_message(role, text)

    effective_context = await session.get_effective_prompt_context()
    print("\n=== Effective Context Injected into Next LLM Call ===")
    print(effective_context)

    # Real proof the compaction actually shrank the raw history, not just
    # that a summary string was produced: compare raw turn count before
    # vs. after, and the actual character count of what would be sent.
    raw_char_count = sum(len(text) for _, text in turns)
    compacted_char_count = len(session.active_summary) + sum(len(t.content) for t in session.history)
    print(f"\nRaw history turns: {len(turns)} | Post-compaction turns kept verbatim: {len(session.history)}")
    print(f"Raw content chars: {raw_char_count} | Compacted content chars: {compacted_char_count}")


if __name__ == "__main__":
    asyncio.run(main())
