import asyncio

from dotenv import load_dotenv
from pydantic_ai import Agent

load_dotenv()


# Sets up the same kind of AI as Day 1, but this time we won't wait for its
# whole answer before doing anything with it — we'll read it piece by piece.
market_agent = Agent(
    "openai:gpt-4o",
    system_prompt=(
        "We are an enterprise AI assistant for the Sovereign Intelligence Hub. "
        "We provide concise, highly technical responses for software engineering teams."
    ),
)


# Starts the test: asks the AI a question, then prints its answer live as it's
# written, instead of waiting for the whole reply and printing it all at once.
async def run_streaming_chat():
    prompt = "In one sentence, why is streaming a better experience than waiting for a full reply?"

    print("Streaming response from hub...\n")

    # run_stream opens a live connection to the AI instead of waiting for its
    # full answer. stream_text() then hands back each new piece of text as
    # the AI writes it, so we can print it immediately — the same effect
    # Day 3's web chat page gets from useChat, just printed to a terminal
    # instead of drawn on a web page.
    async with market_agent.run_stream(prompt) as response:
        async for chunk in response.stream_text(delta=True):
            print(chunk, end="", flush=True)

    print("\n\n--- Streaming Complete ---")


if __name__ == "__main__":
    asyncio.run(run_streaming_chat())
