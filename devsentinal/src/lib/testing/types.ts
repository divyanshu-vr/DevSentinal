/** TestSprite API request/response types */

export interface TestSpriteRequest {
  framework: string;
  language: string;
  routes: { path: string; method: string }[];
  models: { name: string; fields: string[] }[];
  requirements: { id: string; feature_name: string; description: string }[];
  failing_findings: { feature_name: string; explanation: string; file_path: string | null }[];
  file_tree: string[];
}

export interface TestSpriteResponse {
  test_files: {
    file_path: string;
    content: string;
    test_count: number;
    test_types: string[];
    framework: string;
  }[];
}
