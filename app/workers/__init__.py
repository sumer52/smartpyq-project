"""Workers package for Smart PYQ application.

This module contains Celery workers for background task processing.
"""

from .celery_app import celery_app
from .tasks import (
    process_upload_task,
    generate_analytics_task,
    cleanup_expired_sessions_task,
    send_email_task
)

# Alias for backward compatibility
process_paper_upload = process_upload_task

__all__ = [
    "celery_app",
    "process_upload_task",
    "process_paper_upload",
    "generate_analytics_task",
    "cleanup_expired_sessions_task",
    "send_email_task"
]