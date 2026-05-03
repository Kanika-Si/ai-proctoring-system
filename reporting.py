from __future__ import annotations

import json
import re

import requests

from app.core.config import settings
from app.models.entities import ProctorEvent, Student
from app.services.scoring import calculate_score, risk_level_for_score

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional runtime dependency
    OpenAI = None


def build_rag_context(student: Student, events: list[ProctorEvent]) -> str:
    lines = [
        f"Student: {student.full_name} ({student.id})",
        f"Exam active: {student.exam_active}",
        "Recent proctoring events:",
    ]
    for event in reversed(events):
        metadata = json.loads(event.metadata_json or "{}")
        lines.append(
            f"- {event.created_at.isoformat()} | {event.event_type} | severity={event.severity} | "
            f"message={event.message} | metadata={metadata}"
        )
    return "\n".join(lines)


def generate_report(student: Student, events: list[ProctorEvent]) -> dict[str, str]:
    score, _ = calculate_score(events)
    risk_level = risk_level_for_score(score)
    context = build_rag_context(student, events)
    event_counts: dict[str, int] = {}
    for event in events:
        event_counts[event.event_type] = event_counts.get(event.event_type, 0) + 1

    prompt = (
        "You are an AI exam integrity analyst reviewing a remote examination session. "
        "Return only valid JSON with keys summary, risk_level, explanation, recommended_action. "
        "Write a specific, investigation-style report based on the evidence. "
        "The summary should be 2-3 sentences. "
        "The explanation should be 4-6 sentences and must mention the most frequent or highest-severity suspicious events, "
        "their likely meaning, and whether the pattern looks isolated or repeated. "
        "The recommended_action should be 2-3 sentences and should be practical for an admin reviewer. "
        "Do not use placeholders. Do not say there is insufficient information if events are present."
        f"\n\nCalculated risk score: {score}/100"
        f"\nCalculated risk level: {risk_level}"
        f"\nEvent counts: {json.dumps(event_counts)}"
        f"\n\nContext:\n{context}"
    )

    llm_response = _call_llm(prompt)
    if llm_response:
        parsed = _parse_report_payload(llm_response)
        if parsed:
            parsed["report_source"] = "llm"
            return parsed

    return _build_fallback_report(student, events, score, risk_level, event_counts)


def _call_llm(prompt: str) -> str | None:
    if settings.openai_api_key and OpenAI:
        try:
            client = OpenAI(api_key=settings.openai_api_key, timeout=settings.llm_timeout_seconds)
            response = client.responses.create(
                model=settings.openai_model,
                input=[
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "Return only valid JSON with keys summary, risk_level, "
                                    "explanation, recommended_action."
                                ),
                            }
                        ],
                    },
                    {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
                ],
            )
            return response.output_text
        except Exception:
            return None

    if settings.ollama_model:
        try:
            response = requests.post(
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
                timeout=settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            return response.json().get("response")
        except Exception:
            return None

    return None


def _build_fallback_report(
    student: Student,
    events: list[ProctorEvent],
    score: int,
    risk_level: str,
    event_counts: dict[str, int],
) -> dict[str, str]:
    suspicious_events = [event for event in events if event.severity > 0]
    top_events = sorted(
        event_counts.items(),
        key=lambda item: (-item[1], -max((event.severity for event in events if event.event_type == item[0]), default=0), item[0]),
    )
    top_event_names = [_humanize_event_name(name) for name, _ in top_events[:3]]
    top_event_summary = ", ".join(top_event_names) if top_event_names else "normal monitoring signals"
    repeated_pattern = any(count >= 2 for count in event_counts.values())
    highest_severity = max((event.severity for event in events), default=0)
    exam_state = "active" if student.exam_active else "already terminated"

    if suspicious_events:
        summary = (
            f"{student.full_name} reached a cheating score of {score}/100 and is currently classified as {risk_level} risk. "
            f"The strongest indicators in the recent session were {top_event_summary}, and the exam is {exam_state}."
        )
        explanation = (
            f"The timeline contains {len(suspicious_events)} suspicious event(s) across the latest review window. "
            f"The most prominent signals were {top_event_summary}, with a peak severity of {highest_severity}. "
            f"{'The same alert pattern repeated multiple times, which suggests sustained behavior rather than a one-off anomaly. ' if repeated_pattern else 'Most suspicious signals appear limited in repetition, so the pattern may still need manual confirmation. '}"
            f"Based on the current score, the session falls into the {risk_level} risk band. "
            "This report was generated from stored proctoring logs and event history."
        )
        recommended_action = (
            f"Review the flagged clips and event timeline for {student.full_name}, focusing first on {top_event_summary}. "
            f"If the visual evidence matches the alert history, keep the case marked as {risk_level} risk and apply your exam policy accordingly."
        )
    else:
        summary = (
            f"{student.full_name} reached a cheating score of {score}/100 with no suspicious events in the latest review window. "
            f"The session is currently assessed as {risk_level} risk and the exam is {exam_state}."
        )
        explanation = (
            "Recent monitoring data does not show face absence, phone detection, tab switching, audio spikes, or other elevated signals. "
            "The current report is based on the stored event history available to the backend. "
            "Because no suspicious events were present in the latest window, the session appears stable at this time. "
            "This report was generated from stored proctoring logs using rule-based evidence synthesis."
        )
        recommended_action = (
            "Continue routine monitoring and re-check the timeline if new alerts appear. "
            "No immediate disciplinary action is indicated from the current evidence."
        )

    return {
        "summary": summary,
        "risk_level": risk_level,
        "explanation": explanation,
        "recommended_action": recommended_action,
        "report_source": "stored_logs",
    }


def _humanize_event_name(event_type: str) -> str:
    return event_type.replace("_", " ").strip().lower()


def _parse_report_payload(raw: str) -> dict[str, str] | None:
    candidates = [raw.strip()]

    fenced = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", raw, flags=re.DOTALL)
    candidates.extend(item.strip() for item in fenced)

    first_brace = raw.find("{")
    last_brace = raw.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidates.append(raw[first_brace : last_brace + 1].strip())

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if all(key in parsed for key in ("summary", "risk_level", "explanation", "recommended_action")):
            return {
                "summary": str(parsed["summary"]).strip(),
                "risk_level": str(parsed["risk_level"]).upper().strip(),
                "explanation": str(parsed["explanation"]).strip(),
                "recommended_action": str(parsed["recommended_action"]).strip(),
            }

    return None
