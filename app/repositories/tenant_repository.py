"""Tenant repository for multi-tenant database operations.

Handles tenant management, domain validation, and tenant-specific queries.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tenant import Tenant, TenantStatus
from app.models.user import User
from app.repositories.base_repository import BaseRepository
from app.core.exceptions import ValidationError, NotFoundError


class TenantRepository(BaseRepository[Tenant]):
    """Repository for tenant operations."""
    
    def __init__(self, db=None):
        super().__init__(db, Tenant)
    
    async def get_by_slug(
        self,
        slug: str,
        load_users: bool = False
    ) -> Optional[Tenant]:
        """Get tenant by slug.
        
        Args:
            slug: Tenant slug
            load_users: Whether to load users relationship
            
        Returns:
            Tenant instance or None
        """
        query = select(Tenant).where(Tenant.slug == slug)
        
        if load_users:
            query = query.options(selectinload(Tenant.users))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_domain(
        self,
        domain: str,
        load_users: bool = False
    ) -> Optional[Tenant]:
        """Get tenant by allowed domain.
        
        Args:
            domain: Domain to search for
            load_users: Whether to load users relationship
            
        Returns:
            Tenant instance or None
        """
        # Use JSON contains operator to search in allowed_domains array
        query = select(Tenant).where(
            Tenant.allowed_domains.op('@>')([domain])
        )
        
        if load_users:
            query = query.options(selectinload(Tenant.users))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def slug_exists(self, slug: str, exclude_tenant_id: Optional[int] = None) -> bool:
        """Check if slug already exists.
        
        Args:
            slug: Slug to check
            exclude_tenant_id: Tenant ID to exclude from check (for updates)
            
        Returns:
            True if slug exists
        """
        query = select(func.count(Tenant.id)).where(Tenant.slug == slug)
        
        if exclude_tenant_id:
            query = query.where(Tenant.id != exclude_tenant_id)
        
        result = await self.db.execute(query)
        count = result.scalar()
        return count > 0
    
    async def create_tenant(
        self,
        name: str,
        slug: str,
        allowed_domains: List[str],
        access_code_hash: str,
        **kwargs
    ) -> Tenant:
        """Create a new tenant.
        
        Args:
            name: Tenant name
            slug: Tenant slug
            allowed_domains: List of allowed email domains
            access_code_hash: Hashed access code
            **kwargs: Additional tenant fields
            
        Returns:
            Created tenant instance
            
        Raises:
            ValidationError: If slug already exists
        """
        # Check if slug exists
        if await self.slug_exists(slug):
            raise ValidationError(f"Tenant slug '{slug}' already exists")
        
        # Normalize domains to lowercase
        normalized_domains = [domain.lower().strip() for domain in allowed_domains]
        
        # Create tenant data
        tenant_data = {
            'name': name,
            'slug': slug,
            'allowed_domains': normalized_domains,
            'access_code_hash': access_code_hash,
            'status': TenantStatus.ACTIVE,
            **kwargs
        }
        
        return await self.create(**tenant_data)
    
    async def get_active_tenants(
        self,
        skip: int = 0,
        limit: int = 100
    ) -> List[Tenant]:
        """Get active tenants.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of active tenants
        """
        query = (
            select(Tenant)
            .where(Tenant.status == TenantStatus.ACTIVE)
            .order_by(Tenant.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def search_tenants(
        self,
        search_term: str,
        status: Optional[TenantStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Tenant]:
        """Search tenants by name or slug.
        
        Args:
            search_term: Search term
            status: Filter by status
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of matching tenants
        """
        search_pattern = f"%{search_term}%"
        
        query = select(Tenant).where(
            or_(
                Tenant.name.ilike(search_pattern),
                Tenant.slug.ilike(search_pattern)
            )
        )
        
        if status:
            query = query.where(Tenant.status == status)
        
        query = query.order_by(Tenant.name).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def validate_domain_access(
        self,
        tenant_id: int,
        email_domain: str
    ) -> bool:
        """Validate if email domain is allowed for tenant.
        
        Args:
            tenant_id: Tenant ID
            email_domain: Email domain to validate
            
        Returns:
            True if domain is allowed
        """
        tenant = await self.get_by_id(tenant_id)
        if not tenant:
            return False
        
        return tenant.is_domain_allowed(email_domain.lower())
    
    async def update_allowed_domains(
        self,
        tenant_id: int,
        allowed_domains: List[str]
    ) -> Optional[Tenant]:
        """Update tenant's allowed domains.
        
        Args:
            tenant_id: Tenant ID
            allowed_domains: New list of allowed domains
            
        Returns:
            Updated tenant instance
        """
        # Normalize domains to lowercase
        normalized_domains = [domain.lower().strip() for domain in allowed_domains]
        
        return await self.update(tenant_id, allowed_domains=normalized_domains)
    
    async def update_access_code(
        self,
        tenant_id: int,
        access_code_hash: str
    ) -> Optional[Tenant]:
        """Update tenant's access code.
        
        Args:
            tenant_id: Tenant ID
            access_code_hash: New hashed access code
            
        Returns:
            Updated tenant instance
        """
        return await self.update(tenant_id, access_code_hash=access_code_hash)
    
    async def get_tenant_with_stats(
        self,
        tenant_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get tenant with user statistics.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Dictionary with tenant info and stats
        """
        tenant = await self.get_by_id(tenant_id)
        if not tenant:
            return None
        
        # Get user counts
        total_users_query = select(func.count(User.id)).where(User.tenant_id == tenant_id)
        total_users_result = await self.db.execute(total_users_query)
        total_users = total_users_result.scalar()
        
        active_users_query = (
            select(func.count(User.id))
            .where(and_(User.tenant_id == tenant_id, User.status == 'active'))
        )
        active_users_result = await self.db.execute(active_users_query)
        active_users = active_users_result.scalar()
        
        return {
            'tenant': tenant.to_dict(),
            'stats': {
                'total_users': total_users,
                'active_users': active_users
            }
        }
    
    async def get_tenants_by_status(
        self,
        status: TenantStatus,
        skip: int = 0,
        limit: int = 100
    ) -> List[Tenant]:
        """Get tenants by status.
        
        Args:
            status: Tenant status
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of tenants with specified status
        """
        query = (
            select(Tenant)
            .where(Tenant.status == status)
            .order_by(Tenant.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def activate_tenant(self, tenant_id: int) -> bool:
        """Activate a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            True if activated successfully
        """
        query = (
            update(Tenant)
            .where(Tenant.id == tenant_id)
            .values(status=TenantStatus.ACTIVE)
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def suspend_tenant(self, tenant_id: int, reason: Optional[str] = None) -> bool:
        """Suspend a tenant.
        
        Args:
            tenant_id: Tenant ID
            reason: Suspension reason
            
        Returns:
            True if suspended successfully
        """
        update_data = {'status': TenantStatus.SUSPENDED}
        if reason:
            # Store reason in settings
            tenant = await self.get_by_id(tenant_id)
            if tenant:
                settings = tenant.settings or {}
                settings['suspension_reason'] = reason
                settings['suspended_at'] = datetime.utcnow().isoformat()
                update_data['settings'] = settings
        
        query = (
            update(Tenant)
            .where(Tenant.id == tenant_id)
            .values(**update_data)
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def get_tenant_settings(
        self,
        tenant_id: int,
        setting_key: Optional[str] = None
    ) -> Optional[Any]:
        """Get tenant settings.
        
        Args:
            tenant_id: Tenant ID
            setting_key: Specific setting key to retrieve
            
        Returns:
            Settings value or entire settings dict
        """
        tenant = await self.get_by_id(tenant_id)
        if not tenant:
            return None
        
        settings = tenant.settings or {}
        
        if setting_key:
            return settings.get(setting_key)
        
        return settings
    
    async def update_tenant_settings(
        self,
        tenant_id: int,
        settings: Dict[str, Any],
        merge: bool = True
    ) -> Optional[Tenant]:
        """Update tenant settings.
        
        Args:
            tenant_id: Tenant ID
            settings: Settings to update
            merge: Whether to merge with existing settings
            
        Returns:
            Updated tenant instance
        """
        if merge:
            tenant = await self.get_by_id(tenant_id)
            if tenant:
                existing_settings = tenant.settings or {}
                existing_settings.update(settings)
                settings = existing_settings
        
        return await self.update(tenant_id, settings=settings)
    
    async def get_tenant_stats(self) -> Dict[str, Any]:
        """Get overall tenant statistics.
        
        Returns:
            Dictionary with tenant statistics
        """
        # Total tenants
        total_query = select(func.count(Tenant.id))
        total_result = await self.db.execute(total_query)
        total_tenants = total_result.scalar()
        
        # Active tenants
        active_query = select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.ACTIVE)
        active_result = await self.db.execute(active_query)
        active_tenants = active_result.scalar()
        
        # Suspended tenants
        suspended_query = select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.SUSPENDED)
        suspended_result = await self.db.execute(suspended_query)
        suspended_tenants = suspended_result.scalar()
        
        # Inactive tenants
        inactive_query = select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.INACTIVE)
        inactive_result = await self.db.execute(inactive_query)
        inactive_tenants = inactive_result.scalar()
        
        return {
            'total_tenants': total_tenants,
            'active_tenants': active_tenants,
            'suspended_tenants': suspended_tenants,
            'inactive_tenants': inactive_tenants
        }
    
    async def find_tenant_by_email_domain(self, email: str) -> Optional[Tenant]:
        """Find tenant by user's email domain.
        
        Args:
            email: User email address
            
        Returns:
            Tenant instance or None
        """
        if '@' not in email:
            return None
        
        domain = email.split('@')[1].lower()
        return await self.get_by_domain(domain)
    
    async def get_tenants_with_domain(
        self,
        domain: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[Tenant]:
        """Get all tenants that allow a specific domain.
        
        Args:
            domain: Domain to search for
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of tenants allowing the domain
        """
        query = (
            select(Tenant)
            .where(Tenant.allowed_domains.op('@>')([domain.lower()]))
            .order_by(Tenant.name)
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def update_tenant_profile(
        self,
        tenant_id: int,
        name: Optional[str] = None,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        logo_url: Optional[str] = None,
        website_url: Optional[str] = None
    ) -> Optional[Tenant]:
        """Update tenant profile information.
        
        Args:
            tenant_id: Tenant ID
            name: New name
            slug: New slug
            description: Tenant description
            logo_url: Logo URL
            website_url: Website URL
            
        Returns:
            Updated tenant instance
            
        Raises:
            ValidationError: If slug already exists
        """
        update_data = {}
        
        if name is not None:
            update_data['name'] = name
        
        if slug is not None:
            # Check if slug exists (excluding current tenant)
            if await self.slug_exists(slug, exclude_tenant_id=tenant_id):
                raise ValidationError(f"Tenant slug '{slug}' already exists")
            update_data['slug'] = slug
        
        if description is not None:
            update_data['description'] = description
        
        if logo_url is not None:
            update_data['logo_url'] = logo_url
        
        if website_url is not None:
            update_data['website_url'] = website_url
        
        if update_data:
            return await self.update(tenant_id, **update_data)
        
        return await self.get_by_id(tenant_id)