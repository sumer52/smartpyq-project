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
    get_client_ip,
)
from ..core.database import get_db
from ..core.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionError,
    PROTECTED_WITH_NOT_FOUND,
    PROTECTED,
)
from ..models.user import User, UserRole, UserStatus
from ..models.paper import Paper, PaperStatus
from ..models.tenant import Tenant
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
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
    draft_papers: int = 0
    unpublished_papers: int = 0
    ai_analyses: int = 0
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
@router.get("/tenants", response_model=List[TenantResponse], responses=PROTECTED)
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

@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED, responses=PROTECTED)
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

@router.put("/tenants/{tenant_id}/activate", responses=PROTECTED_WITH_NOT_FOUND)
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

@router.put("/tenants/{tenant_id}/suspend", responses=PROTECTED_WITH_NOT_FOUND)
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
@router.get("/users", response_model=List[UserResponse], responses=PROTECTED)
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

@router.put("/users/{user_id}", response_model=UserResponse, responses=PROTECTED_WITH_NOT_FOUND)
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

@router.put("/users/{user_id}/activate", responses=PROTECTED_WITH_NOT_FOUND)
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

@router.put("/users/{user_id}/suspend", responses=PROTECTED_WITH_NOT_FOUND)
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
@router.get("/audit-logs", response_model=List[AuditLogResponse], responses=PROTECTED)
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
@router.get("/stats", response_model=SystemStatsResponse, responses=PROTECTED)
async def get_system_stats(
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Get system-wide statistics (admin only)
    
    Returns comprehensive system statistics and metrics.
    Computed inline against the real model columns (the module-level repos
    have no DB session, and get_tenant_stats queries a nonexistent
    Tenant.status column — see model: tenants.is_active boolean).
    """
    try:
        # User stats
        total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
        active_users = (await db.execute(
            select(func.count(User.id)).where(User.status == UserStatus.ACTIVE)
        )).scalar() or 0

        # Tenant stats (model uses is_active boolean, not a status enum)
        total_tenants = (await db.execute(select(func.count(Tenant.id)))).scalar() or 0
        active_tenants = (await db.execute(
            select(func.count(Tenant.id)).where(Tenant.is_active == True)  # noqa: E712
        )).scalar() or 0

        # Paper stats (status enum stored by NAME, e.g. 'APPROVED').
        # Public model: APPROVED == published; DRAFT == awaiting review;
        # ARCHIVED == unpublished; PENDING/REJECTED == legacy moderation queue.
        total_papers = (await db.execute(select(func.count(Paper.id)))).scalar() or 0
        approved_papers = (await db.execute(
            select(func.count(Paper.id)).where(Paper.status == PaperStatus.APPROVED)
        )).scalar() or 0
        pending_papers = (await db.execute(
            select(func.count(Paper.id)).where(Paper.status == PaperStatus.PENDING)
        )).scalar() or 0
        draft_papers = (await db.execute(
            select(func.count(Paper.id)).where(Paper.status == PaperStatus.DRAFT)
        )).scalar() or 0
        unpublished_papers = (await db.execute(
            select(func.count(Paper.id)).where(Paper.status == PaperStatus.ARCHIVED)
        )).scalar() or 0
        ai_analyses = (await db.execute(
            select(func.count(Paper.id)).where(
                Paper.extracted_text.isnot(None), Paper.extracted_text != ""
            )
        )).scalar() or 0
        total_downloads = (await db.execute(
            select(func.coalesce(func.sum(Paper.download_count), 0))
        )).scalar() or 0

        # TODO: Calculate storage usage from file storage service
        storage_used_gb = 0.0  # Placeholder
        
        return SystemStatsResponse(
            total_users=total_users,
            active_users=active_users,
            total_tenants=total_tenants,
            active_tenants=active_tenants,
            total_papers=total_papers,
            approved_papers=approved_papers,
            pending_papers=pending_papers,
            draft_papers=draft_papers,
            unpublished_papers=unpublished_papers,
            ai_analyses=ai_analyses,
            total_downloads=total_downloads,
            storage_used_gb=storage_used_gb
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve system statistics"
        )

@router.get("/health", responses=PROTECTED)
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