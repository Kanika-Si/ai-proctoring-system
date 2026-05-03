from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnalyzeFrameRequest(BaseModel):
    student_id: str = Field(..., min_length=2)
    image_base64: str
    tab_switched: bool = False
    audio_level: float = 0.0
    head_pose_offset: float = 0.0


class AlertResponse(BaseModel):
    id: int
    student_id: str
    event_type: str
    severity: int
    message: str
    metadata: dict[str, Any]
    created_at: datetime


class TimelinePoint(BaseModel):
    timestamp: datetime
    event_type: str
    severity: int
    score_impact: int


class ScoreResponse(BaseModel):
    student_id: str
    score: int
    risk_level: str
    should_terminate_exam: bool
    breakdown: dict[str, int]


class ReportResponse(BaseModel):
    student_id: str
    summary: str
    risk_level: str
    explanation: str
    recommended_action: str
    report_source: str


class StudentSummary(BaseModel):
    id: str
    full_name: str
    email: str
    exam_active: bool
    latest_frame_base64: str | None
    score: int
    risk_level: str
    last_event: str | None


class StudentDetail(StudentSummary):
    timeline: list[TimelinePoint]
