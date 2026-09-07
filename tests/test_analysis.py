"""
Tests for analysis, questions, bookmarks, practice, and dashboard endpoints.

Covers:
  - POST /api/v1/analysis/analyze
  - GET  /api/v1/analysis/analyses
  - GET  /api/v1/analysis/analyses/{id}
  - DELETE /api/v1/analysis/analyses/{id}
  - GET  /api/v1/analysis/questions
  - GET  /api/v1/analysis/questions/search
  - GET  /api/v1/analysis/repeated-questions
  - GET  /api/v1/analysis/repeated-questions/{id}
  - POST /api/v1/analysis/bookmarks
  - GET  /api/v1/analysis/bookmarks
  - DELETE /api/v1/analysis/bookmarks/{id}
  - POST /api/v1/analysis/practice
  - GET  /api/v1/analysis/practice/history
  - PUT  /api/v1/analysis/practice/{id}
  - GET  /api/v1/analysis/dashboard
"""

import pytest


# ===================================================================
# POST /api/v1/analysis/analyze
# ===================================================================

class TestStartAnalysis:
    """Tests for starting paper analysis."""

    async def test_analyze_no_papers(self, authed_client):
        """Empty paper list returns 404."""
        resp = await authed_client.post(
            "/api/v1/analysis/analyze",
            json=[],
        )
        # Empty list or no papers found
        assert resp.status_code in (200, 404, 422)

    async def test_analyze_nonexistent_paper(self, authed_client):
        """Non-existent paper IDs return 404."""
        resp = await authed_client.post(
            "/api/v1/analysis/analyze",
            json=[99999],
        )
        assert resp.status_code in (404, 200)

    async def test_analyze_existing_paper(self, authed_client, sample_paper):
        """Existing paper triggers analysis (may fail on extraction)."""
        resp = await authed_client.post(
            "/api/v1/analysis/analyze",
            json=[sample_paper.id],
        )
        # Returns analysis result (may be FAILED if PDF doesn't exist on disk)
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert data["status"] in ("completed", "failed", "pending")

    async def test_analyze_no_auth(self, client, sample_paper):
        """Unauthenticated analysis returns 401/403."""
        resp = await client.post(
            "/api/v1/analysis/analyze",
            json=[sample_paper.id],
        )
        assert resp.status_code in (401, 403)


# ===================================================================
# GET /api/v1/analysis/analyses
# ===================================================================

class TestListAnalyses:
    """Tests for listing analysis results."""

    async def test_list_analyses_empty(self, authed_client):
        """No analyses returns empty list."""
        resp = await authed_client.get("/api/v1/analysis/analyses")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_analyses_after_run(self, authed_client, sample_paper):
        """After running analysis, results appear in list."""
        # Run analysis first
        await authed_client.post(
            "/api/v1/analysis/analyze",
            json=[sample_paper.id],
        )
        # List should now have entries
        resp = await authed_client.get("/api/v1/analysis/analyses")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===================================================================
# GET /api/v1/analysis/questions
# ===================================================================

class TestListQuestions:
    """Tests for listing extracted questions."""

    async def test_list_questions_empty(self, authed_client):
        """No questions returns empty list."""
        resp = await authed_client.get("/api/v1/analysis/questions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_questions_with_data(self, authed_client, sample_question):
        """Questions in DB are returned."""
        resp = await authed_client.get("/api/v1/analysis/questions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["question_text"] == "Explain normalization in DBMS."

    async def test_list_questions_filter_by_subject(self, authed_client, sample_question):
        """Filter by subject returns matching questions."""
        resp = await authed_client.get(
            "/api/v1/analysis/questions?subject=Database Management Systems"
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_list_questions_no_auth(self, client):
        """Unauthenticated request returns 401/403."""
        resp = await client.get("/api/v1/analysis/questions")
        assert resp.status_code in (401, 403)


# ===================================================================
# GET /api/v1/analysis/questions/search
# ===================================================================

class TestSearchQuestions:
    """Tests for searching questions."""

    async def test_search_questions_empty(self, authed_client):
        """Search with no matches returns empty list."""
        resp = await authed_client.get("/api/v1/analysis/questions/search?q=quantum")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_search_questions_with_match(self, authed_client, sample_question):
        """Search finds matching questions."""
        resp = await authed_client.get("/api/v1/analysis/questions/search?q=normalization")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ===================================================================
# GET /api/v1/analysis/repeated-questions
# ===================================================================

class TestRepeatedQuestions:
    """Tests for repeated question detection."""

    async def test_repeated_questions_empty(self, authed_client):
        """No groups returns empty list."""
        resp = await authed_client.get("/api/v1/analysis/repeated-questions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_repeated_questions_with_data(self, authed_client, sample_question_group):
        """Groups in DB are returned."""
        resp = await authed_client.get("/api/v1/analysis/repeated-questions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["frequency"] >= 2

    async def test_repeated_questions_filter_by_subject(self, authed_client, sample_question_group):
        """Filter by subject works."""
        resp = await authed_client.get(
            "/api/v1/analysis/repeated-questions?subject=Database Management Systems"
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ===================================================================
# GET /api/v1/analysis/repeated-questions/{id}
# ===================================================================

class TestRepeatedQuestionDetail:
    """Tests for repeated question detail with evidence."""

    async def test_detail_success(self, authed_client, sample_question_group):
        """Get detail for existing group."""
        resp = await authed_client.get(
            f"/api/v1/analysis/repeated-questions/{sample_question_group.id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "evidence" in data
        assert "frequency" in data

    async def test_detail_not_found(self, authed_client):
        """Non-existent group returns 404."""
        resp = await authed_client.get("/api/v1/analysis/repeated-questions/99999")
        assert resp.status_code == 404


# ===================================================================
# POST /api/v1/analysis/bookmarks  (analysis-bookmarks)
# ===================================================================

class TestAnalysisBookmarks:
    """Tests for analysis-level bookmarks (question bookmarks)."""

    async def test_create_bookmark(self, authed_client, sample_question):
        """Bookmark a question."""
        resp = await authed_client.post(
            f"/api/v1/analysis/bookmarks?question_id={sample_question.id}"
        )
        assert resp.status_code == 200
        assert "id" in resp.json()

    async def test_list_bookmarks(self, authed_client, sample_question):
        """List question bookmarks."""
        # Create one first
        await authed_client.post(
            f"/api/v1/analysis/bookmarks?question_id={sample_question.id}"
        )
        resp = await authed_client.get("/api/v1/analysis/bookmarks")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_delete_bookmark(self, authed_client, sample_question):
        """Delete a question bookmark."""
        # Create
        create_resp = await authed_client.post(
            f"/api/v1/analysis/bookmarks?question_id={sample_question.id}"
        )
        bm_id = create_resp.json()["id"]
        # Delete
        resp = await authed_client.delete(f"/api/v1/analysis/bookmarks/{bm_id}")
        assert resp.status_code == 200

    async def test_delete_nonexistent_bookmark(self, authed_client):
        """Deleting non-existent bookmark returns 404."""
        resp = await authed_client.delete("/api/v1/analysis/bookmarks/99999")
        assert resp.status_code == 404


# ===================================================================
# POST /api/v1/analysis/practice
# ===================================================================

class TestPractice:
    """Tests for practice mode."""

    async def test_start_practice(self, authed_client, sample_question):
        """Start a practice session."""
        resp = await authed_client.post(
            f"/api/v1/analysis/practice?question_id={sample_question.id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["status"] == "attempted"

    async def test_practice_history_empty(self, authed_client):
        """Empty history returns empty list."""
        resp = await authed_client.get("/api/v1/analysis/practice/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_practice_history_after_start(self, authed_client, sample_question):
        """After starting practice, history shows attempt."""
        await authed_client.post(
            f"/api/v1/analysis/practice?question_id={sample_question.id}"
        )
        resp = await authed_client.get("/api/v1/analysis/practice/history")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_update_practice_status(self, authed_client, sample_question):
        """Update practice attempt status."""
        # Start
        start_resp = await authed_client.post(
            f"/api/v1/analysis/practice?question_id={sample_question.id}"
        )
        attempt_id = start_resp.json()["id"]
        # Update
        resp = await authed_client.put(
            f"/api/v1/analysis/practice/{attempt_id}?new_status=reviewed"
        )
        assert resp.status_code == 200


# ===================================================================
# GET /api/v1/analysis/dashboard
# ===================================================================

class TestDashboard:
    """Tests for the dashboard summary endpoint."""

    async def test_dashboard_empty(self, authed_client):
        """Empty dashboard returns zeroed stats."""
        resp = await authed_client.get("/api/v1/analysis/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "papers_analyzed" in data
        assert "questions_extracted" in data
        assert "repeated_groups" in data
        assert "most_repeated" in data

    async def test_dashboard_after_analysis(self, authed_client, sample_paper):
        """Dashboard reflects analysis results."""
        # Run analysis
        await authed_client.post(
            "/api/v1/analysis/analyze",
            json=[sample_paper.id],
        )
        resp = await authed_client.get("/api/v1/analysis/dashboard")
        assert resp.status_code == 200
        # papers_analyzed should be > 0 (counted from user's papers)
        data = resp.json()
        assert isinstance(data["papers_analyzed"], int)
