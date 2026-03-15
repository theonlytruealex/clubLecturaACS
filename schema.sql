-- Supabase Schema for Book Club Site

-- 1. Create the 'books' table
CREATE TABLE books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_url TEXT,
  meeting_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the 'comments' table
CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For nested replies
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create the 'reactions' table
CREATE TABLE reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('Inimă', 'Dislike', 'Like', 'Surprise')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add simple indexes for performance
CREATE INDEX idx_comments_book_id ON comments(book_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_reactions_comment_id ON reactions(comment_id);

-- Set up Row Level Security (RLS)
-- Allow public "anon" read & insert access for all since it's an open book club
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to books
CREATE POLICY "Public profiles are viewable by everyone." 
ON books FOR SELECT USING (true);

-- Allow public read/insert access to comments
CREATE POLICY "Public read comments." 
ON comments FOR SELECT USING (true);
CREATE POLICY "Public insert comments." 
ON comments FOR INSERT WITH CHECK (true);

-- Allow public read/insert access to reactions
CREATE POLICY "Public read reactions." 
ON reactions FOR SELECT USING (true);
CREATE POLICY "Public insert reactions." 
ON reactions FOR INSERT WITH CHECK (true);

-- Allow public select on anything (as a fallback)
CREATE POLICY "Public select books" ON books FOR SELECT USING (true);
CREATE POLICY "Public select comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Public select reactions" ON reactions FOR SELECT USING (true);


-- Sample Data Insertion (Optional but helpful for development)
INSERT INTO books (title, author, cover_url, meeting_date) VALUES 
('Maestrul și Margareta', 'Mihail Bulgakov', '/covers/maestrul_si_margareta.jpg', '2026-04-04');
