"""Question models for extracted questions, groups, and analysis."""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON, Float,
    UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import Enum as SQLEnum

from app.core.database import Base


class AnalysisStatus(str, Enum):
    """Analysis processing status."""
    PENDING = "pending"
    EXTRACTING = "extracting"
    ANALYZING = "analyzing"
    MATCHING = "matching"
    COMPLETED = "completed"
    FAILED = "failed"


class SimilarityMethod(str, Enum):
    """Method used for similarity detection."""
    EXACT = "exact"
    TFIDF = "tfidf"
    SEMANTIC = "semantic"


class Question(Base):
    """Individual extracted question from a paper."""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    
    # Question content
    question_number = Column(String(20), nullable=True)  # e.g. "1", "Q1", "a"
    question_text = Column(Text, nullable=False)
    original_question_text = Column(Text, nullable=False)
    normalized_question_text = Column(Text, nullable=False)
    
    # Metadata
    section = Column(String(100), nullable=True)  # e.g. "Section A", "Part I"
    marks = Column(Integer, nullable=True)
    question_type = Column(String(50), nullable=True)  # descriptive, mcq, short_answer, etc.
    subject = Column(String(255), nullable=True, index=True)
    topic = Column(String(255), nullable=True, index=True)
    
    # Embedding for semantic search (stored as JSON array of floats)
    embedding = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    paper = relationship("Paper", foreign_keys=[paper_id])
    group_members = relationship("QuestionGroupMember", back_populates="question", cascade="all, delete-orphan")
    # bookmarks relationship defined in bookmark.py
    practice_attempts = relationship("PracticeAttempt", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_questions_paper_subject", "paper_id", "subject"),
    )


class QuestionGroup(Base):
    """A group of repeated/similar questions."""
    __tablename__ = "question_groups"

    id = Column(Integer, primary_key=True, index=True)
    
    # Representative question text (first or most common)
    representative_text = Column(Text, nullable=False)
    normalized_text = Column(Text, nullable=False)
    
    # Metadata
    subject = Column(String(255), nullable=True, index=True)
    topic = Column(String(255), nullable=True, index=True)
    frequency = Column(Integer, default=0, nullable=False)  # computed count
    similarity_method = Column(SQLEnum(SimilarityMethod, native_enum=False), default=SimilarityMethod.EXACT, nullable=False)
    confidence = Column(Float, default=1.0, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    members = relationship("QuestionGroupMember", back_populates="group", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_question_groups_subject_frequency", "subject", "frequency"),
    )


class QuestionGroupMember(Base):
    """Links a question to its question group."""
    __tablename__ = "question_group_members"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("question_groups.id"), nullable=False, index=True)
    similarity_score = Column(Float, nullable=True)  # How similar to representative
    is_exact_match = Column(Boolean, default=False, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    question = relationship("Question", back_populates="group_members")
    group = relationship("QuestionGroup", back_populates="members")

    __table_args__ = (
        UniqueConstraint("question_id", "group_id", name="uq_question_group"),
    )


class AnalysisResult(Base):
    """Tracks analysis runs per paper or per batch of papers."""
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(255), nullable=True, index=True)
    
    # What was analyzed
    paper_ids = Column(JSON, nullable=False, default=list)  # List of paper IDs
    paper_count = Column(Integer, default=0, nullable=False)
    
    # Results
    questions_extracted = Column(Integer, default=0, nullable=False)
    repeated_groups = Column(Integer, default=0, nullable=False)
    exact_matches = Column(Integer, default=0, nullable=False)
    similar_matches = Column(Integer, default=0, nullable=False)
    
    # Status
    status = Column(SQLEnum(AnalysisStatus, native_enum=False), default=AnalysisStatus.PENDING, nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class PracticeAttempt(Base):
    """Tracks user practice attempts."""
    __tablename__ = "practice_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("question_groups.id"), nullable=True)
    
    status = Column(String(50), default="attempted", nullable=False)  # attempted, reviewed, mastered
    user_answer = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User")
    question = relationship("Question", back_populates="practice_attempts")
    group = relationship("QuestionGroup")
