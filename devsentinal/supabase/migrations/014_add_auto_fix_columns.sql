-- Add auto-fix tracking columns to analysis_runs
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS auto_fix_status TEXT DEFAULT NULL;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS auto_fix_pr_url TEXT DEFAULT NULL;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS auto_fix_pr_number INTEGER DEFAULT NULL;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS auto_fix_error TEXT DEFAULT NULL;
