import { ImageOff } from "lucide-react";
import { useState } from "react";

type GameImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
};

export function GameImage({ src, alt, className, loading = "lazy" }: GameImageProps) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <div className={className ? `${className} game-image-fallback` : "game-image-fallback"} role="img" aria-label={alt}>
        <ImageOff size={24} />
      </div>
    );
  }

  return <img className={className} src={src} alt={alt} loading={loading} onError={() => setFailed(true)} />;
}
