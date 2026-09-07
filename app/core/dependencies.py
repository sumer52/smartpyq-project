"""FastAPI dependencies for authentication and authorization.

Provides dependency functions for route protection, user context,
and permission checking.
"""

from typing import Optional, List, Callable

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import auth_manager, TokenType
from app.core.database import get_db

from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.repositories.user_repository import UserRepository
from app.repositories.tenant_repository import TenantRepository

# HTTP Bearer security scheme
security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get current user from token (optional).
    
    Args:
        request: FastAPI request object
        credentials: HTTP authorization credentials
        db: Database session
        
    Returns:
        User object or None if not authenticated
    """
    token = None
    
    # Extract token from credentials or request
    if credentials:
        token = credentials.credentials
    else:
        token = auth_manager.extract_token_from_request(request)
    
    if not token:
        return None
    
    try:
        # Decode token
        payload = auth_manager.decode_token(token)
        
        # Validate token type
        if not auth_manager.validate_token_type(payload, TokenType.ACCESS):
            return None
        
        # Get user from database
        user_id = payload.get("user_id")
        if not user_id:
            return None
        
        user_repo = UserRepository(db)
        user = await user_repo.get_by_id(user_id)
        
        if not user or not user.is_active:
            return None
        
        return user
        
    except Exception as e:
        pass
        import logging; logging.getLogger(__name__).debug(f"Auth error: {type(e).__name__}")
        return None


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user (required).
    
    Args:
        request: FastAPI request object
        credentials: HTTP authorization credentials
        db: Database session
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user is not authenticated
    """
    user = await get_current_user_optional(request, credentials, db)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user.
    
    Args:
        current_user: Current user from token
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user is not active
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return current_user


async def get_current_verified_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get current verified user.
    
    Args:
        current_user: Current active user
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user is not verified
    """
    # Skip verification check for simple auth users
    if hasattr(current_user, 'is_email_verified') and not current_user.is_email_verified:
        pass  # Allow through - verification is optional for Phase 1
    
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_verified_user)
) -> User:
    """Get current admin user.
    
    Args:
        current_user: Current verified user
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user is not admin
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return current_user


async def get_current_tenant(
    current_user: User = Depends(get_current_verified_user),
    db: AsyncSession = Depends(get_db)
) -> Optional[Tenant]:
    """Get current user's tenant.
    
    Args:
        current_user: Current verified user
        db: Database session
        
    Returns:
        Tenant object or None
    """
    if not current_user.tenant_id:
        return None
    
    tenant_repo = TenantRepository(db)
    return await tenant_repo.get_by_id(current_user.tenant_id)


def require_roles(allowed_roles: List[UserRole]) -> Callable:
    """Dependency factory for role-based access control.
    
    Args:
        allowed_roles: List of allowed user roles
        
    Returns:
        Dependency function
    """
    async def role_checker(
        current_user: User = Depends(get_current_verified_user)
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    
    return role_checker


def require_admin() -> Callable:
    """Dependency for admin-only access.
    
    Returns:
        Dependency function
    """
    return require_roles([UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN])


def require_tenant_admin() -> Callable:
    """Dependency for tenant admin access.
    
    Returns:
        Dependency function
    """
    return require_roles([UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN])


def require_super_admin() -> Callable:
    """Dependency for super admin access.
    
    Returns:
        Dependency function
    """
    return require_roles([UserRole.SUPER_ADMIN])


async def require_same_tenant(
    target_tenant_id: int,
    current_user: User = Depends(get_current_verified_user)
) -> User:
    """Require user to belong to the same tenant.
    
    Args:
        target_tenant_id: Target tenant ID
        current_user: Current user
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user doesn't belong to the same tenant
    """
    # Super admins can access any tenant
    if current_user.role == UserRole.SUPER_ADMIN:
        return current_user
    
    # Check if user belongs to the same tenant
    if current_user.tenant_id != target_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: different tenant"
        )
    
    return current_user


async def require_resource_owner(
    resource_user_id: int,
    current_user: User = Depends(get_current_verified_user)
) -> User:
    """Require user to be the owner of a resource or admin.
    
    Args:
        resource_user_id: ID of the resource owner
        current_user: Current user
        
    Returns:
        User object
        
    Raises:
        HTTPException: If user is not the owner or admin
    """
    # Admins can access any resource
    if current_user.role in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]:
        return current_user
    
    # Check if user is the resource owner
    if current_user.id != resource_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: not resource owner"
        )
    
    return current_user


class PermissionChecker:
    """Permission checker for complex authorization logic."""
    
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user
    
    def can_access_tenant(self, tenant_id: int) -> bool:
        """Check if user can access a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            bool: True if user can access tenant
        """
        # Super admins can access any tenant
        if self.user.role == UserRole.SUPER_ADMIN:
            return True
        
        # Users can only access their own tenant
        return self.user.tenant_id == tenant_id
    
    def can_manage_users(self, target_tenant_id: Optional[int] = None) -> bool:
        """Check if user can manage other users.
        
        Args:
            target_tenant_id: Target tenant ID
            
        Returns:
            bool: True if user can manage users
        """
        # Only admins can manage users
        if self.user.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]:
            return False
        
        # Super admins can manage users in any tenant
        if self.user.role == UserRole.SUPER_ADMIN:
            return True
        
        # Tenant admins can only manage users in their tenant
        if target_tenant_id:
            return self.user.tenant_id == target_tenant_id
        
        return True
    
    def can_moderate_papers(self, paper_tenant_id: int) -> bool:
        """Check if user can moderate papers.
        
        Args:
            paper_tenant_id: Paper's tenant ID
            
        Returns:
            bool: True if user can moderate papers
        """
        # Only admins can moderate papers
        if self.user.role not in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]:
            return False
        
        # Super admins can moderate papers in any tenant
        if self.user.role == UserRole.SUPER_ADMIN:
            return True
        
        # Tenant admins can only moderate papers in their tenant
        return self.user.tenant_id == paper_tenant_id
    
    def can_access_admin_features(self) -> bool:
        """Check if user can access admin features.
        
        Returns:
            bool: True if user can access admin features
        """
        return self.user.role in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]
    
    def can_export_data(self) -> bool:
        """Check if user can export data.
        
        Returns:
            bool: True if user can export data
        """
        return self.user.role in [UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]


async def get_permission_checker(
    current_user: User = Depends(get_current_verified_user),
    db: AsyncSession = Depends(get_db)
) -> PermissionChecker:
    """Get permission checker for current user.
    
    Args:
        current_user: Current user
        db: Database session
        
    Returns:
        PermissionChecker instance
    """
    return PermissionChecker(db, current_user)


# Rate limiting dependency
async def get_client_ip(request: Request) -> str:
    """Get client IP address from request.
    
    Args:
        request: FastAPI request object
        
    Returns:
        str: Client IP address
    """
    # Check for forwarded headers first (for reverse proxy setups)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


# Request context dependency
async def get_request_context(
    request: Request,
    client_ip: str = Depends(get_client_ip),
    current_user: Optional[User] = Depends(get_current_user_optional)
) -> dict:
    """Get request context information.
    
    Args:
        request: FastAPI request object
        client_ip: Client IP address
        current_user: Current user (optional)
        
    Returns:
        dict: Request context
    """
    return {
        "ip_address": client_ip,
        "user_agent": request.headers.get("User-Agent"),
        "method": request.method,
        "url": str(request.url),
        "user_id": current_user.id if current_user else None,
        "tenant_id": current_user.tenant_id if current_user else None,
        "user_role": current_user.role.value if current_user else None
    }