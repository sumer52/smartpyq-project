"""Bookmarks API Routes - Async version"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..core.database import get_db
from ..core.dependencies import get_current_active_user
from ..models.user import User
from ..models.paper import Paper
from ..models.bookmark import Bookmark

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


class BookmarkResponse(BaseModel):
    id: int
    paper_id: int
    created_at: datetime
    paper_title: Optional[str] = None
    paper_subject: Optional[str] = None
    paper_year: Optional[int] = None
    class Config:
        from_attributes = True


class BookmarkToggleResponse(BaseModel):
    bookmarked: bool
    message: str


@router.get("/", response_model=List[BookmarkResponse])
async def get_bookmarks(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all bookmarks for the current user."""
    q = select(Bookmark).where(Bookmark.user_id == current_user.id).order_by(Bookmark.created_at.desc())
    result = await db.execute(q)
    bookmarks = result.scalars().all()
    
    response = []
    for bm in bookmarks:
        pq = select(Paper).where(Paper.id == bm.paper_id)
        pr = await db.execute(pq)
        paper = pr.scalar_one_or_none()
        response.append(BookmarkResponse(
            id=bm.id, paper_id=bm.paper_id, created_at=bm.created_at,
            paper_title=paper.title if paper else None,
            paper_subject=paper.subject if paper else None,
            paper_year=paper.year if paper else None
        ))
    return response


@router.post("/{paper_id}", response_model=BookmarkToggleResponse)
async def toggle_bookmark(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Toggle bookmark for a paper."""
    pq = select(Paper).where(Paper.id == paper_id)
    pr = await db.execute(pq)
    paper = pr.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    bq = select(Bookmark).where(and_(Bookmark.user_id == current_user.id, Bookmark.paper_id == paper_id))
    br = await db.execute(bq)
    existing = br.scalar_one_or_none()
    
    if existing:
        await db.delete(existing)
        await db.flush()
        return BookmarkToggleResponse(bookmarked=False, message="Bookmark removed")
    else:
        new_bm = Bookmark(user_id=current_user.id, paper_id=paper_id)
        db.add(new_bm)
        await db.flush()
        return BookmarkToggleResponse(bookmarked=True, message="Paper bookmarked")


@router.delete("/{paper_id}", response_model=BookmarkToggleResponse)
async def remove_bookmark(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a bookmark for a paper."""
    bq = select(Bookmark).where(and_(Bookmark.user_id == current_user.id, Bookmark.paper_id == paper_id))
    result = await db.execute(bq)
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    await db.delete(existing)
    await db.flush()
    return BookmarkToggleResponse(bookmarked=False, message="Bookmark removed")


@router.get("/check/{paper_id}")
async def check_bookmark(
    paper_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if a paper is bookmarked."""
    bq = select(Bookmark).where(and_(Bookmark.user_id == current_user.id, Bookmark.paper_id == paper_id))
    result = await db.execute(bq)
    existing = result.scalar_one_or_none()
    return {"bookmarked": existing is not None}
