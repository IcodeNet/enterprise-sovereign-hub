This is Day 3's Python side: the same idea as the web chat page — showing an AI's answer as it's written instead of waiting for the whole thing — but as a script you run in a terminal.

---

## Pydantic AI — Day 3: Streaming a Reply as It's Written

### The Problem We're Solving

Days 1 and 2 waited for the AI's entire answer before printing anything. That's fine for a short structured reply, but a real conversational answer can take several seconds to fully write — and during all of that time, the program looks frozen, with nothing on screen to show it's actually working.

The fix is the same one the web version (Day 3's TypeScript lesson) uses: instead of asking the AI to hand back one finished block of text, we open a live connection and read its answer piece by piece as it's written, printing each piece the moment it arrives.

Focus: reading an AI's reply as a live stream of pieces instead of one finished block
Time investment: 15 minutes

Pydantic AI's version of this is `agent.run_stream()`, paired with a method called `stream_text()` that hands back new pieces of the answer as they arrive.

### Step 1: Create the Source File

Inside `apps/ai-engine/src/agents/`, create:
`streaming_chat.py`

### Step 2: Add the Source Code

```python
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
```

*(Note: `stream_text()` has a `delta` setting that isn't obvious from its name, but matters a lot. Leaving it at its default (`delta=False`) makes each piece you receive be the whole answer-so-far, not just the newest bit — so printing every piece as it arrives reprints the whole growing answer over and over, showing up as visibly duplicated, overlapping text. Passing `delta=True` fixes this by handing back only the newest bit each time, exactly like Day 3's web version, where each streamed piece is genuinely new text, not a repeat of everything so far.)*

### Step 3: Run and Verify

Make sure your virtual environment is switched on (`(.venv)` at the start of your terminal prompt), then run:

```bash
python src/agents/streaming_chat.py
```

You should see the answer appear on screen gradually, not all at once — though in a fast terminal, a short answer may finish streaming almost instantly.

---

## Best Practices

- **Check whether a streaming method gives you the whole-answer-so-far or just the newest piece, and pick the one that matches what you're doing with it.** Printing "answer so far" repeatedly instead of "just the new bit" is an easy, hard-to-notice mistake that shows up as duplicated or overlapping text rather than a clean crash.
- **Always run a streaming demo for real and watch the actual output, not just check that it runs without an error.** The bug above produced no error at all — the code "worked," it just printed something visibly wrong that only became obvious by actually reading the output.
- **Use `async with` around a streaming response, not a plain call.** The connection needs to be properly opened and closed around the whole time you're reading pieces from it, which is exactly what the `async with` block guarantees.

## Why This Matters in Production

The same "let the AI answer show up live, piece by piece" idea now works identically on both sides of our project: a real web page (Day 3's TypeScript lesson) and a terminal script (this one). Whichever side of the stack a feature needs to live on, we're not choosing between "instant feedback" and "simple code" — the streaming pattern gives us both.
