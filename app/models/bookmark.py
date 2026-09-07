"""Bookmark model for saving favorite papers and questions.

Allows users to bookmark papers and questions for later reference.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Bookmark(Base):
    """Bookmark model for user's saved papers and questions."""
    
    __tablename__ = "bookmarks"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=True, index=True)
    bookmark_type = Column(String(50), default="paper", nullable=False)
    group_id = Column(Integer, ForeignKey("question_groups.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", backref="bookmarks")
    paper = relationship("Paper", backref="bookmarks")
    question = relationship("Question", backref="bookmarks")
    group = relationship("QuestionGroup", backref="bookmarks")
    
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_user_question_bookmark"),
    )
    
    def __repr__(self):
        return f"<Bookmark(user_id={self.user_id}, type={self.bookmark_type})>"
