export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AgentPlanStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export type AgentInputSource = {
  directories: string[];
  urls: string[];
};

export type AgentRunRequest = {
  task: string;
  directories: string[];
  urls: string[];
  model?: string;
};

export type AgentPlanStep = {
  id: string;
  title: string;
  detail: string;
  status: AgentPlanStepStatus;
};

export type CollectedResourceKind = 'local_file' | 'web_page';

export type CollectedResource = {
  id: string;
  kind: CollectedResourceKind;
  title: string;
  source: string;
  content: string;
  snippet: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ResourceSummary = {
  resourceId: string;
  title: string;
  source: string;
  kind: CollectedResourceKind;
  category: string;
  tags: string[];
  summary: string;
  relevance: string;
};

export type AgentMemory = {
  keyInsights: string[];
  clusters: Array<{
    name: string;
    takeaway: string;
    sourceIds: string[];
  }>;
};

export type AgentArtifact = {
  name: string;
  path: string;
  size: number;
  kind: 'markdown' | 'json';
};

export type AgentRunResult = {
  runId: string;
  task: string;
  status: AgentRunStatus;
  model: string;
  input: AgentInputSource;
  plan: AgentPlanStep[];
  resources: ResourceSummary[];
  memory: AgentMemory;
  finalAnswer: string;
  artifacts: AgentArtifact[];
  startedAt: string;
  completedAt: string;
};

export type AgentRunEvent =
  | {
      type: 'run_started';
      runId: string;
      payload: {
        task: string;
        model: string;
        input: AgentInputSource;
      };
    }
  | {
      type: 'plan_ready';
      runId: string;
      payload: {
        plan: AgentPlanStep[];
      };
    }
  | {
      type: 'step_started';
      runId: string;
      payload: {
        stepId: string;
        title: string;
        detail: string;
      };
    }
  | {
      type: 'resource_collected';
      runId: string;
      payload: {
        resource: Omit<CollectedResource, 'content'>;
      };
    }
  | {
      type: 'resource_summarized';
      runId: string;
      payload: ResourceSummary;
    }
  | {
      type: 'memory_updated';
      runId: string;
      payload: AgentMemory;
    }
  | {
      type: 'file_written';
      runId: string;
      payload: AgentArtifact;
    }
  | {
      type: 'run_completed';
      runId: string;
      payload: AgentRunResult;
    }
  | {
      type: 'run_failed';
      runId: string;
      payload: {
        message: string;
      };
    };
