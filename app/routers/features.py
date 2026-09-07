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
    
# Initialize services
feature_service = FeatureService()

# Feature endpoints
@router.get("/", response_model=List[FeatureResponse])
async def get_features():
    """Get all active features
    
    Returns list of active platform features for display on frontend.
    No authentication required - public endpoint.
    """
    try:
        features = await feature_service.get_active_features()
        return [FeatureResponse(**feature) for feature in features]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve features"
        )

@router.get("/all", response_model=List[FeatureResponse])
async def get_all_features(
    current_user: User = Depends(require_roles(["admin"]))
):
    """Get all features (admin only)
    
    Returns all features including inactive ones for admin management.
    """
    try:
        features = await feature_service.get_all_features()
        return [FeatureResponse(**feature) for feature in features]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve features"
        )

@router.post("/", response_model=FeatureResponse, status_code=status.HTTP_201_CREATED)
async def create_feature(
    request: FeatureCreateRequest,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Create new feature (admin only)
    
    Creates a new platform feature with specified details.
    """
    try:
        feature = await feature_service.create_feature(
            title=request.title,
            description=request.description,
            icon_url=request.icon_url,
            display_order=request.display_order,
            is_active=request.is_active,
            creator_id=current_user.id,
            client_ip=client_ip
        )
        
        return FeatureResponse(**feature)
        
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

@router.put("/{feature_id}", response_model=FeatureResponse)
async def update_feature(
    feature_id: int,
    request: FeatureUpdateRequest,
    current_user: User = Depends(require_roles(["admin"])),
    client_ip: str = Depends(get_client_ip)
):
    """Update feature (admin only)
    
    Updates existing feature with new details.
    """
    try:
        # Filter out None values
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        
        feature = await feature_service.update_feature(
            feature_id=feature_id,
            update_data=update_data,
            updater_id=current_user.id,
            client_ip=client_ip
        )
        
        if not feature:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feature not found"
            )
            
        return FeatureResponse(**feature)
        
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
    client_ip: str = Depends(get_client_ip)
):
    """Toggle feature active status (admin only)
    
    Toggles the is_active status of a feature.
    """
    try:
        result = await feature_service.toggle_feature(
            feature_id=feature_id,
            toggler_id=current_user.id,
            client_ip=client_ip
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feature not found"
            )
            
        return {
            "message": f"Feature {'activated' if result['is_active'] else 'deactivated'} successfully",
            "is_active": result["is_active"]
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
    client_ip: str = Depends(get_client_ip)
):
    """Delete feature (admin only)
    
    Permanently removes a feature from the system.
    """
    try:
        await feature_service.delete_feature(
            feature_id=feature_id,
            deleter_id=current_user.id,
            client_ip=client_ip
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

