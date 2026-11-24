from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()

app = FastAPI(title="Sovereign Intelligence Hub API")


class AgentQueryRequest(BaseModel):
    prompt: str


class AgentQueryResponse(BaseModel):
    status: str
    result: str


# A minimal agent wired directly into a FastAPI endpoint - this is the
# same shape as Day 1's market_analyst, just exposed over HTTP instead of
# run as a standalone script, so a containerized frontend (Day 3's Next.js
# app) can call it as a real network service instead of a local process.
fastapi_agent = Agent("openai:gpt-4o-mini", system_prompt="We are an enterprise AI microservice.")


@app.get("/health")
def health_check() -> dict:
    return {"status": "HEALTHY", "service": "ai-engine"}


@app.post("/api/v1/agent/run", response_model=AgentQueryResponse)
async def run_agent(payload: AgentQueryRequest) -> AgentQueryResponse:
    res = await fastapi_agent.run(payload.prompt)
    return AgentQueryResponse(status="SUCCESS", result=str(res.output))
