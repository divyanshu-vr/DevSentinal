// ============================================================
// SSE (Server-Sent Events) Emitter Utilities
// ============================================================

/**
 * Creates a ReadableStream for SSE and exposes the controller
 * for sending events and closing the stream.
 */
export function createSSEStream(): {
  stream: ReadableStream;
  controller: ReadableStreamDefaultController;
} {
  let controllerRef: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
    },
  });

  return {
    stream,
    controller: controllerRef!,
  };
}

/**
 * Send an SSE event to the client.
 * Formats the data as JSON and encodes it in SSE format:
 * data: {JSON}\n\n
 */
export function sendSSEEvent(
  controller: ReadableStreamDefaultController,
  data: unknown
): void {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const message = `data: ${jsonString}\n\n`;
  const encoded = encoder.encode(message);
  
  try {
    controller.enqueue(encoded);
  } catch (error) {
    console.error('Error sending SSE event:', error);
  }
}

/**
 * Close the SSE stream safely.
 */
export function closeSSE(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch (error) {
    console.error('Error closing SSE stream:', error);
  }
}
