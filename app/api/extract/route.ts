import { streamExtract } from "@/lib/extract";

// Streams newline-delimited JSON events:
//   {"type":"chunk","text":"..."}                       while the model writes
//   {"type":"done","bill":{...},"model":"...","ms":123}  once it finishes
//   {"type":"error","message":"..."}                     if anything fails
export async function POST(request: Request) {
  let image: string | undefined;
  try {
    ({ image } = await request.json());
  } catch {
    return Response.json({ error: "Send JSON with an image field." }, { status: 400 });
  }
  if (!image || typeof image !== "string") {
    return Response.json({ error: "No image in the request." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const stream = streamExtract(image, { signal: request.signal });
        for (;;) {
          const step = await stream.next();
          if (step.done) {
            const { bill, model, ms } = step.value;
            send({ type: "done", bill, model, ms });
            break;
          }
          send({ type: "chunk", text: step.value });
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          send({
            type: "error",
            message: /fetch failed|ECONNREFUSED/.test(message)
              ? "Can't reach Ollama on this laptop. Start it with: ollama serve"
              : message,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
