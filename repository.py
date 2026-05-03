from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.entities import ProctorEvent, Student


def get_student(db: Session, student_id: str) -> Student | None:
    return db.get(Student, student_id)


def list_students(db: Session) -> list[Student]:
    return list(db.scalars(select(Student).order_by(Student.full_name)))


def list_events(db: Session, student_id: str, limit: int = 50) -> list[ProctorEvent]:
    stmt = (
        select(ProctorEvent)
        .where(ProctorEvent.student_id == student_id)
        .order_by(desc(ProctorEvent.created_at))
        .limit(limit)
    )
    return list(db.scalars(stmt))


def list_recent_alerts(db: Session, limit: int = 50, student_id: str | None = None) -> list[ProctorEvent]:
    stmt = select(ProctorEvent).order_by(desc(ProctorEvent.created_at)).limit(limit)
    if student_id:
        stmt = stmt.where(ProctorEvent.student_id == student_id)
    return list(db.scalars(stmt))


def get_latest_event(db: Session, student_id: str) -> ProctorEvent | None:
    stmt = (
        select(ProctorEvent)
        .where(ProctorEvent.student_id == student_id)
        .order_by(desc(ProctorEvent.created_at))
        .limit(1)
    )
    return db.scalars(stmt).first()


def create_event(
    db: Session,
    student_id: str,
    event_type: str,
    severity: int,
    message: str,
    metadata: dict | None = None,
) -> ProctorEvent:
    event = ProctorEvent(
        student_id=student_id,
        event_type=event_type,
        severity=severity,
        message=message,
        metadata_json=json.dumps(metadata or {}),
        created_at=datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
