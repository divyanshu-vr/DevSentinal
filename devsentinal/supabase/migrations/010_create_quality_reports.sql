CREATE TABLE quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  metrics JSONB NOT NULL,
  issues JSONB,
  quality_gate TEXT CHECK (quality_gate IN ('PASS', 'FAIL')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quality_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project quality reports" ON quality_reports
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
