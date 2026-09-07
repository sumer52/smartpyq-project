"""Feature and newsletter service for platform functionality.

Handles feature management, newsletter subscriptions, and platform settings.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime


from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ValidationError,
    NotFoundError,
    ConflictError,
    PermissionError
)
from app.models.feature import Feature
from app.models.user import User, UserRole
from app.models.audit_log import AuditAction, AuditSeverity
from app.repositories.feature_repository import FeatureRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.feature import (
    FeatureResponse,
    FeatureCreateRequest,
    FeatureUpdateRequest,
)
from app.services.cache_service import CacheService
from app.utils.email import EmailService
# from app.workers.tasks import send_newsletter_batch


class FeatureService:
    """Service for feature management operations."""
    
    def __init__(
        self,
        db: Optional[AsyncSession] = None,
        cache_service: Optional[CacheService] = None
    ):
        self.db = db
        self.feature_repo = FeatureRepository(db) if db else None
        self.audit_repo = AuditLogRepository(db) if db else None
        self.cache_service = cache_service
    
    async def get_active_features(
        self,
        user: Optional[User] = None
    ) -> List[FeatureResponse]:
        """Get all active features.
        
        Args:
            user: Requesting user (for personalization)
            
        Returns:
            List of active features
        """
        # Check cache first
        cache_key = "active_features"
        if self.cache_service:
            cached_features = await self.cache_service.get(cache_key)
            if cached_features:
                return [FeatureResponse.parse_obj(f) for f in cached_features]
        
        features = await self.feature_repo.get_active_features()
        feature_responses = [FeatureResponse.from_orm(f) for f in features]
        
        # Cache the results
        if self.cache_service:
            await self.cache_service.set(
                cache_key,
                [f.dict() for f in feature_responses],
                expire=3600  # 1 hour
            )
        
        return feature_responses
    
    async def get_feature(
        self,
        feature_id: int,
        user: Optional[User] = None
    ) -> FeatureResponse:
        """Get feature by ID.
        
        Args:
            feature_id: Feature ID
            user: Requesting user
            
        Returns:
            Feature response
            
        Raises:
            NotFoundError: If feature not found
        """
        feature = await self.feature_repo.get_by_id(feature_id)
        if not feature:
            raise NotFoundError("Feature not found")
        
        # Non-admin users can only see active features
        if user and user.role not in [UserRole.ADMIN] and not feature.is_active:
            raise NotFoundError("Feature not found")
        
        return FeatureResponse.from_orm(feature)
    
    async def create_feature(
        self,
        feature_data: FeatureCreateRequest,
        creator: User,
        ip_address: Optional[str] = None
    ) -> FeatureResponse:
        """Create a new feature.
        
        Args:
            feature_data: Feature creation data
            creator: User creating the feature
            ip_address: Client IP address
            
        Returns:
            Created feature
            
        Raises:
            PermissionError: If user lacks permission
            ValidationError: If data is invalid
        """
        # Only admins can create features
        if creator.role != UserRole.ADMIN:
            raise PermissionError("Only administrators can create features")
        
        # Validate feature key uniqueness
        existing_feature = await self.feature_repo.get_by_key(feature_data.key)
        if existing_feature:
            raise ConflictError(f"Feature with key '{feature_data.key}' already exists")
        
        # Create feature
        feature_dict = feature_data.dict()
        feature_dict.update({
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })
        
        feature = await self.feature_repo.create(**feature_dict)
        
        # Clear cache
        if self.cache_service:
            await self.cache_service.delete("active_features")
        
        # Log audit event
        await self._log_audit(
            AuditAction.FEATURE_CREATE,
            actor_id=creator.id,
            target_type="feature",
            target_id=feature.id,
            tenant_id=creator.tenant_id,
            details=f"Feature created: {feature.title}",
            ip_address=ip_address
        )
        
        return FeatureResponse.from_orm(feature)
    
    async def update_feature(
        self,
        feature_id: int,
        feature_data: FeatureUpdateRequest,
        updater: User,
        ip_address: Optional[str] = None
    ) -> FeatureResponse:
        """Update a feature.
        
        Args:
            feature_id: Feature ID
            feature_data: Feature update data
            updater: User updating the feature
            ip_address: Client IP address
            
        Returns:
            Updated feature
            
        Raises:
            NotFoundError: If feature not found
            PermissionError: If user lacks permission
        """
        # Only admins can update features
        if updater.role != UserRole.ADMIN:
            raise PermissionError("Only administrators can update features")
        
        feature = await self.feature_repo.get_by_id(feature_id)
        if not feature:
            raise NotFoundError("Feature not found")
        
        # Update feature
        update_data = feature_data.dict(exclude_unset=True)
        update_data['updated_at'] = datetime.utcnow()
        
        updated_feature = await self.feature_repo.update(feature_id, **update_data)
        
        # Clear cache
        if self.cache_service:
            await self.cache_service.delete("active_features")
        
        # Log audit event
        await self._log_audit(
            AuditAction.FEATURE_UPDATE,
            actor_id=updater.id,
            target_type="feature",
            target_id=feature_id,
            tenant_id=updater.tenant_id,
            details=f"Feature updated: {feature.title}",
            ip_address=ip_address
        )
        
        return FeatureResponse.from_orm(updated_feature)
    
    async def toggle_feature(
        self,
        feature_id: int,
        updater: User,
        ip_address: Optional[str] = None
    ) -> FeatureResponse:
        """Toggle feature active status.
        
        Args:
            feature_id: Feature ID
            updater: User toggling the feature
            ip_address: Client IP address
            
        Returns:
            Updated feature
            
        Raises:
            NotFoundError: If feature not found
            PermissionError: If user lacks permission
        """
        # Only admins can toggle features
        if updater.role != UserRole.ADMIN:
            raise PermissionError("Only administrators can toggle features")
        
        feature = await self.feature_repo.get_by_id(feature_id)
        if not feature:
            raise NotFoundError("Feature not found")
        
        # Toggle active status
        updated_feature = await self.feature_repo.toggle_active(feature_id)
        
        # Clear cache
        if self.cache_service:
            await self.cache_service.delete("active_features")
        
        # Log audit event
        action = AuditAction.FEATURE_ENABLE if updated_feature.is_active else AuditAction.FEATURE_DISABLE
        await self._log_audit(
            action,
            actor_id=updater.id,
            target_type="feature",
            target_id=feature_id,
            tenant_id=updater.tenant_id,
            details=f"Feature {'enabled' if updated_feature.is_active else 'disabled'}: {feature.title}",
            ip_address=ip_address
        )
        
        return FeatureResponse.from_orm(updated_feature)
    
    async def delete_feature(
        self,
        feature_id: int,
        deleter: User,
        ip_address: Optional[str] = None
    ) -> bool:
        """Delete a feature.
        
        Args:
            feature_id: Feature ID
            deleter: User deleting the feature
            ip_address: Client IP address
            
        Returns:
            True if deleted successfully
            
        Raises:
            NotFoundError: If feature not found
            PermissionError: If user lacks permission
        """
        # Only admins can delete features
        if deleter.role != UserRole.ADMIN:
            raise PermissionError("Only administrators can delete features")
        
        feature = await self.feature_repo.get_by_id(feature_id)
        if not feature:
            raise NotFoundError("Feature not found")
        
        # Delete feature
        await self.feature_repo.delete(feature_id)
        
        # Clear cache
        if self.cache_service:
            await self.cache_service.delete("active_features")
        
        # Log audit event
        await self._log_audit(
            AuditAction.FEATURE_DELETE,
            actor_id=deleter.id,
            target_type="feature",
            target_id=feature_id,
            tenant_id=deleter.tenant_id,
            details=f"Feature deleted: {feature.title}",
            ip_address=ip_address
        )
        
        return True
    
    async def get_feature_stats(
        self,
        user: User
    ) -> Dict[str, Any]:
        """Get feature statistics.
        
        Args:
            user: Requesting user
            
        Returns:
            Feature statistics
            
        Raises:
            PermissionError: If user lacks permission
        """
        # Only admins can view feature stats
        if user.role != UserRole.ADMIN:
            raise PermissionError("Only administrators can view feature statistics")
        
        stats = await self.feature_repo.get_feature_stats()
        
        return {
            'total_features': stats.get('total', 0),
            'active_features': stats.get('active', 0),
            'inactive_features': stats.get('inactive', 0),
            'features_by_category': stats.get('by_category', {}),
            'recent_updates': stats.get('recent_updates', 0)
        }
    
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


