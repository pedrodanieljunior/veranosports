import { useEffect, useRef, useState } from "react";
import { isNative, hideSplashScreen } from "@/lib/platform";

/**
 * Splash animado para o app nativo Android.
 * Toca o vídeo fullscreen uma vez por sessão e depois some suavemente.
 * Os dados da página carregam em paralelo por trás.
 */
export default function NativeSplash({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tenta tocar automaticamente
    video.play().catch(() => {
      // Fallback: se autoplay bloqueado, encerra logo
      finish();
    });

    function finish() {
      setFading(true);
      hideSplashScreen();
      setTimeout(() => {
        setVisible(false);
        onDone();
      }, 600); // duração do fade-out
    }

    video.addEventListener("ended", finish);
    // Segurança: se algo travar, fecha após 12 segundos
    const safeTimeout = setTimeout(finish, 12_000);

    return () => {
      video.removeEventListener("ended", finish);
      clearTimeout(safeTimeout);
    };
  }, [onDone]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        playsInline
        muted
        autoPlay
        preload="auto"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}
