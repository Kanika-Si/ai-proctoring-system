from __future__ import annotations

import json
import os
from dataclasses import dataclass
from math import hypot

import cv2

from app.core.config import settings
from app.models.entities import Student
from app.services.scoring import EVENT_WEIGHTS
from app.utils.image import decode_base64_image

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional runtime dependency
    YOLO = None


@dataclass(slots=True)
class DetectionEvent:
    event_type: str
    message: str
    severity: int
    metadata: dict


class ProctoringAnalyzer:
    def __init__(self) -> None:
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.phone_model = None
        if YOLO and os.path.exists(settings.yolo_model_path):
            self.phone_model = YOLO(settings.yolo_model_path)

    def analyze(self, student: Student, image_base64: str, tab_switched: bool, audio_level: float, head_pose_offset: float) -> tuple[list[DetectionEvent], str]:
        frame = decode_base64_image(image_base64)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        raw_faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=6, minSize=(48, 48))
        faces = self._filter_faces(raw_faces, frame.shape[0] * frame.shape[1])

        events: list[DetectionEvent] = []
        brightness = float(gray.mean() / 255)

        if len(faces) == 0:
            events.append(self._event("no_face", "No face detected in frame.", {"faces": 0, "brightness": round(brightness, 2)}))
        elif len(faces) > 1:
            events.append(
                self._event(
                    "multiple_faces",
                    "Multiple faces detected in frame.",
                    {"faces": len(faces), "brightness": round(brightness, 2)},
                )
            )

        if self._detect_phone(frame):
            events.append(self._event("phone_detected", "Mobile phone detected near candidate.", {"source": "yolo"}))

        if tab_switched:
            events.append(self._event("tab_switch", "Candidate switched browser tab/window.", {"tab_switched": True}))

        if audio_level >= 0.65:
            events.append(self._event("voice_detected", "Background voice/noise crossed threshold.", {"audio_level": audio_level}))

        dominant_face = self._largest_face(faces)
        movement_score = 0.0

        if dominant_face is not None:
            movement_score = max(head_pose_offset, self._estimate_head_movement(student, dominant_face, frame.shape))
            if movement_score >= 0.18:
                events.append(
                    self._event(
                        "head_movement",
                        "Significant head movement detected.",
                        {"head_pose_offset": round(movement_score, 2)},
                    )
                )

        if dominant_face is not None and student.registered_image_base64:
            verified = self._verify_face(student.registered_image_base64, frame, dominant_face)
            if not verified:
                events.append(self._event("face_mismatch", "Live face does not match the registered image closely enough.", {"verification": "failed"}))

        if dominant_face is not None:
            x, y, w, h = dominant_face
            student.last_face_center = json.dumps({"x": int(x + w / 2), "y": int(y + h / 2)})

        return events, image_base64

    def _event(self, event_type: str, message: str, metadata: dict) -> DetectionEvent:
        return DetectionEvent(
            event_type=event_type,
            message=message,
            severity=EVENT_WEIGHTS.get(event_type, 0),
            metadata=metadata,
        )

    def _detect_phone(self, frame) -> bool:
        if not self.phone_model:
            return False

        try:
            results = self.phone_model(frame, verbose=False)
            for result in results:
                for box in result.boxes:
                    cls = int(box.cls[0])
                    label = self.phone_model.names[cls]
                    confidence = float(box.conf[0]) if box.conf is not None else 0.0
                    if label == "cell phone" and confidence >= 0.45:
                        return True
        except Exception:
            return False

        return False

    def _verify_face(self, registered_image_base64: str, live_frame, face_box) -> bool:
        try:
            registered_frame = decode_base64_image(registered_image_base64)
        except Exception:
            return True

        x, y, w, h = face_box
        live_face = cv2.cvtColor(live_frame[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
        registered_face = cv2.cvtColor(registered_frame, cv2.COLOR_BGR2GRAY)

        live_hist = cv2.calcHist([live_face], [0], None, [64], [0, 256])
        registered_hist = cv2.calcHist([registered_face], [0], None, [64], [0, 256])
        score = cv2.compareHist(live_hist, registered_hist, cv2.HISTCMP_CORREL)
        return score >= 0.72

    def _filter_faces(self, faces, frame_area: int):
        if faces is None or len(faces) == 0:
            return []

        min_face_area = frame_area * 0.008
        filtered = [face for face in faces if face[2] * face[3] >= min_face_area]
        if filtered:
            return filtered
        return [max(faces, key=lambda face: face[2] * face[3])]

    def _largest_face(self, faces):
        if not faces:
            return None
        return max(faces, key=lambda face: face[2] * face[3])

    def _estimate_head_movement(self, student: Student, face_box, frame_shape) -> float:
        if not student.last_face_center:
            return 0.0

        try:
            previous = json.loads(student.last_face_center)
        except json.JSONDecodeError:
            return 0.0

        x, y, w, h = face_box
        current_x = x + w / 2
        current_y = y + h / 2
        diagonal = hypot(frame_shape[1], frame_shape[0])
        if diagonal == 0:
            return 0.0

        shift = hypot(current_x - previous.get("x", current_x), current_y - previous.get("y", current_y))
        return shift / diagonal


analyzer = ProctoringAnalyzer()
