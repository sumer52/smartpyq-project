from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSignupRequest(BaseModel):
	name: str = Field(..., min_length=1, max_length=255)
	email: EmailStr
	password: str = Field(..., min_length=8, max_length=128)
	tenant_slug: str = Field(..., min_length=1, max_length=100)
	access_code: str = Field(..., min_length=1, max_length=128)


class UserLoginRequest(BaseModel):
	email: EmailStr
	password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	email: EmailStr
	username: Optional[str] = None
	full_name: Optional[str] = None
	role: str
	status: str
	tenant_id: Optional[int] = None
	is_email_verified: bool = False
	domain_verified: bool = False
	avatar_url: Optional[str] = None
	bio: Optional[str] = None
	university: Optional[str] = None
	course: Optional[str] = None
	year_of_study: Optional[int] = None
	preferences: dict = Field(default_factory=dict)

	@classmethod
	def from_orm(cls, obj):
		return cls.model_validate(obj)


class TokenResponse(BaseModel):
	access_token: str
	refresh_token: str
	token_type: str = "bearer"
	expires_in: int
	user: UserResponse


class OTPRequest(BaseModel):
	email: EmailStr
	otp: str = Field(..., min_length=4, max_length=10)


class PasswordChangeRequest(BaseModel):
	current_password: str = Field(..., min_length=1, max_length=128)
	new_password: str = Field(..., min_length=8, max_length=128)


class OnboardingRequest(BaseModel):
    """Academic onboarding data"""
    stream: str = Field(..., min_length=1, max_length=100)        # e.g., 'bsc'
    specialization: str = Field(..., min_length=1, max_length=100) # e.g., 'mscs'
    academic_year: str = Field(..., min_length=1, max_length=50)   # e.g., '2nd Year'
    semester: str = Field(..., min_length=1, max_length=50)        # e.g., 'sem3'


class AcademicUpdateRequest(BaseModel):
    """Update academic profile"""
    stream: Optional[str] = Field(None, max_length=100)
    specialization: Optional[str] = Field(None, max_length=100)
    academic_year: Optional[str] = Field(None, max_length=50)
    semester: Optional[str] = Field(None, max_length=50)


class UserProfileResponse(BaseModel):
    """Full user profile response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    status: str
    tenant_id: Optional[int] = None
    is_email_verified: bool = False
    domain_verified: bool = False
    avatar_url: Optional[str] = None
    university: Optional[str] = None
    course: Optional[str] = None
    specialization: Optional[str] = None
    academic_year: Optional[str] = None
    semester: Optional[str] = None
    year_of_study: Optional[int] = None
    onboarding_completed: bool = False
    preferences: dict = Field(default_factory=dict)
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None
