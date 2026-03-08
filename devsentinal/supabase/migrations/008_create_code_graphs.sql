CREATE TABLE code_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  graph_data JSONB NOT NULL,
  summary JSONB,
  node_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE code_graphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project graphs" ON code_graphs
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
