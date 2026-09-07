"""Content filtering and safety utilities.

Provides content moderation, safety checks, and filtering capabilities
for user-generated content and AI responses.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ContentSeverity(str, Enum):
    """Content safety severity levels."""
    SAFE = "safe"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCKED = "blocked"


class ContentCategory(str, Enum):
    """Content safety categories."""
    HARASSMENT = "harassment"
    HATE_SPEECH = "hate_speech"
    VIOLENCE = "violence"
    SEXUAL = "sexual"
    PROFANITY = "profanity"
    SPAM = "spam"
    PERSONAL_INFO = "personal_info"
    ACADEMIC_MISCONDUCT = "academic_misconduct"


@dataclass
class ContentFilterResult:
    """Content filtering result."""
    is_safe: bool
    severity: ContentSeverity
    categories: List[ContentCategory]
    confidence: float
    filtered_content: Optional[str] = None
    reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ContentFilter:
    """Content filtering and safety service."""
    
    def __init__(self):
        """Initialize content filter with rules and patterns."""
        self.profanity_patterns = self._load_profanity_patterns()
        self.harassment_patterns = self._load_harassment_patterns()
        self.spam_patterns = self._load_spam_patterns()
        self.personal_info_patterns = self._load_personal_info_patterns()
        self.academic_misconduct_patterns = self._load_academic_misconduct_patterns()
        
        logger.info("Content filter initialized")
    
    async def filter_content(
        self,
        content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> ContentFilterResult:
        """Filter content for safety and appropriateness.
        
        Args:
            content: Content to filter
            context: Additional context (user info, conversation history, etc.)
            
        Returns:
            ContentFilterResult with safety assessment
        """
        if not content or not content.strip():
            return ContentFilterResult(
                is_safe=True,
                severity=ContentSeverity.SAFE,
                categories=[],
                confidence=1.0
            )
        
        content_lower = content.lower().strip()
        detected_categories = []
        max_severity = ContentSeverity.SAFE
        reasons = []
        
        # Check for profanity
        profanity_result = self._check_profanity(content_lower)
        if profanity_result[0]:
            detected_categories.append(ContentCategory.PROFANITY)
            max_severity = self._update_severity(max_severity, profanity_result[1])
            reasons.append(f"Profanity detected: {profanity_result[2]}")
        
        # Check for harassment
        harassment_result = self._check_harassment(content_lower)
        if harassment_result[0]:
            detected_categories.append(ContentCategory.HARASSMENT)
            max_severity = self._update_severity(max_severity, harassment_result[1])
            reasons.append(f"Harassment detected: {harassment_result[2]}")
        
        # Check for spam
        spam_result = self._check_spam(content, context)
        if spam_result[0]:
            detected_categories.append(ContentCategory.SPAM)
            max_severity = self._update_severity(max_severity, spam_result[1])
            reasons.append(f"Spam detected: {spam_result[2]}")
        
        # Check for personal information
        pii_result = self._check_personal_info(content)
        if pii_result[0]:
            detected_categories.append(ContentCategory.PERSONAL_INFO)
            max_severity = self._update_severity(max_severity, pii_result[1])
            reasons.append(f"Personal info detected: {pii_result[2]}")
        
        # Check for academic misconduct
        misconduct_result = self._check_academic_misconduct(content_lower)
        if misconduct_result[0]:
            detected_categories.append(ContentCategory.ACADEMIC_MISCONDUCT)
            max_severity = self._update_severity(max_severity, misconduct_result[1])
            reasons.append(f"Academic misconduct: {misconduct_result[2]}")
        
        # Determine if content is safe
        is_safe = max_severity in [ContentSeverity.SAFE, ContentSeverity.LOW]
        
        # Calculate confidence based on number of detections
        confidence = min(1.0, 0.7 + (len(detected_categories) * 0.1))
        
        # Filter content if needed
        filtered_content = None
        if not is_safe and max_severity != ContentSeverity.BLOCKED:
            filtered_content = self._apply_content_filters(content, detected_categories)
        
        return ContentFilterResult(
            is_safe=is_safe,
            severity=max_severity,
            categories=detected_categories,
            confidence=confidence,
            filtered_content=filtered_content,
            reason="; ".join(reasons) if reasons else None,
            metadata={
                "original_length": len(content),
                "filtered_length": len(filtered_content) if filtered_content else len(content)
            }
        )
    
    def _check_profanity(self, content: str) -> Tuple[bool, ContentSeverity, str]:
        """Check for profanity in content."""
        for pattern, severity in self.profanity_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True, severity, pattern
        return False, ContentSeverity.SAFE, ""
    
    def _check_harassment(self, content: str) -> Tuple[bool, ContentSeverity, str]:
        """Check for harassment patterns."""
        for pattern, severity in self.harassment_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True, severity, pattern
        return False, ContentSeverity.SAFE, ""
    
    def _check_spam(self, content: str, context: Optional[Dict[str, Any]]) -> Tuple[bool, ContentSeverity, str]:
        """Check for spam patterns."""
        # Check for excessive repetition
        words = content.split()
        if len(words) > 10:
            word_counts = {}
            for word in words:
                word_counts[word] = word_counts.get(word, 0) + 1
            
            max_count = max(word_counts.values())
            if max_count > len(words) * 0.3:  # More than 30% repetition
                return True, ContentSeverity.MEDIUM, "excessive repetition"
        
        # Check for spam patterns
        for pattern, severity in self.spam_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True, severity, pattern
        
        # Check for excessive caps
        if len(content) > 20 and sum(1 for c in content if c.isupper()) > len(content) * 0.7:
            return True, ContentSeverity.LOW, "excessive caps"
        
        return False, ContentSeverity.SAFE, ""
    
    def _check_personal_info(self, content: str) -> Tuple[bool, ContentSeverity, str]:
        """Check for personal information."""
        for pattern, severity in self.personal_info_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True, severity, pattern
        return False, ContentSeverity.SAFE, ""
    
    def _check_academic_misconduct(self, content: str) -> Tuple[bool, ContentSeverity, str]:
        """Check for academic misconduct patterns."""
        for pattern, severity in self.academic_misconduct_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True, severity, pattern
        return False, ContentSeverity.SAFE, ""
    
    def _update_severity(self, current: ContentSeverity, new: ContentSeverity) -> ContentSeverity:
        """Update severity to the higher level."""
        severity_order = {
            ContentSeverity.SAFE: 0,
            ContentSeverity.LOW: 1,
            ContentSeverity.MEDIUM: 2,
            ContentSeverity.HIGH: 3,
            ContentSeverity.BLOCKED: 4
        }
        
        if severity_order[new] > severity_order[current]:
            return new
        return current
    
    def _apply_content_filters(self, content: str, categories: List[ContentCategory]) -> str:
        """Apply content filters to clean up content."""
        filtered = content
        
        if ContentCategory.PROFANITY in categories:
            for pattern, _ in self.profanity_patterns:
                filtered = re.sub(pattern, "[filtered]", filtered, flags=re.IGNORECASE)
        
        if ContentCategory.PERSONAL_INFO in categories:
            # Mask email addresses
            filtered = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[email]', filtered)
            # Mask phone numbers
            filtered = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[phone]', filtered)
        
        return filtered
    
    def _load_profanity_patterns(self) -> List[Tuple[str, ContentSeverity]]:
        """Load profanity patterns and their severity levels."""
        return [
            # Mild profanity
            (r'\b(damn|hell|crap)\b', ContentSeverity.LOW),
            # Moderate profanity
            (r'\b(shit|fuck|bitch|ass)\b', ContentSeverity.MEDIUM),
            # Severe profanity
            (r'\b(motherfucker|cocksucker)\b', ContentSeverity.HIGH),
        ]
    
    def _load_harassment_patterns(self) -> List[Tuple[str, ContentSeverity]]:
        """Load harassment patterns."""
        return [
            (r'\b(kill yourself|kys)\b', ContentSeverity.BLOCKED),
            (r'\b(you suck|you\'re stupid|idiot|moron)\b', ContentSeverity.MEDIUM),
            (r'\b(hate you|wish you were dead)\b', ContentSeverity.HIGH),
            (r'\b(retard|retarded)\b', ContentSeverity.HIGH),
        ]
    
    def _load_spam_patterns(self) -> List[Tuple[str, ContentSeverity]]:
        """Load spam patterns."""
        return [
            (r'\b(buy now|click here|free money|make money fast)\b', ContentSeverity.MEDIUM),
            (r'\b(viagra|cialis|casino|lottery)\b', ContentSeverity.HIGH),
            (r'(http://|https://|www\.)\S+', ContentSeverity.LOW),  # URLs
        ]
    
    def _load_personal_info_patterns(self) -> List[Tuple[str, ContentSeverity]]:
        """Load personal information patterns."""
        return [
            # Email addresses
            (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', ContentSeverity.MEDIUM),
            # Phone numbers
            (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', ContentSeverity.MEDIUM),
            # Social security numbers (US format)
            (r'\b\d{3}-\d{2}-\d{4}\b', ContentSeverity.HIGH),
            # Credit card patterns
            (r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', ContentSeverity.HIGH),
        ]
    
    def _load_academic_misconduct_patterns(self) -> List[Tuple[str, ContentSeverity]]:
        """Load academic misconduct patterns."""
        return [
            (r'\b(write my essay|do my homework|take my exam)\b', ContentSeverity.HIGH),
            (r'\b(cheat|cheating|plagiarize|plagiarism)\b', ContentSeverity.MEDIUM),
            (r'\b(essay writing service|homework help service)\b', ContentSeverity.HIGH),
            (r'\b(copy paste|ctrl\+c ctrl\+v)\b', ContentSeverity.LOW),
        ]
    
    async def moderate_ai_response(self, response: str) -> ContentFilterResult:
        """Moderate AI-generated response for safety.
        
        Args:
            response: AI-generated response to moderate
            
        Returns:
            ContentFilterResult with moderation assessment
        """
        # AI responses have different safety considerations
        result = await self.filter_content(response)
        
        # Additional checks for AI responses
        if self._contains_harmful_advice(response):
            result.is_safe = False
            result.severity = ContentSeverity.HIGH
            result.categories.append(ContentCategory.VIOLENCE)
            result.reason = (result.reason or "") + "; Contains harmful advice"
        
        return result
    
    def _contains_harmful_advice(self, content: str) -> bool:
        """Check if content contains harmful advice."""
        harmful_patterns = [
            r'\b(how to hurt|how to harm|how to kill)\b',
            r'\b(make explosives|make bombs|make weapons)\b',
            r'\b(commit suicide|end your life)\b',
            r'\b(illegal drugs|buy drugs|sell drugs)\b',
        ]
        
        for pattern in harmful_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return True
        
        return False
    
    async def get_filter_stats(self) -> Dict[str, Any]:
        """Get content filter statistics."""
        return {
            "profanity_patterns": len(self.profanity_patterns),
            "harassment_patterns": len(self.harassment_patterns),
            "spam_patterns": len(self.spam_patterns),
            "personal_info_patterns": len(self.personal_info_patterns),
            "academic_misconduct_patterns": len(self.academic_misconduct_patterns),
            "categories": [category.value for category in ContentCategory],
            "severity_levels": [severity.value for severity in ContentSeverity]
        }


# Global content filter instance
content_filter = ContentFilter()


# Convenience functions
async def filter_user_content(content: str, context: Optional[Dict[str, Any]] = None) -> ContentFilterResult:
    """Filter user-generated content."""
    return await content_filter.filter_content(content, context)


async def moderate_ai_content(content: str) -> ContentFilterResult:
    """Moderate AI-generated content."""
    return await content_filter.moderate_ai_response(content)


async def is_content_safe(content: str) -> bool:
    """Quick check if content is safe."""
    result = await content_filter.filter_content(content)
    return result.is_safe