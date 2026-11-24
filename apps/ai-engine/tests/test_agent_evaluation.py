from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric, GEval
from deepeval.test_case import LLMTestCase, SingleTurnParams
from deepeval.test_case.llm_test_case import RetrievedContextData

# A custom G-Eval metric ("LLM-as-a-judge"): rather than checking for an
# exact string match (useless against a model that phrases the same correct
# idea differently every run), a SECOND AI call reads the input and the
# actual output and scores how well the output satisfies a plain-English
# criterion. This is Day 9's Worker/Auditor pattern, applied to grading
# test results instead of grading generated code.
architecture_quality_metric = GEval(
    name="Architectural Rigor",
    criteria="Determine whether the answer recommends type-safe, production-ready engineering patterns.",
    evaluation_params=[
        SingleTurnParams.INPUT,
        SingleTurnParams.ACTUAL_OUTPUT,
    ],
    threshold=0.7,  # See the note on judge score variance in the Day 10 doc before raising this
)

# Two built-in RAG-specific metrics: Faithfulness checks the output doesn't
# contradict or invent facts beyond what was actually retrieved.
# AnswerRelevancy checks the output actually addresses what was asked,
# rather than being accurate but beside the point.
faithfulness_metric = FaithfulnessMetric(threshold=0.8)
relevancy_metric = AnswerRelevancyMetric(threshold=0.8)


# A normal pytest test function - deepeval's assert_test integrates
# directly with pytest, so this test can sit in the same test suite as any
# other unit test, and a CI pipeline that already runs `pytest` picks this
# up with no special configuration.
def test_sovereign_agent_output_quality():
    input_prompt = "How should we design type-safe agents in our Sovereign Intelligence Hub?"

    # The facts our RAG pipeline (Day 4) would have actually retrieved for
    # this question - simulated here so this test doesn't depend on a real
    # AI call or a real vector index just to check the SCORING logic works.
    retrieved_context: list[str | RetrievedContextData] = [
        "Pydantic AI provides strict schema enforcement using Pydantic models to parse output data.",
        "Agent dependencies are injected dynamically via RunContext without global variable state.",
    ]

    # The answer we're checking - standing in for whatever our real agent
    # pipeline actually produced for this same question.
    actual_agent_output = (
        "We design type-safe agents by defining explicit Pydantic response models and "
        "passing them into Pydantic AI. Dynamic state is passed using RunContext instead of global state."
    )

    test_case = LLMTestCase(
        input=input_prompt,
        actual_output=actual_agent_output,
        retrieval_context=retrieved_context,
    )

    # assert_test runs every metric against the same test case and fails
    # the test (like any pytest assertion) if ANY metric's score falls
    # below its own threshold - this is what turns "does the output sound
    # reasonable" into an actual pass/fail CI gate.
    assert_test(
        test_case=test_case,
        metrics=[
            faithfulness_metric,
            relevancy_metric,
            architecture_quality_metric,
        ],
    )
