#!/usr/bin/env python3
"""Check lesson/doc/book artifact integrity.

This script is a fast content gate for CI.
It validates:
- Day docs are contiguous (1..max) and each TS doc has a base Day doc.
- Book part lesson tags are mirrored in the compiled book.
- Compiled book lesson tags cover the same set as base Day docs.
- Internal anchor links in the compiled book resolve.
- README day-count claims match the actual max day number.
- No term from the owner's private blocked-terms list appears in repo files.
- Placeholder/generic filenames are not present.
- Reader-facing docs do not contain forward-looking promise wording.
- Internal-only book artifact paths are not present in the repo.
- Public docs avoid historical-state wording and stay present-tense.
"""

from __future__ import annotations

import os
import re
import sys
import time
import unicodedata
from html import unescape
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
BOOK_DIR = ROOT / "book"
PARTS_DIR = BOOK_DIR / "parts"
COMPILED_BOOK = BOOK_DIR / "building-trustworthy-ai-agents.html"
README = ROOT / "README.md"

READER_FACING_PATHS = [
    ROOT / "README.md",
    ROOT / "docs",
    ROOT / "book",
]

PUBLIC_DOC_PATHS = [
    ROOT / "README.md",
    ROOT / "docs",
    ROOT / "book",
]

PRESENT_TENSE_REALITY_PATHS = [
    ROOT / "README.md",
    ROOT / "docs",
    ROOT / "book",
]

DISALLOWED_BOOK_ARTIFACT_PATH_PATTERNS = [
    re.compile(r"^book/review(?:/|$)"),
    re.compile(r"^book/outlines(?:/|$)"),
    re.compile(r"^book/preview-logo\.html$"),
]

DAY_BASE_RE = re.compile(r"^Day (\d+): ")
DAY_TS_RE = re.compile(r"^Day (\d+) \(TS Port\): ")
LESSON_TAG_RE = re.compile(r'<span class="lesson-tag">Lesson (\d+)</span>')
HREF_ID_RE = re.compile(r'href="#([^"]+)"')
ID_ATTR_RE = re.compile(r'\sid="([^"]+)"')
README_DAY_COUNT_RE = re.compile(r"\bcurrently\s+(\d+)\s+days\b", re.IGNORECASE)
README_ALL_DAY_DOCS_RE = re.compile(r"\ball\s+(\d+)\s+day\s+docs\b", re.IGNORECASE)
IGNORED_DIR_NAMES = {
    ".git",
    "node_modules",
    ".next",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "__pycache__",
    ".venv",
}

IGNORED_FILE_NAMES = {".DS_Store"}

GENERIC_FILENAME_PATTERNS = [
    re.compile(r"^class\d+\.[^.]+$", re.IGNORECASE),
    re.compile(r"^(temp|tmp|untitled|newfile|scratch)(\.[^.]+)?$", re.IGNORECASE),
]

CURRICULUM_ORIGIN_PROVENANCE_PATTERNS = [
    re.compile(r"\bsource\s+pdf\b", re.IGNORECASE),
    re.compile(r"\bcurriculum\s+pdf\b", re.IGNORECASE),
    re.compile(r"\bsource\s+curriculum\b", re.IGNORECASE),
    re.compile(r"\bfrom\s+the\s+pdf\b", re.IGNORECASE),
    re.compile(r"\boriginal\s+day\b", re.IGNORECASE),
    re.compile(r"\brenumbered\b", re.IGNORECASE),
    re.compile(r"\bduplicate-finding\b", re.IGNORECASE),
]

FORWARD_LOOKING_PROMISE_PATTERNS = [
    re.compile(r"\bnext(?:[\W_]+)slice\b", re.IGNORECASE),
    re.compile(r"\bfuture(?:[\W_]+)state\b", re.IGNORECASE),
    re.compile(r"\bfuture(?:[\W_]+)work\b", re.IGNORECASE),
    re.compile(r"\bplanned(?:[\W_]+)for(?:[\W_]+)the(?:[\W_]+)next(?:[\W_]+)release\b", re.IGNORECASE),
    re.compile(r"\bplanned(?:[\W_]+)for(?:[\W_]+)next(?:[\W_]+)release\b", re.IGNORECASE),
    re.compile(r"\bplanned(?:[\W_]+)next\b", re.IGNORECASE),
    re.compile(r"\bwe(?:[\W_]+)plan(?:[\W_]+)to(?:[\W_]+)add\b", re.IGNORECASE),
    re.compile(r"\bwe(?:[\W_]+)will(?:[\W_]+)add\b", re.IGNORECASE),
    re.compile(r"\bwe(?:['’])ll(?:[\W_]+)add\b", re.IGNORECASE),
    re.compile(r"\bwill(?:[\W_]+)be(?:[\W_]+)added\b", re.IGNORECASE),
    re.compile(r"\bto(?:[\W_]+)be(?:[\W_]+)implemented\b", re.IGNORECASE),
    re.compile(r"\bcoming(?:[\W_]+)soon\b", re.IGNORECASE),
]

MARKDOWN_INLINE_FORMATTING_RE = re.compile(r"[`*~]+")
MARKDOWN_INLINE_LINK_RE = re.compile(r"\[([^\]]+)\]\([^\)]*\)")
MARKDOWN_REFERENCE_LINK_RE = re.compile(r"\[([^\]]+)\]\[[^\]]*\]")
MARKDOWN_BRACKET_TEXT_RE = re.compile(r"\[([^\]]+)\]")
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_COLLAPSE_RE = re.compile(r"\s+")
NON_LETTER_RE = re.compile(r"[^a-z]+")

HISTORICAL_STATE_PATTERNS = [
    re.compile(r"\bfirst\s+version\b", re.IGNORECASE),
    re.compile(r"\bpreviously\s+(?:implemented|named|called|described|documented)\b", re.IGNORECASE),
    re.compile(r"\bin\s+earlier\s+versions?\b", re.IGNORECASE),
    re.compile(r"\bin\s+prior\s+versions?\b", re.IGNORECASE),
    re.compile(r"\bused\s+to\s+(?:be|have|do|support|work|use)\b", re.IGNORECASE),
    re.compile(r"\bolder\s+names\b", re.IGNORECASE),
]

def normalize_phrase_scan_text(text: str, fail_on_budget: bool = False) -> str:
    """Normalize markdown/html wrappers so phrase scans cannot be bypassed."""
    normalized = decode_text_layers(text, fail_on_budget=fail_on_budget)
    normalized = MARKDOWN_INLINE_LINK_RE.sub(r" \1 ", normalized)
    normalized = MARKDOWN_REFERENCE_LINK_RE.sub(r" \1 ", normalized)
    normalized = MARKDOWN_BRACKET_TEXT_RE.sub(r" \1 ", normalized)
    normalized = HTML_TAG_RE.sub(" ", normalized)
    normalized = MARKDOWN_INLINE_FORMATTING_RE.sub("", normalized)
    return normalized


def canonicalize_letters(text: str) -> str:
    """Lowercase a-z only; removes wrappers/punctuation/separators."""
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return NON_LETTER_RE.sub("", normalized)


class DecodeBudgetExceeded(RuntimeError):
    """Raised when layered decoding exceeds configured budget."""


def decode_text_layers(text: str, fail_on_budget: bool = False) -> str:
    """Decode HTML entities and URL-encoding so hidden text is scan-visible."""
    decoded = text
    seen = {decoded}
    max_output_len = max(200_000, len(text) * 8)
    start = time.perf_counter()
    max_decode_seconds = 2.0

    # Decode mixed HTML-entity and URL-encoding layers until stable.
    # Safety guards: stop on cycles, unexpected expansion, oversized output,
    # or decode-time budget exhaustion on very deeply encoded large inputs.
    while True:
        if (time.perf_counter() - start) > max_decode_seconds:
            if fail_on_budget:
                raise DecodeBudgetExceeded("decode-time budget exceeded")
            break
        next_text = unescape(unquote(decoded))
        if (time.perf_counter() - start) > max_decode_seconds:
            if fail_on_budget:
                raise DecodeBudgetExceeded("decode-time budget exceeded")
            decoded = next_text
            break
        if next_text == decoded:
            break
        if next_text in seen:
            decoded = next_text
            break
        if len(next_text) > len(decoded):
            break
        if len(next_text) > max_output_len:
            break
        seen.add(next_text)
        decoded = next_text
    return decoded


def fail(errors: list[str]) -> int:
    print("artifact-check: FAILED")
    for error in errors:
        print(f"- {error}")
    return 1


def parse_day_docs() -> tuple[set[int], set[int], list[str]]:
    base_days: set[int] = set()
    ts_days: set[int] = set()
    errors: list[str] = []

    for path in DOCS_DIR.glob("Day *.md"):
        name = path.name[:-3]
        base_match = DAY_BASE_RE.match(name)
        ts_match = DAY_TS_RE.match(name)

        if base_match:
            base_days.add(int(base_match.group(1)))
        elif ts_match:
            ts_days.add(int(ts_match.group(1)))

    if not base_days:
        errors.append("No base Day docs found in docs/.")
        return base_days, ts_days, errors

    max_day = max(base_days)
    expected = set(range(1, max_day + 1))
    missing = sorted(expected - base_days)
    extra = sorted(base_days - expected)

    if missing:
        errors.append(f"Missing base Day docs for day number(s): {missing}")
    if extra:
        errors.append(f"Unexpected base Day doc numbers: {extra}")

    ts_without_base = sorted(ts_days - base_days)
    if ts_without_base:
        errors.append(f"TS Port docs without matching base Day doc: {ts_without_base}")

    return base_days, ts_days, errors


def parse_book_lessons() -> tuple[set[int], set[int], list[str]]:
    errors: list[str] = []

    if not COMPILED_BOOK.exists():
        errors.append("book/building-trustworthy-ai-agents.html is missing.")
        return set(), set(), errors

    compiled_text = COMPILED_BOOK.read_text(encoding="utf-8")
    compiled_lessons = {int(n) for n in LESSON_TAG_RE.findall(compiled_text)}

    part_lessons: set[int] = set()
    missing_parts = []
    for idx in range(1, 11):
        part = PARTS_DIR / f"part{idx}.html"
        if not part.exists():
            missing_parts.append(part.name)
            continue
        text = part.read_text(encoding="utf-8")
        part_lessons.update(int(n) for n in LESSON_TAG_RE.findall(text))

    if missing_parts:
        errors.append(f"Missing book part file(s): {missing_parts}")

    if part_lessons != compiled_lessons:
        only_parts = sorted(part_lessons - compiled_lessons)
        only_compiled = sorted(compiled_lessons - part_lessons)
        if only_parts:
            errors.append(f"Lesson tags in parts but missing in compiled book: {only_parts}")
        if only_compiled:
            errors.append(f"Lesson tags in compiled book but missing in parts: {only_compiled}")

    # Internal anchor integrity in compiled book.
    href_ids = set(HREF_ID_RE.findall(compiled_text))
    defined_ids = set(ID_ATTR_RE.findall(compiled_text))
    missing_anchors = sorted(anchor for anchor in href_ids if anchor not in defined_ids)
    if missing_anchors:
        errors.append(
            "Compiled book has href #anchor links with no matching id: "
            + ", ".join(missing_anchors[:20])
            + (" ..." if len(missing_anchors) > 20 else "")
        )

    return part_lessons, compiled_lessons, errors


def check_book_vs_docs(base_days: set[int], compiled_lessons: set[int]) -> list[str]:
    errors: list[str] = []

    if base_days != compiled_lessons:
        missing_in_book = sorted(base_days - compiled_lessons)
        missing_in_docs = sorted(compiled_lessons - base_days)
        if missing_in_book:
            errors.append(f"Base Day docs not represented in compiled book lesson tags: {missing_in_book}")
        if missing_in_docs:
            errors.append(f"Compiled book has lesson tags with no base Day doc: {missing_in_docs}")

    return errors


def check_readme_counts(max_day: int) -> list[str]:
    errors: list[str] = []
    if not README.exists():
        errors.append("README.md is missing.")
        return errors

    text = README.read_text(encoding="utf-8")
    mentions: list[tuple[str, int]] = []
    mentions.extend(("N days", int(x)) for x in README_DAY_COUNT_RE.findall(text))
    mentions.extend(("all N day docs", int(x)) for x in README_ALL_DAY_DOCS_RE.findall(text))

    bad_mentions = sorted({value for _label, value in mentions if value != max_day})
    if bad_mentions:
        errors.append(f"README day-count phrase(s) mismatch. Found {bad_mentions}, expected only {max_day}.")

    return errors


BLOCKED_TERMS_FILE_DEFAULT = Path.home() / ".config" / "portfolio-checks" / "blocked-terms.txt"


def load_blocked_terms() -> list[str] | None:
    """
    The terms are kept out of the repository on purpose: a list of words to
    avoid, committed beside the files it guards, would itself publish them.
    They come from the BLOCKED_TERMS environment variable (one per line, for
    CI from a secret) or a private file (BLOCKED_TERMS_FILE, default
    ~/.config/portfolio-checks/blocked-terms.txt). Lines starting with # are
    comments. None means no list was found.
    """
    raw = os.environ.get("BLOCKED_TERMS")
    if raw is None:
        path = Path(os.environ.get("BLOCKED_TERMS_FILE", str(BLOCKED_TERMS_FILE_DEFAULT)))
        if not path.is_file():
            return None
        raw = path.read_text(encoding="utf-8")
    terms = [line.strip() for line in raw.splitlines()]
    return [t for t in terms if t and not t.startswith("#")]


def blocked_term_matchers(terms: list[str]) -> list[tuple[re.Pattern[str], str | None]]:
    """
    Each term matches as whole words with any separator between its parts
    ("a b" also finds "a-b", "a_b", "a.b", "ab"), and, when it is long
    enough not to sit inside ordinary words, as a run of letters with every
    wrapper and separator removed.
    """
    matchers: list[tuple[re.Pattern[str], str | None]] = []
    for term in terms:
        parts = [re.escape(p) for p in re.split(r"[\W_]+", term.casefold()) if p]
        if not parts:
            continue
        pattern = re.compile(r"\b" + r"[\W_]*".join(parts) + r"\b", re.IGNORECASE)
        canonical = canonicalize_letters(term)
        matchers.append((pattern, canonical if len(canonical) >= 8 else None))
    return matchers


def check_blocked_terms() -> list[str]:
    """
    Every repo file and path against the private list, through the same
    decoding and wrapper removal as the other scans. Reports name the file
    and line only, never the term or the line's text, so the check's own
    output (CI logs included) cannot publish what it guards.
    """
    terms = load_blocked_terms()
    if terms is None:
        if os.environ.get("CI"):
            return ["Blocked-terms scan: no private term list (set the BLOCKED_TERMS secret); failing closed in CI."]
        print("artifact-check: blocked-terms scan skipped, no private term list found", file=sys.stderr)
        return []
    matchers = blocked_term_matchers(terms)
    violations: set[str] = set()

    def hit(text: str) -> bool:
        # Reversed text too: a tool demo once printed a name back to front.
        canonical = canonicalize_letters(text)
        backwards = canonical[::-1]
        return any(
            p.search(text) or p.search(text[::-1]) or (c is not None and (c in canonical or c in backwards))
            for p, c in matchers
        )

    for path in ROOT.rglob("*"):
        if path.name in IGNORED_FILE_NAMES:
            continue
        if any(part in IGNORED_DIR_NAMES for part in path.parts):
            continue
        relative_path = path.relative_to(ROOT)
        if hit(str(relative_path)):
            violations.add(f"{relative_path}: blocked term in the file path")
        if not path.is_file():
            continue
        try:
            raw = path.read_bytes()
        except OSError as exc:
            violations.add(f"{relative_path}: unreadable during blocked-terms scan ({exc.__class__.__name__})")
            continue
        text = raw.decode("utf-8", errors="ignore").replace("\x00", " ")
        for line_no, line in enumerate(text.splitlines(), start=1):
            try:
                forms = [
                    line,
                    unicodedata.normalize("NFKC", line),
                    decode_text_layers(line, fail_on_budget=True),
                    normalize_phrase_scan_text(line, fail_on_budget=True),
                ]
            except DecodeBudgetExceeded:
                violations.add(f"{relative_path}:{line_no}: decode budget exceeded (fail-closed)")
                continue
            if any(hit(form) for form in forms):
                violations.add(f"{relative_path}:{line_no}: blocked term")
        try:
            whole = WHITESPACE_COLLAPSE_RE.sub(" ", normalize_phrase_scan_text(text, fail_on_budget=True))
        except DecodeBudgetExceeded:
            violations.add(f"{relative_path}: decode budget exceeded (fail-closed)")
            continue
        if hit(whole):
            violations.add(f"{relative_path}: blocked term across lines or formatting")

    if violations:
        ordered = sorted(violations)
        suffix = " ..." if len(ordered) > 20 else ""
        return ["Blocked terms found: " + "; ".join(ordered[:20]) + suffix]
    return []


def check_filename_clarity() -> list[str]:
    errors: list[str] = []
    generic_files: list[str] = []

    for path in ROOT.rglob("*"):
        if path.name in IGNORED_FILE_NAMES:
            continue
        if any(part in IGNORED_DIR_NAMES for part in path.parts):
            continue
        if not path.is_file():
            continue

        if any(pattern.match(path.name) for pattern in GENERIC_FILENAME_PATTERNS):
            generic_files.append(str(path.relative_to(ROOT)))

    if generic_files:
        sample = ", ".join(generic_files[:20])
        suffix = " ..." if len(generic_files) > 20 else ""
        errors.append("Placeholder/generic filenames found: " + sample + suffix)

    return errors


def check_curriculum_origin_privacy() -> list[str]:
    errors: list[str] = []
    violations: list[str] = []

    for base_path in PUBLIC_DOC_PATHS:
        if not base_path.exists():
            errors.append(f"Public-doc path missing for curriculum-origin check: {base_path}")
            continue

        if base_path.is_file():
            candidate_files = [base_path]
        else:
            candidate_files = [p for p in base_path.rglob("*") if p.is_file()]

        for path in candidate_files:
            if path.name in IGNORED_FILE_NAMES:
                continue
            if any(part in IGNORED_DIR_NAMES for part in path.parts):
                continue

            relative_path = path.relative_to(ROOT)
            raw = path.read_bytes()
            text = raw.decode("utf-8", errors="ignore").replace("\x00", " ")
            try:
                normalized_text = normalize_phrase_scan_text(text, fail_on_budget=True)
            except DecodeBudgetExceeded:
                violations.append(
                    f"{relative_path}: decode-time budget exceeded during curriculum-origin scan (fail-closed)"
                )
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                try:
                    normalized_line = normalize_phrase_scan_text(line, fail_on_budget=True)
                except DecodeBudgetExceeded:
                    violations.append(
                        f"{relative_path}:{line_no}: decode-time budget exceeded during curriculum-origin scan (fail-closed)"
                    )
                    continue
                for pattern in CURRICULUM_ORIGIN_PROVENANCE_PATTERNS:
                    if pattern.search(line) or pattern.search(normalized_line):
                        violations.append(
                            f"{relative_path}:{line_no}: matches `{pattern.pattern}` -> {line.strip()}"
                        )

            for pattern in CURRICULUM_ORIGIN_PROVENANCE_PATTERNS:
                if pattern.search(normalized_text):
                    violations.append(
                        f"{relative_path}: cross-line/formatting match `{pattern.pattern}`"
                    )

    if violations:
        sample = "; ".join(violations[:20])
        suffix = " ..." if len(violations) > 20 else ""
        errors.append("Reader-facing curriculum-origin provenance references found: " + sample + suffix)

    return errors


def check_reader_facing_truthfulness_scope() -> list[str]:
    errors: list[str] = []
    violations: set[str] = set()

    for base_path in PUBLIC_DOC_PATHS:
        if not base_path.exists():
            errors.append(f"Reader-facing path missing for truthfulness check: {base_path}")
            continue

        if base_path.is_file():
            candidate_files = [base_path]
        else:
            candidate_files = [p for p in base_path.rglob("*") if p.is_file()]

        for path in candidate_files:
            if path.name in IGNORED_FILE_NAMES:
                continue
            if any(part in IGNORED_DIR_NAMES for part in path.parts):
                continue

            relative_path = path.relative_to(ROOT)
            raw = path.read_bytes()
            text = raw.decode("utf-8", errors="ignore").replace("\x00", " ")
            try:
                normalized_text = normalize_phrase_scan_text(text, fail_on_budget=True)
            except DecodeBudgetExceeded:
                violations.add(
                    f"{relative_path}: decode-time budget exceeded during truthfulness scan (fail-closed)"
                )
                continue
            collapsed_text = WHITESPACE_COLLAPSE_RE.sub(" ", normalized_text)

            for line_no, line in enumerate(text.splitlines(), start=1):
                try:
                    normalized_line = normalize_phrase_scan_text(line, fail_on_budget=True)
                except DecodeBudgetExceeded:
                    violations.add(
                        f"{relative_path}:{line_no}: decode-time budget exceeded during truthfulness scan (fail-closed)"
                    )
                    continue
                for pattern in FORWARD_LOOKING_PROMISE_PATTERNS:
                    if pattern.search(line) or pattern.search(normalized_line):
                        violations.add(
                            f"{relative_path}:{line_no}: matches `{pattern.pattern}` -> {line.strip()}"
                        )

            for pattern in FORWARD_LOOKING_PROMISE_PATTERNS:
                match = pattern.search(collapsed_text)
                if match:
                    snippet = collapsed_text[max(0, match.start() - 60) : min(len(collapsed_text), match.end() + 60)]
                    violations.add(
                        f"{relative_path}: cross-line/formatting match `{pattern.pattern}` -> ...{snippet}..."
                    )



    if violations:
        sorted_violations = sorted(violations)
        sample = "; ".join(sorted_violations[:20])
        suffix = " ..." if len(sorted_violations) > 20 else ""
        errors.append("Reader-facing forward-looking promise wording found: " + sample + suffix)

    return errors


def check_internal_book_artifact_paths() -> list[str]:
    errors: list[str] = []
    violations: set[str] = set()

    for path in ROOT.rglob("*"):
        if any(part in IGNORED_DIR_NAMES for part in path.parts):
            continue
        relative_path = path.relative_to(ROOT).as_posix()
        for pattern in DISALLOWED_BOOK_ARTIFACT_PATH_PATTERNS:
            if pattern.search(relative_path):
                violations.add(relative_path)

    if violations:
        sorted_violations = sorted(violations)
        errors.append(
            "Internal-only book artifact paths must stay outside the repo but are present: "
            + ", ".join(sorted_violations)
        )

    return errors


def check_public_docs_present_tense_reality() -> list[str]:
    errors: list[str] = []
    violations: list[str] = []

    for base_path in PRESENT_TENSE_REALITY_PATHS:
        if not base_path.exists():
            errors.append(f"Public-doc path missing for historical-state check: {base_path}")
            continue

        if base_path.is_file():
            candidate_files = [base_path]
        else:
            candidate_files = [p for p in base_path.rglob("*") if p.is_file()]

        for path in candidate_files:
            if path.name in IGNORED_FILE_NAMES:
                continue
            if any(part in IGNORED_DIR_NAMES for part in path.parts):
                continue

            relative_path = path.relative_to(ROOT)
            raw = path.read_bytes()
            text = raw.decode("utf-8", errors="ignore").replace("\x00", " ")
            try:
                normalized_text = normalize_phrase_scan_text(text, fail_on_budget=True)
            except DecodeBudgetExceeded:
                violations.append(
                    f"{relative_path}: decode-time budget exceeded during present-tense reality scan (fail-closed)"
                )
                continue

            for line_no, line in enumerate(text.splitlines(), start=1):
                try:
                    normalized_line = normalize_phrase_scan_text(line, fail_on_budget=True)
                except DecodeBudgetExceeded:
                    violations.append(
                        f"{relative_path}:{line_no}: decode-time budget exceeded during present-tense reality scan (fail-closed)"
                    )
                    continue

                for pattern in HISTORICAL_STATE_PATTERNS:
                    if pattern.search(line) or pattern.search(normalized_line):
                        violations.append(
                            f"{relative_path}:{line_no}: matches `{pattern.pattern}` -> {line.strip()}"
                        )

            for pattern in HISTORICAL_STATE_PATTERNS:
                if pattern.search(normalized_text):
                    violations.append(
                        f"{relative_path}: cross-line/formatting match `{pattern.pattern}`"
                    )

    if violations:
        sample = "; ".join(violations[:20])
        suffix = " ..." if len(violations) > 20 else ""
        errors.append("Public docs contain historical-state wording: " + sample + suffix)

    return errors


def main() -> int:
    base_days, _ts_days, day_errors = parse_day_docs()
    part_lessons, compiled_lessons, book_errors = parse_book_lessons()

    errors = []
    errors.extend(day_errors)
    errors.extend(book_errors)

    if base_days and compiled_lessons:
        errors.extend(check_book_vs_docs(base_days, compiled_lessons))
        errors.extend(check_readme_counts(max(base_days)))

    errors.extend(check_blocked_terms())
    errors.extend(check_filename_clarity())
    errors.extend(check_curriculum_origin_privacy())
    errors.extend(check_reader_facing_truthfulness_scope())
    errors.extend(check_internal_book_artifact_paths())
    errors.extend(check_public_docs_present_tense_reality())

    if errors:
        return fail(errors)

    print("artifact-check: OK")
    print(
        f"- base_day_docs={len(base_days)}"
        f" compiled_lesson_tags={len(compiled_lessons)}"
        f" part_lesson_tags={len(part_lessons)}"
        f" max_day={max(base_days)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
