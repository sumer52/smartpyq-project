"""Privacy-friendly intro analytics.

POST /api/v1/intro-analytics/event — anonymous, fire-and-forget event.
    Payload: {"event_type": "viewed|completed|skipped", "scene": 0-4}
    No cookies, no identifiers, no user agent storage. Aggregated into
    daily counters only.
GET  /api/v1/intro-analytics/summary — admin-only aggregate readout.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..models.intro_analytics import INTRO_EVENT_TYPES, IntroEventAggregate
from ..models.user import User

router = APIRouter(prefix="/intro-analytics", tags=["intro-analytics"])

# A visitor generates at most one of each event per intro session; anything
# above a generous ceiling is abuse or a bug, not analytics.
_DAILY_EVENT_CEILING = 10_000


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


class IntroEventIn(BaseModel):
    event_type: str = Field(description="viewed | completed | skipped")
    scene: int = Field(default=0, ge=0, le=4)


@router.post("/event", status_code=status.HTTP_204_NO_CONTENT)
async def record_intro_event(
    payload: IntroEventIn,
    db: AsyncSession = Depends(get_db),
):
    """Record one anonymous intro event (fire-and-forget).

    Always responds 204 — never blocks or errors the visitor's experience.
    """
    if payload.event_type not in INTRO_EVENT_TYPES:
        raise HTTPException(status_code=422, detail="invalid event_type")

    day = _utc_today()
    result = await db.execute(
        select(IntroEventAggregate)
        .where(
            IntroEventAggregate.day == day,
            IntroEventAggregate.event_type == payload.event_type,
            IntroEventAggregate.scene == payload.scene,
        )
        .with_for_update()
    )
    row = result.scalar_one_or_none()

    if row is None:
        # A concurrent request may have inserted the same row between the
        # SELECT and here; the unique constraint makes the upsert idempotent.
        db.add(
            IntroEventAggregate(
                day=day,
                event_type=payload.event_type,
                scene=payload.scene,
                count=1,
            )
        )
        try:
            await db.commit()
        except IntegrityError:
            # Lost an insert race: fold this event into the winner's row.
            await db.rollback()
            await db.execute(
                update(IntroEventAggregate)
                .where(
                    IntroEventAggregate.day == day,
                    IntroEventAggregate.event_type == payload.event_type,
                    IntroEventAggregate.scene == payload.scene,
                )
                .values(count=IntroEventAggregate.count + 1)
            )
            await db.commit()
        return Response(status_code=204)

    if row.count >= _DAILY_EVENT_CEILING:
        # Silently cap: analytics never becomes a write-amplification DoS.
        return Response(status_code=204)
    row.count += 1
    await db.commit()
    return Response(status_code=204)


@router.get("/summary")
async def intro_analytics_summary(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Aggregate readout for the operator (admin only)."""
    result = await db.execute(select(IntroEventAggregate))
    rows = result.scalars().all()

    by_event = {event: 0 for event in INTRO_EVENT_TYPES}
    skip_scenes: dict[int, int] = {}
    for row in rows:
        by_event[row.event_type] = by_event.get(row.event_type, 0) + row.count
        if row.event_type == "skipped" and row.scene:
            skip_scenes[row.scene] = skip_scenes.get(row.scene, 0) + row.count

    viewed = by_event.get("viewed", 0)
    completed = by_event.get("completed", 0)
    skipped = by_event.get("skipped", 0)
    finished = completed + skipped
    return {
        "totals": {
            "viewed": viewed,
            "completed": completed,
            "skipped": skipped,
        },
        # Completion rate among visitors who finished (completed or skipped),
        # so a growing pool of viewers who neither finish nor skip doesn't
        # dilute the signal.
        "completion_rate": round(completed / finished, 4) if finished else None,
        "skip_scenes": {
            "1": skip_scenes.get(1, 0),
            "2": skip_scenes.get(2, 0),
            "3": skip_scenes.get(3, 0),
            "4": skip_scenes.get(4, 0),
        },
        "privacy": "aggregate counters only; no IPs, identifiers, or cookies",
    }
