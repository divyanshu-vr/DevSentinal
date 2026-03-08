-- Safety migration: ensure pipeline_options exists (in case 012 ran without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_runs' AND column_name = 'pipeline_options'
  ) THEN
    ALTER TABLE analysis_runs ADD COLUMN pipeline_options JSONB DEFAULT '{}';
  END IF;
END $$;
