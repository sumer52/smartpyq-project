"""Intro analytics model for privacy-friendly, anonymous aggregates.

Stores ONLY daily counters — no IPs, no user agents, no cookies, no
session or user identifiers. One row per (day, event_type, scene) with a
count, so the table stays tiny and nothing user-recognizable is ever
persisted.
"""

from sqlalchemy import Column, Integer, String, Date, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import validates

from app.core.database import Base

# Allowed event types (anything else is rejected at the API boundary).
INTRO_EVENT_TYPES = ("viewed", "completed", "skipped")


class IntroEventAggregate(Base):
    """Daily aggregate counter for one intro event type at one scene."""

    __tablename__ = "intro_event_aggregates"

    id = Column(Integer, primary_key=True, index=True)
    day = Column(Date, nullable=False, index=True)
    event_type = Column(String(20), nullable=False)
    # Scene the visitor was on when the event fired (0-4); 0 for
    # viewed/completed which are scene-independent.
    scene = Column(Integer, nullable=False, default=0)
    count = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        String(40),
        nullable=True,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("day", "event_type", "scene", name="uq_intro_event_day"),
    )

    @validates("event_type")
    def _validate_event_type(self, _key, value):
        if value not in INTRO_EVENT_TYPES:
            raise ValueError(f"unknown intro event type: {value!r}")
        return value

    @validates("scene")
    def _validate_scene(self, _key, value):
        return max(0, min(4, int(value or 0)))
