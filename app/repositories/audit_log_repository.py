"""Audit log repository for tracking system activities and user actions.

Handles audit logging, security events, and activity tracking.
"""

from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timedelta
from enum import Enum

from sqlalchemy import select, and_, or_, func, desc, asc, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.audit_log import AuditLog, AuditAction, AuditSeverity
from app.models.user import User
from app.models.tenant import Tenant
from app.repositories.base_repository import BaseRepository
from app.core.exceptions import ValidationError


class AuditLogRepository(BaseRepository[AuditLog]):
    """Repository for audit log operations."""
    
    def __init__(self, db=None):
        super().__init__(db, AuditLog)
    
    async def create_log(
        self,
        action: AuditAction,
        actor_id: Optional[int] = None,
        actor_type: str = "user",
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        session_id: Optional[str] = None,
        details: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        status: str = "success"
    ) -> AuditLog:
        """Create a new audit log entry.
        
        Args:
            action: The action that was performed
            actor_id: ID of the user/system that performed the action
            actor_type: Type of actor (user, system, api_key, etc.)
            target_type: Type of target entity
            target_id: ID of the target entity
            tenant_id: Tenant context
            ip_address: Client IP address
            user_agent: Client user agent
            request_id: Request ID for tracing
            session_id: Session ID
            details: Human-readable description
            metadata: Additional structured data
            severity: Log severity level
            status: Action status (success, failure, partial)
            
        Returns:
            Created audit log entry
        """
        log_data = {
            'action': action,
            'actor_id': actor_id,
            'actor_type': actor_type,
            'target_type': target_type,
            'target_id': target_id,
            'tenant_id': tenant_id,
            'ip_address': ip_address,
            'user_agent': user_agent,
            'request_id': request_id,
            'session_id': session_id,
            'details': details,
            'metadata': metadata or {},
            'severity': severity,
            'status': status
        }
        
        return await self.create(**log_data)
    
    async def get_user_activity(
        self,
        user_id: int,
        actions: Optional[List[AuditAction]] = None,
        days: int = 30,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get activity logs for a specific user.
        
        Args:
            user_id: User ID
            actions: Filter by specific actions
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of audit logs
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(AuditLog).where(
            and_(
                AuditLog.actor_id == user_id,
                AuditLog.actor_type == "user",
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if actions:
            query = query.where(AuditLog.action.in_(actions))
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_tenant_activity(
        self,
        tenant_id: int,
        actions: Optional[List[AuditAction]] = None,
        severity: Optional[AuditSeverity] = None,
        days: int = 30,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get activity logs for a specific tenant.
        
        Args:
            tenant_id: Tenant ID
            actions: Filter by specific actions
            severity: Filter by severity level
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of audit logs
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(AuditLog).where(
            and_(
                AuditLog.tenant_id == tenant_id,
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if actions:
            query = query.where(AuditLog.action.in_(actions))
        
        if severity:
            query = query.where(AuditLog.severity == severity)
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_security_events(
        self,
        tenant_id: Optional[int] = None,
        severity: Optional[AuditSeverity] = None,
        days: int = 7,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get security-related events.
        
        Args:
            tenant_id: Filter by tenant ID
            severity: Filter by severity level
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of security events
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        security_actions = [
            AuditAction.LOGIN_SUCCESS,
            AuditAction.LOGIN_FAILED,
            AuditAction.LOGOUT,
            AuditAction.PASSWORD_CHANGE,
            AuditAction.ACCOUNT_LOCKED,
            AuditAction.PERMISSION_DENIED,
            AuditAction.SUSPICIOUS_ACTIVITY
        ]
        
        query = select(AuditLog).where(
            and_(
                AuditLog.action.in_(security_actions),
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if tenant_id:
            query = query.where(AuditLog.tenant_id == tenant_id)
        
        if severity:
            query = query.where(AuditLog.severity == severity)
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_failed_login_attempts(
        self,
        ip_address: Optional[str] = None,
        user_id: Optional[int] = None,
        hours: int = 24
    ) -> List[AuditLog]:
        """Get failed login attempts.
        
        Args:
            ip_address: Filter by IP address
            user_id: Filter by user ID
            hours: Number of hours to look back
            
        Returns:
            List of failed login attempts
        """
        cutoff_date = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(AuditLog).where(
            and_(
                AuditLog.action == AuditAction.LOGIN_FAILED,
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if ip_address:
            query = query.where(AuditLog.ip_address == ip_address)
        
        if user_id:
            query = query.where(AuditLog.actor_id == user_id)
        
        query = query.order_by(AuditLog.created_at.desc())
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def count_failed_login_attempts(
        self,
        ip_address: Optional[str] = None,
        user_id: Optional[int] = None,
        hours: int = 1
    ) -> int:
        """Count failed login attempts in a time window.
        
        Args:
            ip_address: Filter by IP address
            user_id: Filter by user ID
            hours: Number of hours to look back
            
        Returns:
            Number of failed attempts
        """
        cutoff_date = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(func.count(AuditLog.id)).where(
            and_(
                AuditLog.action == AuditAction.LOGIN_FAILED,
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if ip_address:
            query = query.where(AuditLog.ip_address == ip_address)
        
        if user_id:
            query = query.where(AuditLog.actor_id == user_id)
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_activity_by_target(
        self,
        target_type: str,
        target_id: int,
        actions: Optional[List[AuditAction]] = None,
        days: int = 30,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get activity logs for a specific target entity.
        
        Args:
            target_type: Type of target entity
            target_id: ID of target entity
            actions: Filter by specific actions
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of audit logs
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(AuditLog).where(
            and_(
                AuditLog.target_type == target_type,
                AuditLog.target_id == target_id,
                AuditLog.created_at >= cutoff_date
            )
        )
        
        if actions:
            query = query.where(AuditLog.action.in_(actions))
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def search_logs(
        self,
        search_term: str,
        tenant_id: Optional[int] = None,
        actions: Optional[List[AuditAction]] = None,
        severity: Optional[AuditSeverity] = None,
        days: int = 30,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Search audit logs by details or metadata.
        
        Args:
            search_term: Search term
            tenant_id: Filter by tenant ID
            actions: Filter by specific actions
            severity: Filter by severity level
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of matching audit logs
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        search_pattern = f"%{search_term}%"
        
        query = select(AuditLog).where(
            and_(
                AuditLog.created_at >= cutoff_date,
                or_(
                    AuditLog.details.ilike(search_pattern),
                    AuditLog.ip_address.ilike(search_pattern),
                    AuditLog.user_agent.ilike(search_pattern)
                )
            )
        )
        
        if tenant_id:
            query = query.where(AuditLog.tenant_id == tenant_id)
        
        if actions:
            query = query.where(AuditLog.action.in_(actions))
        
        if severity:
            query = query.where(AuditLog.severity == severity)
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_activity_stats(
        self,
        tenant_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get activity statistics.
        
        Args:
            tenant_id: Filter by tenant ID
            days: Number of days to consider
            
        Returns:
            Dictionary with activity statistics
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        base_query = select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= cutoff_date
        )
        
        if tenant_id:
            base_query = base_query.where(AuditLog.tenant_id == tenant_id)
        
        # Total activities
        total_result = await self.db.execute(base_query)
        total_activities = total_result.scalar()
        
        # Activities by action
        action_stats = {}
        for action in AuditAction:
            action_query = base_query.where(AuditLog.action == action)
            action_result = await self.db.execute(action_query)
            count = action_result.scalar()
            if count > 0:
                action_stats[action.value] = count
        
        # Activities by severity
        severity_stats = {}
        for severity in AuditSeverity:
            severity_query = base_query.where(AuditLog.severity == severity)
            severity_result = await self.db.execute(severity_query)
            count = severity_result.scalar()
            if count > 0:
                severity_stats[severity.value] = count
        
        # Failed vs successful activities
        failed_query = base_query.where(AuditLog.status == "failure")
        failed_result = await self.db.execute(failed_query)
        failed_activities = failed_result.scalar()
        
        # Unique users
        unique_users_query = select(func.count(func.distinct(AuditLog.actor_id))).where(
            and_(
                AuditLog.created_at >= cutoff_date,
                AuditLog.actor_type == "user"
            )
        )
        
        if tenant_id:
            unique_users_query = unique_users_query.where(AuditLog.tenant_id == tenant_id)
        
        unique_users_result = await self.db.execute(unique_users_query)
        unique_users = unique_users_result.scalar()
        
        return {
            'total_activities': total_activities,
            'failed_activities': failed_activities,
            'success_rate': ((total_activities - failed_activities) / max(total_activities, 1)) * 100,
            'unique_users': unique_users,
            'by_action': action_stats,
            'by_severity': severity_stats
        }
    
    async def get_top_active_users(
        self,
        tenant_id: Optional[int] = None,
        days: int = 30,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get most active users by activity count.
        
        Args:
            tenant_id: Filter by tenant ID
            days: Number of days to consider
            limit: Maximum number of users to return
            
        Returns:
            List of user activity summaries
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = (
            select(
                AuditLog.actor_id,
                func.count(AuditLog.id).label('activity_count'),
                func.max(AuditLog.created_at).label('last_activity')
            )
            .where(
                and_(
                    AuditLog.created_at >= cutoff_date,
                    AuditLog.actor_type == "user",
                    AuditLog.actor_id.isnot(None)
                )
            )
            .group_by(AuditLog.actor_id)
            .order_by(func.count(AuditLog.id).desc())
            .limit(limit)
        )
        
        if tenant_id:
            query = query.where(AuditLog.tenant_id == tenant_id)
        
        result = await self.db.execute(query)
        rows = result.all()
        
        return [
            {
                'user_id': row.actor_id,
                'activity_count': row.activity_count,
                'last_activity': row.last_activity
            }
            for row in rows
        ]
    
    async def get_suspicious_activities(
        self,
        tenant_id: Optional[int] = None,
        hours: int = 24,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditLog]:
        """Get potentially suspicious activities.
        
        Args:
            tenant_id: Filter by tenant ID
            hours: Number of hours to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of suspicious activities
        """
        cutoff_date = datetime.utcnow() - timedelta(hours=hours)
        
        suspicious_actions = [
            AuditAction.LOGIN_FAILED,
            AuditAction.PERMISSION_DENIED,
            AuditAction.SUSPICIOUS_ACTIVITY,
            AuditAction.ACCOUNT_LOCKED
        ]
        
        query = select(AuditLog).where(
            and_(
                AuditLog.created_at >= cutoff_date,
                or_(
                    AuditLog.action.in_(suspicious_actions),
                    AuditLog.severity == AuditSeverity.WARNING,
                    AuditLog.severity == AuditSeverity.ERROR,
                    AuditLog.status == "failure"
                )
            )
        )
        
        if tenant_id:
            query = query.where(AuditLog.tenant_id == tenant_id)
        
        query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def cleanup_old_logs(
        self,
        days: int = 90,
        keep_security_events: bool = True
    ) -> int:
        """Clean up old audit logs.
        
        Args:
            days: Delete logs older than this many days
            keep_security_events: Whether to keep security-related events longer
            
        Returns:
            Number of deleted logs
        """
        from sqlalchemy import delete
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = delete(AuditLog).where(AuditLog.created_at < cutoff_date)
        
        if keep_security_events:
            # Keep security events for longer
            security_actions = [
                AuditAction.LOGIN_FAILED,
                AuditAction.PERMISSION_DENIED,
                AuditAction.SUSPICIOUS_ACTIVITY,
                AuditAction.ACCOUNT_LOCKED
            ]
            
            query = query.where(
                and_(
                    ~AuditLog.action.in_(security_actions),
                    AuditLog.severity != AuditSeverity.ERROR,
                    AuditLog.severity != AuditSeverity.WARNING
                )
            )
        
        result = await self.db.execute(query)
        return result.rowcount
    
    async def export_logs(
        self,
        tenant_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        actions: Optional[List[AuditAction]] = None,
        format_type: str = "json"
    ) -> List[Dict[str, Any]]:
        """Export audit logs for compliance or analysis.
        
        Args:
            tenant_id: Filter by tenant ID
            start_date: Start date for export
            end_date: End date for export
            actions: Filter by specific actions
            format_type: Export format (json, csv)
            
        Returns:
            List of log entries as dictionaries
        """
        query = select(AuditLog)
        
        conditions = []
        
        if tenant_id:
            conditions.append(AuditLog.tenant_id == tenant_id)
        
        if start_date:
            conditions.append(AuditLog.created_at >= start_date)
        
        if end_date:
            conditions.append(AuditLog.created_at <= end_date)
        
        if actions:
            conditions.append(AuditLog.action.in_(actions))
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.order_by(AuditLog.created_at.asc())
        
        result = await self.db.execute(query)
        logs = result.scalars().all()
        
        return [log.to_dict() for log in logs]