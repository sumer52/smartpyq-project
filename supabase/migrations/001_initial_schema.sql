-- =============================================================================
-- SmartPYQ Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROFILES TABLE
-- Extends Supabase auth.users with academic profile data
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    course TEXT,
    specialization TEXT,
    academic_year TEXT,
    semester TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    bio TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_course ON profiles(course);

-- =============================================================================
-- 2. QUESTION_PAPERS TABLE
-- Stores metadata for uploaded question papers (files live in Storage)
-- =============================================================================
CREATE TABLE IF NOT EXISTS question_papers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File metadata
    title TEXT NOT NULL,
    original_filename TEXT,
    storage_path TEXT NOT NULL,           -- Supabase Storage path: user_id/filename
    file_type TEXT,                        -- MIME type
    file_size INTEGER,                     -- Size in bytes
    checksum TEXT,                         -- SHA-256 hash
    
    -- Academic metadata
    stream TEXT NOT NULL,                  -- e.g., 'B.Sc Computer Science'
    specialization TEXT,                   -- e.g., 'MSCS'
    semester TEXT,                         -- e.g., 'Semester 3'
    subject TEXT,                          -- e.g., 'Data Structures'
    year INTEGER NOT NULL,                 -- Exam year, e.g., 2024
    exam_type TEXT DEFAULT 'final',        -- final, midterm, quiz
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    
    -- Search & analytics
    extracted_text TEXT,                   -- OCR-extracted text for search
    tags JSONB DEFAULT '[]',
    view_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for filtering and search
CREATE INDEX IF NOT EXISTS idx_papers_user_id ON question_papers(user_id);
CREATE INDEX IF NOT EXISTS idx_papers_stream ON question_papers(stream);
CREATE INDEX IF NOT EXISTS idx_papers_specialization ON question_papers(specialization);
CREATE INDEX IF NOT EXISTS idx_papers_semester ON question_papers(semester);
CREATE INDEX IF NOT EXISTS idx_papers_subject ON question_papers(subject);
CREATE INDEX IF NOT EXISTS idx_papers_year ON question_papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_status ON question_papers(status);
CREATE INDEX IF NOT EXISTS idx_papers_created_at ON question_papers(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_papers_search ON question_papers 
    USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(extracted_text, '')));

-- =============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_papers ENABLE ROW LEVEL SECURITY;

-- --- PROFILES POLICIES ---

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can insert their own profile (on signup trigger)
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admins can view all profiles (optional - for admin panel)
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE user_id = auth.uid() AND course = 'admin'
        )
    );

-- --- QUESTION_PAPERS POLICIES ---

-- Anyone authenticated can read approved papers (public library)
CREATE POLICY "Authenticated users can view approved papers"
    ON question_papers FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND status = 'approved'
    );

-- Users can read their own papers (any status)
CREATE POLICY "Users can view own papers"
    ON question_papers FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own papers
CREATE POLICY "Users can insert own papers"
    ON question_papers FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own papers
CREATE POLICY "Users can update own papers"
    ON question_papers FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own papers
CREATE POLICY "Users can delete own papers"
    ON question_papers FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================================================
-- 4. STORAGE BUCKET & POLICIES
-- Run these via Supabase Dashboard > Storage > New Bucket
-- Or run via SQL:
-- =============================================================================

-- Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'question-papers',
    'question-papers',
    false,                              -- Private by default
    52428800,                           -- 50MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies

-- Users can upload to their own folder
CREATE POLICY "Users can upload to own folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'question-papers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own files
CREATE POLICY "Users can read own files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'question-papers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own files
CREATE POLICY "Users can delete own files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'question-papers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Authenticated users can read any file in the bucket (for approved papers)
CREATE POLICY "Authenticated users can read all files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'question-papers'
        AND auth.role() = 'authenticated'
    );

-- =============================================================================
-- 5. UPDATED_AT TRIGGER
-- Auto-update updated_at on row changes
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_papers_updated_at
    BEFORE UPDATE ON question_papers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 6. PROFILE AUTO-CREATION TRIGGER
-- Automatically create a profile row when a user signs up via Supabase Auth
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
    );
    RETURN NEW;
END;
$$ language 'plpgsql' security definer;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
