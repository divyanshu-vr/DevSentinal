// ============================================================
// SSE Endpoint — Analysis Progress Streaming
// ============================================================

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createSSEStream, sendSSEEvent, closeSSE } from '@/lib/sse/emitter';
import type { AnalysisRun } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;
  console.log(`[SSE:analysis] Connection opened for run=${runId}`);
  const supabase = createServerClient();

  const { stream, controller } = createSSEStream();

  // Set SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Track state
  let lastStatus: AnalysisRun['status'] | null = null;
  let lastFindingCount = 0;
  let lastLogCreatedAt = '1970-01-01T00:00:00Z';
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Polling function
  const poll = async () => {
    try {
      // Poll analysis_runs table
      const { data: run, error: runError } = await supabase
        .from('analysis_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (runError || !run) {
        sendSSEEvent(controller, {
          type: 'error',
          message: 'Analysis run not found',
        });
        cleanup();
        return;
      }

      // Check for status change
      if (lastStatus !== run.status) {
        console.log(`[SSE:analysis] Status change for run=${runId}: ${lastStatus} -> ${run.status}`);
        lastStatus = run.status;
        sendSSEEvent(controller, {
          type: 'status_change',
          status: run.status,
        });
      }

      // Poll findings table
      const { data: findings, error: findingsError } = await supabase
        .from('findings')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });

      if (!findingsError && findings) {
        // Send new findings
        if (findings.length > lastFindingCount) {
          const newFindings = findings.slice(lastFindingCount);
          for (const finding of newFindings) {
            sendSSEEvent(controller, {
              type: 'finding',
              finding,
            });
          }
          lastFindingCount = findings.length;
        }
      }

      // Poll pipeline_logs for real-time progress (gracefully skip if table doesn't exist)
      try {
        const { data: logs } = await supabase
          .from('pipeline_logs')
          .select('id, step, sub_step, message, level, metadata, created_at')
          .eq('run_id', runId)
          .gt('created_at', lastLogCreatedAt)
          .order('created_at', { ascending: true })
          .limit(50);

        if (logs && logs.length > 0) {
          for (const log of logs) {
            sendSSEEvent(controller, { type: 'log', log });
          }
          lastLogCreatedAt = logs[logs.length - 1].created_at;
        }
      } catch {
        // pipeline_logs table may not exist yet — skip silently
      }

      // Check if analysis is complete
      if (run.status === 'complete') {
        sendSSEEvent(controller, {
          type: 'complete',
          health_score: run.health_score,
        });
        cleanup();
        return;
      }

      // Check if analysis errored
      if (run.status === 'error') {
        sendSSEEvent(controller, {
          type: 'error',
          message: run.error_message || 'Analysis failed',
        });
        cleanup();
        return;
      }
    } catch (error) {
      console.error('Error polling analysis:', error);
      sendSSEEvent(controller, {
        type: 'error',
        message: 'Internal server error',
      });
      cleanup();
    }
  };

  // Cleanup function
  const cleanup = () => {
    console.log(`[SSE:analysis] Connection closing for run=${runId}, last status=${lastStatus}`);
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
