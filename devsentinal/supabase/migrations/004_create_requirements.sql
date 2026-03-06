CREATE TABLE requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feature', 'endpoint', 'acceptance_criteria', 'edge_case')),
  feature_name TEXT NOT NULL,
  description TEXT NOT NULL,
  endpoint TEXT,
  http_method TEXT,
  expected_behavior TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project requirements" ON requirements
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
