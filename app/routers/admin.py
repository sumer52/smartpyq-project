"""Admin API Routes

Handles administrative functions including tenant management, user management,
and audit logging.
"""

import logging
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
from ..models.audit_log import AuditLog
from ..core.auth import AuthManager
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

logger = logging.getLogger(__name__)

# Request/Response Models
class TenantResponse(BaseModel):
    """Tenant response model"""
    id: int
    name: str
    slug: str
    allowed_domains: List[str]
    is_active: bool
    settings: dict = Field(default_factory=dict)
    created_at: Optional[datetime] = None
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
    name: Optional[str] = None
    email: str
    role: str
    # Both are nullable in the users table (admin/demo accounts have no tenant).
    tenant_id: Optional[int] = None
    tenant_name: Optional[str] = None
    domain_verified: bool = False
    is_active: bool = True
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    
class UserUpdateRequest(BaseModel):
    """User update request"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    
class AuditLogResponse(BaseModel):
    """Audit log response model"""
    id: int
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    action: str
    # audit_logs.target_type and .target_id are nullable strings (see model).
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    meta: dict = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    client_ip: Optional[str] = None
    
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

# ---------------------------------------------------------------------------
# Request-scoped helpers
#
# These handlers used to call module-level repository instances that were
# constructed without a database session, so every request raised
# AttributeError and was reported as HTTP 500. They now receive the request
# session via Depends(get_db). The methods they called
# (get_all_with_stats, get_users_with_tenant_info, update_user, log_action,
# get_logs_with_filters) were never implemented, and TenantRepository writes a
# `Tenant.status` column the model does not have (it uses is_active), so the
# queries below are written against the real model columns.
# ---------------------------------------------------------------------------

def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _user_payload(user: User, tenant_name: Optional[str] = None) -> dict:
    """Serialise a User row into the admin UserResponse shape."""
    return {
        "id": user.id,
        "name": user.full_name or user.username or (user.email or "").split("@")[0],
        "email": user.email,
        "role": _enum_value(user.role),
        "tenant_id": user.tenant_id,
        "tenant_name": tenant_name,
        "domain_verified": bool(user.domain_verified),
        "is_active": _enum_value(user.status) == UserStatus.ACTIVE.value,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


async def _write_audit(
    db: AsyncSession,
    *,
    actor: User,
    action: str,
    target_type: Optional[str] = None,
    target_id=None,
    meta: Optional[dict] = None,
    client_ip: Optional[str] = None,
) -> None:
    """Record an administrative action in audit_logs.

    Best-effort: the mutation is already committed, so an audit-write failure
    is logged rather than turning a successful action into a 500.
    """
    try:
        db.add(AuditLog(
            actor_id=actor.id,
            actor_type="user",
            actor_email=actor.email,
            action=action,
            severity="low",
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            description=f"{actor.email} performed {action}",
            event_metadata=meta or {},
            ip_address=client_ip,
            tenant_id=actor.tenant_id,
        ))
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to write audit log for action %s", action)


def _tenant_payload(tenant: Tenant, user_count: int = 0, paper_count: int = 0) -> dict:
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "allowed_domains": tenant.allowed_domains or [],
        "is_active": bool(tenant.is_active),
        "settings": tenant.settings or {},
        "created_at": tenant.created_at,
        "user_count": user_count,
        "paper_count": paper_count,
    }


# Tenant Management
@router.get("/tenants", response_model=List[TenantResponse], responses=PROTECTED)
async def get_tenants(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active_only: bool = Query(True),
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Get all tenants (admin only)

    Returns a paginated list of tenants with per-tenant user/paper counts.
    """
    query = select(Tenant)
    if active_only:
        query = query.where(Tenant.is_active.is_(True))
    query = (
        query.order_by(Tenant.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    tenants = (await db.execute(query)).scalars().all()

    user_counts = dict((await db.execute(
        select(User.tenant_id, func.count(User.id)).group_by(User.tenant_id)
    )).all())
    paper_counts = dict((await db.execute(
        select(Paper.tenant_id, func.count(Paper.id)).group_by(Paper.tenant_id)
    )).all())

    return [
        TenantResponse(**_tenant_payload(
            tenant,
            user_count=user_counts.get(tenant.id, 0),
            paper_count=paper_counts.get(tenant.id, 0),
        ))
        for tenant in tenants
    ]


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED, responses=PROTECTED)
async def create_tenant(
    request: TenantCreateRequest,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Create new tenant (admin only).

    The access code is stored hashed; it is never returned.
    """
    existing = (await db.execute(
        select(Tenant).where(Tenant.slug == request.slug)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tenant slug '{request.slug}' already exists",
        )

    tenant = Tenant(
        name=request.name,
        slug=request.slug,
        allowed_domains=[d.lower().strip() for d in request.allowed_domains if d.strip()],
        access_code_hash=AuthManager().hash_password(request.access_code),
        is_active=True,
        settings={},
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    await _write_audit(
        db,
        actor=current_user,
        action="tenant_created",
        target_type="tenant",
        target_id=tenant.id,
        meta={"tenant_name": tenant.name, "domains": request.allowed_domains},
        client_ip=client_ip,
    )
    return TenantResponse(**_tenant_payload(tenant))


@router.put("/tenants/{tenant_id}/activate", responses=PROTECTED_WITH_NOT_FOUND)
async def activate_tenant(
    tenant_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Activate tenant (admin only)"""
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    tenant.is_active = True
    await db.commit()
    await _write_audit(
        db,
        actor=current_user,
        action="tenant_activated",
        target_type="tenant",
        target_id=tenant_id,
        client_ip=client_ip,
    )
    return {"message": "Tenant activated successfully"}


@router.put("/tenants/{tenant_id}/suspend", responses=PROTECTED_WITH_NOT_FOUND)
async def suspend_tenant(
    tenant_id: int,
    reason: str = Form(..., min_length=10, max_length=500),
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Suspend tenant (admin only)"""
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    tenant.is_active = False
    # Reassign the dict so SQLAlchemy detects the JSON column change.
    settings = dict(tenant.settings or {})
    settings["suspension_reason"] = reason
    settings["suspended_at"] = datetime.utcnow().isoformat()
    tenant.settings = settings
    await db.commit()

    await _write_audit(
        db,
        actor=current_user,
        action="tenant_suspended",
        target_type="tenant",
        target_id=tenant_id,
        meta={"reason": reason},
        client_ip=client_ip,
    )
    return {"message": "Tenant suspended successfully"}

# User Management
@router.get("/users", response_model=List[UserResponse], responses=PROTECTED)
async def get_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tenant_id: Optional[int] = Query(None),
    role: Optional[UserRole] = Query(None),
    active_only: bool = Query(True),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Get users with filtering

    Admin can see all users, tenant_admin can only see users in their tenant.
    """
    # Restrict tenant_admin to their own tenant
    if _enum_value(current_user.role) == "tenant_admin":
        tenant_id = current_user.tenant_id

    query = select(User, Tenant.name).outerjoin(Tenant, User.tenant_id == Tenant.id)
    if tenant_id is not None:
        query = query.where(User.tenant_id == tenant_id)
    if role is not None:
        query = query.where(User.role == role)
    if active_only:
        query = query.where(User.status == UserStatus.ACTIVE)
    query = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    rows = (await db.execute(query)).all()
    return [UserResponse(**_user_payload(user, tenant_name)) for user, tenant_name in rows]

@router.put("/users/{user_id}", response_model=UserResponse, responses=PROTECTED_WITH_NOT_FOUND)
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Update user (admin/tenant_admin)

    Tenant_admin can only update users in their tenant.
    """
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if _enum_value(current_user.role) == "tenant_admin":
        if target_user.tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )

    changes = {}
    if request.name is not None:
        target_user.full_name = request.name
        changes["name"] = request.name
    if request.role is not None:
        target_user.role = request.role
        changes["role"] = _enum_value(request.role)
    if request.is_active is not None:
        target_user.status = UserStatus.ACTIVE if request.is_active else UserStatus.SUSPENDED
        changes["is_active"] = request.is_active

    await db.commit()
    await db.refresh(target_user)

    await _write_audit(
        db,
        actor=current_user,
        action="user_updated",
        target_type="user",
        target_id=user_id,
        meta={"changes": changes},
        client_ip=client_ip,
    )

    tenant_name = None
    if target_user.tenant_id is not None:
        tenant_name = (await db.execute(
            select(Tenant.name).where(Tenant.id == target_user.tenant_id)
        )).scalar_one_or_none()
    return UserResponse(**_user_payload(target_user, tenant_name))

@router.put("/users/{user_id}/activate", responses=PROTECTED_WITH_NOT_FOUND)
async def activate_user(
    user_id: int,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Activate user account"""
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if _enum_value(current_user.role) == "tenant_admin" \
            and target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    target_user.status = UserStatus.ACTIVE
    await db.commit()

    await _write_audit(
        db,
        actor=current_user,
        action="user_activated",
        target_type="user",
        target_id=user_id,
        client_ip=client_ip,
    )
    return {"message": "User activated successfully"}

@router.put("/users/{user_id}/suspend", responses=PROTECTED_WITH_NOT_FOUND)
async def suspend_user(
    user_id: int,
    reason: str = Form(..., min_length=10, max_length=500),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
):
    """Suspend user account"""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot suspend your own account",
        )

    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if _enum_value(current_user.role) == "tenant_admin" \
            and target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    target_user.status = UserStatus.SUSPENDED
    await db.commit()

    await _write_audit(
        db,
        actor=current_user,
        action="user_suspended",
        target_type="user",
        target_id=user_id,
        meta={"reason": reason},
        client_ip=client_ip,
    )
    return {"message": "User suspended successfully"}

# Audit Logs
@router.get("/audit-logs", response_model=List[AuditLogResponse], responses=PROTECTED)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    actor_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Get audit logs with filtering

    Admin can see all logs, tenant_admin can see logs for their tenant.
    """
    start_date = datetime.utcnow() - timedelta(days=days)

    query = select(AuditLog).where(AuditLog.created_at >= start_date)
    if action:
        query = query.where(AuditLog.action == action)
    if target_type:
        query = query.where(AuditLog.target_type == target_type)
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
    # Restrict tenant_admin to their tenant's activities
    if _enum_value(current_user.role) == "tenant_admin":
        query = query.where(AuditLog.tenant_id == current_user.tenant_id)

    query = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    logs = (await db.execute(query)).scalars().all()

    return [
        AuditLogResponse(
            id=log.id,
            actor_id=log.actor_id,
            actor_name=log.actor_email,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            meta=log.event_metadata or {},
            created_at=log.created_at,
            client_ip=log.ip_address,
        )
        for log in logs
    ]

# Search coverage: what visitors searched for and found nothing
@router.get("/search-gaps", responses=PROTECTED)
async def get_search_gaps(
    limit: int = 20,
    current_user: User = Depends(require_roles(["admin", "tenant_admin", "super_admin"])),
):
    """Most frequent zero-result search queries (admin only).

    Read straight from logs/search_zero_results.jsonl, which the public
    /search endpoint appends to. This is the shortlist of what content to add:
    a query that keeps returning nothing is a paper (or a subject name) the
    library is missing.
    """
    from ..routers.search import read_zero_result_log

    return read_zero_result_log(limit=max(1, min(limit, 100)))

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