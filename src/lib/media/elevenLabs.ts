import { backoffDelay, sleep } from "./util";

const ELEVENLABS_MODEL = "eleven_flash_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";
const MAX_RETRIES = 3;

/**
 * Synthesize sentence audio via the ElevenLabs TTS REST API. Returns MP3.
 */
export async function synthesizeElevenLabs(params: {
  text: string;
  voiceId: string;
  apiKey: string;
  languageCode?: string;
  speed?: number;
}): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    params.voiceId,
  )}?output_format=${OUTPUT_FORMAT}`;

  const payload: Record<string, unknown> = {
    text: params.text,
    model_id: ELEVENLABS_MODEL,
    output_format: OUTPUT_FORMAT,
    voice_settings: { speed: params.speed ?? 0.85 },
  };
  if (params.languageCode) {
    payload.language_code = params.languageCode;
  }

  let lastError = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    lastError = `ElevenLabs HTTP ${response.status}: ${await response
      .text()
      .catch(() => "")}`;

    switch (response.status) {
      case 429:
      case 500:
      case 503:
        // 429 is typically concurrent_limit_exceeded — back off and retry
        await sleep(backoffDelay(attempt));
        break;
      default:
        throw new Error(lastError);
    }
  }

  throw new Error(lastError || "ElevenLabs failed after retries");
}
