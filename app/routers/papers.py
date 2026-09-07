import os
import logging as _plog
import tempfile
import logging
"""Papers API Routes

Handles paper management, upload, search, and download operations.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
    Query
)
from pydantic import BaseModel, Field

from ..core.dependencies import (
    get_current_active_user,
    get_current_user_optional,
    get_current_tenant,
    require_roles,
    get_client_ip
)
from ..core.exceptions import (
    ValidationError,
    PermissionError,
    NotFoundError,
    ConflictError
)
from ..models.user import User
from ..models.tenant import Tenant
from ..models.paper import PaperStatus, ExamType
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.database import get_db
from ..services.paper_service import PaperService
from app.utils.cache import app_cache
from ..services.document_analyzer import (
    analyze_document,
    validate_file,
    SUPPORTED_EXTENSIONS
)
from ..schemas.paper import PaperCreateRequest, PaperSearchRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/papers", tags=["papers"])

# Request/Response Models
class PaperResponse(BaseModel):
    """Paper response model"""
    id: int
    title: str
    subject: str
    university: str = ""
    stream: str = ""
    specialization: str = ""
    year: int
    semester: str = ""
    exam_type: str = ""
    tags: List[str] = []
    status: str = "approved"
    uploader_name: str = ""
    created_at: datetime = None
    download_count: int = 0
    file_size: Optional[int] = None
    
class PaperListResponse(BaseModel):
    """Paginated paper list response"""
    papers: List[PaperResponse]
    total: int
    page: int
    per_page: int
    total_pages: int

class PaperUploadResponse(BaseModel):
    """Paper upload response"""
    id: int
    title: str
    status: str
    message: str
    processing_job_id: Optional[str] = None

class PaperSearchResponse(BaseModel):
    """Paper search response"""
    papers: List[PaperResponse]
    total: int
    query: str
    filters: dict
    took_ms: int

class DownloadUrlResponse(BaseModel):
    """Download URL response"""
    download_url: str
    expires_at: datetime
    file_name: str
    file_size: int

class PaperStatsResponse(BaseModel):
    """Paper statistics response"""
    total_papers: int
    approved_papers: int
    pending_papers: int
    rejected_papers: int
    total_downloads: int
    popular_subjects: List[dict]
    recent_uploads: int

class DetectedMetadataResponse(BaseModel):
    """Metadata detected from a document."""
    title: str = ""
    stream: str = ""
    specialization: str = ""
    semester: str = ""
    subject: str = ""
    year: int = 0
    university: str = ""
    exam_type: str = ""
    max_marks: Optional[int] = None
    duration_minutes: Optional[int] = None
    confidence: float = 0.0

class DetectedQuestionResponse(BaseModel):
    """A question detected from the paper."""
    question_number: str = ""
    question_text: str = ""
    section: str = ""
    marks: Optional[int] = None
    question_type: str = "descriptive"

class AnalyzeResponse(BaseModel):
    """Response from document analysis endpoint."""
    success: bool
    error: Optional[str] = None
    file_type: str = ""
    page_count: int = 0
    metadata: DetectedMetadataResponse = Field(default_factory=DetectedMetadataResponse)
    questions: List[DetectedQuestionResponse] = []
    sections: List[str] = []
    confidence: float = 0.0

# Initialize service
paper_service = PaperService()

@router.get("/", response_model=PaperListResponse)
async def get_papers(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    subject: Optional[str] = Query(None, description="Filter by subject"),
    university: Optional[str] = Query(None, description="Filter by university"),
    stream: Optional[str] = Query(None, description="Filter by stream"),
    specialization: Optional[str] = Query(None, description="Filter by specialization"),
    year: Optional[int] = Query(None, ge=2000, le=2030, description="Filter by year"),
    semester: Optional[str] = Query(None, description="Filter by semester"),
    paper_status: Optional[PaperStatus] = Query(PaperStatus.APPROVED, description="Filter by status"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated list of papers with filters (public browsing)"""
    try:
        from sqlalchemy import select, func
        from app.models.paper import Paper as PaperModel
        
        conditions = [PaperModel.status == paper_status]
        if subject:
            conditions.append(PaperModel.subject.ilike(f'%{subject}%'))
        if university:
            conditions.append(PaperModel.university.ilike(f'%{university}%'))
        if stream:
            conditions.append(PaperModel.stream.ilike(f'%{stream}%'))
        if specialization:
            conditions.append(PaperModel.specialization.ilike(f'%{specialization}%'))
        if year:
            conditions.append(PaperModel.year == year)
        if semester:
            conditions.append(PaperModel.semester.ilike(f'%{semester}%'))
        
        count_q = select(func.count(PaperModel.id)).where(*conditions)
        total = (await db.execute(count_q)).scalar() or 0
        
        offset = (page - 1) * per_page
        query = select(PaperModel).where(*conditions).order_by(PaperModel.created_at.desc()).offset(offset).limit(per_page)
        result = await db.execute(query)
        papers = result.scalars().all()
        
        paper_list = []
        for p in papers:
            paper_list.append(PaperResponse(
                id=p.id,
                title=p.title,
                subject=p.subject,
                university=p.university or "",
                stream=p.stream or "",
                specialization=p.specialization or "",
                year=p.year,
                semester=p.semester or "",
                exam_type=p.exam_type.value if p.exam_type else "final",
                tags=p.tags or [],
                status=p.status.value if p.status else "approved",
                uploader_name="Student",
                created_at=p.created_at,
                download_count=p.download_count or 0,
                file_size=p.file_size
            ))
        
        return PaperListResponse(
            papers=paper_list,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve papers: {str(e)}")

@router.get("/years")
async def get_available_years(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all available exam years from uploaded papers"""
    try:
        from sqlalchemy import select, func, distinct
        from app.models.paper import Paper as PaperModel
        
        result = await db.execute(
            select(func.distinct(PaperModel.year))
            .filter(PaperModel.status == PaperStatus.APPROVED)
            .order_by(PaperModel.year)
        )
        years = [row[0] for row in result.all() if row[0]]
        return {"years": years}
    except Exception as e:
        return {"years": [], "error": str(e)}
    except Exception as e:
        _plog.getLogger(__name__).debug("Traceback omitted")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve papers."
        )

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_paper(
    file: UploadFile = File(..., description="PDF or image file to analyze"),
    current_user: User = Depends(get_current_active_user),
):
    """Analyze an uploaded document before submission.

    Accepts PDF, JPG, JPEG, PNG, or WEBP files.
    Extracts metadata (title, stream, semester, subject, year, etc.)
    and questions from the document using text extraction and OCR.
    
    Returns detected information for user review before final upload.
    """
    try:
        # Read file content
        file_content = await file.read()

        # Validate the file
        validation = validate_file(file_content, file.filename)
        if not validation['valid']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation['error']
            )

        # Save to temp file for processing
        ext = os.path.splitext(file.filename or '')[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name

        try:
            # Run document analysis
            analysis = analyze_document(tmp_path, file.filename)

            return AnalyzeResponse(
                success=analysis.success,
                error=analysis.error,
                file_type=analysis.file_type,
                page_count=analysis.page_count,
                metadata=DetectedMetadataResponse(**analysis.metadata.to_dict()),
                questions=[DetectedQuestionResponse(**q.to_dict()) for q in analysis.questions],
                sections=analysis.sections,
                confidence=analysis.confidence,
            )
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except HTTPException:
        raise
    except Exception as e:
        _plog.getLogger(__name__).error(f"Analysis error: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze document."
        )

@router.get("/search")
async def search_papers(
    q: Optional[str] = Query(None, min_length=2, description="Search query (optional - returns all if empty)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    subject: Optional[str] = Query(None),
    stream: Optional[str] = Query(None),
    university: Optional[str] = Query(None),
    year: Optional[int] = Query(None, ge=2000, le=2030),
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Full-text search papers
    
    Searches paper titles, subjects, and content using PostgreSQL full-text search.
    Supports additional filtering by subject, university, and year.
    """
    try:
        filters = {
            "subject": subject,
            "university": university,
            "year": year
        }
        
        # Remove None values
        filters = {k: v for k, v in filters.items() if v is not None}
        
        paper_svc = PaperService(db=db)
        search_request = PaperSearchRequest(
            query=q,
            subject=subject,
            stream=stream,
            university=university,
            year=year,
            tenant_id=current_tenant.id,
            page=page,
            limit=per_page
        )
        
        result = await paper_svc.search_papers(
            search_request=search_request,
            user=current_user
        )
        
        return result
        
    except Exception as e:
        import traceback
        _plog.getLogger(__name__).error(f"Search error: {type(e).__name__}")
        _plog.getLogger(__name__).debug("Traceback omitted")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed."
        )

@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get paper by ID
    
    Returns detailed paper information if user has access.
    """
    try:
        paper_svc = PaperService(db=db)
        paper = await paper_svc.get_paper(
            paper_id=paper_id,
            user=current_user
        )
        
        if not paper:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paper not found"
            )
            
        return paper
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except Exception as e:
        import traceback
        _plog.getLogger(__name__).error(f"Get paper error: {type(e).__name__}")
        _plog.getLogger(__name__).debug("Traceback omitted")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve paper."
        )

@router.post("/upload", response_model=PaperUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_paper(
    file: UploadFile = File(..., description="PDF file to upload"),
    title: str = Form(..., min_length=3, max_length=200),
    subject: str = Form(..., min_length=2, max_length=100),
    university: str = Form("", max_length=100),
    stream: str = Form(..., min_length=1, max_length=100),
    specialization: str = Form("", max_length=100),
    semester: str = Form(..., min_length=1, max_length=50),
    exam: str = Form(..., min_length=1, max_length=100),
    year: int = Form(..., ge=2000, le=2030),
    tags: str = Form("", description="Comma-separated tags"),
    description: str = Form("", max_length=1000),
    current_user: User = Depends(get_current_active_user),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Upload a new paper
    
    Accepts PDF files and metadata. File is validated and stored.
    Returns paper ID and processing status.
    """
    try:
        # Create paper service with db session
        from app.core.database import get_db as _get_db
        svc = PaperService(db=db)
        # Validate file type - accept PDF and images
        filename_lower = file.filename.lower() if file.filename else ""
        content_type = file.content_type or ""
        
        allowed_extensions = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
        file_ext = os.path.splitext(filename_lower)[1]
        
        if file_ext not in allowed_extensions:
            supported = ', '.join(sorted(allowed_extensions))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type. Supported formats: {supported}"
            )
            
        # Read file content
        file_content = await file.read()
        
        # Validate file is not empty
        if len(file_content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The file is empty. Please upload a valid file."
            )
        
        # Validate file size (50MB max)
        max_size = 50 * 1024 * 1024  # 50MB
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size exceeds 50MB limit. Please upload a smaller file."
            )
            
        # Stream authorization: users can only upload for their enrolled stream
        user_stream = (current_user.course or "").lower()
        paper_stream = stream.lower()
        
        # Map course names to stream IDs
        stream_map = {
            'bsc': 'bsc', 'b.sc': 'bsc', 'b.sc computer science': 'bsc',
            'bcom': 'bcom', 'b.com': 'bcom',
            'bca': 'bca', 'bba': 'bba'
        }
        
        user_stream_id = stream_map.get(user_stream, user_stream)
        paper_stream_id = stream_map.get(paper_stream, paper_stream)
        
        # Allow admins to upload for any stream
        is_admin = hasattr(current_user, 'role') and (current_user.role or '').lower() in ['admin', 'tenant_admin', 'super_admin']
        
        if not is_admin and user_stream_id and paper_stream_id and user_stream_id != paper_stream_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only upload papers for your enrolled stream: {current_user.course}"
            )
        
        # Parse tags
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []
        
        # Get tenant (use default tenant for now)
        from app.models.tenant import Tenant
        from app.core.database import get_db
        from sqlalchemy import select
        
        # Create paper data object
        from app.models.paper import ExamType
        exam_type_value = ExamType.FINAL  # Default to final exam
        if 'mid' in exam.lower():
            exam_type_value = ExamType.MIDTERM
        elif 'quiz' in exam.lower():
            exam_type_value = ExamType.QUIZ
        
        paper_data = PaperCreateRequest(
            title=title,
            subject=subject,
            university=university if university else "Not Specified",
            stream=stream,
            specialization=specialization,
            year=year,
            semester=semester,
            exam_type=exam_type_value,
            tags=tag_list,
            tenant_id=current_user.tenant_id or 1
        )
        
        result = await svc.upload_paper(
            file_data=file_content,
            filename=file.filename,
            paper_data=paper_data,
            uploader=current_user,
            ip_address=client_ip
        )
        
        return PaperUploadResponse(**result)
        
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        _plog.getLogger(__name__).error(f"Upload error: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {type(e).__name__}"
        )

@router.get("/{paper_id}/download")
async def download_paper(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Download paper file directly (PDF or image).
    
    Uses the storage_key from PaperVersion to locate the file on disk.
    Stream-based authorization: users can only download papers 
    matching their enrolled stream/specialization.
    Super admins can download any paper.
    """
    from starlette.responses import FileResponse
    from app.core.config import settings
    from sqlalchemy import select
    from app.models.paper import Paper as PaperModel, PaperVersion
    
    from app.utils.supabase_client import is_supabase_storage_enabled, get_supabase_admin
    
    storage_base = settings.LOCAL_STORAGE_PATH or "./uploads"
    
    # Fetch paper FIRST - needed for authorization and storage path
    query = select(PaperModel).where(PaperModel.id == paper_id)
    result = await db.execute(query)
    paper = result.scalar_one_or_none()
    
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    # Authorization check: stream-based access (AFTER paper fetch)
    user = current_user
    is_admin = hasattr(user, 'role') and (user.role or '').lower() in ['admin', 'tenant_admin', 'super_admin']
    
    if not is_admin:
        user_stream = (user.course or "").lower()
        user_spec = (user.specialization or "").lower()
        paper_stream = (paper.stream or "").lower()
        paper_spec = (paper.specialization or "").lower()
        
        # Map course names to stream IDs
        stream_map = {
            'bsc': 'bsc', 'b.sc': 'bsc', 'b.sc computer science': 'bsc',
            'bcom': 'bcom', 'b.com': 'bcom',
            'bca': 'bca', 'bba': 'bba'
        }
        
        user_stream_id = stream_map.get(user_stream, user_stream)
        paper_stream_id = stream_map.get(paper_stream, paper_stream)
        
        # Check if user has access to this paper stream
        if user_stream_id and paper_stream_id and user_stream_id != paper_stream_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have access to papers from this stream."
            )
        
        # Specialization check removed: shared papers are accessible
        # to all users within the same stream (product requirement).
    
    # After authorization, try Supabase signed URL
    if is_supabase_storage_enabled() and paper.file_url:
        admin = get_supabase_admin()
        if admin:
            storage_path = None
            if '/question-papers/' in (paper.file_url or ''):
                storage_path = paper.file_url.split('/question-papers/', 1)[-1]
            elif paper.file_url and not paper.file_url.startswith('http') and '/' in paper.file_url:
                # file_url is a storage path like 'user_id/hash.ext'
                storage_path = paper.file_url
            elif paper.file_url and 'supabase' in paper.file_url:
                version_q = select(PaperVersion).where(PaperVersion.paper_id == paper_id)
                ver_result = await db.execute(version_q)
                ver = ver_result.scalars().first()
                if ver and ver.s3_key:
                    storage_path = ver.s3_key
            
            if storage_path:
                try:
                    signed = admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
                        storage_path, expires_in=3600
                    )
                    if signed and signed.get('signedURL'):
                        from starlette.responses import RedirectResponse
                        from sqlalchemy import text as _sa_text
                        await db.execute(_sa_text('UPDATE papers SET download_count = download_count + 1 WHERE id = :pid'), {'pid': paper_id})
                        await db.commit()
                        return RedirectResponse(url=signed['signedURL'], status_code=307)
                except Exception as e:
                    logger.warning(f"Supabase signed URL failed, falling back to local: {e}")
    
    # Locate file using PaperVersion storage_key (DB-driven, not filesystem scan)
    # Cache resolved path to avoid repeated filesystem scans
    path_cache_key = f"paper_path:{paper_id}"
    cached_path = app_cache.get(path_cache_key)
    if cached_path and os.path.isfile(cached_path):
        file_path = cached_path
    else:
        file_path = None

    version_query = select(PaperVersion).where(
        PaperVersion.paper_id == paper_id
    ).order_by(PaperVersion.version_number.desc())
    version_result = await db.execute(version_query)
    version = version_result.scalars().first()
    
    if file_path is None:
        if version and version.s3_key:
            # Resolve storage_key to absolute path
            # storage_key format: "papers/{paper_id}/{hash}.ext"
            candidate = os.path.join(storage_base, version.s3_key)
            if os.path.isfile(candidate):
                file_path = candidate
    
    # Fallback: check file_url stored on paper record
    if not file_path and paper.file_url:
        # file_url format: "http://localhost:8000/files/papers/{id}/{hash}.ext"
        # Extract the path portion after /files/
        url_path = paper.file_url
        for prefix in [settings.LOCAL_STORAGE_URL + "/", settings.LOCAL_STORAGE_URL]:
            if url_path.startswith(prefix):
                url_path = url_path[len(prefix):]
                break
        candidate = os.path.join(storage_base, url_path)
        if os.path.isfile(candidate):
            file_path = candidate
    
    # Fallback: scan uploads/papers/{paper_id}/ (legacy files)
    if not file_path:
        allowed_exts = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
        upload_dir = os.path.join(storage_base, "papers", str(paper_id))
        if os.path.exists(upload_dir):
            for f in sorted(os.listdir(upload_dir)):
                ext = os.path.splitext(f)[1].lower()
                if ext in allowed_exts:
                    file_path = os.path.join(upload_dir, f)
                    break
    
    # Cache resolved path to avoid repeated filesystem scans
    if file_path:
        app_cache.set(path_cache_key, file_path, ttl=300)

    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine MIME type
    ext = os.path.splitext(file_path)[1].lower()
    mime_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    mime_type = mime_map.get(ext, "application/octet-stream")
    
    # Increment download count atomically (no race condition)
    try:
        from sqlalchemy import text
        await db.execute(
            text('UPDATE papers SET download_count = download_count + 1 WHERE id = :pid'),
            {'pid': paper_id}
        )
        await db.commit()
    except Exception:
        pass  # Don't fail download if counter update fails
    
    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=f"paper_{paper_id}{ext}"
    )

@router.post("/{paper_id}/stamp", response_model=DownloadUrlResponse)
async def stamp_paper(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Generate watermarked version of paper
    
    Creates a watermarked copy with user information and returns download URL.
    Used for tracking and preventing unauthorized distribution.
    """
    try:
        paper_svc = PaperService(db=db)
        result = await paper_svc.stamp_paper(
            paper_id=paper_id,
            user_id=current_user.id,
            tenant_id=current_tenant.id,
            client_ip=client_ip
        )
        
        return DownloadUrlResponse(**result)
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate stamped paper"
        )

# Admin endpoints
@router.post("/{paper_id}/approve")
async def approve_paper(
    paper_id: int,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Approve pending paper
    
    Admin/tenant_admin only. Changes paper status to approved.
    """
    try:
        paper_svc = PaperService(db=db)
        await paper_svc.approve_paper(
            paper_id=paper_id,
            approver=current_user,
            ip_address=client_ip
        )
        
        return {"message": "Paper approved successfully"}
        
    except NotFoundError:
        # Good
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve paper"
        )

@router.post("/{paper_id}/reject")
async def reject_paper(
    paper_id: int,
    reason: str = Form(..., min_length=10, max_length=500),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Reject pending paper
    
    Admin/tenant_admin only. Changes paper status to rejected with reason.
    """
    try:
        paper_svc = PaperService(db=db)
        await paper_svc.reject_paper(
            paper_id=paper_id,
            reason=reason,
            rejector=current_user,
            ip_address=client_ip
        )
        
        return {"message": "Paper rejected successfully"}
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject paper"
        )

@router.delete("/{paper_id}")
async def delete_paper(
    paper_id: int,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Delete paper
    
    Admin/tenant_admin only. Permanently removes paper and associated files.
    """
    try:
        paper_svc = PaperService(db=db)
        await paper_svc.delete_paper(
            paper_id=paper_id,
            user=current_user,
            ip_address=client_ip
        )
        
        return {"message": "Paper deleted successfully"}
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete paper"
        )

@router.get("/stats/overview", response_model=PaperStatsResponse)
async def get_paper_stats(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Get paper statistics
    
    Returns overview of paper counts, popular subjects, and recent activity.
    """
    try:
        cache_key = f"paper_stats:{current_tenant.id}"
        cached = app_cache.get(cache_key)
        if cached is not None:
            return PaperStatsResponse(**cached)
        stats = await paper_service.get_paper_stats(
            tenant_id=current_tenant.id,
            user_id=current_user.id
        )
        app_cache.set(cache_key, stats, ttl=120)
        return PaperStatsResponse(**stats)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve statistics"
        )