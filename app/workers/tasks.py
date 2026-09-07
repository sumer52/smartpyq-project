"""Celery tasks for Smart PYQ background processing.

Includes tasks for:
- File upload processing (PDF parsing, OCR, virus scanning)
- Email sending (OTP, notifications, newsletters)
- Analytics generation
- Cleanup operations
"""

import logging
import hashlib
import mimetypes
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

from celery import current_task
from sqlalchemy.orm import Session

from .celery_app import celery_app
from ..core.database import get_db_session
from ..core.config import settings
from ..models import Paper, User
from ..utils.storage import StorageAdapter
from ..utils.email import EmailService
from ..utils.pdf_processor import PDFProcessor
from ..utils.security import VirusScanner
from ..repositories import (
    PaperRepository,
    UserRepository,

    ChatRepository,
    AuditLogRepository
)

logger = logging.getLogger(__name__)

# Initialize services
storage_adapter = StorageAdapter()
email_service = EmailService()
pdf_processor = PDFProcessor()
virus_scanner = VirusScanner()

@celery_app.task(bind=True, max_retries=3)
def process_upload_task(self, paper_id: int, file_path: str, user_id: int) -> Dict[str, Any]:
    """Process uploaded paper file.
    
    Steps:
    1. Virus scan
    2. Extract text and metadata
    3. Generate thumbnail
    4. Compute checksum
    5. Check for duplicates
    6. Upload to production storage
    7. Update database
    
    Args:
        paper_id: ID of the paper record
        file_path: Temporary file path
        user_id: ID of the user who uploaded
        
    Returns:
        Dict with processing results
    """
    try:
        with get_db_session() as db:
            paper_repo = PaperRepository(db)
            audit_repo = AuditLogRepository(db)
            
            # Get paper record
            paper = paper_repo.get_by_id(paper_id)
            if not paper:
                raise ValueError(f"Paper {paper_id} not found")
            
            # Update task progress
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "virus_scan", "progress": 10}
            )
            
            # Step 1: Virus scan
            logger.info(f"Starting virus scan for paper {paper_id}")
            scan_result = virus_scanner.scan_file(file_path)
            if not scan_result["clean"]:
                paper_repo.update_status(paper_id, "rejected")
                audit_repo.log_action(
                    actor_id=user_id,
                    action="paper_rejected_virus",
                    target_type="paper",
                    target_id=paper_id,
                    meta={"reason": "virus_detected", "details": scan_result}
                )
                raise ValueError(f"Virus detected: {scan_result['threat']}")
            
            # Step 2: Extract text and metadata
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "text_extraction", "progress": 30}
            )
            
            logger.info(f"Extracting text from paper {paper_id}")
            extraction_result = pdf_processor.extract_text_and_metadata(file_path)
            
            # Step 3: Generate thumbnail
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "thumbnail_generation", "progress": 50}
            )
            
            logger.info(f"Generating thumbnail for paper {paper_id}")
            thumbnail_path = pdf_processor.generate_thumbnail(file_path)
            
            # Step 4: Compute checksum
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "checksum_calculation", "progress": 60}
            )
            
            checksum = _compute_file_checksum(file_path)
            
            # Step 5: Check for duplicates
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "duplicate_check", "progress": 70}
            )
            
            duplicate = paper_repo.find_by_checksum(checksum)
            if duplicate and duplicate.id != paper_id:
                paper_repo.update_status(paper_id, "duplicate")
                audit_repo.log_action(
                    actor_id=user_id,
                    action="paper_marked_duplicate",
                    target_type="paper",
                    target_id=paper_id,
                    meta={"duplicate_of": duplicate.id}
                )
                logger.warning(f"Paper {paper_id} is duplicate of {duplicate.id}")
                return {
                    "status": "duplicate",
                    "duplicate_of": duplicate.id,
                    "message": "File already exists in the system"
                }
            
            # Step 6: Upload to production storage
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "storage_upload", "progress": 80}
            )
            
            # Generate storage key
            file_extension = Path(file_path).suffix
            storage_key = f"papers/{paper.tenant_id}/{paper_id}/{checksum}{file_extension}"
            
            # Upload main file
            file_url = storage_adapter.upload_file(
                file_path=file_path,
                key=storage_key,
                content_type="application/pdf"
            )
            
            # Upload thumbnail if generated
            thumbnail_url = None
            if thumbnail_path and Path(thumbnail_path).exists():
                thumbnail_key = f"thumbnails/{paper.tenant_id}/{paper_id}/{checksum}.jpg"
                thumbnail_url = storage_adapter.upload_file(
                    file_path=thumbnail_path,
                    key=thumbnail_key,
                    content_type="image/jpeg"
                )
            
            # Step 7: Update database
            current_task.update_state(
                state="PROGRESS",
                meta={"step": "database_update", "progress": 90}
            )
            
            # Create paper version
            version_data = {
                "paper_id": paper_id,
                "s3_key": storage_key,
                "checksum": checksum,
                "file_size": Path(file_path).stat().st_size,
                "metadata": {
                    "pages": extraction_result.get("page_count", 0),
                    "text_length": len(extraction_result.get("text", "")),
                    "has_images": extraction_result.get("has_images", False),
                    "processing_time": extraction_result.get("processing_time", 0)
                }
            }
            paper_version = paper_repo.create_version(version_data)
            
            # Update paper record
            paper_updates = {
                "file_url": file_url,
                "thumbnail_url": thumbnail_url,
                "status": "pending_review",
                "extracted_text": extraction_result.get("text", "")[:10000],  # Limit text size
                "metadata": {
                    **paper.metadata,
                    "processed_at": datetime.utcnow().isoformat(),
                    "file_size": version_data["file_size"],
                    "checksum": checksum
                }
            }
            paper_repo.update(paper_id, paper_updates)
            
            # Log successful processing
            audit_repo.log_action(
                actor_id=user_id,
                action="paper_processed",
                target_type="paper",
                target_id=paper_id,
                meta={
                    "version_id": paper_version.id,
                    "file_size": version_data["file_size"],
                    "pages": extraction_result.get("page_count", 0)
                }
            )
            
            # Cleanup temporary files
            _cleanup_temp_files([file_path, thumbnail_path])
            
            logger.info(f"Successfully processed paper {paper_id}")
            
            return {
                "status": "success",
                "paper_id": paper_id,
                "version_id": paper_version.id,
                "file_url": file_url,
                "thumbnail_url": thumbnail_url,
                "pages": extraction_result.get("page_count", 0),
                "file_size": version_data["file_size"]
            }
            
    except Exception as exc:
        logger.error(f"Error processing paper {paper_id}: {str(exc)}")
        
        # Update paper status to failed
        try:
            with get_db_session() as db:
                paper_repo = PaperRepository(db)
                paper_repo.update_status(paper_id, "processing_failed")
        except Exception:
            pass
        
        # Retry logic
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying paper processing for {paper_id} (attempt {self.request.retries + 1})")
            raise self.retry(countdown=60 * (2 ** self.request.retries), exc=exc)
        
        raise exc

@celery_app.task(bind=True, max_retries=3)
def send_email_task(self, to_email: str, subject: str, template: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Send email using configured email service.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        template: Email template name
        context: Template context variables
        
    Returns:
        Dict with send results
    """
    try:
        logger.info(f"Sending email to {to_email} with template {template}")
        
        result = email_service.send_email(
            to_email=to_email,
            subject=subject,
            template=template,
            context=context
        )
        
        logger.info(f"Email sent successfully to {to_email}")
        return {
            "status": "success",
            "to_email": to_email,
            "message_id": result.get("message_id")
        }
        
    except Exception as exc:
        logger.error(f"Error sending email to {to_email}: {str(exc)}")
        
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying email send to {to_email} (attempt {self.request.retries + 1})")
            raise self.retry(countdown=60 * (2 ** self.request.retries), exc=exc)
        
        raise exc

@celery_app.task(bind=True, max_retries=2)
def send_newsletter_task(self, newsletter_data: Dict[str, Any], batch_size: int = 100) -> Dict[str, Any]:
    """Send newsletter to all subscribers in batches.
    
    Args:
        newsletter_data: Newsletter content and metadata
        batch_size: Number of emails per batch
        
    Returns:
        Dict with send results
    """
    try:
        with get_db_session() as db:

            
            # Get all active subscribers
            subscribers = subscriber_repo.get_active_subscribers()
            total_subscribers = len(subscribers)
            
            if total_subscribers == 0:
                logger.info("No active subscribers found")
                return {"status": "success", "sent": 0, "message": "No subscribers"}
            
            logger.info(f"Sending newsletter to {total_subscribers} subscribers")
            
            sent_count = 0
            failed_count = 0
            
            # Process in batches
            for i in range(0, total_subscribers, batch_size):
                batch = subscribers[i:i + batch_size]
                
                current_task.update_state(
                    state="PROGRESS",
                    meta={
                        "sent": sent_count,
                        "total": total_subscribers,
                        "progress": int((sent_count / total_subscribers) * 100)
                    }
                )
                
                # Send to batch
                for subscriber in batch:
                    try:
                        email_service.send_email(
                            to_email=subscriber.email,
                            subject=newsletter_data["subject"],
                            template="newsletter",
                            context={
                                **newsletter_data["context"],
                                "subscriber_email": subscriber.email,
                                "unsubscribe_url": f"{settings.FRONTEND_URL}/unsubscribe?email={subscriber.email}"
                            }
                        )
                        sent_count += 1
                        
                    except Exception as e:
                        logger.error(f"Failed to send newsletter to {subscriber.email}: {str(e)}")
                        failed_count += 1
                
                # Small delay between batches
                if i + batch_size < total_subscribers:
                    import time
                    time.sleep(1)
            
            logger.info(f"Newsletter sent: {sent_count} successful, {failed_count} failed")
            
            return {
                "status": "success",
                "sent": sent_count,
                "failed": failed_count,
                "total": total_subscribers
            }
            
    except Exception as exc:
        logger.error(f"Error sending newsletter: {str(exc)}")
        
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying newsletter send (attempt {self.request.retries + 1})")
            raise self.retry(countdown=300, exc=exc)  # 5 minute delay
        
        raise exc

@celery_app.task
def generate_analytics_task(period: str = "daily") -> Dict[str, Any]:
    """Generate analytics data for the specified period.
    
    Args:
        period: Analytics period (daily, weekly, monthly)
        
    Returns:
        Dict with analytics results
    """
    try:
        with get_db_session() as db:
            paper_repo = PaperRepository(db)
            user_repo = UserRepository(db)
            chat_repo = ChatRepository(db)
            
            # Calculate date range
            end_date = datetime.utcnow()
            if period == "daily":
                start_date = end_date - timedelta(days=1)
            elif period == "weekly":
                start_date = end_date - timedelta(weeks=1)
            elif period == "monthly":
                start_date = end_date - timedelta(days=30)
            else:
                start_date = end_date - timedelta(days=1)
            
            # Generate analytics
            analytics = {
                "period": period,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "papers": {
                    "total_uploads": paper_repo.count_by_date_range(start_date, end_date),
                    "by_status": paper_repo.get_status_stats(start_date, end_date),
                    "by_subject": paper_repo.get_subject_stats(start_date, end_date),
                    "top_uploaders": paper_repo.get_top_uploaders(start_date, end_date, limit=10)
                },
                "users": {
                    "new_registrations": user_repo.count_by_date_range(start_date, end_date),
                    "active_users": user_repo.count_active_users(start_date, end_date),
                    "by_role": user_repo.get_role_stats(start_date, end_date)
                },
                "chat": {
                    "total_sessions": chat_repo.count_sessions_by_date_range(start_date, end_date),
                    "total_messages": chat_repo.count_messages_by_date_range(start_date, end_date),
                    "avg_session_length": chat_repo.get_avg_session_length(start_date, end_date)
                }
            }
            
            # Store analytics in cache for quick access
            from ..core.cache import cache_manager
            cache_key = f"analytics:{period}:{end_date.strftime('%Y-%m-%d')}"
            cache_manager.set(cache_key, analytics, ttl=3600)  # Cache for 1 hour
            
            logger.info(f"Generated {period} analytics for {start_date} to {end_date}")
            
            return {
                "status": "success",
                "period": period,
                "analytics": analytics
            }
            
    except Exception as exc:
        logger.error(f"Error generating analytics: {str(exc)}")
        raise exc

@celery_app.task
def cleanup_expired_sessions_task() -> Dict[str, Any]:
    """Clean up expired chat sessions and temporary files.
    
    Returns:
        Dict with cleanup results
    """
    try:
        with get_db_session() as db:
            chat_repo = ChatRepository(db)
            
            # Clean up expired sessions (older than 7 days)
            cutoff_date = datetime.utcnow() - timedelta(days=7)
            
            # Get expired sessions
            expired_sessions = chat_repo.get_expired_sessions(cutoff_date)
            
            cleaned_sessions = 0
            cleaned_messages = 0
            
            for session in expired_sessions:
                # Delete messages first
                message_count = chat_repo.delete_session_messages(session.id)
                cleaned_messages += message_count
                
                # Delete session
                chat_repo.delete_session(session.id)
                cleaned_sessions += 1
            
            # Clean up temporary upload files (older than 1 day)
            temp_dir = Path(tempfile.gettempdir()) / "smartpyq_uploads"
            cleaned_files = 0
            
            if temp_dir.exists():
                cutoff_time = datetime.utcnow() - timedelta(days=1)
                
                for file_path in temp_dir.glob("*"):
                    if file_path.is_file():
                        file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if file_mtime < cutoff_time:
                            try:
                                file_path.unlink()
                                cleaned_files += 1
                            except Exception as e:
                                logger.warning(f"Failed to delete temp file {file_path}: {str(e)}")
            
            logger.info(
                f"Cleanup completed: {cleaned_sessions} sessions, "
                f"{cleaned_messages} messages, {cleaned_files} temp files"
            )
            
            return {
                "status": "success",
                "cleaned_sessions": cleaned_sessions,
                "cleaned_messages": cleaned_messages,
                "cleaned_files": cleaned_files
            }
            
    except Exception as exc:
        logger.error(f"Error during cleanup: {str(exc)}")
        raise exc

# Helper functions

def _compute_file_checksum(file_path: str) -> str:
    """Compute SHA-256 checksum of file."""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

def _cleanup_temp_files(file_paths: List[Optional[str]]) -> None:
    """Clean up temporary files."""
    for file_path in file_paths:
        if file_path and Path(file_path).exists():
            try:
                Path(file_path).unlink()
                logger.debug(f"Cleaned up temp file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {file_path}: {str(e)}")

# Alias for backward compatibility
process_paper_upload = process_upload_task
send_newsletter_batch = send_newsletter_task