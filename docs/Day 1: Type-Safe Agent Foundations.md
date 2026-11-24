This is Day 1 of our **Enterprise Sovereign Intelligence Hub** build: teaching an AI to always answer in a fixed, checkable shape instead of loose sentences.

---

## Pydantic AI — Day 1: Type-Safe Agent Foundations

### The Problem We're Solving

Ask an AI a question and it writes back a paragraph. That's fine for a chat window, but useless the moment another piece of code needs to actually use the answer — say, pull out just the skill name and a 1-10 score. Without a fixed shape to expect, you're stuck either picking through the sentence by hand or hoping the AI happened to write something a computer can read this time. When it doesn't, the mistake shows up far away and later, not at the moment the AI actually got it wrong.

The fix is to tell the AI up front exactly what shape its answer must take — which pieces of information, and what kind each one is — and have a tool check every answer against that shape before your code ever sees it. If the AI's first attempt doesn't fit, the tool makes it try again automatically. That's what we're building today: a small AI helper that always hands back a skill name, a demand score, and a one-line reason — nothing else, no exceptions.

### Step 1: Create the Agent Source File

Inside your VS Code editor, navigate to the folder structure we just generated and create a new file named:
`apps/ai-engine/src/agents/market_analyst.py`

### Step 2: Add the Source Code

Paste the following complete implementation into your file. Notice how we spell out exactly what the AI's answer must look like, so the answer we get back is always trustworthy enough for other code to use directly:

```python
# Brings in a helper that can read secret settings (like API keys) from a hidden .env file.
from dotenv import load_dotenv

# Brings in the tools for defining a strict data shape with described fields.
from pydantic import BaseModel, Field

# Brings in the library that lets an AI model be wrapped with rules about what it's allowed to reply with.
from pydantic_ai import Agent

# Actually reads that hidden .env file now, so the API key inside it becomes available to the program.
load_dotenv()


# Defines the exact shape the AI's answer must fit into: a skill name, a number 1-10 showing demand,
# and a one-sentence reason — with each field's meaning spelled out for the AI.
class MarketInsight(BaseModel):
    skill_name: str = Field(
        description="The exact name of the technical skill identified."
    )
    demand_frequency: int = Field(
        description="Frequency level found in text from 1 (low) to 10 (high)."
    )
    justification: str = Field(
        description="A single clear sentence explaining why this skill is needed."
    )


# Sets up the AI itself: which model to use, forces every reply into the fixed shape from above,
# and gives it a role — "act like a senior engineer analyzing job requirements".
market_agent = Agent(
    "openai:gpt-4o",
    output_type=MarketInsight,
    system_prompt=(
        "We are a principal AI systems engineer. "
        "Our job is to analyze text and extract technical requirements cleanly."
    ),
)


# Starts the test function, with a made-up job description fed in as the input to try it out on.
async def run_analysis():
    sample_job = (
        "Looking for an engineer to build production RAG systems. "
        "Must be highly proficient in Pydantic AI to build type-safe agent graphs "
        "and handle complex schema validation across backend microservices."
    )

    # Prints a message so you can see it's about to contact the AI, then sends the job description
    # and waits for its structured answer.
    print("Sending text to agent...")
    result = await market_agent.run(sample_job)

    # Grabs the AI's already-checked, properly-shaped answer out of the response.
    data: MarketInsight = result.output
    # Prints out each piece of that answer nicely.
    print("\n--- Validated Agent Output Received ---")
    print(f"Skill: {data.skill_name}")
    print(f"Frequency Score: {data.demand_frequency}/10")
    print(f"Justification: {data.justification}")


# Makes sure this whole test only runs when you execute this file directly, then kicks it off.
if __name__ == "__main__":
    import asyncio

    asyncio.run(run_analysis())
```

### Step 3: Run the Verification Test

Make sure your virtual environment (the isolated folder holding this project's Python packages) is still switched on in your terminal — you'll see `(.venv)` at the start of the prompt line. Install the exact package versions we've already tested, then run the script:

```bash
pip install -r requirements.txt
python src/agents/market_analyst.py
```

*(Note: Make sure you've added your real API key to your `apps/ai-engine/.env` file — the hidden settings file mentioned in our environment setup document — before running. The filename must be exactly `.env`. A stray leading space (e.g. `" .env"`) creates a different, invisible file, and the program won't tell you it couldn't find your key — it will just silently act as if the file doesn't exist.)*

*(Note: If your company routes internet traffic through a security proxy that inspects encrypted connections (a common setup on company laptops) and you're on WSL — Windows' Linux compatibility layer — the AI call will fail with a certificate error, even with a correct API key and even after installing the fix below. That's because the fix only helps once your computer's own trusted-certificate list has the complete chain of trust — and on WSL it's common for only half of that chain to be installed. WSL keeps its own separate list of trusted certificates; it doesn't automatically use the one Windows already trusts.*

*Check first — see which half of the chain is missing:*

```bash
openssl x509 -in /usr/local/share/ca-certificates/proxy-intermediate-ca.crt -noout -subject -issuer
```

*If the two lines printed are different, the second line names the certificate you're missing. Get that certificate from your Windows side, which already trusts it — open PowerShell (Windows' command tool) and run:*

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*<your proxy's name>*" } | Format-List Subject, Issuer, Thumbprint
```

*Find the entry where the two lines are identical (that's the top-level certificate, not the half-way one), then save it to a file:*

```powershell
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq "<paste the thumbprint here>" }
$pem = @(
    '-----BEGIN CERTIFICATE-----'
    [System.Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks)
    '-----END CERTIFICATE-----'
) -join "`n"
Set-Content -Path "$env:USERPROFILE\proxy-root.pem" -Value $pem
```

*Then, back in WSL, add that file to the trusted list and check it worked:*

```bash
sudo cp /mnt/c/Users/<YourWindowsUsername>/proxy-root.pem /usr/local/share/ca-certificates/proxy-root-ca.crt
sudo update-ca-certificates
openssl verify -CApath /etc/ssl/certs /usr/local/share/ca-certificates/proxy-intermediate-ca.crt
```

*That last line should print `... OK`. Once it does, the certificate chain is complete and the fix below will actually work.*

*If your Windows side also has no top-level certificate for your proxy (only the half-way one), this can't be fixed from your own machine — it means the device's setup is missing a piece. Ask whoever manages the device for the top-level certificate specifically, not the half-way one.)*

*(Note: even with your computer's trusted list complete, Python keeps its own separate, fixed list and won't automatically look at your computer's list. Fix that once per project with:*

```bash
pip install pip-system-certs
```

*This makes Python check your computer's trusted list instead of its own fixed one, so it sees the same certificate your browser and other tools already trust.)*

---

## Best Practices

- **Never trust a loose sentence from an AI for anything a program will read.** Always spell out the exact shape you expect first, and let a tool check every answer against it, retrying automatically — don't try to hand-pick pieces out of AI-written prose yourself.
- **Write field descriptions for the AI, not just for future readers of the code.** Those description lines are sent to the AI as part of its instructions — it actually reads them, they're not just comments for humans.
- **Lock in the exact working versions of your packages once things work.** The libraries in this space change fast — the two renamed pieces we hit here (`result_type`→`output_type`, `result.data`→`result.output`) are proof — and a locked, tested list of versions is what stops a fresh setup from hitting the same wall blind.
- **Check that your secrets file is actually being read before blaming the AI call.** A misnamed or misplaced settings file (like our `" .env"` vs `.env` mistake) fails silently — the loading step won't complain if it finds nothing.

## Why This Implementation Matters in Production

Instead of picking through unpredictable sentences by hand, this approach makes the AI's own reply loop do the checking for us — it guarantees the answer matches our expected shape exactly, and if the AI's first attempt doesn't fit, it tries again automatically, with no extra code from us.

To see how the Vercel AI SDK version of this same idea works, see the [TypeScript port of this lesson](Day%201%20%28TS%20Port%29%3A%20Vercel%20AI%20SDK%20Type-Safe%20Agent%20Foundations.md).
