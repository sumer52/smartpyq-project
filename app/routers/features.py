"""Features API Routes

Handles platform features and newsletter subscription management.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter, 
    Depends, 
    HTTPException, 
    status
)
from pydantic import BaseModel, Field

from ..core.dependencies import (
    get_current_active_user,
    require_roles,
    get_client_ip
)
from ..core.exceptions import (
    ValidationError,
    NotFoundError
)
from ..models.user import User
from ..services.feature_service import FeatureService
from ..core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.feature import (
    FeatureResponse as FeatureSchema,
    FeatureCreateRequest as FeatureCreateSchema,
    FeatureUpdateRequest as FeatureUpdateSchema,
)

router = APIRouter(prefix="/features", tags=["features"])

# Request/Response Models
class FeatureResponse(BaseModel):
    """Feature response model"""
    id: int
    title: str
    description: str
    icon_url: Optional[str]
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    
class FeatureCreateRequest(BaseModel):
    """Feature creation request"""
    title: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=500)
    icon_url: Optional[str] = Field(None, max_length=255)
    display_order: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True)
    
class FeatureUpdateRequest(BaseModel):
    """Feature update request"""
    title: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, min_length=10, max_length=500)
    icon_url: Optional[str] = Field(None, max_length=255)
    display_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    
# NOTE: services are constructed per-request with a DB session.
# The old module-level FeatureService() had feature_repo=None, which made
# every endpoint in this router 500.

# Feature endpoints
@router.get("/", response_model=List[FeatureSchema])
async def get_features(db: AsyncSession = Depends(get_db)):
    """Get all active features
    
    Returns list of active platform features for display on frontend.
    No authentication required - public endpoint.
    """
    try:
        svc = FeatureService(db=db)
        return await svc.get_active_features()
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve features"
        )

@router.get("/all", response_model=List[FeatureSchema])
async def get_all_features(
    current_user: User = Depends(require_roles(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Get all features (admin only)
    
    Returns all features including inactive ones for admin management.
    """
    try:
        from sqlalchemy import select
        from app.models.feature import Feature
        result = await db.execute(select(Feature).order_by(Feature.display_order))
        return list(result.scalars().all())
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve features"
        )

@router.post("/", response_model=FeatureSchema, status_code=status.HTTP_201_CREATED)
async def create_feature(
    request: FeatureCreateSchema,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Create new feature (admin only)
    
    Creates a new platform feature with specified details.
    """
    try:
        svc = FeatureService(db=db)
        return await svc.create_feature(
            feature_data=request,
            creator=current_user,
            ip_address=client_ip
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create feature"
        )

@router.put("/{feature_id}", response_model=FeatureSchema)
async def update_feature(
    feature_id: int,
    request: FeatureUpdateSchema,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Update feature (admin only)
    
    Updates existing feature with new details.
    """
    try:
        svc = FeatureService(db=db)
        return await svc.update_feature(
            feature_id=feature_id,
            feature_data=request,
            updater=current_user,
            ip_address=client_ip
        )
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feature not found"
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update feature"
        )

@router.post("/{feature_id}/toggle")
async def toggle_feature(
    feature_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Toggle feature active status (admin only)
    
    Toggles the is_enabled status of a feature.
    """
    try:
        svc = FeatureService(db=db)
        feature = await svc.toggle_feature(
            feature_id=feature_id,
            updater=current_user,
            ip_address=client_ip
        )
        
        return {
            "message": f"Feature {'enabled' if feature.is_enabled else 'disabled'} successfully",
            "is_active": feature.is_enabled
        }
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feature not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle feature"
        )

@router.delete("/{feature_id}")
async def delete_feature(
    feature_id: int,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Delete feature (admin only)
    
    Permanently removes a feature from the system.
    """
    try:
        svc = FeatureService(db=db)
        await svc.delete_feature(
            feature_id=feature_id,
            deleter=current_user,
            ip_address=client_ip
        )
        
        return {"message": "Feature deleted successfully"}
        
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feature not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete feature"
        )

