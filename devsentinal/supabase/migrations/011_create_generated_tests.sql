CREATE TABLE generated_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  test_count INTEGER DEFAULT 0,
  test_types TEXT[],
  framework TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE generated_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project generated tests" ON generated_tests
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
