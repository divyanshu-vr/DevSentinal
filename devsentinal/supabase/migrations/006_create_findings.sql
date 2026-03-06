CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
  feature_name TEXT NOT NULL,
  test_description TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('happy_path', 'error_case', 'auth_guard', 'validation', 'edge_case')),
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  code_snippet TEXT,
  explanation TEXT,
  fix_confidence REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project findings" ON findings
  FOR ALL USING (
    run_id IN (
      SELECT ar.id FROM analysis_runs ar
      JOIN projects p ON ar.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );
