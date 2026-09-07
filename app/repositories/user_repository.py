"""User repository for user-related database operations.

Handles user authentication, profile management, and tenant relationships.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.user import User, UserRole, UserStatus
from app.models.tenant import Tenant
from app.repositories.base_repository import BaseRepository
from app.core.exceptions import ValidationError, NotFoundError


class UserRepository(BaseRepository[User]):
    """Repository for user operations."""
    
    def __init__(self, db=None):
        super().__init__(db, User)
    
    async def get_by_email(
        self,
        email: str,
        load_tenant: bool = False
    ) -> Optional[User]:
        """Get user by email address.
        
        Args:
            email: User email address
            load_tenant: Whether to load tenant relationship
            
        Returns:
            User instance or None
        """
        query = select(User).where(User.email == email.lower())
        
        if load_tenant:
            query = query.options(selectinload(User.tenant))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_username(
        self,
        username: str,
        load_tenant: bool = False
    ) -> Optional[User]:
        """Get user by username.
        
        Args:
            username: Username
            load_tenant: Whether to load tenant relationship
            
        Returns:
            User instance or None
        """
        query = select(User).where(User.username == username)
        
        if load_tenant:
            query = query.options(selectinload(User.tenant))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_email_or_username(
        self,
        identifier: str,
        load_tenant: bool = False
    ) -> Optional[User]:
        """Get user by email or username.
        
        Args:
            identifier: Email or username
            load_tenant: Whether to load tenant relationship
            
        Returns:
            User instance or None
        """
        query = select(User).where(
            or_(
                User.email == identifier.lower(),
                User.username == identifier
            )
        )
        
        if load_tenant:
            query = query.options(selectinload(User.tenant))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def email_exists(self, email: str, exclude_user_id: Optional[int] = None) -> bool:
        """Check if email already exists.
        
        Args:
            email: Email to check
            exclude_user_id: User ID to exclude from check (for updates)
            
        Returns:
            True if email exists
        """
        query = select(func.count(User.id)).where(User.email == email.lower())
        
        if exclude_user_id:
            query = query.where(User.id != exclude_user_id)
        
        result = await self.db.execute(query)
        count = result.scalar()
        return count > 0
    
    async def username_exists(self, username: str, exclude_user_id: Optional[int] = None) -> bool:
        """Check if username already exists.
        
        Args:
            username: Username to check
            exclude_user_id: User ID to exclude from check (for updates)
            
        Returns:
            True if username exists
        """
        query = select(func.count(User.id)).where(User.username == username)
        
        if exclude_user_id:
            query = query.where(User.id != exclude_user_id)
        
        result = await self.db.execute(query)
        count = result.scalar()
        return count > 0
    
    async def create_user(
        self,
        email: str,
        password_hash: str,
        name: str,
        username: Optional[str] = None,
        tenant_id: Optional[int] = None,
        role: UserRole = UserRole.STUDENT,
        **kwargs
    ) -> User:
        """Create a new user.
        
        Args:
            email: User email
            password_hash: Hashed password
            name: User full name
            username: Username (optional)
            tenant_id: Tenant ID
            role: User role
            **kwargs: Additional user fields
            
        Returns:
            Created user instance
            
        Raises:
            ValidationError: If email or username already exists
        """
        # Check if email exists
        if await self.email_exists(email):
            raise ValidationError(f"Email {email} already exists")
        
        # Check if username exists (if provided)
        if username and await self.username_exists(username):
            raise ValidationError(f"Username {username} already exists")
        
        # Create user data
        user_data = {
            'email': email.lower(),
            'password_hash': password_hash,
            'name': name,
            'username': username,
            'tenant_id': tenant_id,
            'role': role,
            'status': UserStatus.PENDING_VERIFICATION,
            **kwargs
        }
        
        return await self.create(**user_data)
    
    async def get_users_by_tenant(
        self,
        tenant_id: int,
        role: Optional[UserRole] = None,
        status: Optional[UserStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """Get users by tenant with optional filters.
        
        Args:
            tenant_id: Tenant ID
            role: Filter by user role
            status: Filter by user status
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of users
        """
        query = select(User).where(User.tenant_id == tenant_id)
        
        if role:
            query = query.where(User.role == role)
        
        if status:
            query = query.where(User.status == status)
        
        query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_active_users(
        self,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """Get active users.
        
        Args:
            tenant_id: Filter by tenant ID
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of active users
        """
        query = select(User).where(User.status == UserStatus.ACTIVE)
        
        if tenant_id:
            query = query.where(User.tenant_id == tenant_id)
        
        query = query.order_by(User.last_login_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def update_last_login(self, user_id: int) -> bool:
        """Update user's last login timestamp.
        
        Args:
            user_id: User ID
            
        Returns:
            True if updated successfully
        """
        query = (
            update(User)
            .where(User.id == user_id)
            .values(
                last_login_at=datetime.utcnow(),
                failed_login_attempts=0  # Reset failed attempts on successful login
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def increment_failed_login_attempts(self, user_id: int) -> int:
        """Increment failed login attempts for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            New failed attempts count
        """
        # Get current count
        user = await self.get_by_id(user_id)
        if not user:
            return 0
        
        new_count = (user.failed_login_attempts or 0) + 1
        
        # Update count and potentially lock account
        update_data = {
            'failed_login_attempts': new_count,
            'last_login_at': datetime.utcnow()
        }
        
        # Lock account after 5 failed attempts
        if new_count >= 5:
            update_data['locked_until'] = datetime.utcnow() + timedelta(hours=1)
            
        
        await self.update(user_id, **update_data)
        return new_count
    
    async def unlock_user(self, user_id: int) -> bool:
        """Unlock a user account.
        
        Args:
            user_id: User ID
            
        Returns:
            True if unlocked successfully
        """
        query = (
            update(User)
            .where(User.id == user_id)
            .values(
                locked_until=None,
                failed_login_attempts=0
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def verify_email(self, user_id: int) -> bool:
        """Mark user email as verified.
        
        Args:
            user_id: User ID
            
        Returns:
            True if verified successfully
        """
        query = (
            update(User)
            .where(User.id == user_id)
            .values(
                email_verified=True,
                email_verified_at=datetime.utcnow(),
                status=UserStatus.ACTIVE
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def update_password(self, user_id: int, password_hash: str) -> bool:
        """Update user password.
        
        Args:
            user_id: User ID
            password_hash: New hashed password
            
        Returns:
            True if updated successfully
        """
        query = (
            update(User)
            .where(User.id == user_id)
            .values(
                password_hash=password_hash,
                password_changed_at=datetime.utcnow()
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def get_users_by_role(
        self,
        role: UserRole,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """Get users by role.
        
        Args:
            role: User role
            tenant_id: Filter by tenant ID
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of users with specified role
        """
        query = select(User).where(User.role == role)
        
        if tenant_id:
            query = query.where(User.tenant_id == tenant_id)
        
        query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def search_users(
        self,
        search_term: str,
        tenant_id: Optional[int] = None,
        role: Optional[UserRole] = None,
        status: Optional[UserStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """Search users by name, email, or username.
        
        Args:
            search_term: Search term
            tenant_id: Filter by tenant ID
            role: Filter by role
            status: Filter by status
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of matching users
        """
        search_pattern = f"%{search_term}%"
        
        query = select(User).where(
            or_(
                User.name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.username.ilike(search_pattern)
            )
        )
        
        if tenant_id:
            query = query.where(User.tenant_id == tenant_id)
        
        if role:
            query = query.where(User.role == role)
        
        if status:
            query = query.where(User.status == status)
        
        query = query.order_by(User.name).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_users_requiring_verification(
        self,
        tenant_id: Optional[int] = None,
        hours_old: int = 24
    ) -> List[User]:
        """Get users that need email verification.
        
        Args:
            tenant_id: Filter by tenant ID
            hours_old: Minimum hours since registration
            
        Returns:
            List of users needing verification
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours_old)
        
        query = select(User).where(
            and_(
                User.email_verified == False,
                User.status == UserStatus.PENDING_VERIFICATION,
                User.created_at <= cutoff_time
            )
        )
        
        if tenant_id:
            query = query.where(User.tenant_id == tenant_id)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_locked_users(
        self,
        tenant_id: Optional[int] = None,
        hours_locked: Optional[int] = None
    ) -> List[User]:
        """Get locked user accounts.
        
        Args:
            tenant_id: Filter by tenant ID
            hours_locked: Minimum hours since lock
            
        Returns:
            List of locked users
        """
        query = select(User).where(User.locked_until > datetime.utcnow())
        
        if tenant_id:
            query = query.where(User.tenant_id == tenant_id)
        
        if hours_locked:
            cutoff_time = datetime.utcnow() - timedelta(hours=hours_locked)
            query = query.where()
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_user_stats(self, tenant_id: Optional[int] = None) -> Dict[str, Any]:
        """Get user statistics.
        
        Args:
            tenant_id: Filter by tenant ID
            
        Returns:
            Dictionary with user statistics
        """
        base_query = select(func.count(User.id))
        
        if tenant_id:
            base_query = base_query.where(User.tenant_id == tenant_id)
        
        # Total users
        total_result = await self.db.execute(base_query)
        total_users = total_result.scalar()
        
        # Active users
        active_query = base_query.where(User.status == UserStatus.ACTIVE)
        active_result = await self.db.execute(active_query)
        active_users = active_result.scalar()
        
        # Pending verification
        pending_query = base_query.where(User.status == UserStatus.PENDING_VERIFICATION)
        pending_result = await self.db.execute(pending_query)
        pending_users = pending_result.scalar()
        
        # Locked users
        locked_query = base_query.where(User.locked_until > datetime.utcnow())
        locked_result = await self.db.execute(locked_query)
        locked_users = locked_result.scalar()
        
        # Users by role
        role_stats = {}
        for role in UserRole:
            role_query = base_query.where(User.role == role)
            role_result = await self.db.execute(role_query)
            role_stats[role.value] = role_result.scalar()
        
        return {
            'total_users': total_users,
            'active_users': active_users,
            'pending_verification': pending_users,
            'locked_users': locked_users,
            'by_role': role_stats
        }
    
    async def update_profile(
        self,
        user_id: int,
        name: Optional[str] = None,
        username: Optional[str] = None,
        bio: Optional[str] = None,
        avatar_url: Optional[str] = None,
        preferences: Optional[Dict[str, Any]] = None
    ) -> Optional[User]:
        """Update user profile information.
        
        Args:
            user_id: User ID
            name: New name
            username: New username
            bio: User bio
            avatar_url: Avatar URL
            preferences: User preferences
            
        Returns:
            Updated user instance
            
        Raises:
            ValidationError: If username already exists
        """
        update_data = {}
        
        if name is not None:
            update_data['name'] = name
        
        if username is not None:
            # Check if username exists (excluding current user)
            if await self.username_exists(username, exclude_user_id=user_id):
                raise ValidationError(f"Username {username} already exists")
            update_data['username'] = username
        
        if bio is not None:
            update_data['bio'] = bio
        
        if avatar_url is not None:
            update_data['avatar_url'] = avatar_url
        
        if preferences is not None:
            update_data['preferences'] = preferences
        
        if update_data:
            return await self.update(user_id, **update_data)
        
        return await self.get_by_id(user_id)