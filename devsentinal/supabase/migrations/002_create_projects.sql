CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  tech_stack TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'analyzing', 'analyzed', 'fixing', 'error')),
  health_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own projects" ON projects
  FOR ALL USING (user_id = auth.uid());
