import OpenAI from "openai";
import { pipeline, env, RawImage, type ImageClassificationPipeline } from "@xenova/transformers";
import { config } from "./config";
import * as db from "./db";
import { classify, contentTypeFor } from "./media";
import * as r2 from "./r2";

env.cacheDir = process.env.TRANSFORMERS_CACHE || ".cache/transformers";
env.allowLocalModels = true;

const MIN_SCORE = 0.04;
const TOP_K = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const BATCH_LIMIT = parseInt(process.env.VISUAL_INDEX_BATCH || "40", 10);

let classifierPromise: Promise<ImageClassificationPipeline> | null = null;
let localModelUnavailable = false;

function getClassifier(): Promise<ImageClassificationPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline("image-classification", "Xenova/mobilenet-a0.25").catch((err) => {
      classifierPromise = null;
      localModelUnavailable = true;
      throw err;
    });
  }
  return classifierPromise;
}

function labelToTags(label: string): string[] {
  const tags = new Set<string>();
  const normalized = label.toLowerCase().trim();
  tags.add(normalized);
  tags.add(normalized.replace(/_/g, " "));
  for (const part of normalized.split(/[_\s]+/)) {
    if (part.length >= 3) tags.add(part);
  }
  return [...tags];
}

export function tagsFromPredictions(
  predictions: Array<{ label: string; score: number }>,
): string[] {
  const tags = new Set<string>();
  for (const p of predictions) {
    if (p.score < MIN_SCORE) continue;
    labelToTags(p.label).forEach((t) => tags.add(t));
  }
  return [...tags].sort().slice(0, 20);
}

async function classifyWithLocal(buf: Buffer): Promise<string[]> {
  if (localModelUnavailable || process.env.VISUAL_INDEX_LOCAL === "0") return [];
  const classifier = await getClassifier();
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(buf)]));
  const raw = await classifier(image, { topk: TOP_K });
  const predictions = Array.isArray(raw) ? raw : [raw];
  return tagsFromPredictions(
    predictions.flatMap((r) => (Array.isArray(r) ? r : [r])) as Array<{ label: string; score: number }>,
  );
}

async function classifyWithOpenAI(buf: Buffer, fileName: string): Promise<string[]> {
  if (!config.openaiConfigured) return [];
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const mime = contentTypeFor(fileName) || "image/jpeg";
  const b64 = buf.toString("base64");
  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Identify objects and scenes in this image for search. Respond as JSON: {"tags":["car","outdoor","red"]}. Use 4-10 short lowercase tags only.',
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${b64}`, detail: "low" },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 120,
    temperature: 0.1,
  });
  try {
    const data = JSON.parse(completion.choices[0]?.message?.content || "{}") as { tags?: string[] };
    return (data.tags || [])
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export type VisualIndexResult = {
  indexed: boolean;
  tags: string[];
  skipped?: string;
  source?: "local" | "openai" | "none";
};

/** Index one image if needed. Local model first, OpenAI fallback when configured. */
export async function visualIndexImage(
  userId: string,
  key: string,
  size: number | null,
  force = false,
): Promise<VisualIndexResult> {
  const name = key.split("/").pop() || "";
  if (classify(name) !== "image") {
    return { indexed: false, tags: [], skipped: "not_image", source: "none" };
  }

  const existing = await db.getItem(userId, key);
  if (
    !force &&
    existing?.visual_indexed_at &&
    existing.visual_index_size === size &&
    existing.visual_tags
  ) {
    return {
      indexed: true,
      tags: existing.visual_tags.split(",").filter(Boolean),
      skipped: "already_indexed",
      source: "none",
    };
  }

  const bytes = await r2.getObjectBytes(key, MAX_IMAGE_BYTES);
  if (!bytes) {
    await db.setVisualIndex(userId, key, "", existing?.caption || "", size);
    return { indexed: false, tags: [], skipped: "unreadable_or_too_large", source: "none" };
  }

  let tags: string[] = [];
  let source: VisualIndexResult["source"] = "none";

  try {
    tags = await classifyWithLocal(bytes);
    if (tags.length) source = "local";
  } catch (err) {
    console.warn("[visual-index] local model failed:", err instanceof Error ? err.message : err);
    localModelUnavailable = true;
  }

  if (!tags.length && config.openaiConfigured) {
    try {
      tags = await classifyWithOpenAI(bytes, name);
      if (tags.length) source = "openai";
    } catch (err) {
      console.warn("[visual-index] openai fallback failed:", err instanceof Error ? err.message : err);
    }
  }

  const tagStr = tags.join(",");
  const caption =
    existing?.caption ||
    (tags.length
      ? tags
          .slice(0, 3)
          .map((t) => t.replace(/_/g, " "))
          .join(", ")
      : "");

  await db.setVisualIndex(userId, key, tagStr, caption, size);

  if (!tags.length) {
    return { indexed: false, tags: [], skipped: "no_tags", source };
  }
  return { indexed: true, tags, source };
}

export type VisualBatchResult = {
  visual_indexed: number;
  visual_skipped: number;
  visual_pending: number;
  visual_failed: number;
};

/** Index up to BATCH_LIMIT images that lack visual tags. */
export async function visualIndexPending(
  userId: string,
  opts?: { limit?: number; force?: boolean },
): Promise<VisualBatchResult> {
  const limit = opts?.limit ?? BATCH_LIMIT;
  const pending = await db.listImagesNeedingVisualIndex(userId, limit);
  let visual_indexed = 0;
  let visual_skipped = 0;
  let visual_failed = 0;

  for (const row of pending) {
    const result = await visualIndexImage(userId, row.key, row.size, opts?.force ?? false);
    if (result.indexed) visual_indexed++;
    else if (result.skipped === "already_indexed") visual_skipped++;
    else visual_failed++;
  }

  const visual_pending = await db.countImagesNeedingVisualIndex(userId);
  return { visual_indexed, visual_skipped, visual_failed, visual_pending };
}

export function visualIndexAvailable(): boolean {
  return !localModelUnavailable || config.openaiConfigured;
}

export function visualIndexMode(): string {
  if (config.openaiConfigured) return "openai_fallback";
  if (localModelUnavailable) return "unavailable";
  return "local_mobilenet";
}
