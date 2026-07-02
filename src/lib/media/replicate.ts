import { backoffDelay, sleep } from "./util";

/**
 * Image rendering via the Replicate predictions API (FLUX-schnell).
 * Parameters mirror the proven HarryPotterFluencyDecks pipeline:
 * 512x512 JPG, 8 inference steps, guidance 0.
 */
const REPLICATE_MODEL_VERSION =
  "50c923670950fcefc82284cac71290f6dd61edca7922aeb1c1746bed0c532f72";
const IMAGE_WIDTH = 512;
const IMAGE_HEIGHT = 512;
const MAX_RETRIES = 4;
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60;

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

export async function renderImage(params: {
  prompt: string;
  apiKey: string;
}): Promise<Buffer> {
  const payload = {
    version: REPLICATE_MODEL_VERSION,
    input: {
      prompt: params.prompt,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      num_inference_steps: 8,
      guidance_scale: 0.0,
      output_format: "jpg",
      output_quality: 85,
    },
  };

  let lastError = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after")) || 0;
      lastError = "Replicate HTTP 429: rate limited";
      await sleep(Math.max(retryAfter * 1000, backoffDelay(attempt)));
      continue;
    }

    if (!response.ok) {
      lastError = `Replicate HTTP ${response.status}: ${await response
        .text()
        .catch(() => "")}`;
      if (response.status >= 500) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new Error(lastError);
    }

    let prediction: ReplicatePrediction = await response.json();

    // Prefer: wait usually returns a terminal state, but poll if it didn't
    let polls = 0;
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled" &&
      polls < MAX_POLLS
    ) {
      await sleep(POLL_INTERVAL_MS);
      polls++;
      const pollUrl =
        prediction.urls?.get ||
        `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const pollResponse = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${params.apiKey}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!pollResponse.ok) {
        throw new Error(`Replicate poll failed: HTTP ${pollResponse.status}`);
      }
      prediction = await pollResponse.json();
    }

    if (
      prediction.status === "starting" ||
      prediction.status === "processing"
    ) {
      // Poll budget exhausted but the prediction is still running — do NOT
      // retry, that would launch (and bill) a second concurrent render
      throw new Error(
        `Replicate prediction still ${prediction.status} after ${MAX_POLLS} polls — giving up without retry`,
      );
    }

    if (prediction.status !== "succeeded") {
      lastError = `Replicate prediction ${prediction.status}: ${
        prediction.error || "unknown error"
      }`;
      continue;
    }

    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (!outputUrl) {
      lastError = "Replicate succeeded but returned no output URL";
      continue;
    }

    const imageResponse = await fetch(outputUrl, {
      signal: AbortSignal.timeout(60000),
    });
    if (!imageResponse.ok) {
      lastError = `Failed to download image: HTTP ${imageResponse.status}`;
      continue;
    }

    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error(lastError || "Replicate failed after retries");
}
