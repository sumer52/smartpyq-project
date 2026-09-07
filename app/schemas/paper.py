"""Pydantic schemas for Paper-related API requests and responses."""

from datetime import datetime
from typing import Optional, List, Any

from pydantic import BaseModel, ConfigDict, Field


class PaperCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=255)
    university: str = Field(..., min_length=1, max_length=255)
    course: Optional[str] = None
    stream: Optional[str] = None
    specialization: Optional[str] = None  # e.g., MSCS, MSDS, General
    year: int = Field(..., ge=1900, le=2100)
    semester: Optional[str] = None
    semester_year: Optional[str] = None
    exam_type: str = Field(..., min_length=1, max_length=50)
    exam_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    max_marks: Optional[int] = None
    difficulty_level: Optional[str] = None
    tags: Optional[List[str]] = None
    tenant_id: Optional[int] = None


class PaperUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    subject: Optional[str] = Field(None, min_length=1, max_length=255)
    university: Optional[str] = Field(None, min_length=1, max_length=255)
    course: Optional[str] = None
    stream: Optional[str] = None
    year: Optional[int] = Field(None, ge=1900, le=2100)
    semester: Optional[str] = None
    semester_year: Optional[str] = None
    exam_type: Optional[str] = None
    exam_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    max_marks: Optional[int] = None
    difficulty_level: Optional[str] = None
    tags: Optional[List[str]] = None


class PaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    subject: str
    university: str
    course: Optional[str] = None
    stream: Optional[str] = None
    specialization: Optional[str] = None
    year: int
    semester: Optional[str] = None
    semester_year: Optional[str] = None
    exam_type: str
    exam_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    max_marks: Optional[int] = None
    difficulty_level: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    page_count: Optional[int] = None
    status: str
    tenant_id: int
    uploader_id: int
    view_count: int = 0
    download_count: int = 0
    average_rating: float = 0.0
    rating_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)


class PaperSearchRequest(BaseModel):
    query: Optional[str] = None
    subject: Optional[str] = None
    university: Optional[str] = None
    stream: Optional[str] = None
    year: Optional[int] = None
    semester_year: Optional[str] = None
    exam_type: Optional[str] = None
    status: Optional[str] = None
    tenant_id: Optional[int] = None
    sort_by: str = "created_at"
    sort_order: str = "desc"
    page: int = Field(1, ge=1)
    limit: int = Field(20, ge=1, le=100)


class PaperSearchResponse(BaseModel):
    papers: List[PaperResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class PaperVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    paper_id: int
    version_number: int
    file_size: int
    file_name: str
    change_notes: Optional[str] = None
    uploaded_by: int
    created_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)
