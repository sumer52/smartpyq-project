"""Paper service for managing academic papers and documents.

Handles paper CRUD operations, search functionality, file uploads,
version management, and access control.
"""

import os
import hashlib
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_

from app.core.config import settings
from app.core.exceptions import (
    NotFoundError,
    ValidationError,
    PermissionError,
    ConflictError
)
from app.models.paper import Paper, PaperStatus, PaperVersion
from app.models.user import User, UserRole
from app.models.audit_log import AuditAction, AuditSeverity
from app.repositories.paper_repository import PaperRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.paper import (
    PaperCreateRequest,
    PaperUpdateRequest,
    PaperResponse,
    PaperSearchRequest,
    PaperSearchResponse,
    PaperVersionResponse
)
from app.utils.storage import StorageService
from app.services.cache_service import CacheService
from app.utils.pdf import PDFProcessor



class PaperService:
    """Service for paper management operations."""
    
    def __init__(
        self,
        db: Optional[AsyncSession] = None,
        storage_service: Optional[StorageService] = None,
        cache_service: Optional[CacheService] = None,
        pdf_processor: Optional[PDFProcessor] = None
    ):
        self.db = db
        self.paper_repo = PaperRepository(db) if db else None
        self.audit_repo = AuditLogRepository(db) if db else None
        self.storage_service = storage_service
        self.cache_service = cache_service
        self.pdf_processor = pdf_processor
    
    async def create_paper(
        self,
        paper_data: PaperCreateRequest,
        uploader: User,
        ip_address: Optional[str] = None
    ) -> PaperResponse:
        """Create a new paper.
        
        Args:
            paper_data: Paper creation data
            uploader: User creating the paper
            ip_address: Client IP address
            
        Returns:
            Created paper response
            
        Raises:
            ValidationError: If paper data is invalid
            PermissionError: If user lacks permission
        """
        # Check if user can create papers in this tenant
        if uploader.tenant_id != paper_data.tenant_id:
            if uploader.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN]:
                raise PermissionError("Cannot create papers for other tenants")
        
        # Validate tags
        if paper_data.tags and len(paper_data.tags) > 20:
            raise ValidationError("Maximum 20 tags allowed")
        
        # Normalize metadata (fix spelling, standardize names)
        from app.utils.metadata_normalizer import normalize_metadata
        meta_dict = paper_data.dict(exclude={'tenant_id'})
        meta_dict, corrections = normalize_metadata(meta_dict)
        if corrections:
            logger.info(f"Metadata corrections applied for paper: {[c['field'] + ': ' + c['original'] + ' -> ' + c['corrected'] for c in corrections]}")
        
        # Create paper
        paper_dict = meta_dict
        paper_dict.update({
            'tenant_id': paper_data.tenant_id or uploader.tenant_id,
            'uploader_id': uploader.id,
            'status': PaperStatus.PENDING,
            'created_at': datetime.utcnow()
        })
        
        paper = await self.paper_repo.create(**paper_dict)
        
        # Log audit event
        await self._log_audit(
            AuditAction.PAPER_CREATED,
            actor_id=uploader.id,
            target_type="paper",
            target_id=paper.id,
            tenant_id=paper.tenant_id,
            details=f"Paper created: {paper.title}",
            ip_address=ip_address
        )
        
        return PaperResponse.from_orm(paper)
    
    async def get_paper(
        self,
        paper_id: int,
        user: Optional[User] = None,
        include_content: bool = False
    ) -> PaperResponse:
        """Get paper by ID.
        
        Args:
            paper_id: Paper ID
            user: Requesting user
            include_content: Whether to include file content
            
        Returns:
            Paper response
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks access
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check access permissions
        if not await self._check_paper_access(paper, user):
            raise PermissionError("Access denied")
        
        # Get from cache if available
        cache_key = f"paper:{paper_id}:content:{include_content}"
        if self.cache_service and not include_content:
            cached_paper = await self.cache_service.get(cache_key)
            if cached_paper:
                return PaperResponse.parse_obj(cached_paper)
        
        paper_response = PaperResponse.from_orm(paper)
        
        # Cache the response
        if self.cache_service and not include_content:
            await self.cache_service.set(
                cache_key,
                paper_response.dict(),
                expire=3600  # 1 hour
            )
        
        return paper_response
    
    async def search_papers(
        self,
        search_request: PaperSearchRequest,
        user: Optional[User] = None
    ) -> PaperSearchResponse:
        """Search papers with filters.
        
        Args:
            search_request: Search parameters
            user: Requesting user
            
        Returns:
            Search results
        """
        # Build search filters
        filters = {}
        
        # Tenant filter
        if user and user.role not in [UserRole.ADMIN]:
            filters['tenant_id'] = user.tenant_id
        elif search_request.tenant_id:
            filters['tenant_id'] = search_request.tenant_id
        
        # Status filter (non-admins can only see approved papers)
        if user and user.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN]:
            filters['status'] = PaperStatus.APPROVED
        elif search_request.status:
            filters['status'] = search_request.status
        
        # Other filters
        if search_request.subject:
            filters['subject'] = search_request.subject
        if search_request.university:
            filters['university'] = search_request.university
        if search_request.stream:
            filters['stream'] = search_request.stream
        if search_request.year:
            filters['year'] = search_request.year
        if search_request.semester_year:
            filters['semester_year'] = search_request.semester_year
        if search_request.exam_type:
            filters['exam_type'] = search_request.exam_type
        
        # Check cache for common searches
        cache_key = None
        if self.cache_service and not search_request.query:
            cache_key = f"search:{hash(str(sorted(filters.items())))}:{search_request.page}:{search_request.limit}"
            cached_result = await self.cache_service.get(cache_key)
            if cached_result:
                return PaperSearchResponse.parse_obj(cached_result)
        
        # Perform search
        if search_request.query:
            # Full-text search
            papers, total = await self.paper_repo.search_papers(
                query=search_request.query,
                filters=filters,
                page=search_request.page,
                limit=search_request.limit,
                sort_by=search_request.sort_by,
                sort_order=search_request.sort_order
            )
        else:
            # Filter-based search
            papers, total = await self.paper_repo.get_papers_with_filters(
                filters=filters,
                page=search_request.page,
                limit=search_request.limit,
                sort_by=search_request.sort_by,
                sort_order=search_request.sort_order
            )
        
        # Convert to response objects
        paper_responses = [PaperResponse.from_orm(paper) for paper in papers]
        
        result = PaperSearchResponse(
            papers=paper_responses,
            total=total,
            page=search_request.page,
            limit=search_request.limit,
            total_pages=(total + search_request.limit - 1) // search_request.limit
        )
        
        # Cache the result
        if self.cache_service and cache_key:
            await self.cache_service.set(
                cache_key,
                result.dict(),
                expire=1800  # 30 minutes
            )
        
        return result
    
    async def upload_paper(
        self,
        file_data: bytes,
        filename: str,
        paper_data: PaperCreateRequest,
        uploader: User,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload paper file and create paper record.
        
        Accepts PDF and image files (JPG, JPEG, PNG, WEBP).
        For images, runs OCR to extract text for search indexing.
        
        Args:
            file_data: File content
            filename: Original filename
            paper_data: Paper metadata
            uploader: User uploading the file
            ip_address: Client IP address
            
        Returns:
            Upload result with paper info
            
        Raises:
            ValidationError: If file is invalid
            PermissionError: If user lacks permission
        """
        from app.models.paper import ProcessingStatus
        import io
        import os
        
        # Validate file - accept PDF and images
        allowed_extensions = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
        file_ext = os.path.splitext(filename.lower())[1]
        if file_ext not in allowed_extensions:
            raise ValidationError(f"Unsupported file type. Allowed: {', '.join(sorted(allowed_extensions))}")
        
        # Sanitize filename: strip any path components and control characters.
        # The original name is only stored as metadata (storage keys use the
        # content hash), so this is defense-in-depth against traversal.
        filename = os.path.basename(filename.replace("\\", "/")).strip()
        filename = "".join(ch for ch in filename if ch.isprintable())[:255] or f"upload{file_ext}"
        
        if len(file_data) > settings.MAX_FILE_SIZE:
            raise ValidationError(f"File size exceeds {settings.MAX_FILE_SIZE} bytes")
        
        # Determine declared MIME type from extension
        mime_type_map = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.webp': 'image/webp',
        }
        content_mime = mime_type_map.get(file_ext, 'application/octet-stream')
        
        # Sniff the real MIME type from magic bytes — reject content that does
        # not match its declared extension (blocks disguised uploads).
        sniffed_mime = self._sniff_mime(file_data)
        if sniffed_mime != content_mime:
            raise ValidationError(
                f"File content ({sniffed_mime or 'unknown'}) does not match its extension ({content_mime})"
            )
        
        # Generate file hash
        file_hash = hashlib.sha256(file_data).hexdigest()
        file_extension = Path(filename).suffix
        
        # Check for duplicate files by hash (warn but allow re-upload)
        existing_version = await self.paper_repo.get_version_by_checksum(file_hash)
        if existing_version:
            logger.info(f"Duplicate file detected (checksum match), allowing re-upload")
        
        # Create paper record first
        paper = await self.create_paper(paper_data, uploader, ip_address)
        
        # Canonical LOCAL staging key (also used for the version record).
        # Supabase stores under its own per-user key (below) — the download
        # endpoint resolves both shapes from paper.file_url.
        staging_key = f"papers/{paper.id}/{file_hash}{file_extension}"
        
        try:
            file_url = None
            storage_path = None  # local filesystem path to the stored bytes
            
            # Try Supabase Storage first, fallback to local filesystem
            from app.utils.supabase_client import is_supabase_storage_enabled, get_supabase_admin
            
            if is_supabase_storage_enabled():
                admin = get_supabase_admin()
                if admin:
                    try:
                        user_folder = str(uploader.id)
                        safe_filename = f"{file_hash}{file_extension}"
                        storage_path = f"{user_folder}/{safe_filename}"
                        
                        admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
                            path=storage_path,
                            file=file_data,
                            file_options={"content-type": content_mime}
                        )
                        file_url = storage_path  # Store path only; download endpoint generates signed URL
                        logger.info(f"File uploaded to Supabase Storage: {storage_path}")
                    except Exception as supabase_err:
                        if settings.ENV == "production":
                            # Never silently drop user files on Render's
                            # ephemeral filesystem — fail loudly and roll back.
                            raise ValidationError(
                                "File storage is temporarily unavailable. "
                                "Please try again in a few minutes."
                            )
                        logger.warning(f"Supabase Storage upload failed, falling back to local: {supabase_err}")
                        file_url = None  # Will trigger local fallback below
                else:
                    if settings.ENV == "production":
                        raise ValidationError(
                            "File storage is not configured. Please contact support."
                        )
                    logger.warning("Supabase admin client unavailable, falling back to local storage")
            elif settings.ENV == "production":
                # Production without Supabase configured: local disk is
                # ephemeral on Render, so refuse rather than lose files.
                raise ValidationError(
                    "File storage is not configured. Please contact support."
                )
            
            # Local fallback: development only.
            if not file_url:
                storage_base = settings.LOCAL_STORAGE_PATH or "./storage"
                local_path = os.path.join(storage_base, staging_key)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, 'wb') as f:
                    f.write(file_data)
                storage_path = local_path
                file_url = f"{settings.LOCAL_STORAGE_URL or 'http://localhost:8000/files'}/{staging_key}"

            # Extract text for search indexing. analyze_document needs a real
            # local file: for Supabase uploads, analyze the in-memory bytes via
            # a secure temp file (always deleted in finally). For local
            # development uploads, analyze the file we just wrote.
            extracted_text = ""
            import tempfile
            if storage_path and os.path.isfile(storage_path):
                analysis_target = storage_path
                tmp_fd = None
                try:
                    if not file_url.startswith(settings.LOCAL_STORAGE_URL or 'http://localhost:8000/files'):
                        # Remote object: write bytes to a temp file for analysis
                        tmp_fd, analysis_target = tempfile.mkstemp(
                            suffix=file_extension or ".bin"
                        )
                        with os.fdopen(tmp_fd, "wb") as tf:
                            tf.write(file_data)
                        tmp_fd = None  # ownership transferred to analysis_target
                    from app.services.document_analyzer import analyze_document
                    analysis = analyze_document(analysis_target, filename)
                    if analysis.success:
                        extracted_text = analysis.raw_text[:10000] if analysis.raw_text else ""
                except Exception as e:
                    logger.warning(f"Text extraction failed: {e}")
                finally:
                    if tmp_fd is not None:
                        os.close(tmp_fd)
                    try:
                        if analysis_target != storage_path:
                            os.remove(analysis_target)
                    except (OSError, UnboundLocalError):
                        pass
            else:
                logger.warning(
                    f"Paper {paper.id}: no local file available for text extraction"
                )

            # Update paper with file info and auto-approve
            await self.paper_repo.update(
                paper.id,
                file_url=file_url,
                file_name=filename,
                file_size=len(file_data),
                file_type=content_mime,
                checksum=file_hash,
                extracted_text=extracted_text,
                processing_status=ProcessingStatus.UPLOADED,
                status=PaperStatus.APPROVED
            )
            
            # Create paper version record with storage_key for reliable file lookup
            version_data = {
                'paper_id': paper.id,
                'version_number': 1,
                's3_key': staging_key,  # e.g. "papers/5/abc123.pdf"
                'checksum': file_hash,
                'file_size': len(file_data),
                'file_name': filename,
                'uploaded_by': uploader.id,
                'created_at': datetime.utcnow()
            }
            
            version = await self.paper_repo.create_version(**version_data)
            
            # Log audit event
            await self._log_audit(
                AuditAction.PAPER_UPLOADED,
                actor_id=uploader.id,
                target_type="paper",
                target_id=paper.id,
                tenant_id=paper.tenant_id,
                details=f"Paper uploaded: {filename} ({len(file_data)} bytes)",
                ip_address=ip_address,
                metadata={
                    'filename': filename,
                    'file_size': len(file_data),
                    'checksum': file_hash
                }
            )
            
            return {
                'id': paper.id,
                'title': paper.title,
                'status': 'uploaded',
                'message': 'Question paper uploaded successfully',
                'file_url': file_url,
                'processing_status': 'uploaded'
            }
            
        except Exception as e:
            # Clean up paper record if upload fails
            try:
                await self.paper_repo.delete(paper.id)
            except:
                pass
            raise ValidationError(f"Upload failed: {str(e)}")

    @staticmethod
    def _sniff_mime(data: bytes) -> Optional[str]:
        """Detect real MIME type from magic bytes (dev-friendly: unknown -> None)."""
        if not data or len(data) < 12:
            return None
        if data[:5] == b"%PDF-":
            return "application/pdf"
        if data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    async def approve_paper(
        self,
        paper_id: int,
        approver: User,
        ip_address: Optional[str] = None
    ) -> PaperResponse:
        """Approve a paper.
        
        Args:
            paper_id: Paper ID
            approver: User approving the paper
            ip_address: Client IP address
            
        Returns:
            Updated paper response
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks permission
            ValidationError: If paper cannot be approved
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check permissions
        if not await self._check_paper_moderation_access(paper, approver):
            raise PermissionError("Access denied")
        
        if paper.status != PaperStatus.PENDING:
            raise ValidationError("Only pending papers can be approved")
        
        # Update paper status
        updated_paper = await self.paper_repo.update(
            paper_id,
            status=PaperStatus.APPROVED,
            moderator_id=approver.id,
            approved_at=datetime.utcnow()
        )
        
        # Clear cache
        if self.cache_service:
            await self._clear_paper_cache(paper_id)
        
        # Log audit event
        await self._log_audit(
            AuditAction.PAPER_APPROVED,
            actor_id=approver.id,
            target_type="paper",
            target_id=paper_id,
            tenant_id=paper.tenant_id,
            details=f"Paper approved: {paper.title}",
            ip_address=ip_address
        )
        
        return PaperResponse.from_orm(updated_paper)
    
    async def reject_paper(
        self,
        paper_id: int,
        reason: str,
        rejector: User,
        ip_address: Optional[str] = None
    ) -> PaperResponse:
        """Reject a paper.
        
        Args:
            paper_id: Paper ID
            reason: Rejection reason
            rejector: User rejecting the paper
            ip_address: Client IP address
            
        Returns:
            Updated paper response
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks permission
            ValidationError: If paper cannot be rejected
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check permissions
        if not await self._check_paper_moderation_access(paper, rejector):
            raise PermissionError("Access denied")
        
        if paper.status not in [PaperStatus.PENDING, PaperStatus.APPROVED]:
            raise ValidationError("Paper cannot be rejected")
        
        # Update paper status
        updated_paper = await self.paper_repo.update(
            paper_id,
            status=PaperStatus.REJECTED,
            moderation_notes=reason
        )
        
        # Clear cache
        if self.cache_service:
            await self._clear_paper_cache(paper_id)
        
        # Log audit event
        await self._log_audit(
            AuditAction.PAPER_REJECTED,
            actor_id=rejector.id,
            target_type="paper",
            target_id=paper_id,
            tenant_id=paper.tenant_id,
            details=f"Paper rejected: {paper.title} - {reason}",
            ip_address=ip_address,
            metadata={'rejection_reason': reason}
        )
        
        return PaperResponse.from_orm(updated_paper)
    
    async def get_paper_download_url(
        self,
        paper_id: int,
        user: User,
        ip_address: Optional[str] = None
    ) -> str:
        """Get signed URL for paper download.
        
        Args:
            paper_id: Paper ID
            user: Requesting user
            ip_address: Client IP address
            
        Returns:
            Signed download URL
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks access
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check access permissions
        if not await self._check_paper_access(paper, user):
            raise PermissionError("Access denied")
        
        if paper.status != PaperStatus.APPROVED:
            if user.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN]:
                raise PermissionError("Paper not available for download")
        
        # Get latest version
        latest_version = await self.paper_repo.get_latest_version(paper_id)
        if not latest_version or not latest_version.s3_key:
            raise NotFoundError("Paper file not found")
        
        # Generate signed URL
        if self.storage_service:
            signed_url = await self.storage_service.generate_signed_url(
                latest_version.s3_key,
                expires_in=settings.SIGNED_URL_TTL_SECONDS
            )
        else:
            # Fallback to direct file serving
            signed_url = f"/api/v1/papers/{paper_id}/file"
        
        # Log download access
        await self._log_audit(
            AuditAction.PAPER_DOWNLOADED,
            actor_id=user.id,
            target_type="paper",
            target_id=paper_id,
            tenant_id=paper.tenant_id,
            details=f"Paper download accessed: {paper.title}",
            ip_address=ip_address
        )
        
        # Update download count
        await self.paper_repo.increment_download_count(paper_id)
        
        return signed_url
    
    async def get_paper_versions(
        self,
        paper_id: int,
        user: User
    ) -> List[PaperVersionResponse]:
        """Get all versions of a paper.
        
        Args:
            paper_id: Paper ID
            user: Requesting user
            
        Returns:
            List of paper versions
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks access
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check access permissions
        if not await self._check_paper_access(paper, user):
            raise PermissionError("Access denied")
        
        versions = await self.paper_repo.get_paper_versions(paper_id)
        return [PaperVersionResponse.from_orm(version) for version in versions]
    
    async def stamp_paper(
        self,
        paper_id: int,
        user_id: int,
        tenant_id: int,
        client_ip: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate a watermarked/stamped download URL for a paper.
        
        Currently returns a download URL. Full watermarking can be added later.
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        if paper.status != PaperStatus.APPROVED:
            raise ValidationError("Paper is not approved for download")
        
        # Log the stamp request
        await self._log_audit(
            AuditAction.PAPER_DOWNLOADED,
            actor_id=user_id,
            target_type="paper",
            target_id=paper_id,
            tenant_id=tenant_id,
            details=f"Stamp requested for: {paper.title}",
            ip_address=client_ip
        )
        
        import datetime as dt
        from datetime import timedelta
        expires = dt.datetime.utcnow() + timedelta(seconds=settings.SIGNED_URL_TTL_SECONDS)
        
        return {
            "download_url": f"/api/v1/papers/{paper_id}/download",
            "expires_at": expires,
            "file_name": paper.file_name or f"paper_{paper_id}.pdf",
            "file_size": paper.file_size or 0
        }
    
    async def delete_paper(
        self,
        paper_id: int,
        user: User,
        ip_address: Optional[str] = None
    ) -> bool:
        """Delete a paper.
        
        Args:
            paper_id: Paper ID
            user: User deleting the paper
            ip_address: Client IP address
            
        Returns:
            True if deleted successfully
            
        Raises:
            NotFoundError: If paper not found
            PermissionError: If user lacks permission
        """
        paper = await self.paper_repo.get_by_id(paper_id)
        if not paper:
            raise NotFoundError("Paper not found")
        
        # Check permissions (only admin, tenant admin, or uploader can delete)
        can_delete = (
            user.role in [UserRole.ADMIN, UserRole.TENANT_ADMIN] or
            (paper.uploader_id == user.id and paper.status == PaperStatus.PENDING)
        )
        
        if not can_delete:
            raise PermissionError("Access denied")
        
        # Delete associated files from storage
        versions = await self.paper_repo.get_paper_versions(paper_id)
        
        # Try Supabase Storage cleanup
        from app.utils.supabase_client import is_supabase_storage_enabled, get_supabase_admin
        if is_supabase_storage_enabled():
            admin = get_supabase_admin()
            if admin:
                for version in versions:
                    if version.s3_key:
                        try:
                            admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([version.s3_key])
                        except Exception:
                            pass
        
        if self.storage_service:
            for version in versions:
                if version.s3_key:
                    try:
                        await self.storage_service.delete_file(version.s3_key)
                    except Exception:
                        pass
        else:
            # Local filesystem cleanup fallback
            import shutil
            from app.core.config import settings
            storage_base = settings.LOCAL_STORAGE_PATH or "./uploads"
            paper_dir = os.path.join(storage_base, "papers", str(paper_id))
            if os.path.isdir(paper_dir):
                try:
                    shutil.rmtree(paper_dir)
                except Exception:
                    pass
            # Also clean up by s3_key paths
            for version in versions:
                if version.s3_key:
                    try:
                        file_path = os.path.join(storage_base, version.s3_key)
                        if os.path.isfile(file_path):
                            os.unlink(file_path)
                        # Clean up parent dir if empty
                        parent = os.path.dirname(file_path)
                        if os.path.isdir(parent) and not os.listdir(parent):
                            os.rmdir(parent)
                    except Exception:
                        pass
        
        # Delete from database
        await self.paper_repo.delete(paper_id)
        
        # Clear cache
        if self.cache_service:
            await self._clear_paper_cache(paper_id)
        
        # Log audit event
        await self._log_audit(
            AuditAction.PAPER_DELETED,
            actor_id=user.id,
            target_type="paper",
            target_id=paper_id,
            tenant_id=paper.tenant_id,
            details=f"Paper deleted: {paper.title}",
            ip_address=ip_address
        )
        
        return True
    
    async def get_paper_stats(
        self,
        user: Optional[User] = None,
        tenant_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get paper statistics.
        
        Args:
            user: Requesting user
            tenant_id: Tenant ID filter
            
        Returns:
            Statistics dictionary
        """
        # Apply tenant filter based on user permissions
        if user and user.role not in [UserRole.ADMIN]:
            tenant_id = user.tenant_id
        
        stats = await self.paper_repo.get_paper_stats(tenant_id=tenant_id)
        
        return {
            'total_papers': stats.get('total', 0),
            'approved_papers': stats.get('approved', 0),
            'pending_papers': stats.get('pending', 0),
            'rejected_papers': stats.get('rejected', 0),
            'total_downloads': stats.get('total_downloads', 0),
            'papers_by_exam_type': stats.get('by_exam_type', {}),
            'papers_by_subject': stats.get('by_subject', {}),
            'recent_uploads': stats.get('recent_uploads', 0)
        }
    
    async def _check_paper_access(
        self,
        paper: Paper,
        user: Optional[User]
    ) -> bool:
        """Check if user can access paper.
        
        Args:
            paper: Paper to check
            user: User requesting access
            
        Returns:
            True if access allowed
        """
        if not user:
            return paper.status == PaperStatus.APPROVED
        
        # Admins can access all papers
        if user.role == UserRole.ADMIN:
            return True
        
        # Tenant admins can access papers in their tenant
        if user.role == UserRole.TENANT_ADMIN and user.tenant_id == paper.tenant_id:
            return True
        
        # Users can access approved papers in their tenant
        if user.tenant_id == paper.tenant_id:
            return paper.status == PaperStatus.APPROVED or paper.uploader_id == user.id
        
        return False
    
    async def _check_paper_moderation_access(
        self,
        paper: Paper,
        user: User
    ) -> bool:
        """Check if user can moderate paper.
        
        Args:
            paper: Paper to check
            user: User requesting moderation access
            
        Returns:
            True if moderation access allowed
        """
        # Admins can moderate all papers
        if user.role == UserRole.ADMIN:
            return True
        
        # Tenant admins can moderate papers in their tenant
        if user.role == UserRole.TENANT_ADMIN and user.tenant_id == paper.tenant_id:
            return True
        
        return False
    
    async def _clear_paper_cache(self, paper_id: int) -> None:
        """Clear paper-related cache entries.
        
        Args:
            paper_id: Paper ID
        """
        if self.cache_service:
            # Clear specific paper cache
            cache_keys = [
                f"paper:{paper_id}:content:True",
                f"paper:{paper_id}:content:False"
            ]
            
            for key in cache_keys:
                await self.cache_service.delete(key)
            
            # Clear search cache (simplified - in production, use cache tags)
            await self.cache_service.delete_pattern("search:*")
    
    async def _log_audit(
        self,
        action: AuditAction,
        actor_id: Optional[int] = None,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log audit event.
        
        Args:
            action: Audit action
            actor_id: Actor user ID
            target_type: Target entity type
            target_id: Target entity ID
            tenant_id: Tenant ID
            details: Event details
            ip_address: Client IP address
            severity: Event severity
            metadata: Additional metadata
        """
        try:
            await self.audit_repo.create_log(
                action=action,
                actor_id=actor_id,
                target_type=target_type,
                target_id=target_id,
                tenant_id=tenant_id,
                details=details,
                ip_address=ip_address,
                severity=severity,
                metadata=metadata
            )
        except Exception:
            # Don't let audit logging failures break the main flow
            pass