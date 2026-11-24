"""Request-scoped degradation visibility - Day 62.

Goal: keep service responses available while recording exactly which runtime
components degraded during a request.
"""

from dataclasses import dataclass, field
from enum import Enum
from time import perf_counter


class DegradationSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class DegradationEvent:
    component: str
    reason: str
    severity: DegradationSeverity
    fallback_used: str


@dataclass
class RequestTrace:
    request_id: str
    degraded: bool = False
    events: list[DegradationEvent] = field(default_factory=list)

    def record(
        self,
        component: str,
        reason: str,
        severity: DegradationSeverity,
        fallback_used: str,
    ) -> None:
        self.degraded = True
        self.events.append(
            DegradationEvent(
                component=component,
                reason=reason,
                severity=severity,
                fallback_used=fallback_used,
            )
        )


@dataclass(frozen=True)
class RequestOutcome:
    request_id: str
    reply: str
    degraded: bool
    events: tuple[DegradationEvent, ...]
    elapsed_ms: int


class ClassifierTimeout(Exception):
    pass


class RetrievalUnavailable(Exception):
    pass


def classify_intent(question: str) -> str:
    if "simulate" in question.lower():
        raise ClassifierTimeout("classifier timed out at 300ms budget")
    return "faq"


def retrieve_context(question: str) -> str:
    if "fscs" in question.lower():
        raise RetrievalUnavailable("policy index temporarily unavailable")
    return "retrieval context: general docs"


def handle_request(request_id: str, question: str) -> RequestOutcome:
    started = perf_counter()
    trace = RequestTrace(request_id=request_id)

    try:
        intent = classify_intent(question)
    except ClassifierTimeout as error:
        trace.record(
            component="intent_classifier",
            reason=str(error),
            severity=DegradationSeverity.MEDIUM,
            fallback_used="rule_based_intent=faq",
        )
        intent = "faq"

    context = ""
    if intent == "faq":
        try:
            context = retrieve_context(question)
        except RetrievalUnavailable as error:
            trace.record(
                component="retrieval",
                reason=str(error),
                severity=DegradationSeverity.HIGH,
                fallback_used="safe_no_context_answer",
            )
            context = ""

    if context:
        reply = "Answer from docs with evidence citations."
    else:
        reply = "Safe fallback: I can answer the policy basics, but I cannot confirm current evidence right now."

    elapsed_ms = int((perf_counter() - started) * 1000)
    return RequestOutcome(
        request_id=request_id,
        reply=reply,
        degraded=trace.degraded,
        events=tuple(trace.events),
        elapsed_ms=elapsed_ms,
    )


def main() -> None:
    print("--- Test 1: Healthy path stays non-degraded ---")
    t1 = handle_request("r-1001", "What is a notice account?")
    print(f"Result: degraded={t1.degraded}, events={len(t1.events)}, reply={t1.reply}")
    assert not t1.degraded and len(t1.events) == 0
    print("[VERIFIED] Healthy path produced no degradation events.")

    print("\n--- Test 2: Classifier timeout records degradation and fallback ---")
    t2 = handle_request("r-1002", "Simulate my savings plan over 12 months")
    print(f"Result: degraded={t2.degraded}, events={len(t2.events)}, reply={t2.reply}")
    assert t2.degraded and len(t2.events) == 1
    assert t2.events[0].component == "intent_classifier"
    print(
        "[VERIFIED] Timeout was captured with fallback metadata "
        f"({t2.events[0].fallback_used})."
    )

    print("\n--- Test 3: Retrieval outage records high-severity degradation ---")
    t3 = handle_request("r-1003", "What does FSCS cover for cash savings?")
    print(f"Result: degraded={t3.degraded}, events={len(t3.events)}, reply={t3.reply}")
    assert t3.degraded and len(t3.events) == 1
    assert t3.events[0].component == "retrieval"
    assert t3.events[0].severity == DegradationSeverity.HIGH
    print(
        "[VERIFIED] Retrieval outage was recorded as high-severity with "
        f"fallback={t3.events[0].fallback_used}."
    )

    print("\n--- Test 4: Dual failures preserve both events in one request trace ---")
    t4 = handle_request("r-1004", "Simulate FSCS coverage for my account")
    print(f"Result: degraded={t4.degraded}, events={len(t4.events)}, reply={t4.reply}")
    assert t4.degraded and len(t4.events) == 2
    assert {event.component for event in t4.events} == {"intent_classifier", "retrieval"}
    print("[VERIFIED] Multiple degradations were captured in one request-scoped trace.")


if __name__ == "__main__":
    main()
