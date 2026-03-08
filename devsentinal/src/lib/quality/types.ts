/** SonarCloud API response types */

export interface SonarMeasuresResponse {
  component: {
    key: string;
    name: string;
    measures: { metric: string; value: string }[];
  };
}

export interface SonarIssuesResponse {
  total: number;
  issues: {
    key: string;
    rule: string;
    severity: string;
    component: string;
    message: string;
    line?: number;
    effort?: string;
    type: string;
  }[];
}

export interface SonarTaskResponse {
  task: {
    id: string;
    status: string; // 'SUCCESS' | 'FAILED' | 'PENDING' | 'IN_PROGRESS'
  };
}
