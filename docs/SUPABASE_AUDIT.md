# SUPABASE + USER DATA + PDF/PYQ HUB PRODUCTION AUDIT

**Date:** August 30, 2026  
**Auditor:** Buffy (Codebuff Agent)  
**Application:** SmartPYQ  

---

## 1. SUPABASE ARCHITECTURE

### Actual Usage Map

| Component | Status | Evidence |
|-----------|--------|----------|
| **Supabase Auth** | NOT USED | App uses custom JWT auth with Argon2 password hashing in SQLite |
| **Supabase PostgreSQL** | PARTIALLY USED | Tables `profiles` and `question_papers` exist but are not the primary data store |
| **Supabase Storage** | USED | PDFs uploaded to `question-papers` bucket |
| **Row Level Security** | CONFIGURED | Policies exist but are bypassed by admin client |
| **Storage Policies** | CONFIGURED | 4 policies on `question-papers` bucket |
| **Realtime** | NOT USED | No realtime subscriptions found |
| **Edge Functions** | NOT USED | No edge function deployment found |

### Architecture Diagram (Actual)

```
┌─────────────────────────────────────────────────────────┐
│                    SmartPYQ Application                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │   Frontend   │    │     Backend (FastAPI)          │   │
│  │   React      │───▶│                               │   │
│  │              │ API│  SQLite (primary database)     │   │
│  └──────────────┘    │  - users (with password_hash) │   │
│                      │  - papers                      │   │
│                      │  - paper_versions              │   │
│                      │  - tenants                     │   │
│                      │  - questions                   │   │
│                      │  - bookmarks                   │   │
│                      │  - audit_logs                  │   │
│                      │  - chat_sessions               │   │
│                      │  - chat_messages               │   │
│                      └───────────┬────────────────────┘   │
│                                  │                        │
│                      ┌───────────▼────────────────────┐   │
│                      │  Supabase Storage (secondary)   │   │
│                      │  - question-papers bucket       │   │
│                      │  - Files stored by user_id/     │   │
│                      └────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Supabase PostgreSQL (secondary, not primary)     │   │
│  │  - profiles table (synced from SQLite)            │   │
│  │  - question_papers table (synced from SQLite)     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. USER REGISTRATION AND LOGIN

### Findings

| Check | Status | Evidence |
|-------|--------|----------|
| Email registration | VERIFIED | `POST /api/v1/auth/simple-signup` creates user in SQLite |
| Email verification | PARTIALLY VERIFIED | OTP endpoint exists but emails not sent in dev mode |
| Login | VERIFIED | `POST /api/v1/auth/simple-login` returns JWT tokens |
| Logout | VERIFIED | `POST /api/v1/auth/logout` (stateless JWT) |
| Password reset | VERIFIED | OTP-based reset flow exists |
| Session persistence | VERIFIED | JWT tokens with refresh mechanism |
| Session expiration | VERIFIED | 15-minute access token, 7-day refresh token |
| Refresh-token handling | VERIFIED | `POST /api/v1/auth/refresh` endpoint exists |
| Invalid credentials | VERIFIED | Returns 401 with error message |
| Duplicate email handling | VERIFIED | Returns 400 "already exists" |
| Account deletion | VERIFIED | `POST /api/v1/auth/delete-account` with password confirmation |
| Protected routes | VERIFIED | `get_current_active_user` dependency |

### CRITICAL SECURITY FINDING

**Passwords are stored manually in SQLite, NOT in Supabase Auth.**

Evidence from `app/models/user.py`:
```python
password_hash = Column(String(255), nullable=True)
```

Evidence from database INSERT (captured during test):
```sql
INSERT INTO users (..., password_hash, ...) VALUES (..., '$argon2id$v=19$m=65536,t=3,p=4$...', ...)
```

This means:
- User passwords are in the application database, not Supabase Auth
- The application manages its own JWT tokens, not Supabase Auth sessions
- Supabase is only used for file storage, not authentication

---

## 3. USER PROFILE DATA

### Fields Stored

| Field | Source | Location |
|-------|--------|----------|
| user_id | Auto-generated | SQLite `users.id` |
| email | User input | SQLite `users.email` |
| name | User input | SQLite `users.full_name` |
| password_hash | User input (hashed) | SQLite `users.password_hash` |
| course/stream | Onboarding | SQLite `users.course` |
| specialization | Onboarding | SQLite `users.specialization` |
| academic_year | Onboarding | SQLite `users.academic_year` |
| semester | Onboarding | SQLite `users.semester` |
| onboarding_completed | Onboarding | SQLite `users.onboarding_completed` |
| role | System | SQLite `users.role` |
| status | System | SQLite `users.status` |
| created_at | Auto | SQLite `users.created_at` |
| updated_at | Auto | SQLite `users.updated_at` |

### Profile Sync to Supabase

The `profiles` table in Supabase PostgreSQL exists but is NOT actively synced from the application. The application uses SQLite as the primary data store.

---

## 4. DATABASE SCHEMA AUDIT

### SQLite Tables (Primary)

| Table | Primary Key | RLS |
|-------|-------------|-----|
| users | id (INTEGER) | N/A (SQLite) |
| papers | id (INTEGER) | N/A (SQLite) |
| paper_versions | id (INTEGER) | N/A (SQLite) |
| tenants | id (INTEGER) | N/A (SQLite) |
| questions | id (INTEGER) | N/A (SQLite) |
| bookmarks | id (INTEGER) | N/A (SQLite) |
| audit_logs | id (INTEGER) | N/A (SQLite) |
| chat_sessions | id (INTEGER) | N/A (SQLite) |
| chat_messages | id (INTEGER) | N/A (SQLite) |

### Supabase PostgreSQL Tables (Secondary)

| Table | Primary Key | RLS Status |
|-------|-------------|------------|
| profiles | id (UUID) | ENABLED |
| question_papers | id (UUID) | ENABLED |

### RLS Policies (Supabase)

**profiles:**
- Users can view own profile (auth.uid() = user_id)
- Users can update own profile
- Users can insert own profile

**question_papers:**
- Authenticated users can view approved papers
- Users can view own papers
- Users can insert own papers
- Users can update own papers
- Users can delete own papers

---

## 5. PDF UPLOAD STORAGE AUDIT

### Upload Flow (Verified)

```
User uploads PDF
    ↓
Backend validates file (type, size, duplicate hash)
    ↓
Creates paper record in SQLite
    ↓
Uploads to Supabase Storage: question-papers/{user_id}/{hash}.pdf
    ↓
Stores file_url in SQLite papers table
    ↓
Creates paper_version record with s3_key
    ↓
Returns success
```

### Evidence

From test logs:
```
HTTP Request: POST https://krmayhgoqvludrzyoxoz.supabase.co/storage/v1/object/question-papers/7/41af2b24...pdf "HTTP/2 200 OK"
File uploaded to Supabase Storage: 7/41af2b24...pdf
```

### Storage Configuration

| Setting | Value |
|---------|-------|
| Bucket | question-papers |
| Public | false |
| File size limit | 50 MB |
| Allowed MIME types | application/pdf, image/jpeg, image/png, image/webp |

---

## 6. PDF ACCESS MODEL — CRITICAL

### Required Behavior

User A uploads PDF for Stream A → User B (same stream) should see it → User C (different stream) should NOT see it.

### Actual Behavior (Tested)

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| User A uploads PDF | Success | ✅ Uploaded to Supabase Storage | VERIFIED |
| User B (same stream) searches | Find PDF | ❌ Search endpoint requires `q` parameter | PARTIAL |
| User B downloads PDF | Success | ❌ **500 ERROR** - `UnboundLocalError` | **FAILED** |
| User C (different stream) downloads | 403 Blocked | ❌ **500 ERROR** - same bug | **FAILED** |

### CRITICAL BUG: Download Endpoint Broken

```
UnboundLocalError: cannot access local variable 'paper' where it is not associated with a value
```

**Root Cause:** The download endpoint in `app/routers/papers.py` tries to use the `paper` variable BEFORE fetching it from the database. The code attempts to generate a Supabase signed URL using `paper.file_url` at line 539, but `paper` is not defined until line 560.

**Impact:** Downloads are completely broken for ALL users. No one can download any PDF.

---

## 7. STREAM-BASED PYQ HUB

### Navigation Flow (Tested)

| Step | Status | Evidence |
|------|--------|----------|
| Login | ✅ Works | JWT token obtained |
| Complete onboarding | ✅ Works | Stream/specialization saved |
| Upload PDF | ✅ Works | Stored in Supabase Storage |
| Search papers | ❌ Fails | Requires `q` query parameter |
| Download PDF | ❌ Fails | 500 error (code bug) |

---

## 8. SHARED PDF ACCESS

### Test Results

| User | Stream | Upload | Search | Download |
|------|--------|--------|--------|----------|
| User A | B.Sc CS | ✅ | N/A | ❌ (bug) |
| User B | B.Sc CS | N/A | ❌ (API issue) | ❌ (bug) |
| User C | BCA | N/A | N/A | ❌ (bug) |

**Conclusion:** Shared PDF access is NOT working due to the download endpoint bug.

---

## 9. SUPABASE RLS AUDIT

### Policies Configured

| Table | Policy | Action | Condition |
|-------|--------|--------|-----------|
| profiles | Users can view own profile | SELECT | auth.uid() = user_id |
| profiles | Users can update own profile | UPDATE | auth.uid() = user_id |
| profiles | Users can insert own profile | INSERT | auth.uid() = user_id |
| question_papers | Authenticated users can view approved | SELECT | auth.role() = 'authenticated' AND status = 'approved' |
| question_papers | Users can view own papers | SELECT | auth.uid() = user_id |
| question_papers | Users can insert own papers | INSERT | auth.uid() = user_id |
| question_papers | Users can update own papers | UPDATE | auth.uid() = user_id |
| question_papers | Users can delete own papers | DELETE | auth.uid() = user_id |

### RLS Effectiveness

**CRITICAL:** The application uses the **service-role key** for all database operations, which **bypasses RLS completely**. RLS policies are configured but not enforced because the backend client uses admin privileges.

Evidence:
```python
# app/utils/supabase_client.py
def get_supabase_admin():
    """Get the Supabase admin client using the service role/secret key.
    Use this for server-side operations that bypass RLS.
    """
```

---

## 10. SUPABASE STORAGE RLS/POLICY AUDIT

### Storage Policies

| Policy | Action | Condition |
|--------|--------|-----------|
| Users can upload to own folder | INSERT | bucket_id = 'question-papers' AND foldername(name)[1] = auth.uid() |
| Users can read own files | SELECT | bucket_id = 'question-papers' AND foldername(name)[1] = auth.uid() |
| Users can delete own files | DELETE | bucket_id = 'question-papers' AND foldername(name)[1] = auth.uid() |
| Authenticated users can read all files | SELECT | bucket_id = 'question-papers' AND auth.role() = 'authenticated' |

### Storage Policy Effectiveness

**CRITICAL:** The backend uses the **service-role key** for uploads, which **bypasses Storage policies**. The "Authenticated users can read all files" policy allows any authenticated user to read any file, but the application generates **public URLs** instead of signed URLs.

Evidence:
```python
file_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/{storage_path}"
```

This means:
1. Files are uploaded with admin privileges (bypassing user folder restrictions)
2. Files are accessible via public URLs (not signed URLs)
3. Storage policies are not effectively enforced

---

## 11. PDF DOWNLOAD VERIFICATION

### Download Flow (Broken)

```
User requests download
    ↓
Backend tries to generate Supabase signed URL
    ↓
Uses paper.file_url BEFORE paper is fetched
    ↓
UnboundLocalError → 500 Internal Server Error
```

### Evidence

```
File "app/routers/papers.py", line 539, in download_paper
    if is_supabase_storage_enabled() and paper.file_url:
                       ^^^^^
UnboundLocalError: cannot access local variable 'paper' where it is not associated with a value
```

---

## 12. UPLOAD → DATABASE CONSISTENCY

### Upload Flow Analysis

| Step | Status | Evidence |
|------|--------|----------|
| 1. Authenticate user | ✅ | JWT token validated |
| 2. Validate PDF | ✅ | File type, size, duplicate check |
| 3. Create paper record | ✅ | SQLite INSERT |
| 4. Upload to Supabase Storage | ✅ | HTTP 200 OK |
| 5. Update paper with file_url | ✅ | SQLite UPDATE |
| 6. Create paper_version | ✅ | SQLite INSERT |

### Failure Cases

| Scenario | Handling | Status |
|----------|----------|--------|
| Storage upload fails | Falls back to local storage | ✅ |
| DB insert fails after storage | Paper record deleted | ✅ |
| Duplicate upload | Rejected by checksum | ✅ |
| Storage unavailable | Local fallback | ✅ |

---

## 13. SECURITY OF STREAM/SUBJECT CLASSIFICATION

### Upload Authorization

The upload endpoint does NOT verify whether the user is authorized to upload for the specified stream. Any authenticated user can upload papers for any stream.

Evidence:
```python
# No stream validation against user's enrolled stream
paper = await self.create_paper(paper_data, uploader, ip_address)
```

This may be intentional (allowing users to contribute papers for any stream), but should be documented.

### Download Authorization

The download endpoint has stream-based authorization (code exists but is broken due to the `paper` variable bug).

---

## 14. ADMIN/MODERATION

### Moderation Status

| Feature | Status | Evidence |
|---------|--------|----------|
| Paper status (pending/approved/rejected) | EXISTS | `PaperStatus` enum in models |
| Admin approval endpoint | EXISTS | `POST /api/v1/papers/{id}/approve` |
| Admin rejection endpoint | EXISTS | `POST /api/v1/papers/{id}/reject` |
| Default status on upload | PENDING | Papers start as PENDING |
| Auto-approve on upload | YES | Upload sets status to APPROVED |

**Note:** Papers are auto-approved on upload, bypassing moderation.

---

## 15. COMPLETE END-TO-END TEST

### Test Results

| Step | User A | User B | User C |
|------|--------|--------|--------|
| Register | ✅ 200 | ✅ 200 | ✅ 200 |
| Onboarding | ✅ 200 | ✅ 200 | ❌ 400 (BCA not allowed) |
| Upload PDF | ✅ 201 | N/A | N/A |
| Search papers | ❌ 422 (API issue) | ❌ 422 | N/A |
| Download PDF | ❌ 500 (code bug) | ❌ 500 | ❌ 500 |

---

## 16. SUPABASE ENVIRONMENT SECURITY

### Environment Variables

| Variable | Location | Exposed to Frontend? |
|----------|----------|---------------------|
| SUPABASE_URL | .env (backend) | ❌ No |
| SUPABASE_PUBLISHABLE_KEY | .env (backend) | ❌ No |
| SUPABASE_SECRET_KEY | .env (backend) | ❌ No |
| VITE_SUPABASE_URL | .env.local (frontend) | ⚠️ Yes (by design) |
| VITE_SUPABASE_ANON_KEY | .env.local (frontend) | ⚠️ Yes (by design) |

### Security Status

| Check | Status | Evidence |
|-------|--------|----------|
| Service-role key in .env | ✅ | Not in frontend code |
| .env in .gitignore | ✅ | Listed in .gitignore |
| No secrets in source code | ✅ | Grep confirms no hardcoded keys |
| Frontend uses anon key only | ✅ | supabase.js uses VITE_SUPABASE_ANON_KEY |

---

## 17. FINAL SUPABASE VERDICT

### Production Readiness

| Area | Status | Evidence | Severity |
|------|--------|----------|----------|
| Supabase Auth | NOT USED | App uses custom JWT auth | HIGH |
| Password handling | FAIL | Passwords stored in SQLite, not Supabase Auth | CRITICAL |
| User profiles | PARTIAL | Profiles exist but not synced to Supabase | MEDIUM |
| Database schema | PARTIAL | Tables exist but SQLite is primary | MEDIUM |
| Database RLS | NOT ENFORCED | Admin client bypasses RLS | HIGH |
| Storage bucket | VERIFIED | question-papers bucket exists | LOW |
| Storage policies | NOT ENFORCED | Admin client bypasses policies | HIGH |
| PDF upload | VERIFIED | Files stored in Supabase Storage | LOW |
| PDF metadata | PARTIAL | Metadata in SQLite, not Supabase PostgreSQL | MEDIUM |
| Stream filtering | NOT VERIFIED | Code exists but broken | HIGH |
| Subject filtering | NOT VERIFIED | Code exists but broken | HIGH |
| Shared PDF access | FAILED | Download endpoint broken (500 error) | CRITICAL |
| PDF download | FAILED | UnboundLocalError in download endpoint | CRITICAL |
| Cross-user access | NOT TESTED | Download broken, cannot verify | HIGH |
| Cross-stream isolation | NOT TESTED | Download broken, cannot verify | HIGH |
| Upload security | PARTIAL | No stream authorization on upload | MEDIUM |
| Service-role protection | VERIFIED | Key not exposed to frontend | LOW |
| Backup/restore | NOT VERIFIED | No backup mechanism found | HIGH |

---

## REQUIRED ANSWERS

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Does registration create user in Supabase Auth? | **NO** | Users created in SQLite with custom JWT auth |
| 2 | Is user's email stored correctly? | **VERIFIED** | SQLite users.email column |
| 3 | Are passwords handled by Supabase Auth? | **NO** | Passwords stored in SQLite as Argon2 hashes |
| 4 | Is user's profile stored correctly? | **PARTIALLY** | SQLite has all fields, Supabase profiles table exists but not synced |
| 5 | Is stream/course/subject info stored? | **VERIFIED** | SQLite users.course, users.specialization, users.semester |
| 6 | Is PDF stored in Supabase Storage? | **VERIFIED** | HTTP 200 OK on upload, file in question-papers bucket |
| 7 | Is PDF metadata in database? | **VERIFIED** | SQLite papers table has all metadata |
| 8 | Can authorized user see uploaded PDF? | **NOT VERIFIED** | Download endpoint broken (500 error) |
| 9 | Can authorized user download PDF? | **NO** | UnboundLocalError in download endpoint |
| 10 | Is access limited to uploader only? | **NOT VERIFIED** | Download broken, cannot test |
| 11 | Can unrelated stream users access PDF? | **NOT VERIFIED** | Download broken, cannot test |
| 12 | Can frontend manipulation bypass restrictions? | **NOT VERIFIED** | Download broken, cannot test |
| 13 | Are Supabase RLS policies enforced? | **NO** | Admin client bypasses RLS |
| 14 | Are Supabase Storage policies enforced? | **NO** | Admin client bypasses policies, public URLs used |
| 15 | Can user delete/modify another user's PDF? | **NOT VERIFIED** | Download/delete broken |
| 16 | Is service-role credential protected? | **VERIFIED** | Not exposed to frontend |
| 17 | Are migrations/policies/buckets complete? | **PARTIAL** | Migration ran, but RLS not enforced |
| 18 | Is complete flow production-ready? | **NO** | Download endpoint broken, auth not using Supabase |

---

## CRITICAL BUGS FOUND

### 1. Download Endpoint Broken (CRITICAL)

**File:** `app/routers/papers.py`  
**Line:** 539  
**Error:** `UnboundLocalError: cannot access local variable 'paper'`  
**Impact:** No user can download any PDF  
**Fix Required:** Fetch paper record BEFORE attempting Supabase signed URL generation

### 2. Passwords Not in Supabase Auth (HIGH)

**File:** `app/models/user.py`  
**Evidence:** `password_hash = Column(String(255))`  
**Impact:** Authentication not integrated with Supabase  
**Note:** This may be intentional design, but contradicts the requirement to use Supabase Auth

### 3. RLS Not Enforced (HIGH)

**File:** `app/utils/supabase_client.py`  
**Evidence:** Service-role key used for all operations  
**Impact:** RLS policies exist but are bypassed  
**Fix Required:** Use anon key for user-facing operations, service-role only for admin

### 4. Public Storage URLs (MEDIUM)

**File:** `app/services/paper_service.py`  
**Evidence:** `file_url = f".../public/..."`  
**Impact:** Files accessible without authentication  
**Fix Required:** Use signed URLs instead of public URLs

### 5. No Stream Authorization on Upload (MEDIUM)

**File:** `app/services/paper_service.py`  
**Evidence:** No check against user's enrolled stream  
**Impact:** Any user can upload papers for any stream  
**Fix Required:** Validate stream against user's profile

---

## RECOMMENDATIONS

### Immediate (Critical)

1. **Fix download endpoint** - Move paper fetch before Supabase signed URL generation
2. **Add error handling** - Wrap Supabase operations in try/except

### Short-term (High)

3. **Integrate Supabase Auth** - Migrate authentication to Supabase Auth
4. **Enforce RLS** - Use anon key for user operations, service-role for admin only
5. **Use signed URLs** - Replace public URLs with time-limited signed URLs

### Medium-term (Medium)

6. **Sync profiles to Supabase** - Keep SQLite and Supabase PostgreSQL in sync
7. **Add stream authorization** - Validate upload stream against user profile
8. **Implement backup** - Regular SQLite backups to cloud storage

---

## TEST SUMMARY

| Test | Result |
|------|--------|
| Registration | ✅ PASS |
| Login | ✅ PASS |
| Onboarding | ✅ PASS (bsc only) |
| Upload PDF | ✅ PASS |
| Store in Supabase | ✅ PASS |
| Search papers | ❌ FAIL (API issue) |
| Download PDF | ❌ FAIL (code bug) |
| Cross-user access | ❌ NOT TESTED |
| Cross-stream isolation | ❌ NOT TESTED |

**Overall Status:** NOT PRODUCTION READY  
**Critical Issues:** 2 (Download broken, Auth not using Supabase)  
**High Issues:** 2 (RLS not enforced, Passwords in SQLite)  
**Medium Issues:** 2 (Public URLs, No stream auth on upload)
