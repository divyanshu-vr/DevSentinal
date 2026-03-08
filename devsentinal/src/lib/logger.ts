import { createServerClient } from '@/lib/supabase/server';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PipelineLogger {
  setStep(step: string): void;
  debug(message: string, subStep?: string, metadata?: Record<string, unknown>): void;
  info(message: string, subStep?: string, metadata?: Record<string, unknown>): void;
  warn(message: string, subStep?: string, metadata?: Record<string, unknown>): void;
  error(message: string, subStep?: string, metadata?: Record<string, unknown>): void;
  timed<T>(message: string, subStep: string, fn: () => Promise<T>): Promise<T>;
}

export function createPipelineLogger(opts: {
  runId: string;
  pipelineType: 'analysis' | 'fix' | 'auto_fix';
}): PipelineLogger {
  const { runId, pipelineType } = opts;
  let currentStep = '';
  const supabase = createServerClient(); // Cache client — reuse across all log calls

  console.log(`[PipelineLogger] Created for run=${runId} type=${pipelineType}`);

  function log(level: LogLevel, message: string, subStep?: string, metadata?: Record<string, unknown>) {
    const tag = `[PIPELINE:${currentStep}${subStep ? `:${subStep}` : ''}]`;
    const ts = new Date().toISOString();
    const line = `${ts} ${tag} ${message}`;

    switch (level) {
      case 'debug': console.debug(line); break;
      case 'info': console.log(line); break;
      case 'warn': console.warn(line); break;
      case 'error': console.error(line); break;
    }

    // Fire-and-forget DB write — never block the pipeline
    Promise.resolve(
      supabase
        .from('pipeline_logs')
        .insert({
          run_id: runId,
          pipeline_type: pipelineType,
          step: currentStep,
          sub_step: subStep ?? null,
          message,
          level,
          metadata: metadata ?? {},
        })
    )
      .then(({ error }) => {
        if (error) console.error(`[PipelineLogger] DB write failed for run ${runId}:`, error.message);
      })
      .catch((err: unknown) => {
        console.error(`[PipelineLogger] DB write exception for run ${runId}:`, err);
      });
  }

  return {
    setStep(step: string) {
      currentStep = step;
    },
    debug(message, subStep?, metadata?) {
      log('debug', message, subStep, metadata);
    },
    info(message, subStep?, metadata?) {
      log('info', message, subStep, metadata);
    },
    warn(message, subStep?, metadata?) {
      log('warn', message, subStep, metadata);
    },
    error(message, subStep?, metadata?) {
      log('error', message, subStep, metadata);
    },
    async timed<T>(message: string, subStep: string, fn: () => Promise<T>): Promise<T> {
      log('info', `${message}...`, subStep);
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        log('info', `${message} completed`, subStep, { duration_ms: duration });
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        log('error', `${message} failed: ${err instanceof Error ? err.message : String(err)}`, subStep, { duration_ms: duration });
        throw err;
      }
    },
  };
}
