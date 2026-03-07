import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { analysisRun } from '@/lib/inngest/analyze';

// Register all Inngest functions here.
// When Person C delivers fix.ts, import fixRun and add it to the functions array.
const functions = [
  analysisRun,
  // TODO: Add Person C's fixRun when available
  // fixRun,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
