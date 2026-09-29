"""Tests for the privacy-friendly intro analytics endpoints."""

from datetime import date

import pytest
from sqlalchemy import select

from app.models.intro_analytics import IntroEventAggregate

EVENT_URL = "/api/v1/intro-analytics/event"
SUMMARY_URL = "/api/v1/intro-analytics/summary"


class TestRecordIntroEvent:
    """Tests for POST /api/v1/intro-analytics/event."""

    @pytest.mark.asyncio
    async def test_records_viewed_event(self, client):
        resp = await client.post(EVENT_URL, json={"event_type": "viewed", "scene": 0})
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_records_skipped_with_scene(self, client):
        resp = await client.post(EVENT_URL, json={"event_type": "skipped", "scene": 2})
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_records_completed_event(self, client):
        resp = await client.post(EVENT_URL, json={"event_type": "completed", "scene": 0})
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_rejects_unknown_event_type(self, client):
        resp = await client.post(EVENT_URL, json={"event_type": "bogus", "scene": 0})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_scene_out_of_range(self, client):
        resp = await client.post(EVENT_URL, json={"event_type": "skipped", "scene": 9})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_aggregates_counts(self, client, db_session):
        for _ in range(3):
            await client.post(EVENT_URL, json={"event_type": "completed", "scene": 0})
        rows = (await db_session.execute(select(IntroEventAggregate))).scalars().all()
        completed = sum(r.count for r in rows if r.event_type == "completed")
        assert completed == 3

    @pytest.mark.asyncio
    async def test_no_identifying_data_stored(self, client, db_session):
        """The privacy promise: nothing user-recognizable is ever persisted."""
        await client.post(EVENT_URL, json={"event_type": "viewed", "scene": 0})
        rows = (await db_session.execute(select(IntroEventAggregate))).scalars().all()
        assert rows
        allowed = {"id", "day", "event_type", "scene", "count", "updated_at"}
        for row in rows:
            for column, value in row.__dict__.items():
                if not column.startswith("_"):
                    assert column in allowed, f"unexpected column {column!r}"
                    assert value is None or isinstance(
                        value, (int, str, date)
                    ), f"unexpected value in {column!r}: {value!r}"


class TestIntroAnalyticsSummary:
    """Tests for GET /api/v1/intro-analytics/summary."""

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get(SUMMARY_URL)
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_summary_math(self, admin_client, db_session):
        db_session.add_all(
            [
                IntroEventAggregate(day=date.today(), event_type="viewed", scene=0, count=10),
                IntroEventAggregate(day=date.today(), event_type="completed", scene=0, count=4),
                IntroEventAggregate(day=date.today(), event_type="skipped", scene=2, count=3),
                IntroEventAggregate(day=date.today(), event_type="skipped", scene=4, count=3),
            ]
        )
        await db_session.commit()
        resp = await admin_client.get(SUMMARY_URL)
        assert resp.status_code == 200
        body = resp.json()
        assert body["totals"] == {"viewed": 10, "completed": 4, "skipped": 6}
        assert body["completion_rate"] == round(4 / 10, 4)
        assert body["skip_scenes"]["2"] == 3
        assert body["skip_scenes"]["4"] == 3

    @pytest.mark.asyncio
    async def test_summary_empty_state(self, admin_client):
        resp = await admin_client.get(SUMMARY_URL)
        assert resp.status_code == 200
        body = resp.json()
        assert body["totals"] == {"viewed": 0, "completed": 0, "skipped": 0}
        assert body["completion_rate"] is None
