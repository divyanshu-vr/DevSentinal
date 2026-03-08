-- Pipeline logs for real-time progress tracking
CREATE TABLE pipeline_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  pipeline_type TEXT NOT NULL DEFAULT 'analysis'
    CHECK (pipeline_type IN ('analysis', 'fix', 'auto_fix')),
  step TEXT NOT NULL,
  sub_step TEXT,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warn', 'error')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for SSE polling: fetch logs by run_id ordered by time
CREATE INDEX idx_pipeline_logs_run_id_created ON pipeline_logs(run_id, created_at);
