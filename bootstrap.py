from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Student


def seed_default_data(db: Session) -> None:
    students = [
        ("student-001", "Aarav Sharma", "student1@proctoring.demo"),
        ("student-002", "Diya Patel", "student2@proctoring.demo"),
        ("student-003", "Ishaan Kumar", "student3@proctoring.demo"),
    ]

    for student_id, full_name, email in students:
        existing = db.get(Student, student_id)
        if existing:
            existing.full_name = full_name
            existing.email = email
            if not existing.password:
                existing.password = settings.student_password
            db.add(existing)
            continue
        db.add(
            Student(
                id=student_id,
                full_name=full_name,
                email=email,
                password=settings.student_password,
            )
        )

    db.commit()
