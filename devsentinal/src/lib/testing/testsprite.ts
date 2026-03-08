import type { GeneratedTestFile, Requirement, Finding } from '@/types';
import type { TestSpriteRequest, TestSpriteResponse } from './types';

export async function generateTestFiles(context: {
  framework: string;
  language: string;
  routes: { path: string; method: string }[];
  models: { name: string; fields: string[] }[];
  requirements: Requirement[];
  failingFindings: Finding[];
  fileTree: string[];
}): Promise<GeneratedTestFile[]> {
  const apiKey = process.env.TESTSPRITE_API_KEY;
  if (!apiKey) {
    throw new Error('TESTSPRITE_API_KEY not configured');
  }

  const requestBody: TestSpriteRequest = {
    framework: context.framework,
    language: context.language,
    routes: context.routes,
    models: context.models,
    requirements: context.requirements.map((r) => ({
      id: r.id,
      feature_name: r.feature_name,
      description: r.description,
    })),
    failing_findings: context.failingFindings
      .filter((f) => f.status === 'fail')
      .map((f) => ({
        feature_name: f.feature_name,
        explanation: f.explanation ?? '',
        file_path: f.file_path,
      })),
    file_tree: context.fileTree,
  };

  const res = await fetch('https://api.testsprite.com/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`TestSprite API error: ${res.status} ${res.statusText}${errorBody ? ` — ${errorBody}` : ''}`);
  }

  const data: TestSpriteResponse = await res.json();

  return data.test_files.map((tf) => ({
    id: '',
    project_id: '',
    run_id: '',
    file_path: tf.file_path,
    content: tf.content,
    test_count: tf.test_count,
    test_types: tf.test_types,
    framework: tf.framework,
    created_at: '',
  }));
}
