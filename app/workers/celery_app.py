"""Celery application configuration for Smart PYQ.

Configures Celery for background task processing including:
- File upload processing
- Email sending
- Analytics generation
- Cleanup tasks
"""

import logging
from celery import Celery
from kombu import Queue

from ..core.config import settings

logger = logging.getLogger(__name__)

# Create Celery application
celery_app = Celery(
    "smartpyq",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.tasks"
    ]
)

# Celery configuration
celery_app.conf.update(
    # Task routing
    task_routes={
        "app.workers.tasks.process_upload_task": {"queue": "upload_processing"},
        "app.workers.tasks.send_email_task": {"queue": "email"},
        "app.workers.tasks.send_newsletter_task": {"queue": "email"},
        "app.workers.tasks.generate_analytics_task": {"queue": "analytics"},
        "app.workers.tasks.cleanup_expired_sessions_task": {"queue": "cleanup"},
    },
    
    # Queue definitions
    task_queues=(
        Queue("upload_processing", routing_key="upload_processing"),
        Queue("email", routing_key="email"),
        Queue("analytics", routing_key="analytics"),
        Queue("cleanup", routing_key="cleanup"),
        Queue("default", routing_key="default"),
    ),
    
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution settings
    task_always_eager=settings.ENV == "test",  # Execute tasks synchronously in tests
    task_eager_propagates=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    
    # Result backend settings
    result_expires=3600,  # 1 hour
    result_backend_transport_options={
        "master_name": "mymaster",
    },
    
    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,
    
    # Beat schedule for periodic tasks
    beat_schedule={
        "cleanup-expired-sessions": {
            "task": "app.workers.tasks.cleanup_expired_sessions_task",
            "schedule": 3600.0,  # Every hour
        },
        "generate-daily-analytics": {
            "task": "app.workers.tasks.generate_analytics_task",
            "schedule": 86400.0,  # Every day
            "kwargs": {"period": "daily"}
        },
    },
    beat_schedule_filename="celerybeat-schedule",
)

# Task annotations for specific configurations
celery_app.conf.task_annotations = {
    "app.workers.tasks.process_upload_task": {
        "rate_limit": "10/m",  # 10 uploads per minute
        "time_limit": 300,     # 5 minutes
        "soft_time_limit": 240, # 4 minutes
    },
    "app.workers.tasks.send_email_task": {
        "rate_limit": "100/m",  # 100 emails per minute
        "time_limit": 30,       # 30 seconds
    },
    "app.workers.tasks.send_newsletter_task": {
        "rate_limit": "10/m",   # 10 newsletter batches per minute
        "time_limit": 600,      # 10 minutes
    },
}

# Error handling
@celery_app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery setup"""
    logger.debug(f"Request: {self.request!r}")
    return "Debug task completed"

# Task failure handler
@celery_app.task(bind=True)
def task_failure_handler(self, task_id, error, traceback):
    """Handle task failures"""
    logger.error(
        f"Task {task_id} failed with error: {error}",
        extra={
            "task_id": task_id,
            "error": str(error),
            "traceback": traceback
        }
    )

# Register signal handlers
from celery.signals import task_failure

def task_failure_handler_signal(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwargs):
    """Handle task failure signals"""
    logger.error(
        f"Task {task_id} failed: {exception}",
        extra={
            "task_id": task_id,
            "task_name": sender.name if sender else "unknown",
            "exception": str(exception),
            "traceback": str(traceback)
        }
    )

task_failure.connect(task_failure_handler_signal)

if __name__ == "__main__":
    celery_app.start()