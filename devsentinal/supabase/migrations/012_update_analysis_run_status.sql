-- Drop existing check constraint and add new v2 status values
ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_status_check;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_status_check
  CHECK (status IN (
    'pending', 'parsing_prd', 'understanding_code',
    'building_graph', 'scanning_security', 'scanning_quality',
    'generating_tests', 'running_tests', 'generating_test_files',
    'complete', 'error'
  ));

-- Add pipeline_options column
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS pipeline_options JSONB DEFAULT '{}';
