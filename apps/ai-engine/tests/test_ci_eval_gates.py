"""CI/CD regression gate suite - Day 25.

Runs a small, fixed benchmark dataset through DeepEval's metrics on every
push/PR so a prompt or model change that quietly degrades answer quality is
caught in CI before merge, not discovered later by a user.
"""

import pytest
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, GEval, HallucinationMetric
from deepeval.test_case import LLMTestCase, SingleTurnParams

enterprise_standard_metric = GEval(
    name="Enterprise Architecture Quality",
    criteria=(
        "Assess whether the response gives a technically accurate, specific answer "
        "that correctly explains the relevant architecture or implementation pattern, "
        "grounded in the provided context, without vague or generic filler."
    ),
    evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    threshold=0.5,
)

relevancy_metric = AnswerRelevancyMetric(threshold=0.5)
hallucination_metric = HallucinationMetric(threshold=0.5)

BENCHMARK_DATASET = [
    {
        "input": "How do we pass runtime database dependencies to Pydantic AI agents?",
        "actual_output": (
            "We use the deps_type parameter on the Agent and access dependencies "
            "dynamically inside tools using RunContext[DatabaseDeps] without global state."
        ),
        "context": [
            "Pydantic AI allows dependency injection via deps_type and RunContext.",
            "Global variables should be avoided in production agent services.",
        ],
    },
    {
        "input": "How does our hybrid vector search merge BM25 and semantic embeddings?",
        "actual_output": (
            "Our hybrid search engine queries Qdrant using dense OpenAI embeddings "
            "alongside sparse BM25 token vectors, combining them via Reciprocal Rank "
            "Fusion (RRF)."
        ),
        "context": [
            "Qdrant supports dense and sparse vectors simultaneously.",
            "Reciprocal Rank Fusion merges rankings from multiple retrieval algorithms.",
        ],
    },
]


@pytest.mark.parametrize("item", BENCHMARK_DATASET)
def test_production_agent_regression_gate(item: dict) -> None:
    test_case = LLMTestCase(
        input=item["input"],
        actual_output=item["actual_output"],
        context=item["context"],
    )
    assert_test(
        test_case=test_case,
        metrics=[relevancy_metric, hallucination_metric, enterprise_standard_metric],
    )
