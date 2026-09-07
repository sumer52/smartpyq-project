"""Authentication API Routes

Handles user authentication, registration, and session management.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.dependencies import (
    get_current_user,
    get_current_active_user,
    get_client_ip,
    get_request_context
)
from ..core.exceptions import (
    AuthenticationError,
    ValidationError,
    RateLimitError
)
from ..models.user import User
from ..services.auth_service import AuthService
from ..utils.email import EmailService
from ..schemas.auth import OnboardingRequest, AcademicUpdateRequest

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer(auto_error=False)

# Request/Response Models
class SignupRequest(BaseModel):
    """User registration request"""
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    tenant_access_code: str = Field(..., min_length=6, max_length=50)
    
class LoginRequest(BaseModel):
    """User login request"""
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    remember_me: bool = False

class RefreshTokenRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str = Field(..., min_length=1)

class SendOTPRequest(BaseModel):
    """Send OTP request"""
    email: EmailStr
    purpose: str = Field(default="email_verification", pattern="^(email_verification|password_reset)$")

class VerifyOTPRequest(BaseModel):
    """Verify OTP request"""
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    purpose: str = Field(default="email_verification", pattern="^(email_verification|password_reset)$")

class ChangePasswordRequest(BaseModel):
    """Change password request"""
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

class ResetPasswordRequest(BaseModel):
    """Reset password request (after OTP verification)"""
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)


class AuthResponse(BaseModel):
    """Authentication response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True
    # Dev-only: the OTP when email isn't configured (never set in production).
    dev_otp: Optional[str] = None

class UserProfileResponse(BaseModel):
    """User profile response"""
    id: int
    name: str
    email: str
    role: str
    domain_verified: bool
    tenant_id: int
    created_at: datetime
    last_login_at: Optional[datetime]
    course: Optional[str] = None
    specialization: Optional[str] = None
    academic_year: Optional[str] = None
    semester: Optional[str] = None
    onboarding_completed: bool = False

# Initialize services
_email_svc = EmailService()
auth_service = AuthService(email_service=_email_svc)

@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: SignupRequest,
    client_ip: str = Depends(get_client_ip),
    context: dict = Depends(get_request_context),
    db: AsyncSession = Depends(get_db)
):
    """Register a new user account
    
    Requires:
    - Valid email from allowed tenant domain
    - Strong password (min 8 chars)
    - Valid tenant access code
    
    Returns success message. User must verify email before login.
    """
    try:
        auth_svc = AuthService(db=db, email_service=_email_svc)
        from app.schemas.auth import UserSignupRequest
        signup_data = UserSignupRequest(
            name=request.name,
            email=request.email,
            password=request.password,
            tenant_slug="smartpyq",
            access_code=request.tenant_access_code
        )
        await auth_svc.signup(
            signup_data=signup_data,
            ip_address=client_ip,
            user_agent=context.get("user_agent", "")
        )
        
        return MessageResponse(
            message="Registration successful. Please check your email for verification instructions."
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again."
        )

@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    client_ip: str = Depends(get_client_ip),
    context: dict = Depends(get_request_context),
    db: AsyncSession = Depends(get_db)
):
    """Authenticate user and return JWT tokens
    
    Requires:
    - Valid email and password
    - Account must be verified
    
    Returns access and refresh tokens with user info.
    """
    try:
        auth_svc = AuthService(db=db, email_service=_email_svc)
        from app.schemas.auth import UserLoginRequest
        login_data = UserLoginRequest(email=request.email, password=request.password)
        result = await auth_svc.login(
            login_data=login_data,
            ip_address=client_ip,
            user_agent=context.get("user_agent", "")
        )
        
        # Handle both dict and Pydantic model responses
        if hasattr(result, 'model_dump'):
            result_dict = result.model_dump()
        elif isinstance(result, dict):
            result_dict = result
        else:
            result_dict = dict(result)
        
        return AuthResponse(
            access_token=result_dict["access_token"],
            refresh_token=result_dict["refresh_token"],
            expires_in=result_dict["expires_in"],
            user=result_dict.get("user", {})
        )
        
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )
    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).error(f"Login error: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again."
        )

@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token"""
    try:
        from app.core.auth import AuthManager
        from app.repositories.user_repository import UserRepository
        
        auth_mgr = AuthManager()
        payload = auth_mgr.decode_token(request.refresh_token)
        user_id = payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        user_repo = UserRepository(db)
        user = await user_repo.get_by_id(user_id)
        
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        
        new_access = auth_mgr.create_access_token(
            subject=str(user.id), user_id=user.id,
            role=user.role.value if hasattr(user.role, "value") else user.role,
            tenant_id=user.tenant_id
        )
        new_refresh = auth_mgr.create_refresh_token(subject=str(user.id), user_id=user.id)
        
        return AuthResponse(
            access_token=new_access,
            refresh_token=new_refresh,
            expires_in=86400,
            user={
                "id": user.id, "email": user.email,
                "name": user.full_name or user.username or user.email.split("@")[0],
                "role": (user.role.value if hasattr(user.role, "value") else str(user.role)).upper(),
                "tenant_id": user.tenant_id,
                "course": user.course, "specialization": user.specialization,
                "academic_year": user.academic_year, "semester": user.semester,
                "onboarding_completed": user.onboarding_completed
            }
        )
        
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed. Please login again."
        )

@router.post("/send-otp", response_model=MessageResponse)
async def send_otp(
    request: SendOTPRequest,
    client_ip: str = Depends(get_client_ip)
):
    """Send OTP code to user email
    
    Supports:
    - Email verification for new accounts
    - Password reset for existing accounts
    
    Rate limited to prevent abuse.
    """
    try:
        dev_otp = await auth_service.send_otp(
            email=request.email,
            purpose=request.purpose,
            client_ip=client_ip
        )
        
        return MessageResponse(
            message=f"OTP code sent to {request.email}. Please check your inbox.",
            dev_otp=dev_otp
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP. Please try again."
        )

@router.post("/verify-otp", response_model=MessageResponse)
async def verify_otp(
    request: VerifyOTPRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Verify OTP code
    
    Validates OTP and activates account or allows password reset.
    """
    try:
        auth_svc = AuthService(db=db, email_service=_email_svc)
        from app.schemas.auth import OTPRequest
        otp_data = OTPRequest(email=request.email, otp=request.otp_code)
        result = await auth_svc.verify_otp(
            otp_data=otp_data,
            client_ip=client_ip
        )
        
        if request.purpose == "email_verification":
            message = "Email verified successfully. You can now login."
        else:
            message = "OTP verified. You can now reset your password."
            
        return MessageResponse(message=message)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OTP verification failed. Please try again."
        )

@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    client_ip: str = Depends(get_client_ip)
):
    """Change user password
    
    Requires:
    - Valid current password
    - Strong new password
    - Active authenticated session
    """
    try:
        await auth_service.change_password(
            user_id=current_user.id,
            current_password=request.current_password,
            new_password=request.new_password,
            client_ip=client_ip
        )
        
        return MessageResponse(
            message="Password changed successfully."
        )
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password change failed. Please try again."
        )

@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: ResetPasswordRequest,
    client_ip: str = Depends(get_client_ip)
):
    """Reset password using OTP verification
    
    Requires:
    - Valid email
    - Verified OTP code (from send-otp + verify-otp flow)
    - New password meeting security requirements
    """
    try:
        from sqlalchemy import select
        from app.models.user import User
        from app.core.database import get_db
        from app.core.auth import auth_manager
        
        # Get a database session
        async for db in get_db():
            # Find the user
            query = select(User).where(User.email == request.email)
            result = await db.execute(query)
            user = result.scalar_one_or_none()
            
            if not user:
                # Don't reveal whether user exists
                return MessageResponse(message="If an account with that email exists, the password has been reset.")
            
            # Verify the OTP (re-verify to ensure it was valid)
            try:
                from app.services.auth_service import AuthService
                auth_svc = AuthService(db=db, email_service=_email_svc)
                await auth_svc.verify_otp(
                    email=request.email,
                    otp_code=request.otp_code,
                    purpose="password_reset",
                    client_ip=client_ip
                )
            except Exception:
                return MessageResponse(message="If an account with that email exists, the password has been reset.")
            
            # Hash and set new password
            user.password_hash = auth_manager.hash_password(request.new_password)
            user.failed_login_attempts = 0
            user.locked_until = None
            await db.commit()
            
            return MessageResponse(message="Password reset successfully. You can now login with your new password.")
        
        return MessageResponse(message="If an account with that email exists, the password has been reset.")
        
    except Exception as e:
        # Don't reveal specific errors
        return MessageResponse(message="If an account with that email exists, the password has been reset.")


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: User = Depends(get_current_user),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Logout user and invalidate tokens
    
    Blacklists current refresh token to prevent reuse.
    """
    try:
        auth_svc = AuthService(db=db, email_service=_email_svc)
        await auth_svc.logout_user(
            user_id=current_user.id,
            client_ip=client_ip
        )
        
        return MessageResponse(
            message="Logged out successfully."
        )
        
    except Exception as e:
        # Logout is best-effort; always succeed from user perspective
        return MessageResponse(
            message="Logged out successfully."
        )

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user profile
    
    Returns user information for authenticated user.
    """
    return UserProfileResponse(
        id=current_user.id,
        name=current_user.full_name,
        email=current_user.email,
        role=current_user.role,
        domain_verified=current_user.domain_verified,
        tenant_id=current_user.tenant_id,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at,
        course=current_user.course,
        specialization=current_user.specialization,
        academic_year=current_user.academic_year,
        semester=current_user.semester,
        onboarding_completed=current_user.onboarding_completed or False
    )

@router.get("/verify-token")
async def verify_token(
    current_user: User = Depends(get_current_user)
):
    """Verify if current token is valid
    
    Used by frontend to check authentication status.
    """
    return {
        "valid": True,
        "user_id": current_user.id,
        "role": current_user.role
    }

@router.post("/simple-login")
async def simple_login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Simple direct login endpoint -- BLOCKED in production."""
    from app.core.config import settings as _cfg
    if _cfg.ENV == "production":
        raise HTTPException(status_code=404, detail="Endpoint not available")
    from sqlalchemy import select
    from app.models.user import User
    from app.core.auth import AuthManager
    
    auth_mgr = AuthManager()
    
    # Trim whitespace from credentials
    clean_email = (request.email or "").strip().lower()
    clean_password = (request.password or "").strip()
    
    # Find user
    query = select(User).where(User.email == clean_email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Verify password
    if not auth_mgr.verify_password(clean_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Generate tokens
    access_token = auth_mgr.create_access_token(
        subject=str(user.id),
        user_id=user.id,
        role=user.role.value if hasattr(user.role, 'value') else user.role,
        tenant_id=user.tenant_id
    )
    refresh_token = auth_mgr.create_refresh_token(subject=str(user.id), user_id=user.id)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 900,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.full_name or user.username or user.email.split('@')[0],
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "tenant_id": user.tenant_id,
            "course": user.course,
            "specialization": user.specialization,
            "academic_year": user.academic_year,
            "semester": user.semester,
            "onboarding_completed": user.onboarding_completed
        }
    }

@router.post("/simple-signup")
async def simple_signup(
    request: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    """Simple direct signup -- BLOCKED in production."""
    from app.core.config import settings as _cfg
    if _cfg.ENV == "production":
        raise HTTPException(status_code=404, detail="Endpoint not available")
    from sqlalchemy import select
    from app.models.user import User, UserRole
    from app.core.auth import AuthManager
    
    auth_mgr = AuthManager()
    
    # Clean email
    clean_email = (request.email or "").strip().lower()
    
    # Check if user exists
    query = select(User).where(User.email == clean_email)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Create user directly
    password_hash = auth_mgr.hash_password(request.password)
    user = User(
        email=clean_email,
        username=request.email.split('@')[0] + '_' + __import__('uuid').uuid4().hex[:8],
        full_name=request.name,
        password_hash=password_hash,
        role=UserRole.STUDENT,
        status="active",
        tenant_id=1,
        is_email_verified=True,
        domain_verified=True,
        failed_login_attempts=0,
        preferences={},
        course=getattr(request, "course", None),
        specialization=getattr(request, "specialization", None),
        academic_year=getattr(request, "academic_year", None),
        semester=getattr(request, "semester", None),
        onboarding_completed=bool(getattr(request, "semester", None))
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    
    # Generate tokens
    access_token = auth_mgr.create_access_token(
        subject=str(user.id),
        user_id=user.id,
        role=user.role.value if hasattr(user.role, 'value') else user.role,
        tenant_id=user.tenant_id
    )
    refresh_token = auth_mgr.create_refresh_token(subject=str(user.id), user_id=user.id)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 900,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.full_name or user.username or user.email.split('@')[0],
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "tenant_id": user.tenant_id
        }
    }


@router.post("/onboarding", response_model=MessageResponse)
async def complete_onboarding(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Complete academic onboarding after registration."""
    try:
        from sqlalchemy import select
        from app.models.user import User as UserModel
        
        allowed_streams = {"bsc", "bcom", "bca", "bba"}
        if request.stream not in allowed_streams:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stream '{request.stream}' is not currently available."
            )
        
        allowed_specs = {"mscs", "msds", "mpc", "bipc", "general", "compapps", "honours", "busanalytics", "datasci", "cloud", "cyber", "finance", "hrm", "marketing"}
        if request.specialization not in allowed_specs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Specialization '{request.specialization}' is not currently available."
            )
        
        valid_semesters = {f"sem{i}" for i in range(1, 7)}
        if request.semester not in valid_semesters:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid semester '{request.semester}'."
            )
        
        valid_years = {"1st Year", "2nd Year", "3rd Year", "4th Year"}
        if request.academic_year not in valid_years:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid academic year '{request.academic_year}'."
            )
        
        query = select(UserModel).where(UserModel.id == current_user.id)
        result = await db.execute(query)
        user = result.scalar_one()
        
        user.specialization = request.specialization
        user.academic_year = request.academic_year
        user.semester = request.semester
        stream_course_map = {
            "bsc": "B.Sc Computer Science",
            "bcom": "B.Com",
            "bca": "BCA",
            "bba": "BBA"
        }
        user.course = stream_course_map.get(request.stream, request.stream)
        user.onboarding_completed = True
        
        await db.flush()
        
        return MessageResponse(message="Onboarding completed successfully")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete onboarding"
        )


@router.put("/profile/academic", response_model=MessageResponse)
async def update_academic_profile(
    request: AcademicUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update academic profile (stream, specialization, year, semester)."""
    try:
        from sqlalchemy import select
        from app.models.user import User as UserModel
        
        query = select(UserModel).where(UserModel.id == current_user.id)
        result = await db.execute(query)
        user = result.scalar_one()
        
        if request.specialization is not None:
            user.specialization = request.specialization
        if request.academic_year is not None:
            user.academic_year = request.academic_year
        if request.semester is not None:
            user.semester = request.semester
        if request.stream is not None:
            stream_course_map = {
                "bsc": "B.Sc Computer Science",
                "bcom": "B.Com",
                "bca": "BCA",
                "bba": "BBA"
            }
            user.course = stream_course_map.get(request.stream, request.stream)
        
        await db.flush()
        
        return MessageResponse(message="Academic profile updated successfully")
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update academic profile"
        )


class RegisterCompleteRequest(BaseModel):
    """Complete registration with all data at once."""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    stream: str = Field(..., min_length=1, max_length=100)
    specialization: str = Field(..., min_length=1, max_length=100)
    academic_year: str = Field(..., min_length=1, max_length=50)
    semester: str = Field(..., min_length=1, max_length=50)
    otp_code: str = Field(..., min_length=6, max_length=6)
    tenant_access_code: str = Field(default='SMARTPYQ2024', max_length=128)

class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Current password for confirmation")
    confirmation: str = Field(..., description="Type 'DELETE' to confirm")

@router.post("/delete-account", response_model=MessageResponse)
async def delete_account(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_active_user),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Delete user account.
    
    Requires password confirmation and typing DELETE.
    Soft-deletes the user: anonymizes data, marks inactive.
    Per Privacy Policy, data is fully removed within 30 days.
    """
    try:
        # Require exact confirmation string
        if request.confirmation != "DELETE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please type DELETE to confirm account deletion"
            )
        
        # Verify password
        from app.core.auth import AuthManager
        auth_mgr = AuthManager()
        if not auth_mgr.verify_password(request.password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect password"
            )
        
        # Prevent deletion of super admins
        if current_user.role in ["super_admin", "tenant_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin accounts cannot be self-deleted. Contact support."
            )
        
        from sqlalchemy import select, update
        from app.models.user import User as UserModel, UserStatus
        
        # Anonymize and deactivate (soft delete per Privacy Policy 30-day window)
        anon_email = f"deleted_{current_user.id}_{int(datetime.utcnow().timestamp())}@deleted.smartpyq.com"
        
        await db.execute(
            update(UserModel)
            .where(UserModel.id == current_user.id)
            .values(
                email=anon_email,
                full_name="[Deleted User]",
                password_hash="",
                status=UserStatus.INACTIVE,
                is_email_verified=False,
                domain_verified=False,
                avatar_url=None,
                bio=None,
                phone=None,
                preferences={},
                totp_secret=None,
                backup_codes=None,
                password_reset_token=None,
                google_id=None,
                github_id=None,
                last_login_ip=None
            )
        )
        await db.commit()
        
        # Log audit event
        from app.models.audit_log import AuditAction, AuditSeverity, AuditLog
        audit = AuditLog(
            actor_id=current_user.id,
            action=AuditAction.ACCOUNT_DELETED if hasattr(AuditAction, 'ACCOUNT_DELETED') else AuditAction.SIGNUP_FAILED,
            target_type="user",
            target_id=current_user.id,
            details=f"Account deleted by user: {current_user.email}",
            ip_address=client_ip,
            severity=AuditSeverity.WARNING
        )
        db.add(audit)
        await db.commit()
        
        return MessageResponse(
            message="Account deleted successfully. Your data will be fully removed within 30 days."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again."
        )


@router.post("/register-complete", response_model=AuthResponse)
async def register_complete(
    request: RegisterCompleteRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db)
):
    """Complete registration: verify OTP, create user with academic profile, return tokens."""
    from sqlalchemy import select
    from app.models.user import User, UserRole
    from app.core.auth import AuthManager
    import uuid
    
    auth_mgr = AuthManager()
    clean_email = request.email.strip().lower()
    
    # 1. Verify OTP first
    auth_svc = AuthService(db=db, email_service=_email_svc)
    otp_ok = await auth_svc.verify_otp_code(clean_email, request.otp_code, "email_verification")
    if not otp_ok:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code")
    
    # 2. Check if user already exists
    query = select(User).where(User.email == clean_email)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already exists")
    
    # 3. Validate inputs
    allowed_streams = {"bsc", "bcom", "bca", "bba"}
    if request.stream.lower() not in allowed_streams:
        raise HTTPException(status_code=400, detail=f"Stream '{request.stream}' is not available")
    
    allowed_specs = {"mscs", "msds", "mpc", "bipc", "general", "compapps", "honours", "busanalytics", "datasci", "cloud", "cyber", "finance", "hrm", "marketing"}
    if request.specialization.lower() not in allowed_specs:
        raise HTTPException(status_code=400, detail=f"Specialization '{request.specialization}' is not available")
    
    valid_semesters = {f"sem{i}" for i in range(1, 7)}
    if request.semester.lower() not in valid_semesters:
        raise HTTPException(status_code=400, detail=f"Invalid semester '{request.semester}'")
    
    valid_years = {"1st Year", "2nd Year", "3rd Year", "4th Year"}
    if request.academic_year not in valid_years:
        raise HTTPException(status_code=400, detail=f"Invalid academic year '{request.academic_year}'")
    
    # 4. Hash password and create user
    password_hash = auth_mgr.hash_password(request.password)
    
    stream_course_map = {
        "bsc": "B.Sc Computer Science",
        "bcom": "B.Com",
        "bca": "BCA",
        "bba": "BBA"
    }
    
    user = User(
        email=clean_email,
        username=clean_email.split('@')[0] + '_' + uuid.uuid4().hex[:8],
        full_name=request.name,
        password_hash=password_hash,
        role=UserRole.STUDENT,
        status="active",
        tenant_id=1,
        is_email_verified=True,
        domain_verified=True,
        failed_login_attempts=0,
        preferences={},
        course=stream_course_map.get(request.stream.lower(), request.stream),
        specialization=request.specialization.lower(),
        academic_year=request.academic_year,
        semester=request.semester.lower(),
        onboarding_completed=True
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    
    # 5. Generate tokens
    access_token = auth_mgr.create_access_token(
        subject=str(user.id),
        user_id=user.id,
        role=user.role.value if hasattr(user.role, 'value') else user.role,
        tenant_id=user.tenant_id
    )
    refresh_token = auth_mgr.create_refresh_token(subject=str(user.id), user_id=user.id)
    
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=86400,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.full_name or user.username,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "tenant_id": user.tenant_id,
            "course": user.course,
            "specialization": user.specialization,
            "academic_year": user.academic_year,
            "semester": user.semester,
            "onboarding_completed": True
        }
    )


@router.post("/send-otp-simple")
async def send_otp_simple(request: SendOTPRequest):
    """Simple OTP send -- BLOCKED in production."""
    from app.core.config import settings as _cfg
    if _cfg.ENV == "production":
        raise HTTPException(status_code=404, detail="Endpoint not available")
    auth_svc = AuthService(db=None, email_service=_email_svc)
    dev_otp = await auth_svc.send_otp(email=request.email, purpose=request.purpose)
    # dev_otp is only non-None when email isn't configured (dev fallback), so
    # signup still works before real SMTP credentials are set up.
    return MessageResponse(message=f"OTP sent to {request.email}. Check server console for dev mode.", dev_otp=dev_otp)


@router.get("/papers-accessible")
async def get_accessible_papers(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get papers accessible to the current user based on their academic profile."""
    from sqlalchemy import select
    from app.models.paper import Paper, PaperStatus
    
    is_demo = (str(current_user.role.value) if hasattr(current_user.role, "value") else str(current_user.role)) == "super_admin"
    
    query = select(Paper).where(Paper.status == PaperStatus.APPROVED)
    
    if not is_demo and current_user.course:
        course_stream_map = {
            "B.Sc Computer Science": "bsc",
            "B.Com": "bcom",
            "BCA": "bca",
            "BBA": "bba"
        }
        user_stream = course_stream_map.get(current_user.course, "")
        if user_stream:
            query = query.where(Paper.stream.ilike(f"%{user_stream}%"))
    
    query = query.order_by(Paper.created_at.desc()).limit(50)
    result = await db.execute(query)
    papers = result.scalars().all()
    
    return {
        "papers": [
            {
                "id": p.id,
                "title": p.title,
                "subject": p.subject,
                "stream": p.stream,
                "specialization": p.specialization,
                "semester": p.semester,
                "year": p.year,
                "exam_type": p.exam_type.value if p.exam_type else None,
                "file_url": p.file_url,
                "status": p.status.value,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in papers
        ],
        "total": len(papers),
        "user_stream": current_user.course,
        "is_demo": is_demo
    }
