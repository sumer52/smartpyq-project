"""Fuzz and property-based tests for the metadata normalizer.

Tests that normalize_metadata handles arbitrary/spellings safely
and always returns valid output.
"""

import pytest
import random
import string
from app.utils.metadata_normalizer import (
    normalize_metadata,
    normalize_title,
    find_best_match,
    similarity,
    CANONICAL_SUBJECTS,
    CANONICAL_STREAMS,
    CANONICAL_SEMESTERS,
)


class TestSimilarity:
    """Tests for the similarity function."""

    def test_identical_strings(self):
        assert similarity("hello", "hello") == 1.0

    def test_empty_strings(self):
        assert similarity("", "") == 1.0

    def test_case_insensitive(self):
        assert similarity("Hello", "hello") == 1.0

    def test_completely_different(self):
        score = similarity("aaa", "zzz")
        assert 0.0 <= score < 0.5

    def test_partial_match(self):
        score = similarity("computer", "computing")
        assert score > 0.7

    def test_whitespace_handling(self):
        assert similarity("  hello  ", "hello") == 1.0


class TestFindBestMatch:
    """Tests for find_best_match function."""

    def test_exact_match(self):
        result = find_best_match("Mathematics", CANONICAL_SUBJECTS)
        assert result == "Mathematics"

    def test_case_insensitive_match(self):
        result = find_best_match("mathematics", CANONICAL_SUBJECTS)
        assert result == "Mathematics"

    def test_no_match_returns_none(self):
        result = find_best_match("zzzzzzxxxxxx", CANONICAL_SUBJECTS, threshold=0.9)
        assert result is None

    def test_empty_input(self):
        assert find_best_match("", CANONICAL_SUBJECTS) is None
        assert find_best_match("   ", CANONICAL_SUBJECTS) is None

    def test_stream_exact_match(self):
        all_aliases = []
        for key, aliases in CANONICAL_STREAMS.items():
            all_aliases.extend(aliases)
        result = find_best_match("B.Sc", all_aliases)
        assert result is not None

    def test_semester_match(self):
        all_aliases = []
        for key, aliases in CANONICAL_SEMESTERS.items():
            all_aliases.extend(aliases)
        result = find_best_match("Semester 3", all_aliases)
        assert result is not None


class TestNormalizeTitle:
    """Tests for title normalization."""

    def test_empty_title(self):
        assert normalize_title("") == ""
        assert normalize_title(None) is None

    def test_typo_corrections(self):
        result = normalize_title("computer scince")
        assert "Computer" in result
        assert "Science" in result

    def test_question_paper_typo(self):
        result = normalize_title("questin papaer")
        assert "Question Paper" in result

    def test_title_casing(self):
        result = normalize_title("data structures and algorithms")
        assert result[0].isupper()

    def test_preserves_correct_titles(self):
        title = "Data Structures and Algorithms"
        result = normalize_title(title)
        # Should be roughly the same
        assert "Data" in result
        assert "Structures" in result


class TestNormalizeMetadataFuzz:
    """Fuzz tests for normalize_metadata."""

    @pytest.mark.parametrize("seed", range(20))
    def test_random_subject_fuzz(self, seed):
        """Random strings as subject should not crash."""
        rng = random.Random(seed)
        length = rng.randint(1, 50)
        random_subject = ''.join(rng.choices(string.ascii_letters + ' ', k=length))
        metadata = {"subject": random_subject, "stream": "bsc", "semester": "sem3"}
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)
        assert isinstance(corrections, list)
        # Subject should be a string or None
        assert result.get("subject") is None or isinstance(result.get("subject"), str)

    @pytest.mark.parametrize("seed", range(20))
    def test_random_stream_fuzz(self, seed):
        """Random strings as stream should not crash."""
        rng = random.Random(seed)
        length = rng.randint(1, 30)
        random_stream = ''.join(rng.choices(string.ascii_letters, k=length))
        metadata = {"stream": random_stream}
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)
        assert isinstance(corrections, list)

    @pytest.mark.parametrize("seed", range(20))
    def test_random_title_fuzz(self, seed):
        """Random strings as title should not crash."""
        rng = random.Random(seed)
        length = rng.randint(0, 100)
        random_title = ''.join(rng.choices(string.ascii_letters + ' ', k=length))
        metadata = {"title": random_title}
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)
        assert result.get("title") is None or isinstance(result.get("title"), str)

    @pytest.mark.parametrize("seed", range(20))
    def test_random_year_fuzz(self, seed):
        """Random year values should not crash."""
        rng = random.Random(seed)
        year = rng.randint(-1000, 10000)
        metadata = {"year": str(year)}
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)
        # Year should be int or unchanged
        assert "year" in result

    def test_empty_metadata(self):
        """Empty metadata dict should work."""
        result, corrections = normalize_metadata({})
        assert result == {}
        assert corrections == []

    def test_none_values_handled(self):
        """None values in metadata should not crash."""
        metadata = {
            "subject": None,
            "stream": None,
            "semester": None,
            "title": None,
            "year": None,
        }
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)

    def test_known_subject_normalizes(self):
        """Known subjects should be normalized correctly."""
        test_cases = [
            ("mathmatics", "Mathematics"),
            ("statistcs", "Statistics"),
            ("computer scince", "Computer Science"),
        ]
        for input_val, expected in test_cases:
            metadata = {"subject": input_val}
            result, corrections = normalize_metadata(metadata)
            assert result["subject"] == expected, f"'{input_val}' should normalize to '{expected}'"

    def test_known_stream_normalizes(self):
        """Known streams should normalize to canonical keys."""
        test_cases = ["B.Sc", "BSC", "b.sc", "b com", "BCA", "bba"]
        for stream in test_cases:
            metadata = {"stream": stream}
            result, corrections = normalize_metadata(metadata)
            assert result["stream"] in CANONICAL_STREAMS, f"'{stream}' should normalize to a canonical stream key"

    def test_known_semester_normalizes(self):
        """Known semesters should normalize to canonical IDs."""
        test_cases = ["Semester 3", "Sem 5", "sem1", "sem 6"]
        for sem in test_cases:
            metadata = {"semester": sem}
            result, corrections = normalize_metadata(metadata)
            assert result["semester"] in CANONICAL_SEMESTERS, f"'{sem}' should normalize to a canonical semester ID"

    def test_corrections_are_list_of_dicts(self):
        """Corrections should always be a list of dicts with expected keys."""
        metadata = {"subject": "mathmatics", "title": "questin papaer"}
        _, corrections = normalize_metadata(metadata)
        for c in corrections:
            assert "field" in c
            assert "original" in c
            assert "corrected" in c
            assert "confidence" in c
            assert 0.0 <= c["confidence"] <= 1.0

    def test_idempotent_normalization(self):
        """Normalizing already-normalized metadata should not change it."""
        metadata = {"subject": "Mathematics", "stream": "bsc", "semester": "sem3"}
        result1, _ = normalize_metadata(dict(metadata))
        result2, _ = normalize_metadata(dict(result1))
        assert result1 == result2

    def test_very_long_input(self):
        """Very long strings should not crash."""
        long_str = "a" * 10000
        metadata = {"subject": long_str, "title": long_str}
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)

    def test_special_characters(self):
        """Special characters should not crash."""
        metadata = {
            "subject": "Math@#$%^&*()",
            "title": "Test Special Chars Here",
            "stream": "B.Sc",
        }
        result, corrections = normalize_metadata(metadata)
        assert isinstance(result, dict)
        assert isinstance(result.get("title"), str)
