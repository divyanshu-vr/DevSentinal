CREATE TABLE fix_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID REFERENCES findings(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sandboxing', 'coding', 'linting', 'testing', 'opening_pr', 'complete', 'error')),
  pr_url TEXT,
  pr_number INTEGER,
  branch_name TEXT,
  agent_log JSONB DEFAULT '[]',
  lint_result JSONB,
  test_result JSONB,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE fix_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own fix jobs" ON fix_jobs
  FOR ALL USING (
    finding_id IN (
      SELECT f.id FROM findings f
      JOIN analysis_runs ar ON f.run_id = ar.id
      JOIN projects p ON ar.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );
