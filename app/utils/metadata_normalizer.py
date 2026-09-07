"""Metadata Normalizer for Paper Uploads

Validates and normalizes paper metadata before database insertion.
Ensures consistent naming across all uploaded papers by comparing against
known canonical values from the application's data structures.
"""

import re
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher


# ─── Canonical Data ───────────────────────────────────────────────────────────

# Valid subject names across all streams/semesters
CANONICAL_SUBJECTS = [
    # B.Sc MSCS
    'Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit',
    # B.Sc MPC
    'Physics', 'Chemistry',
    # B.Sc BiPC
    'Botany', 'Zoology', 'Life Science',
    # B.Com General
    'Accounting - I', 'Accounting - II', 'Business Management', 'Basics of Marketing',
    'Business Law', 'Banking Services', 'Business Statistics - I', 'Business Statistics - II',
    'Advanced Accounting', 'Auditing', 'Corporate Accounting', 'Income Tax',
    'Cost Accounting', 'Advanced Corporate Accounting', 'Advanced Income Tax',
    'Computerized Accounting', 'Accounting Standards', 'Cost Control',
    # B.Com Computer Applications
    'Financial Accounting', 'Computer Fundamentals', 'Computer Applications',
    'Database Management', 'Programming',
    # B.Com Honours
    'Financial Management', 'Management Accounting',
    # B.Com Business Analytics
    'Business Economics', 'Business Analytics Fundamentals', 'Data Analytics',
    'Predictive Analytics', 'Business Intelligence', 'Data Visualization',
    'Advanced Business Analytics', 'Financial Analytics',
    # BCA
    'Programming Fundamentals', 'Data Structures', 'Object Oriented Programming',
    'Database Management Systems', 'Operating Systems', 'Computer Networks',
    'Software Engineering', 'DBMS using Python', 'Artificial Intelligence',
    'Network Security', '.NET Programming', 'UNIX Programming', 'Software Testing',
    'Advanced Programming', 'Information Security', 'Project',
    # BBA
    'Principles of Management', 'Economics', 'Organizational Behaviour',
    'Human Resource Management', 'Information Technology', 'Financial Management',
    'Market Research', 'Management Science', 'Business Law',
    'Financial Asset Management', 'Financial Markets', 'Mobile Commerce',
    'Supply Chain Management', 'Customer Relationship Management',
]

# Valid stream keys and their display names
CANONICAL_STREAMS = {
    'bsc': ['B.Sc', 'BSC', 'b.sc', 'b sc'],
    'bcom': ['B.Com', 'BCOM', 'b.com', 'b com'],
    'bca': ['BCA', 'bca'],
    'bba': ['BBA', 'bba'],
}

# Valid semester IDs
CANONICAL_SEMESTERS = {
    'sem1': ['Semester 1', 'Sem 1', 'sem1', 'sem 1', 'semester 1'],
    'sem2': ['Semester 2', 'Sem 2', 'sem2', 'sem 2', 'semester 2'],
    'sem3': ['Semester 3', 'Sem 3', 'sem3', 'sem 3', 'semester 3'],
    'sem4': ['Semester 4', 'Sem 4', 'sem4', 'sem 4', 'semester 4'],
    'sem5': ['Semester 5', 'Sem 5', 'sem5', 'sem 5', 'semester 5'],
    'sem6': ['Semester 6', 'Sem 6', 'sem6', 'sem 6', 'semester 6'],
}

# Valid universities
CANONICAL_UNIVERSITIES = [
    'Osmania University', 'University of Hyderabad',
    'Jawaharlal Nehru Technological University', 'Kakatiya University',
    'Palamuru University', 'Satavahana University', 'Telangana University',
]


# ─── Fuzzy Matching ───────────────────────────────────────────────────────────

def similarity(a: str, b: str) -> float:
    """Calculate similarity between two strings (0 to 1)."""
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def find_best_match(input_val: str, candidates: List[str], threshold: float = 0.6) -> Optional[str]:
    """Find the best matching canonical value for user input."""
    if not input_val or not input_val.strip():
        return None

    normalized = input_val.strip()

    # Exact match
    for c in candidates:
        if c.lower() == normalized.lower():
            return c

    # Fuzzy match
    best = None
    best_score = 0.0
    for c in candidates:
        score = similarity(normalized, c)
        if score > best_score:
            best_score = score
            best = c

    if best_score >= threshold:
        return best

    return None


# ─── Title Normalization ──────────────────────────────────────────────────────

# Common spelling corrections for academic terms
TITLE_CORRECTIONS = {
    r'\b(fnal|finl)\b': 'Final',
    r'\b(mid|midd)\s*(term|trem)\b': 'Mid Term',
    r'\b(exam|exm|exma)\b': 'Exam',
    r'\b(semestar|semster)\b': 'Semester',
    r'\b(questin|qus|que|ques|qustion)\s*(paper|papaer|ppr)\b': 'Question Paper',
    r'\b(papaer|papper|papre|papr)\b': 'Paper',
    r'\b(univercity|universty|universiy|univesity)\b': 'University',
    r'\b(technolog|techonology|techonlogy)\b': 'Technology',
    r'\b(sciecne|scince|scinece|scienc)\b': 'Science',
    r'\b(managment|managemnt|mangement)\b': 'Management',
    r'\b(statistcs|statstics|statitics)\b': 'Statistics',
    r'\b(mathematcs|mathamatics|mathmatics)\b': 'Mathematics',
    r'\b(econimics|economocs|econmics)\b': 'Economics',
    r'\b(accounting|accountng|accouting|acounting)\b': 'Accounting',
    r'\b(buisness|busines|busniess|bussiness)\b': 'Business',
    r'\b(operatng|opertaing|operting)\s*systems?\b': 'Operating Systems',
    r'\b(computer|computr|compuer|comptuer)\s*(scince|sciene|science|scinence)\b': 'Computer Science',
    r'\b(netwrk|netowrk|netwrok)s?\b': 'Networks',
    r'\b(database|databse|databs|databaes)\s*(managment|management|managemnt|mangement)?\s*(system|sytem|sysstem)?s?\b': 'Database Management Systems',
    r'\b(artifcial|inteligence|intelligance)\b': 'Artificial Intelligence',
    r'\b(programing|programmming)\b': 'Programming',
    r'\b(structurs|strucutres|strutures)\b': 'Structures',
    r'\b(object|objcet)\s*(oriened|orented|oriented)\s*(programing|programming)\b': 'Object Oriented Programming',
    r'\b(income|inccome)\s*(tax|tx)\b': 'Income Tax',
    r'\b(corporate|corprate)\s*(accounting|accountng)\b': 'Corporate Accounting',
    r'\b(advanced|advnced)\s*(accounting|accountng)\b': 'Advanced Accounting',
    r'\b(cost|csot)\s*(accounting|accountng)\b': 'Cost Accounting',
    r'\b(business|buisness|busines)\s*(statistics|statistcs)\b': 'Business Statistics',
    r'\b(human|humn)\s*(resource|resourse)\s*(management|managemnt)\b': 'Human Resource Management',
    r'\b(financial|finacial)\s*(accounting|accountng)\b': 'Financial Accounting',
    r'\b(marketing|maketing)\b': 'Marketing',
    r'\b(economics|econimics)\b': 'Economics',
    r'\b(botany|botnay)\b': 'Botany',
    r'\b(zoology|zoolgy)\b': 'Zoology',
    r'\b(chemistry|chemsitry|chemistrty)\b': 'Chemistry',
    r'\b(physics|phyiscs|physcs)\b': 'Physics',
    r'\b(life|lfe)\s*(science|scince)\b': 'Life Science',
}


def normalize_title(title: str) -> str:
    """Normalize a paper title with spelling corrections and title casing."""
    if not title:
        return title

    normalized = title.strip()

    # Apply regex corrections
    for pattern, replacement in TITLE_CORRECTIONS.items():
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    # Title case normalization
    small_words = {'of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'is', 'by'}
    words = normalized.split()
    normalized_words = []
    for i, word in enumerate(words):
        if i == 0 or word.lower() not in small_words:
            normalized_words.append(word[0].upper() + word[1:] if word else word)
        else:
            normalized_words.append(word.lower())
    normalized = ' '.join(normalized_words)

    # Clean up multiple spaces and trim
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    # Ensure space between words that might have been merged
    normalized = re.sub(r'([a-z])([A-Z])', r'\1 \2', normalized)
    # Clean up again after word boundary fix
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    return normalized


# ─── Main Normalization ───────────────────────────────────────────────────────

def normalize_metadata(metadata: Dict) -> Tuple[Dict, List[Dict]]:
    """Normalize and validate paper metadata.

    Returns:
        Tuple of (normalized_metadata, corrections_made)
        corrections_made is a list of dicts with field, original, corrected, confidence
    """
    corrections = []

    # Normalize Subject
    if metadata.get('subject'):
        match = find_best_match(metadata['subject'], CANONICAL_SUBJECTS, threshold=0.55)
        if match and match.lower() != metadata['subject'].strip().lower():
            corrections.append({
                'field': 'subject',
                'original': metadata['subject'],
                'corrected': match,
                'confidence': similarity(metadata['subject'], match),
            })
            metadata['subject'] = match

    # Normalize Stream
    if metadata.get('stream'):
        stream_input = metadata['stream'].strip().lower()
        for canonical_key, aliases in CANONICAL_STREAMS.items():
            if stream_input in [a.lower() for a in aliases] or stream_input == canonical_key:
                if metadata['stream'] != canonical_key:
                    corrections.append({
                        'field': 'stream',
                        'original': metadata['stream'],
                        'corrected': canonical_key,
                        'confidence': 1.0,
                    })
                    metadata['stream'] = canonical_key
                break
        else:
            # Fuzzy match against all aliases
            all_aliases = []
            for key, aliases in CANONICAL_STREAMS.items():
                for a in aliases:
                    all_aliases.append((a, key))
            match = find_best_match(metadata['stream'], [a for a, _ in all_aliases], threshold=0.55)
            if match:
                canonical_key = next(key for a, key in all_aliases if a.lower() == match.lower())
                if metadata['stream'] != canonical_key:
                    corrections.append({
                        'field': 'stream',
                        'original': metadata['stream'],
                        'corrected': canonical_key,
                        'confidence': similarity(metadata['stream'], match),
                    })
                    metadata['stream'] = canonical_key

    # Normalize Semester
    if metadata.get('semester'):
        sem_input = metadata['semester'].strip().lower()
        for canonical_id, aliases in CANONICAL_SEMESTERS.items():
            if sem_input in [a.lower() for a in aliases] or sem_input == canonical_id:
                if metadata['semester'] != canonical_id:
                    corrections.append({
                        'field': 'semester',
                        'original': metadata['semester'],
                        'corrected': canonical_id,
                        'confidence': 1.0,
                    })
                    metadata['semester'] = canonical_id
                break
        else:
            all_sem_aliases = []
            for key, aliases in CANONICAL_SEMESTERS.items():
                for a in aliases:
                    all_sem_aliases.append((a, key))
            match = find_best_match(metadata['semester'], [a for a, _ in all_sem_aliases], threshold=0.55)
            if match:
                canonical_id = next(key for a, key in all_sem_aliases if a.lower() == match.lower())
                if metadata['semester'] != canonical_id:
                    corrections.append({
                        'field': 'semester',
                        'original': metadata['semester'],
                        'corrected': canonical_id,
                        'confidence': similarity(metadata['semester'], match),
                    })
                    metadata['semester'] = canonical_id

    # Normalize Title
    if metadata.get('title'):
        normalized_title = normalize_title(metadata['title'])
        if normalized_title != metadata['title']:
            corrections.append({
                'field': 'title',
                'original': metadata['title'],
                'corrected': normalized_title,
                'confidence': 0.85,
            })
            metadata['title'] = normalized_title

    # Normalize University
    if metadata.get('university'):
        match = find_best_match(metadata['university'], CANONICAL_UNIVERSITIES, threshold=0.6)
        if match and match.lower() != metadata['university'].strip().lower():
            corrections.append({
                'field': 'university',
                'original': metadata['university'],
                'corrected': match,
                'confidence': similarity(metadata['university'], match),
            })
            metadata['university'] = match

    # Validate Year
    if metadata.get('year'):
        try:
            year = int(metadata['year'])
            import datetime
            current_year = datetime.datetime.now().year
            if year < 2000 or year > current_year + 1:
                corrected_year = min(current_year, max(2000, year))
                corrections.append({
                    'field': 'year',
                    'original': str(metadata['year']),
                    'corrected': str(corrected_year),
                    'confidence': 0.5,
                })
                metadata['year'] = corrected_year
        except (ValueError, TypeError):
            pass

    return metadata, corrections
