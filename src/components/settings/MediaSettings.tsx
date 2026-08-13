"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Music,
  Volume2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMediaStore } from "@/stores/mediaStore";
import { useLanguageStore } from "@/stores/languageStore";
import { useAuth } from "@/hooks/useAuth";
import {
  ApiResponse,
  IMAGE_STYLE_VALUES,
  ImageStyle,
  MediaProviderStatus,
  MediaType,
} from "@/lib/types";
import { IMAGE_STYLES } from "@/lib/media/imageStyles";

const MEDIA_TYPE_OPTIONS: Array<{
  type: MediaType;
  label: string;
  description: string;
  icon: typeof ImageIcon;
  provider: keyof MediaProviderStatus;
}> = [
  {
    type: "image",
    label: "Images",
    description: "AI-generated illustration of the word's meaning",
    icon: ImageIcon,
    provider: "replicate",
  },
  {
    type: "wordAudio",
    label: "Word Audio",
    description: "Headword pronunciation via Google TTS",
    icon: Volume2,
    provider: "googleTts",
  },
  {
    type: "sentenceAudio",
    label: "Sentence Audio",
    description: "Example sentence narration via ElevenLabs",
    icon: Music,
    provider: "elevenLabs",
  },
];

// Derived from IMAGE_STYLES so the dropdown can never drift from the styles
// that actually exist
const IMAGE_STYLE_OPTIONS: Array<{ value: ImageStyle; label: string }> =
  IMAGE_STYLE_VALUES.map((value) => ({
    value,
    label: IMAGE_STYLES[value].name,
  }));

// Env-var booleans can't change during a session — fetch once, share across
// remounts (the settings modal unmounts this component on every tab switch)
let providerStatusPromise: Promise<MediaProviderStatus | null> | null = null;

function fetchProviderStatus(): Promise<MediaProviderStatus | null> {
  if (!providerStatusPromise) {
    providerStatusPromise = fetch("/api/media/status")
      .then((res) => res.json())
      .then((body: ApiResponse<MediaProviderStatus>) =>
        body.success && body.data ? body.data : null,
      )
      .catch(() => {
        providerStatusPromise = null; // allow retry after a network failure
        return null;
      });
  }
  return providerStatusPromise;
}

// Mirrors the payload of GET /api/user/usage
interface MediaUsageSummary {
  period: string;
  images: { used: number; limit: number };
  tts: { used: number; limit: number };
}

function parseUsage(
  body: ApiResponse<MediaUsageSummary>,
): MediaUsageSummary | null {
  return body.success && body.data ? body.data : null;
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${percent >= 100 ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Monthly included-quota meter for paid Refold accounts */
function UsageMeter() {
  const [usage, setUsage] = useState<MediaUsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/usage")
      .then((res) => res.json())
      .then((body: ApiResponse<MediaUsageSummary>) => {
        if (cancelled) return;
        const data = parseUsage(body);
        if (data) {
          setUsage(data);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Included Media Generation</CardTitle>
        <CardDescription>
          Your paid Refold account includes monthly image and sentence-audio
          generation on our keys{usage ? ` (period ${usage.period})` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed ? (
          <p className="text-sm text-muted-foreground">
            Could not load usage right now.
          </p>
        ) : !usage ? (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        ) : (
          <>
            <UsageBar
              label="Images"
              used={usage.images.used}
              limit={usage.images.limit}
            />
            <UsageBar
              label="Sentence audio"
              used={usage.tts.used}
              limit={usage.tts.limit}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MediaSettings() {
  const {
    enabledTypes,
    apiKeys,
    setTypeEnabled,
    setApiKey,
    updateLanguageConfig,
    getConfigForLanguage,
  } = useMediaStore();
  const { targetLanguages } = useLanguageStore();
  const { user, isLoading: authLoading } = useAuth();
  const isPaid = Boolean(user?.paid);

  const visibleLanguages = targetLanguages.filter((lang) => lang.visible);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [providerStatus, setProviderStatus] =
    useState<MediaProviderStatus | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (!selectedLanguage && visibleLanguages.length > 0) {
      setSelectedLanguage(visibleLanguages[0].standardizedName);
    }
  }, [selectedLanguage, visibleLanguages]);

  useEffect(() => {
    let cancelled = false;
    fetchProviderStatus().then((status) => {
      if (!cancelled) setProviderStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const config = selectedLanguage
    ? getConfigForLanguage(selectedLanguage)
    : null;

  // Google TTS is server-side only. The paid APIs (ElevenLabs, Replicate)
  // are covered by the server for paid Refold accounts; everyone else needs
  // their own key — the server env keys are NOT a fallback for them.
  const hasKey: Record<keyof MediaProviderStatus, boolean> = {
    googleTts: Boolean(providerStatus?.googleTts),
    elevenLabs: isPaid || Boolean(apiKeys.elevenLabs),
    replicate: isPaid || Boolean(apiKeys.replicate),
  };

  const keyInputs = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">
            ElevenLabs API Key
          </label>
          <Input
            type={showKeys ? "text" : "password"}
            value={apiKeys.elevenLabs}
            placeholder="xi-..."
            onChange={(e) => setApiKey("elevenLabs", e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">
            Replicate API Token
          </label>
          <Input
            type={showKeys ? "text" : "password"}
            value={apiKeys.replicate}
            placeholder="r8_..."
            onChange={(e) => setApiKey("replicate", e.target.value)}
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowKeys(!showKeys)}
        className="text-xs"
      >
        {showKeys ? (
          <>
            <EyeOff className="h-3.5 w-3.5 mr-1" /> Hide keys
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5 mr-1" /> Show keys
          </>
        )}
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <ImageIcon className="h-6 w-6" />
          Media Generation
        </h2>
        <p className="text-muted-foreground mt-1">
          Generate images and audio for Anki cards during export
        </p>
        {!authLoading && !user && (
          <p className="text-sm text-muted-foreground mt-2">
            Sign in with Refold — paid accounts include media generation.
          </p>
        )}
        {!authLoading && user && !isPaid && (
          <p className="text-sm text-muted-foreground mt-2">
            Upgrade on{" "}
            <a
              href="https://refold.la"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              refold.la
            </a>{" "}
            for included media generation.
          </p>
        )}
      </div>

      {/* Included-quota meter for paid accounts */}
      {isPaid && <UsageMeter />}

      {/* Global toggles + provider key status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Media Types</CardTitle>
          <CardDescription>
            Enabled types are generated when you export a card to Anki
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {MEDIA_TYPE_OPTIONS.map(
            ({ type, label, description, icon: Icon, provider }) => {
              const keyConfigured = hasKey[provider];
              return (
                <label
                  key={type}
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={enabledTypes[type]}
                    onChange={(e) => setTypeEnabled(type, e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {description}
                    </div>
                  </div>
                  {providerStatus &&
                    (keyConfigured ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Key configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <XCircle className="h-3.5 w-3.5" /> No API key
                      </span>
                    ))}
                </label>
              );
            },
          )}
        </CardContent>
      </Card>

      {/* User-supplied API keys for the paid providers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            API Keys
          </CardTitle>
          <CardDescription>
            {isPaid
              ? "Media generation is included with your account, so personal keys are optional. Any keys you add are stored only in this browser. Google TTS uses the server's key."
              : "ElevenLabs and Replicate bill per use, so you provide your own keys here (stored only in this browser). Google TTS uses the server's key."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPaid ? (
            <details>
              <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                Personal API keys (optional)
              </summary>
              <div className="mt-4 space-y-4">{keyInputs}</div>
            </details>
          ) : (
            keyInputs
          )}
        </CardContent>
      </Card>

      {/* Per-language configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Language Settings</CardTitle>
          <CardDescription>
            Voices and art style are configured per target language
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visibleLanguages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No target languages available. Add languages in the Languages tab
              first.
            </p>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium block mb-1">
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {visibleLanguages.map((lang) => (
                    <option
                      key={lang.standardizedName}
                      value={lang.standardizedName}
                    >
                      {lang.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {config && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Google TTS Language Code
                      </label>
                      <Input
                        value={config.googleLanguageCode}
                        placeholder="e.g. cs-CZ"
                        onChange={(e) =>
                          updateLanguageConfig(selectedLanguage, {
                            googleLanguageCode: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Google TTS Voice
                      </label>
                      <Input
                        value={config.googleVoiceName}
                        placeholder="e.g. cs-CZ-Chirp3-HD-Achernar (blank = default)"
                        onChange={(e) =>
                          updateLanguageConfig(selectedLanguage, {
                            googleVoiceName: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        ElevenLabs Voice ID
                      </label>
                      <Input
                        value={config.elevenLabsVoiceId}
                        placeholder="Voice ID from your ElevenLabs account"
                        onChange={(e) =>
                          updateLanguageConfig(selectedLanguage, {
                            elevenLabsVoiceId: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        ElevenLabs Language Code
                      </label>
                      <Input
                        value={config.elevenLabsLanguageCode}
                        placeholder="e.g. cs (blank = auto-detect)"
                        onChange={(e) =>
                          updateLanguageConfig(selectedLanguage, {
                            elevenLabsLanguageCode: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Speech Speed ({config.elevenLabsSpeed.toFixed(2)}x)
                      </label>
                      <input
                        type="range"
                        min={0.7}
                        max={1.2}
                        step={0.05}
                        value={config.elevenLabsSpeed}
                        onChange={(e) =>
                          updateLanguageConfig(selectedLanguage, {
                            elevenLabsSpeed: Number(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Slower speech helps learners parse sentences
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Image Style
                      </label>
                      <select
                        value={config.imageStyle}
                        onChange={(e) => {
                          // Validate instead of asserting: only known styles
                          const style = IMAGE_STYLE_VALUES.find(
                            (v) => v === e.target.value,
                          );
                          if (style) {
                            updateLanguageConfig(selectedLanguage, {
                              imageStyle: style,
                            });
                          }
                        }}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {IMAGE_STYLE_OPTIONS.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
