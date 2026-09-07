"""Admin API Routes

Handles administrative functions including tenant management, user management,
and audit logging.
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import (
    APIRouter, 
    Depends, 
    HTTPException, 
    status,
    Query,
    Form
)
from pydantic import BaseModel, Field

from ..core.dependencies import (
    get_current_active_user,
    require_roles,
    get_client_ip
)
from ..core.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionError
)
from ..models.user import User, UserRole
from ..repositories import (
    UserRepository,
    TenantRepository,
    PaperRepository,
    AuditLogRepository
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Request/Response Models
class TenantResponse(BaseModel):
    """Tenant response model"""
    id: int
    name: str
    slug: str
    allowed_domains: List[str]
    is_active: bool
    settings: dict
    created_at: datetime
    user_count: int
    paper_count: int
    
class TenantCreateRequest(BaseModel):
    """Tenant creation request"""
    name: str = Field(..., min_length=3, max_length=100)
    slug: str = Field(..., min_length=3, max_length=50, pattern="^[a-z0-9-]+$")
    allowed_domains: List[str] = Field(..., min_items=1)
    access_code: str = Field(..., min_length=6, max_length=50)
    
class UserResponse(BaseModel):
    """User response model"""
    id: int
    name: str
    email: str
    role: str
    tenant_id: int
    tenant_name: str
    domain_verified: bool
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    
class UserUpdateRequest(BaseModel):
    """User update request"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    
class AuditLogResponse(BaseModel):
    """Audit log response model"""
    id: int
    actor_id: Optional[int]
    actor_name: Optional[str]
    action: str
    target_type: str
    target_id: Optional[int]
    meta: dict
    created_at: datetime
    client_ip: Optional[str]
    
class SystemStatsResponse(BaseModel):
    """System statistics response"""
    total_users: int
    active_users: int
    total_tenants: int
    active_tenants: int
    total_papers: int
    approved_papers: int
    pending_papers: int
    total_downloads: int
    storage_used_gb: float
    
class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True

# Initialize repositories
user_repo = UserRepository()
tenant_repo = TenantRepository()
paper_repo = PaperRepository()
audit_repo = AuditLogRepository()

# Tenant Management
@router.get("/tenants", response_model=List[TenantResponse])
async def get_tenants(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active_only: bool = Query(True),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Get all tenants (admin only)
    
    Returns paginated list of tenants with statistics.
    """
    try:
        tenants = await tenant_repo.get_all_with_stats(
            page=page,
            per_page=per_page,
            active_only=active_only
        )
        
        return [TenantResponse(**tenant) for tenant in tenants]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve tenants"
        )

@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    request: TenantCreateRequest,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Create new tenant (admin only)
    
    Creates a new tenant with specified domains and access code.
    """
    try:
        tenant = await tenant_repo.create_tenant(
            name=request.name,
            slug=request.slug,
            allowed_domains=request.allowed_domains,
            access_code=request.access_code,
            creator_id=current_user.id
        )
        
        # Log tenant creation
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="tenant_created",
            target_type="tenant",
            target_id=tenant["id"],
            meta={"tenant_name": tenant["name"], "domains": request.allowed_domains},
            client_ip=client_ip
        )
        
        return TenantResponse(**tenant)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create tenant"
        )

@router.put("/tenants/{tenant_id}/activate")
async def activate_tenant(
    tenant_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Activate tenant (admin only)"""
    try:
        result = await tenant_repo.activate_tenant(tenant_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found"
            )
            
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="tenant_activated",
            target_type="tenant",
            target_id=tenant_id,
            client_ip=client_ip
        )
        
        return {"message": "Tenant activated successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate tenant"
        )

@router.put("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: int,
    reason: str = Form(..., min_length=10, max_length=500),
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Suspend tenant (admin only)"""
    try:
        result = await tenant_repo.suspend_tenant(tenant_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found"
            )
            
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="tenant_suspended",
            target_type="tenant",
            target_id=tenant_id,
            meta={"reason": reason},
            client_ip=client_ip
        )
        
        return {"message": "Tenant suspended successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to suspend tenant"
        )

# User Management
@router.get("/users", response_model=List[UserResponse])
async def get_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tenant_id: Optional[int] = Query(None),
    role: Optional[UserRole] = Query(None),
    active_only: bool = Query(True),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"]))
):
    """Get users with filtering
    
    Admin can see all users, tenant_admin can only see users in their tenant.
    """
    try:
        # Restrict tenant_admin to their own tenant
        if current_user.role == "tenant_admin":
            tenant_id = current_user.tenant_id
            
        users = await user_repo.get_users_with_tenant_info(
            page=page,
            per_page=per_page,
            tenant_id=tenant_id,
            role=role,
            active_only=active_only
        )
        
        return [UserResponse(**user) for user in users]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve users"
        )

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Update user (admin/tenant_admin)
    
    Tenant_admin can only update users in their tenant.
    """
    try:
        # Get target user to check permissions
        target_user = await user_repo.get_by_id(user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
            
        # Check tenant_admin permissions
        if current_user.role == "tenant_admin":
            if target_user.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
                
        # Filter out None values
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        
        updated_user = await user_repo.update_user(
            user_id=user_id,
            update_data=update_data
        )
        
        # Log user update
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="user_updated",
            target_type="user",
            target_id=user_id,
            meta={"changes": update_data},
            client_ip=client_ip
        )
        
        return UserResponse(**updated_user)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user"
        )

@router.put("/users/{user_id}/activate")
async def activate_user(
    user_id: int,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Activate user account"""
    try:
        # Check permissions for tenant_admin
        if current_user.role == "tenant_admin":
            target_user = await user_repo.get_by_id(user_id)
            if not target_user or target_user.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
                
        result = await user_repo.activate_user(user_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
            
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="user_activated",
            target_type="user",
            target_id=user_id,
            client_ip=client_ip
        )
        
        return {"message": "User activated successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate user"
        )

@router.put("/users/{user_id}/suspend")
async def suspend_user(
    user_id: int,
    reason: str = Form(..., min_length=10, max_length=500),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Suspend user account"""
    try:
        # Check permissions for tenant_admin
        if current_user.role == "tenant_admin":
            target_user = await user_repo.get_by_id(user_id)
            if not target_user or target_user.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
                
        result = await user_repo.suspend_user(user_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
            
        await audit_repo.log_action(
            actor_id=current_user.id,
            action="user_suspended",
            target_type="user",
            target_id=user_id,
            meta={"reason": reason},
            client_ip=client_ip
        )
        
        return {"message": "User suspended successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to suspend user"
        )

# Audit Logs
@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    actor_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"]))
):
    """Get audit logs with filtering
    
    Admin can see all logs, tenant_admin can see logs for their tenant.
    """
    try:
        # Calculate date range
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Restrict tenant_admin to their tenant's activities
        tenant_filter = None
        if current_user.role == "tenant_admin":
            tenant_filter = current_user.tenant_id
            
        logs = await audit_repo.get_logs_with_filters(
            page=page,
            per_page=per_page,
            action=action,
            target_type=target_type,
            actor_id=actor_id,
            start_date=start_date,
            tenant_id=tenant_filter
        )
        
        return [AuditLogResponse(**log) for log in logs]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit logs"
        )

# System Statistics
@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    current_user: User = Depends(require_roles(["admin"]))
):
    """Get system-wide statistics (admin only)
    
    Returns comprehensive system statistics and metrics.
    """
    try:
        # Get user stats
        user_stats = await user_repo.get_user_stats()
        
        # Get tenant stats
        tenant_stats = await tenant_repo.get_tenant_stats()
        
        # Get paper stats
        paper_stats = await paper_repo.get_paper_stats()
        
        # TODO: Calculate storage usage from file storage service
        storage_used_gb = 0.0  # Placeholder
        
        return SystemStatsResponse(
            total_users=user_stats["total_users"],
            active_users=user_stats["active_users"],
            total_tenants=tenant_stats["total_tenants"],
            active_tenants=tenant_stats["active_tenants"],
            total_papers=paper_stats["total_papers"],
            approved_papers=paper_stats["approved_papers"],
            pending_papers=paper_stats["pending_papers"],
            total_downloads=paper_stats["total_downloads"],
            storage_used_gb=storage_used_gb
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve system statistics"
        )

@router.get("/health")
async def health_check(
    current_user: User = Depends(require_roles(["admin"]))
):
    """System health check (admin only)
    
    Returns system health status and component availability.
    """
    try:
        # TODO: Implement actual health checks for:
        # - Database connectivity
        # - Redis connectivity
        # - File storage availability
        # - External API status (Gemini, etc.)
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow(),
            "components": {
                "database": "healthy",
                "redis": "healthy",
                "storage": "healthy",
                "ai_service": "healthy"
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Health check failed"
        )