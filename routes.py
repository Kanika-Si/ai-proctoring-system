from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Student
from app.schemas.auth import AuthenticatedUser, LoginRequest, LoginResponse
from app.schemas.proctoring import (
    AlertResponse,
    AnalyzeFrameRequest,
    ReportResponse,
    ScoreResponse,
    StudentDetail,
    StudentSummary,
    TimelinePoint,
)
from app.services.analyzer import analyzer
from app.services.auth import create_access_token, get_current_user, require_admin, require_student_or_admin
from app.services.reporting import generate_report
from app.services.repository import create_event, get_latest_event, get_student, list_events, list_recent_alerts, list_students
from app.services.scoring import calculate_score, risk_level_for_score

router = APIRouter()
EVENT_DEDUP_WINDOW_SECONDS = 6


@router.get("/health")
def healthcheck():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    if payload.role == "admin":
        if payload.email != settings.admin_email or payload.password != settings.admin_password:
            raise HTTPException(status_code=401, detail="Invalid admin credentials.")
        return LoginResponse(
            access_token=None,
            token_type=None,
            role="admin",
            user_id="admin-001",
            full_name="Chief Proctor",
        )

    student = db.query(Student).filter(Student.email == payload.email).first()
    if not student or payload.password != student.password:
        raise HTTPException(status_code=401, detail="Invalid student credentials.")

    return LoginResponse(
        access_token=None,
        token_type=None,
        role="student",
        user_id=student.id,
        full_name=student.full_name,
    )


@router.post("/analyze")
def analyze_frame(
    payload: AnalyzeFrameRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    require_student_or_admin(payload.student_id, current_user)
    student = get_student(db, payload.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    events, frame_base64 = analyzer.analyze(
        student=student,
        image_base64=payload.image_base64,
        tab_switched=payload.tab_switched,
        audio_level=payload.audio_level,
        head_pose_offset=payload.head_pose_offset,
    )

    student.latest_frame_base64 = frame_base64
    db.add(student)
    db.commit()

    if not events:
        _log_event_if_needed(
            db=db,
            student_id=student.id,
            event_type="normal",
            severity=0,
            message="Normal frame analyzed with no suspicious events.",
            metadata={},
        )
    else:
        for event in events:
            _log_event_if_needed(
                db=db,
                student_id=student.id,
                event_type=event.event_type,
                severity=event.severity,
                message=event.message,
                metadata=event.metadata,
            )

    score_payload = _score_for_student(db, student.id)
    if score_payload.score >= settings.exam_score_termination_threshold:
        student.exam_active = False
        db.add(student)
        db.commit()

    return {
        "student_id": student.id,
        "events": [event.event_type for event in events] or ["normal"],
        "score": score_payload.score,
        "risk_level": score_payload.risk_level,
        "exam_active": student.exam_active,
    }


@router.get("/alerts", response_model=list[AlertResponse])
def alerts(
    student_id: str | None = None,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_admin),
):
    events = list_recent_alerts(db, limit=limit, student_id=student_id)
    return [
        AlertResponse(
            id=event.id,
            student_id=event.student_id,
            event_type=event.event_type,
            severity=event.severity,
            message=event.message,
            metadata=json.loads(event.metadata_json or "{}"),
            created_at=event.created_at,
        )
        for event in events
    ]


@router.get("/score", response_model=ScoreResponse)
def score(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    require_student_or_admin(student_id, current_user)
    student = get_student(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    return _score_for_student(db, student_id)


@router.get("/report", response_model=ReportResponse)
def report(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    require_student_or_admin(student_id, current_user)
    student = get_student(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    events = list_events(db, student_id=student_id, limit=30)
    result = generate_report(student, events)
    return ReportResponse(student_id=student_id, **result)


@router.get("/timeline", response_model=list[TimelinePoint])
def timeline(
    student_id: str,
    limit: int = Query(default=30, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    require_student_or_admin(student_id, current_user)
    student = get_student(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    return _timeline_for_student(db, student_id=student_id, limit=limit)


@router.get("/students", response_model=list[StudentSummary])
def students(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_admin)):
    items = []
    for student in list_students(db):
        score_payload = _score_for_student(db, student.id)
        recent_events = list_events(db, student.id, limit=1)
        items.append(
            StudentSummary(
                id=student.id,
                full_name=student.full_name,
                email=student.email,
                exam_active=student.exam_active,
                latest_frame_base64=None,
                score=score_payload.score,
                risk_level=score_payload.risk_level,
                last_event=recent_events[0].message if recent_events else None,
            )
        )
    return items


@router.get("/students/{student_id}", response_model=StudentDetail)
def student_detail(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    require_student_or_admin(student_id, current_user)
    student = get_student(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    score_payload = _score_for_student(db, student.id)
    recent_events = list_events(db, student.id, limit=1)
    return StudentDetail(
        id=student.id,
        full_name=student.full_name,
        email=student.email,
        exam_active=student.exam_active,
        latest_frame_base64=student.latest_frame_base64,
        score=score_payload.score,
        risk_level=score_payload.risk_level,
        last_event=recent_events[0].message if recent_events else None,
        timeline=_timeline_for_student(db, student.id),
    )


def _score_for_student(db: Session, student_id: str) -> ScoreResponse:
    events = list_events(db, student_id=student_id, limit=20)
    score, breakdown = calculate_score(events)
    return ScoreResponse(
        student_id=student_id,
        score=score,
        risk_level=risk_level_for_score(score),
        should_terminate_exam=score >= settings.exam_score_termination_threshold,
        breakdown=breakdown,
    )


def _timeline_for_student(db: Session, student_id: str, limit: int = 30) -> list[TimelinePoint]:
    events = list_events(db, student_id=student_id, limit=limit)
    return [
        TimelinePoint(
            timestamp=event.created_at,
            event_type=event.event_type,
            severity=event.severity,
            score_impact=event.severity,
        )
        for event in reversed(events)
    ]


def _log_event_if_needed(
    db: Session,
    student_id: str,
    event_type: str,
    severity: int,
    message: str,
    metadata: dict,
):
    latest_event = get_latest_event(db, student_id)
    if (
        latest_event
        and latest_event.event_type == event_type
        and datetime.utcnow() - latest_event.created_at <= timedelta(seconds=EVENT_DEDUP_WINDOW_SECONDS)
    ):
        return latest_event

    return create_event(
        db=db,
        student_id=student_id,
        event_type=event_type,
        severity=severity,
        message=message,
        metadata=metadata,
    )
