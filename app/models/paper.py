"""Paper model for managing question papers and documents.

Handles paper metadata, file storage, versioning, and search functionality.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON, Float
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import Enum as SQLEnum

from app.core.database import Base


class PaperStatus(str, Enum):
    """Paper status enumeration."""
    DRAFT = "draft"          # Being uploaded/processed
    PENDING = "pending"      # Awaiting moderation
    APPROVED = "approved"    # Approved and visible
    REJECTED = "rejected"    # Rejected by moderator
    ARCHIVED = "archived"    # Archived/hidden


class ExamType(str, Enum):
    """Exam type enumeration."""
    MIDTERM = "midterm"
    FINAL = "final"
    QUIZ = "quiz"
    ASSIGNMENT = "assignment"
    PRACTICAL = "practical"
    VIVA = "viva"
    OTHER = "other"


class ProcessingStatus(str, Enum):
    """Processing status enumeration for paper upload pipeline."""
    UPLOADED = "uploaded"      # File uploaded, awaiting processing
    PROCESSING = "processing"  # Being processed
    COMPLETED = "completed"    # Processing complete
    FAILED = "failed"          # Processing failed


class DifficultyLevel(str, Enum):
    """Difficulty level enumeration."""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Paper(Base):
    """Paper model for question papers and documents.
    
    Represents academic papers with metadata, file storage,
    and search functionality.
    """
    
    __tablename__ = "papers"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Basic information
    title = Column(String(500), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Academic metadata
    subject = Column(String(255), nullable=False, index=True)
    university = Column(String(255), nullable=False, index=True)
    course = Column(String(255), nullable=True, index=True)
    stream = Column(String(255), nullable=True, index=True)
    specialization = Column(String(255), nullable=True, index=True)  # e.g., MSCS, MSDS, General
    
    # Time-based metadata
    year = Column(Integer, nullable=False, index=True)
    semester = Column(String(50), nullable=True)
    semester_year = Column(String(10), nullable=True)  # e.g., "2023-24"
    
    # Exam details
    exam_type = Column(SQLEnum(ExamType), nullable=False, index=True)
    exam_date = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    max_marks = Column(Integer, nullable=True)
    
    # Classification
    difficulty_level = Column(SQLEnum(DifficultyLevel), nullable=True, index=True)
    tags = Column(JSON, nullable=False, default=list)  # List of tags
    
    # File information
    file_url = Column(String(1000), nullable=True)  # Storage URL
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)  # Size in bytes
    file_type = Column(String(50), nullable=True)  # MIME type
    checksum = Column(String(64), nullable=True)  # SHA-256 hash
    
    # Content extraction
    extracted_text = Column(Text, nullable=True)  # OCR/extracted text
    page_count = Column(Integer, nullable=True)
    
    # Processing status for upload pipeline
    processing_status = Column(SQLEnum(ProcessingStatus), default=ProcessingStatus.UPLOADED, nullable=False, index=True)
    processing_error = Column(Text, nullable=True)
    
    # Status and moderation
    status = Column(SQLEnum(PaperStatus), default=PaperStatus.DRAFT, nullable=False, index=True)
    moderation_notes = Column(Text, nullable=True)
    
    # Relationships
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    moderator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Analytics
    view_count = Column(Integer, default=0, nullable=False)
    download_count = Column(Integer, default=0, nullable=False)
    rating_sum = Column(Float, default=0.0, nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)
    
    # Search and indexing
    search_vector = Column(Text, nullable=True)  # Full-text search vector
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="papers")
    uploader = relationship("User", back_populates="papers", foreign_keys=[uploader_id])
    moderator = relationship("User", foreign_keys=[moderator_id])
    versions = relationship("PaperVersion", back_populates="paper", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Paper(id={self.id}, title='{self.title[:50]}...', subject='{self.subject}')>"
    
    @property
    def is_approved(self) -> bool:
        """Check if paper is approved."""
        return self.status == PaperStatus.APPROVED
    
    @property
    def is_public(self) -> bool:
        """Check if paper is publicly visible."""
        return self.status == PaperStatus.APPROVED
    
    @property
    def average_rating(self) -> float:
        """Calculate average rating."""
        if self.rating_count == 0:
            return 0.0
        return self.rating_sum / self.rating_count
    
    @property
    def file_size_mb(self) -> float:
        """Get file size in MB."""
        if self.file_size is None:
            return 0.0
        return self.file_size / (1024 * 1024)
    
    def add_tag(self, tag: str) -> None:
        """Add a tag to the paper.
        
        Args:
            tag: Tag to add
        """
        if self.tags is None:
            self.tags = []
        
        tag = tag.strip().lower()
        if tag and tag not in self.tags:
            self.tags.append(tag)
    
    def remove_tag(self, tag: str) -> None:
        """Remove a tag from the paper.
        
        Args:
            tag: Tag to remove
        """
        if self.tags is None:
            return
        
        tag = tag.strip().lower()
        if tag in self.tags:
            self.tags.remove(tag)
    
    def has_tag(self, tag: str) -> bool:
        """Check if paper has a specific tag.
        
        Args:
            tag: Tag to check
            
        Returns:
            bool: True if paper has the tag
        """
        if self.tags is None:
            return False
        return tag.strip().lower() in self.tags
    
    def increment_view_count(self) -> None:
        """Increment the view count."""
        self.view_count += 1
    
    def increment_download_count(self) -> None:
        """Increment the download count."""
        self.download_count += 1
    
    def add_rating(self, rating: float) -> None:
        """Add a rating to the paper.
        
        Args:
            rating: Rating value (1-5)
        """
        if 1 <= rating <= 5:
            self.rating_sum += rating
            self.rating_count += 1
    
    def can_be_accessed_by(self, user) -> bool:
        """Check if paper can be accessed by a user.
        
        Args:
            user: User object
            
        Returns:
            bool: True if user can access paper
        """
        # Super admin can access all papers
        if user.is_super_admin:
            return True
        
        # Paper must be approved for regular access
        if not self.is_approved:
            # Only uploader, moderators, and tenant admins can access non-approved papers
            return (
                user.id == self.uploader_id or
                user.is_admin or
                (user.is_tenant_admin and user.tenant_id == self.tenant_id)
            )
        
        # Check tenant access
        return user.can_access_tenant(self.tenant_id)
    
    def to_dict(self, include_content: bool = False) -> Dict[str, Any]:
        """Convert paper to dictionary representation.
        
        Args:
            include_content: Whether to include extracted content
            
        Returns:
            dict: Paper data as dictionary
        """
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "subject": self.subject,
            "university": self.university,
            "course": self.course,
            "stream": self.stream,
            "specialization": self.specialization,
            "year": self.year,
            "semester": self.semester,
            "semester_year": self.semester_year,
            "exam_type": self.exam_type.value if self.exam_type else None,
            "exam_date": self.exam_date.isoformat() if self.exam_date else None,
            "duration_minutes": self.duration_minutes,
            "max_marks": self.max_marks,
            "difficulty_level": self.difficulty_level.value if self.difficulty_level else None,
            "tags": self.tags or [],
            "file_name": self.file_name,
            "file_size": self.file_size,
            "file_size_mb": self.file_size_mb,
            "file_type": self.file_type,
            "page_count": self.page_count,
            "processing_status": self.processing_status.value if self.processing_status else None,
            "processing_error": self.processing_error,
            "status": self.status.value,
            "tenant_id": self.tenant_id,
            "uploader_id": self.uploader_id,
            "view_count": self.view_count,
            "download_count": self.download_count,
            "average_rating": self.average_rating,
            "rating_count": self.rating_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None
        }
        
        if include_content:
            data["extracted_text"] = self.extracted_text
        
        return data


class PaperVersion(Base):
    """Paper version model for tracking file versions.
    
    Maintains history of paper file changes and versions.
    """
    
    __tablename__ = "paper_versions"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Relationships
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    
    # Version information
    version_number = Column(Integer, nullable=False)
    s3_key = Column(String(500), nullable=False)  # Storage key
    checksum = Column(String(64), nullable=False)  # SHA-256 hash
    
    # File metadata
    file_size = Column(Integer, nullable=False)
    file_name = Column(String(255), nullable=False)
    
    # Change information
    change_notes = Column(Text, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    paper = relationship("Paper", back_populates="versions")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    
    def __repr__(self) -> str:
        return f"<PaperVersion(id={self.id}, paper_id={self.paper_id}, version={self.version_number})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert version to dictionary representation."""
        return {
            "id": self.id,
            "paper_id": self.paper_id,
            "version_number": self.version_number,
            "file_size": self.file_size,
            "file_name": self.file_name,
            "change_notes": self.change_notes,
            "uploaded_by": self.uploaded_by,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }