import { ApiError } from "./http";
import type { BottleCategory, RuntimeEnv } from "./types";

export const CATEGORIES: BottleCategory[] = [
  "炸裂的截图",
  "震撼的场景",
  "人物",
  "外观",
  "故事情节",
  "战绩"
];

const DEFAULT_SENSITIVE_WORDS = [
  "赌博",
  "色情",
  "政治谣言",
  "人身攻击",
  "辱骂",
  "外挂",
  "诈骗"
];

export type BottleInput = {
  title: string;
  gameName: string;
  category: BottleCategory;
  description: string;
  template: string;
};

export async function validateBottleInput(env: RuntimeEnv, input: BottleInput) {
  const title = input.title.trim();
  const gameName = input.gameName.trim();
  const description = input.description.trim();

  if (title.length < 1 || title.length > 30) {
    throw new ApiError(400, "invalid_title", "标题需为 1-30 字。");
  }

  if (gameName.length < 1 || gameName.length > 40) {
    throw new ApiError(400, "invalid_game_name", "游戏名需为 1-40 字。");
  }

  if (!CATEGORIES.includes(input.category)) {
    throw new ApiError(400, "invalid_category", "请选择有效分类。");
  }

  if (description.length < 15 || description.length > 300) {
    throw new ApiError(400, "invalid_description", "推荐理由需为 15-300 字。");
  }

  const sensitiveWords = await getSensitiveWords(env);
  const combined = `${title} ${gameName} ${description}`.toLowerCase();
  const hit = sensitiveWords.find((word) => combined.includes(word.toLowerCase()));
  if (hit) {
    throw new ApiError(400, "sensitive_content", `内容包含不适合公开展示的词：${hit}`);
  }

  return {
    title,
    gameName,
    category: input.category,
    description,
    template: input.template.trim().slice(0, 40) || "standard"
  };
}

export async function getSensitiveWords(env: RuntimeEnv) {
  const stored = await env.GH_CONFIG.get("sensitive_words", "json").catch(() => null);
  if (Array.isArray(stored)) {
    return stored.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  return DEFAULT_SENSITIVE_WORDS;
}

export function validateImage(file: File | null) {
  if (!file) {
    throw new ApiError(400, "image_required", "请上传一张游戏图片。");
  }

  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(file.type)) {
    throw new ApiError(400, "invalid_image_type", "图片仅支持 JPG、PNG、WEBP、GIF。");
  }

  if (file.size <= 0) {
    throw new ApiError(400, "image_empty", "图片文件不能为空。");
  }

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ApiError(400, "image_too_large", "图片不能超过 8MB。");
  }

  return file;
}

export function extensionFromMime(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
