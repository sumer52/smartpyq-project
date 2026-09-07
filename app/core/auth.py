"""Authentication utilities.

Provides JWT token handling, password hashing, and authentication helpers.
"""

import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Union

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, HashingError
from fastapi import Request
from fastapi.security import HTTPBearer

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ValidationError

# Initialize password hasher
ph = PasswordHasher()

# Initialize HTTP Bearer for token extraction
security = HTTPBearer(auto_error=False)


class TokenType:
    """Token type constants."""
    ACCESS = "access"
    REFRESH = "refresh"
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"
    OTP = "otp"


class AuthManager:
    """Authentication manager for handling tokens and passwords."""
    
    def __init__(self):
        self.secret_key = settings.JWT_SECRET
        self.algorithm = "HS256"
        self.access_token_expire = timedelta(seconds=settings.JWT_ACCESS_EXPIRE_SECONDS)
        self.refresh_token_expire = timedelta(seconds=settings.JWT_REFRESH_EXPIRE_SECONDS)
    
    def hash_password(self, password: str) -> str:
        """Hash a password using Argon2.
        
        Args:
            password: Plain text password
            
        Returns:
            str: Hashed password
            
        Raises:
            ValidationError: If password hashing fails
        """
        try:
            return ph.hash(password)
        except HashingError as e:
            raise ValidationError(f"Password hashing failed: {str(e)}")
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """Verify a password against its hash.
        
        Args:
            password: Plain text password
            hashed_password: Hashed password
            
        Returns:
            bool: True if password matches
        """
        try:
            ph.verify(hashed_password, password)
            return True
        except VerifyMismatchError:
            return False
    
    def needs_rehash(self, hashed_password: str) -> bool:
        """Check if password hash needs to be updated.
        
        Args:
            hashed_password: Hashed password
            
        Returns:
            bool: True if hash needs update
        """
        return ph.check_needs_rehash(hashed_password)
    
    def create_access_token(
        self,
        subject: Union[str, int],
        user_id: int,
        role: str,
        tenant_id: Optional[int] = None,
        expires_delta: Optional[timedelta] = None,
        additional_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create an access token.
        
        Args:
            subject: Token subject (usually user email)
            user_id: User ID
            role: User role
            tenant_id: Tenant ID
            expires_delta: Custom expiration time
            additional_claims: Additional JWT claims
            
        Returns:
            str: JWT access token
        """
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + self.access_token_expire
        
        payload = {
            "sub": str(subject),
            "user_id": user_id,
            "role": role,
            "tenant_id": tenant_id,
            "type": TokenType.ACCESS,
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16)  # JWT ID for token revocation
        }
        
        if additional_claims:
            payload.update(additional_claims)
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def create_refresh_token(
        self,
        subject: Union[str, int],
        user_id: int,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create a refresh token.
        
        Args:
            subject: Token subject (usually user email)
            user_id: User ID
            expires_delta: Custom expiration time
            
        Returns:
            str: JWT refresh token
        """
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + self.refresh_token_expire
        
        payload = {
            "sub": str(subject),
            "user_id": user_id,
            "type": TokenType.REFRESH,
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16)
        }
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def create_verification_token(
        self,
        subject: Union[str, int],
        token_type: str,
        expires_delta: Optional[timedelta] = None,
        additional_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a verification token (email, password reset, etc.).
        
        Args:
            subject: Token subject
            token_type: Type of verification token
            expires_delta: Custom expiration time
            additional_claims: Additional JWT claims
            
        Returns:
            str: JWT verification token
        """
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=24)  # Default 24 hours
        
        payload = {
            "sub": str(subject),
            "type": token_type,
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": secrets.token_urlsafe(16)
        }
        
        if additional_claims:
            payload.update(additional_claims)
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def decode_token(self, token: str) -> Dict[str, Any]:
        """Decode and validate a JWT token.
        
        Args:
            token: JWT token
            
        Returns:
            dict: Token payload
            
        Raises:
            AuthenticationError: If token is invalid
        """
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                options={"verify_exp": True}
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise AuthenticationError("Token has expired")
        except jwt.InvalidTokenError as e:
            raise AuthenticationError(f"Invalid token: {str(e)}")
    
    def validate_token_type(self, payload: Dict[str, Any], expected_type: str) -> bool:
        """Validate token type.
        
        Args:
            payload: Token payload
            expected_type: Expected token type
            
        Returns:
            bool: True if token type matches
        """
        return payload.get("type") == expected_type
    
    def extract_token_from_request(self, request: Request) -> Optional[str]:
        """Extract JWT token from request.
        
        Args:
            request: FastAPI request object
            
        Returns:
            str: JWT token or None
        """
        # Try Authorization header first
        authorization = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            return authorization.split(" ")[1]
        
        # Try cookie as fallback
        return request.cookies.get("access_token")
    
    def generate_otp(self, length: int = 6) -> str:
        """Generate a numeric OTP.
        
        Args:
            length: OTP length
            
        Returns:
            str: Numeric OTP
        """
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])
    
    def generate_secure_token(self, length: int = 32) -> str:
        """Generate a secure random token.
        
        Args:
            length: Token length in bytes
            
        Returns:
            str: URL-safe token
        """
        return secrets.token_urlsafe(length)
    
    def create_token_pair(
        self,
        subject: Union[str, int],
        user_id: int,
        role: str,
        tenant_id: Optional[int] = None,
        additional_claims: Optional[Dict[str, Any]] = None
    ) -> Dict[str, str]:
        """Create access and refresh token pair.
        
        Args:
            subject: Token subject
            user_id: User ID
            role: User role
            tenant_id: Tenant ID
            additional_claims: Additional claims for access token
            
        Returns:
            dict: Access and refresh tokens
        """
        access_token = self.create_access_token(
            subject=subject,
            user_id=user_id,
            role=role,
            tenant_id=tenant_id,
            additional_claims=additional_claims
        )
        
        refresh_token = self.create_refresh_token(
            subject=subject,
            user_id=user_id
        )
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int(self.access_token_expire.total_seconds())
        }


# Global auth manager instance
auth_manager = AuthManager()
