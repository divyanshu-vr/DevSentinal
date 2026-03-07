// ============================================================
// SSE Endpoint — Fix Job Progress Streaming
// ============================================================

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createSSEStream, sendSSEEvent, closeSSE } from '@/lib/sse/emitter';
import type { FixJob, AgentLogEntry } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;
  const supabase = createServerClient();

  const { stream, controller } = createSSEStream();

  // Set SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Track state
  let lastStatus: FixJob['status'] | null = null;
  let lastLogCount = 0;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Polling function
  const poll = async () => {
    try {
      // Poll fix_jobs table
      const { data: job, error: jobError } = await supabase
        .from('fix_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        sendSSEEvent(controller, {
          type: 'error',
          message: 'Fix job not found',
        });
        cleanup();
        return;
      }

      // Check for status change
      if (lastStatus !== job.status) {
        lastStatus = job.status;
        sendSSEEvent(controller, {
          type: 'status_change',
          status: job.status,
        });
      }

      // Check for new agent log entries
      const agentLog = job.agent_log as AgentLogEntry[] || [];
      if (agentLog.length > lastLogCount) {
        const newEntries = agentLog.slice(lastLogCount);
        for (const entry of newEntries) {
          sendSSEEvent(controller, {
            type: 'agent_log',
            log_entry: entry,
          });
        }
        lastLogCount = agentLog.length;
      }

      // Check if fix job is complete
      if (job.status === 'complete') {
        sendSSEEvent(controller, {
          type: 'complete',
          pr_url: job.pr_url,
        });
        cleanup();
        return;
      }

      // Check if fix job errored
      if (job.status === 'error') {
        sendSSEEvent(controller, {
          type: 'error',
          message: job.error_message || 'Fix job failed',
        });
        cleanup();
        return;
      }
    } catch (error) {
      console.error('Error polling fix job:', error);
      sendSSEEvent(controller, {
        type: 'error',
        message: 'Internal server error',
      });
      cleanup();
    }
  };

  // Cleanup function
  const cleanup = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    closeSSE(controller);
  };

  // Start polling every 1 second
  pollInterval = setInterval(poll, 1000);

  // Initial poll
  poll();

  return new Response(stream, { headers });
}
