CREATE TABLE security_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
  message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  code_snippet TEXT,
  category TEXT,
  cwe TEXT[],
  owasp TEXT[],
  fix_suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE security_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project security findings" ON security_findings
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
