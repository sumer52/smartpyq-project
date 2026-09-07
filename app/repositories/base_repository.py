"""Base repository class for database operations.

Provides common CRUD operations and query patterns for all repositories.
"""

from typing import Generic, TypeVar, Type, Optional, List, Dict, Any, Union
from abc import ABC, abstractmethod

from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.sql import Select

from app.core.database import Base
from app.core.exceptions import NotFoundError, ValidationError

# Generic type for model
ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType], ABC):
    """Base repository class with common database operations."""
    
    def __init__(self, db, model: Type[ModelType]):
        self.db = db
        self.model = model
    
    async def get_by_id(
        self,
        id: int,
        load_relationships: Optional[List[str]] = None
    ) -> Optional[ModelType]:
        """Get a record by ID.
        
        Args:
            id: Record ID
            load_relationships: List of relationships to eager load
            
        Returns:
            Model instance or None
        """
        query = select(self.model).where(self.model.id == id)
        
        # Add eager loading for relationships
        if load_relationships:
            for relationship in load_relationships:
                query = query.options(selectinload(getattr(self.model, relationship)))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_id_or_404(
        self,
        id: int,
        load_relationships: Optional[List[str]] = None
    ) -> ModelType:
        """Get a record by ID or raise 404 error.
        
        Args:
            id: Record ID
            load_relationships: List of relationships to eager load
            
        Returns:
            Model instance
            
        Raises:
            NotFoundError: If record not found
        """
        record = await self.get_by_id(id, load_relationships)
        if not record:
            raise NotFoundError(f"{self.model.__name__} with id {id} not found")
        return record
    
    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        load_relationships: Optional[List[str]] = None,
        order_by: Optional[str] = None,
        order_desc: bool = False
    ) -> List[ModelType]:
        """Get all records with pagination.
        
        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            load_relationships: List of relationships to eager load
            order_by: Field to order by
            order_desc: Whether to order in descending order
            
        Returns:
            List of model instances
        """
        query = select(self.model)
        
        # Add eager loading for relationships
        if load_relationships:
            for relationship in load_relationships:
                query = query.options(selectinload(getattr(self.model, relationship)))
        
        # Add ordering
        if order_by:
            order_field = getattr(self.model, order_by)
            if order_desc:
                query = query.order_by(order_field.desc())
            else:
                query = query.order_by(order_field)
        
        # Add pagination
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_by_field(
        self,
        field_name: str,
        field_value: Any,
        load_relationships: Optional[List[str]] = None
    ) -> Optional[ModelType]:
        """Get a record by a specific field.
        
        Args:
            field_name: Name of the field
            field_value: Value to search for
            load_relationships: List of relationships to eager load
            
        Returns:
            Model instance or None
        """
        query = select(self.model).where(getattr(self.model, field_name) == field_value)
        
        # Add eager loading for relationships
        if load_relationships:
            for relationship in load_relationships:
                query = query.options(selectinload(getattr(self.model, relationship)))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_many_by_field(
        self,
        field_name: str,
        field_value: Any,
        skip: int = 0,
        limit: int = 100,
        load_relationships: Optional[List[str]] = None
    ) -> List[ModelType]:
        """Get multiple records by a specific field.
        
        Args:
            field_name: Name of the field
            field_value: Value to search for
            skip: Number of records to skip
            limit: Maximum number of records to return
            load_relationships: List of relationships to eager load
            
        Returns:
            List of model instances
        """
        query = select(self.model).where(getattr(self.model, field_name) == field_value)
        
        # Add eager loading for relationships
        if load_relationships:
            for relationship in load_relationships:
                query = query.options(selectinload(getattr(self.model, relationship)))
        
        # Add pagination
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def create(self, **kwargs) -> ModelType:
        """Create a new record.
        
        Args:
            **kwargs: Field values for the new record
            
        Returns:
            Created model instance
        """
        instance = self.model(**kwargs)
        self.db.add(instance)
        await self.db.flush()  # Flush to get the ID
        await self.db.refresh(instance)
        return instance
    
    async def update(
        self,
        id: int,
        **kwargs
    ) -> Optional[ModelType]:
        """Update a record by ID.
        
        Args:
            id: Record ID
            **kwargs: Field values to update
            
        Returns:
            Updated model instance or None
        """
        # Remove None values to avoid overwriting with None
        update_data = {k: v for k, v in kwargs.items() if v is not None}
        
        if not update_data:
            return await self.get_by_id(id)
        
        query = (
            update(self.model)
            .where(self.model.id == id)
            .values(**update_data)
        )
        
        await self.db.execute(query)
        await self.db.flush()
        
        # Fetch the updated record
        updated_record = await self.get_by_id(id)
        return updated_record
    
    async def delete(self, id: int) -> bool:
        """Delete a record by ID.
        
        Args:
            id: Record ID
            
        Returns:
            True if record was deleted, False if not found
        """
        query = delete(self.model).where(self.model.id == id)
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def exists(self, id: int) -> bool:
        """Check if a record exists by ID.
        
        Args:
            id: Record ID
            
        Returns:
            True if record exists
        """
        query = select(func.count(self.model.id)).where(self.model.id == id)
        result = await self.db.execute(query)
        count = result.scalar()
        return count > 0
    
    async def count(
        self,
        filters: Optional[Dict[str, Any]] = None
    ) -> int:
        """Count records with optional filters.
        
        Args:
            filters: Dictionary of field filters
            
        Returns:
            Number of records
        """
        query = select(func.count(self.model.id))
        
        if filters:
            conditions = []
            for field_name, field_value in filters.items():
                if hasattr(self.model, field_name):
                    conditions.append(getattr(self.model, field_name) == field_value)
            
            if conditions:
                query = query.where(and_(*conditions))
        
        result = await self.db.execute(query)
        return result.scalar()
    
    async def search(
        self,
        filters: Optional[Dict[str, Any]] = None,
        search_fields: Optional[Dict[str, str]] = None,
        skip: int = 0,
        limit: int = 100,
        order_by: Optional[str] = None,
        order_desc: bool = False,
        load_relationships: Optional[List[str]] = None
    ) -> List[ModelType]:
        """Search records with filters and text search.
        
        Args:
            filters: Dictionary of exact field filters
            search_fields: Dictionary of field names and search terms for ILIKE search
            skip: Number of records to skip
            limit: Maximum number of records to return
            order_by: Field to order by
            order_desc: Whether to order in descending order
            load_relationships: List of relationships to eager load
            
        Returns:
            List of model instances
        """
        query = select(self.model)
        
        # Add exact filters
        if filters:
            conditions = []
            for field_name, field_value in filters.items():
                if hasattr(self.model, field_name):
                    if isinstance(field_value, list):
                        conditions.append(getattr(self.model, field_name).in_(field_value))
                    else:
                        conditions.append(getattr(self.model, field_name) == field_value)
            
            if conditions:
                query = query.where(and_(*conditions))
        
        # Add text search filters
        if search_fields:
            search_conditions = []
            for field_name, search_term in search_fields.items():
                if hasattr(self.model, field_name) and search_term:
                    search_conditions.append(
                        getattr(self.model, field_name).ilike(f"%{search_term}%")
                    )
            
            if search_conditions:
                query = query.where(or_(*search_conditions))
        
        # Add eager loading for relationships
        if load_relationships:
            for relationship in load_relationships:
                query = query.options(selectinload(getattr(self.model, relationship)))
        
        # Add ordering
        if order_by and hasattr(self.model, order_by):
            order_field = getattr(self.model, order_by)
            if order_desc:
                query = query.order_by(order_field.desc())
            else:
                query = query.order_by(order_field)
        
        # Add pagination
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def bulk_create(self, records: List[Dict[str, Any]]) -> List[ModelType]:
        """Create multiple records in bulk.
        
        Args:
            records: List of dictionaries with record data
            
        Returns:
            List of created model instances
        """
        instances = [self.model(**record) for record in records]
        self.db.add_all(instances)
        await self.db.flush()
        
        # Refresh all instances to get generated IDs
        for instance in instances:
            await self.db.refresh(instance)
        
        return instances
    
    async def bulk_update(
        self,
        updates: List[Dict[str, Any]]
    ) -> int:
        """Update multiple records in bulk.
        
        Args:
            updates: List of dictionaries with id and update data
            
        Returns:
            Number of updated records
        """
        if not updates:
            return 0
        
        # Group updates by the fields being updated for efficiency
        total_updated = 0
        
        for update_data in updates:
            record_id = update_data.pop('id')
            if update_data:  # Only update if there's data to update
                query = (
                    update(self.model)
                    .where(self.model.id == record_id)
                    .values(**update_data)
                )
                result = await self.db.execute(query)
                total_updated += result.rowcount
        
        return total_updated
    
    def build_query(self) -> Select:
        """Build a base query for the model.
        
        Returns:
            SQLAlchemy Select query
        """
        return select(self.model)
    
    async def execute_query(self, query: Select) -> List[ModelType]:
        """Execute a custom query.
        
        Args:
            query: SQLAlchemy Select query
            
        Returns:
            List of model instances
        """
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_or_create(
        self,
        defaults: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> tuple[ModelType, bool]:
        """Get an existing record or create a new one.
        
        Args:
            defaults: Default values for creation
            **kwargs: Fields to search for existing record
            
        Returns:
            Tuple of (instance, created) where created is True if new record
        """
        # Try to find existing record
        conditions = []
        for field_name, field_value in kwargs.items():
            if hasattr(self.model, field_name):
                conditions.append(getattr(self.model, field_name) == field_value)
        
        if conditions:
            query = select(self.model).where(and_(*conditions))
            result = await self.db.execute(query)
            existing = result.scalar_one_or_none()
            
            if existing:
                return existing, False
        
        # Create new record
        create_data = kwargs.copy()
        if defaults:
            create_data.update(defaults)
        
        new_instance = await self.create(**create_data)
        return new_instance, True