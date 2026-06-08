import { ImagePlus, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { makeDemoImageFile } from "../lib/demoImage";
import { TurnstileWidget } from "./TurnstileWidget";
import type { ApiBottle, BottleCategory, SubmitBottleInput } from "../lib/types";

type CreateBottlePanelProps = {
  categories: BottleCategory[];
  submitting: boolean;
  turnstileSiteKey?: string | null;
  turnstileRequired?: boolean;
  onSubmit: (input: SubmitBottleInput) => Promise<ApiBottle | null>;
};

const defaultInput = {
  title: "把这段旅程安利给你",
  gameName: "未命名的好游戏",
  category: "震撼的场景" as BottleCategory,
  description:
    "这张图最打动我的地方，是它没有急着告诉你答案，而是把世界摊开，让你自己决定下一步往哪里走。"
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 8 * 1024 * 1024;

export function CreateBottlePanel({
  categories,
  submitting,
  turnstileSiteKey,
  turnstileRequired,
  onSubmit
}: CreateBottlePanelProps) {
  const [title, setTitle] = useState(defaultInput.title);
  const [gameName, setGameName] = useState(defaultInput.gameName);
  const [category, setCategory] = useState<BottleCategory>(defaultInput.category);
  const [description, setDescription] = useState(defaultInput.description);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [uploadError, setUploadError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const charState = useMemo(() => {
    if (description.length < 15) return "too-short";
    if (description.length > 300) return "too-long";
    return "ok";
  }, [description.length]);

  const handleTurnstileExpired = useCallback(() => {
    setTurnstileToken("");
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleDemoImage() {
    const file = await makeDemoImageFile(title || "光核演示截图");
    setUploadError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const issue = validateClientImage(file);
    if (issue) {
      setUploadError(issue);
      setImage(null);
      setPreview("");
      return;
    }
    setUploadError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    let file = image;
    if (!file) {
      file = await makeDemoImageFile(title || "光核演示截图");
    }

    const bottle = await onSubmit({
      title,
      gameName,
      category,
      description,
      template: "standard",
      image: file,
      turnstileToken
    });

    if (bottle) {
      setTitle("");
      setGameName("");
      setDescription("");
      setImage(null);
      setPreview("");
      setUploadError("");
      setTurnstileToken("");
    }
  }

  return (
    <section className="create-layout">
      <div className="panel create-form">
        <div className="panel-heading">
          <div>
            <h2>扔出漂流瓶</h2>
            <span>投递后获得 +1 次打捞机会</span>
          </div>
          <Sparkles size={20} />
        </div>

        <label className="upload-zone">
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            type="file"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {preview ? (
            <img src={preview} alt="漂流瓶图片预览" />
          ) : (
            <span>
              <ImagePlus size={28} />
              上传一张游戏图片
              <small>JPG / PNG / WEBP / GIF，最大 8MB</small>
            </span>
          )}
        </label>
        <button className="ghost-wide" type="button" onClick={handleDemoImage}>
          使用演示截图
        </button>
        {uploadError && <span className="upload-error">{uploadError}</span>}

        <div className="field-grid">
          <label>
            标题
            <input
              maxLength={30}
              value={title}
              placeholder="1-30 字"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            游戏
            <input
              maxLength={40}
              value={gameName}
              placeholder="游戏名"
              onChange={(event) => setGameName(event.target.value)}
            />
          </label>
        </div>

        <div className="category-picker">
          {categories.map((item) => (
            <button
              className={category === item ? "active" : ""}
              key={item}
              type="button"
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="text-field">
          推荐理由
          <textarea
            value={description}
            placeholder="15-300 字，说说为什么想把它递给陌生玩家。"
            onChange={(event) => setDescription(event.target.value)}
          />
          <span className={charState}>{description.length}/300</span>
        </label>

        <div className="rules-strip">
          <span>文明友好</span>
          <span>围绕安利</span>
          <span>避免灌水</span>
          <span>不含敏感内容</span>
        </div>

        <TurnstileWidget
          siteKey={turnstileSiteKey}
          onToken={setTurnstileToken}
          onExpired={handleTurnstileExpired}
        />

        <button
          className="primary-action"
          type="button"
          disabled={submitting || Boolean(turnstileRequired && (!turnstileSiteKey || !turnstileToken))}
          onClick={handleSubmit}
        >
          <Send size={18} />
          {submitting ? "投递中" : "确认扔出"}
        </button>
      </div>

      <div className="panel live-preview">
        <div className="panel-heading">
          <h2>瓶中卡片</h2>
          <span>实时预览</span>
        </div>
        <div className="preview-card">
          {preview ? (
            <img src={preview} alt="瓶中卡片预览" />
          ) : (
            <div className="preview-empty">
              <ImagePlus size={32} />
            </div>
          )}
          <span>{category}</span>
          <h3>{title || "还没有标题"}</h3>
          <strong>{gameName || "还没有游戏名"}</strong>
          <p>{description || "写下一段真诚的推荐理由。"}</p>
        </div>
      </div>
    </section>
  );
}

function validateClientImage(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    return "图片仅支持 JPG、PNG、WEBP、GIF。";
  }

  if (file.size <= 0) {
    return "图片文件不能为空。";
  }

  if (file.size > maxImageBytes) {
    return "图片不能超过 8MB。";
  }

  return "";
}
