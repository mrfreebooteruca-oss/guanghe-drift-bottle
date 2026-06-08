import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TurnstileWidgetProps = {
  siteKey: string | null | undefined;
  onToken: (token: string) => void;
  onExpired: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey, onToken, onExpired }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return;

    if (window.turnstile) {
      setReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile-script]");
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
    }

    const markReady = () => setReady(true);
    script.addEventListener("load", markReady);
    if (!existing) {
      document.head.appendChild(script);
    }

    return () => {
      script.removeEventListener("load", markReady);
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !ready || !window.turnstile || !containerRef.current || widgetRef.current) {
      return;
    }

    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      callback: onToken,
      "expired-callback": onExpired,
      "error-callback": onExpired
    });

    return () => {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [onExpired, onToken, ready, siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="turnstile-shell">
      <div>
        <ShieldCheck size={16} />
        <span>人机校验</span>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
