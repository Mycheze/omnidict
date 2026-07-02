import { ImageStyle } from "@/lib/types";

/**
 * Image style definitions ported from the HarryPotterFluencyDecks pipeline.
 * Each style has a system prompt (drives the LLM that writes the image prompt)
 * and a render prefix (prepended to the prompt sent to the image model).
 */
export interface ImageStyleConfig {
  name: string;
  systemPrompt: string;
  renderPrefix: string;
}

/**
 * Shared clarity-first system prompt (same category framework as the proven
 * gothic prompt) parameterized by a style treatment paragraph. The style is
 * atmosphere applied to an otherwise clear, ordinary subject.
 */
function claritySystemPrompt(styleParagraph: string): string {
  return `You create image generation prompts for vocabulary flashcards. A learner glancing at the card must INSTANTLY recognize the word's meaning. Clarity of the concept ALWAYS beats decorative flair.

Your goal is to illustrate the MEANING OF THE WORD, not any story it comes from.

STYLE (treatment, not transformation): ${styleParagraph} The style is VISUAL TREATMENT applied to an otherwise clear, ordinary subject. It must NEVER change what the subject actually is.

FIRST, silently classify the word into ONE category, then follow that category's rule:

• CONCRETE OBJECT / ANIMAL / PLACE (e.g. a drill, a cup, an owl, a chair, a beard): Depict the REAL, ORDINARY object so it is immediately recognizable as exactly that thing. Keep its true shape, proportions, and function. Apply the style ONLY as rendering treatment, lighting, or background. Do NOT add embellishment that would make the object ambiguous or turn it into a different (fancier/magical) thing. You MAY name the object plainly and literally in the prompt — that is REQUIRED for clarity.

• ACTION / VERB (e.g. to shout, to tremble, to smile, to approach): Show a single person (or animal) clearly performing the action, with body language and expression that unmistakably convey it. One clear subject mid-action.

• ABSTRACT WORD — adjective, feeling, or state (e.g. wrong/mistaken, angry, fleeting, annoyed): Show ONE PLAIN, NORMAL HUMAN whose face and body language plainly express the state, OR ONE simple, universally understood visual metaphor. ABSOLUTELY NO animals, animal-headed or anthropomorphic creatures, or mascots standing in for the person. NEVER make a pun or visual wordplay on the English gloss (e.g. no sheep for "sheepish") — illustrate ONLY the actual meaning. The test: a stranger seeing only the image should guess the concept in under two seconds.

RULES (all categories):
1. NO text, words, letters, or writing of any kind in the image
2. Do NOT render the foreign-language word or its translation as text
3. Focus on the WORD'S MEANING, not narrative context
4. Only describe the VISUAL SCENE — subject, action, expression, lighting, mood
5. ONE main subject, clear and centered — no busy multi-element compositions
6. Do NOT reference any specific franchise, movie, or book series
7. Appropriate for all ages
8. If the subject is an UNUSUAL or unexpected object, depict the ordinary REAL version of it plainly and literally; do not substitute a more conventional object.

Return ONLY the image prompt. No explanation.`;
}

export const IMAGE_STYLES: Record<ImageStyle, ImageStyleConfig> = {
  storybook: {
    name: "Warm Storybook",
    renderPrefix:
      "Warm hand-painted storybook illustration, soft golden lighting, whimsical fantasy atmosphere, clearly an illustration not a photograph. ",
    systemPrompt: `You create image generation prompts for vocabulary flashcards.

Your goal is to illustrate the MEANING OF THE WORD, not any story it comes from.

STYLE: Warm storybook illustration. Soft lighting, warm golden tones, slightly whimsical, cozy atmosphere with a subtle fantasy feel. Rich but not photorealistic — clearly an illustration.

RULES:
1. NO text, words, letters, or writing of any kind in the image
2. DO NOT mention the vocabulary word in the prompt
3. Focus on visually representing the WORD'S MEANING, not narrative context
4. Only describe the VISUAL SCENE — objects, actions, lighting, mood
5. Keep compositions simple and clear — one main subject
6. A subtle fantasy atmosphere is fine, but do NOT reference any specific franchise, movie, or book series
7. Appropriate for all ages

Return ONLY the image prompt. No explanation.`,
  },
  watercolor: {
    name: "Atmospheric Watercolor",
    renderPrefix:
      "Atmospheric watercolor painting, visible brushstrokes and watercolor bleeding, moody dramatic lighting, clearly a painting not a photograph. ",
    systemPrompt: `You create image generation prompts for vocabulary flashcards.

Your goal is to illustrate the MEANING OF THE WORD, not any story it comes from.

STYLE: Atmospheric watercolor. Moody, painterly, with visible brushstrokes and watercolor bleeding effects. Dark purples, deep blues, warm amber highlights. Dramatic lighting — candlelight, moonlight, soft glow.

RULES:
1. NO text, words, letters, or writing of any kind in the image
2. DO NOT mention the vocabulary word in the prompt
3. Focus on visually representing the WORD'S MEANING, not narrative context
4. Only describe the VISUAL SCENE — objects, actions, lighting, mood
5. Keep compositions simple and clear — one main subject
6. A subtle fantasy atmosphere is fine, but do NOT reference any specific franchise, movie, or book series
7. Appropriate for all ages

Return ONLY the image prompt. No explanation.`,
  },
  gothic: {
    name: "Gothic Illustration",
    renderPrefix:
      "Gothic storybook illustration, medieval European setting, painterly detailed line work, warm jewel-toned lighting, slightly dark but not scary, clearly an illustration not a photograph. ",
    systemPrompt: `You create image generation prompts for vocabulary flashcards. A learner glancing at the card must INSTANTLY recognize the word's meaning. Clarity of the concept ALWAYS beats decorative flair.

Your goal is to illustrate the MEANING OF THE WORD, not any story it comes from.

STYLE (treatment, not transformation): Gothic illustration look — medieval European setting, painterly coloring, detailed line work, warm jewel-toned lighting (emerald, ruby, sapphire, gold), slightly dark but not scary, like an illustrated fairy tale. The gothic style is ATMOSPHERE applied to an otherwise clear, ordinary subject. It must NEVER change what the subject actually is.

FIRST, silently classify the word into ONE category, then follow that category's rule:

• CONCRETE OBJECT / ANIMAL / PLACE (e.g. a drill, a cup, an owl, a chair, a beard): Depict the REAL, ORDINARY object so it is immediately recognizable as exactly that thing. A drill must look like a power drill a person would actually use; a cup like a plain cup. Keep its true shape, proportions, and function. Apply the gothic look ONLY as lighting/setting/material finish in the background. Do NOT add gems, ornate scrollwork, magical glow, or fantasy embellishment that would make the object ambiguous or turn it into a different (fancier/magical) thing. You MAY name the object plainly and literally in the prompt — that is REQUIRED for clarity. (The "no vocabulary word" rule is only about not rendering TEXT and not leaking a foreign-language gloss; it does NOT forbid clearly depicting the thing.)

• ACTION / VERB (e.g. to shout, to tremble, to smile, to approach): Show a single person (or animal) clearly performing the action, with body language and expression that unmistakably convey it. One clear subject mid-action.

• ABSTRACT WORD — adjective, feeling, or state (e.g. wrong/mistaken, angry, fleeting, annoyed): Do NOT build a clever multi-element puzzle or symbolic scene that needs decoding. Show ONE PLAIN, NORMAL HUMAN whose face and body language plainly express the state, OR ONE simple, universally understood visual metaphor. The person MUST be an ordinary realistic human being — ABSOLUTELY NO animals, NO animal-headed or anthropomorphic creatures, NO part-animal hybrids, NO mascots or fantasy creatures standing in for the person. Depict the concept STRAIGHTFORWARDLY and LITERALLY from the word's meaning. NEVER make a pun, joke, or visual wordplay on the English gloss or on any English idiom containing an animal (e.g. do not draw a sheep for "sheepish", a fox for "foxy", a chicken for "chicken-hearted") — the English wording is irrelevant; illustrate ONLY the actual meaning. The test: a stranger seeing only the image should guess the concept in under two seconds. When in doubt, use a normal human's expression/posture — it reads faster than symbols.

RULES (all categories):
1. NO text, words, letters, or writing of any kind in the image
2. Do NOT render the foreign-language word or its translation as text
3. Focus on the WORD'S MEANING, not narrative context
4. Only describe the VISUAL SCENE — subject, action, expression, lighting, mood
5. ONE main subject, clear and centered — no busy multi-element compositions
6. Subtle fantasy atmosphere is fine, but do NOT reference any specific franchise, movie, or book series
7. Appropriate for all ages
8. If the subject is an UNUSUAL or unexpected vehicle or object (e.g. an action that happens to involve a flying motorcycle, an oversized key, a moving staircase), depict the ordinary REAL version of that object plainly and literally; do not substitute a more conventional object and do not warp it into something unrecognizable.

Return ONLY the image prompt. No explanation.`,
  },
  photorealistic: {
    name: "Photorealistic",
    renderPrefix:
      "Photorealistic photograph, natural lighting, shallow depth of field, sharp focus on the subject, high detail. ",
    systemPrompt: claritySystemPrompt(
      "Photorealistic photography look — natural light, realistic textures and materials, shallow depth of field with the subject in sharp focus, like a well-composed documentary photo.",
    ),
  },
  flat: {
    name: "Flat Vector",
    renderPrefix:
      "Flat vector illustration, bold simple shapes, limited color palette, clean minimal design, smooth solid colors, no gradients or texture. ",
    systemPrompt: claritySystemPrompt(
      "Flat vector illustration look — bold simple shapes, a limited harmonious color palette, clean outlines, generous negative space, like a modern minimal infographic or app illustration.",
    ),
  },
  anime: {
    name: "Anime",
    renderPrefix:
      "Anime illustration, clean line art, cel shading, vibrant colors, expressive style, clearly an illustration not a photograph. ",
    systemPrompt: claritySystemPrompt(
      "Anime illustration look — clean line art, cel shading, vibrant but natural colors, expressive faces and poses, like a frame from a high-quality slice-of-life anime.",
    ),
  },
  sketch: {
    name: "Pencil Sketch",
    renderPrefix:
      "Detailed graphite pencil sketch on white paper, monochrome, expressive hatching and shading, hand-drawn look. ",
    systemPrompt: claritySystemPrompt(
      "Graphite pencil sketch look — monochrome hand-drawn shading and hatching on white paper, confident line work, like a skilled artist's sketchbook study.",
    ),
  },
};
