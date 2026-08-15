import { useEffect, useRef, useState } from "react";
import { hideSplashScreen } from "@/lib/platform";

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

    function finish() {
      setFading(true);
      hideSplashScreen();
      setTimeout(() => {
        setVisible(false);
        onDone();
      }, 600);
    }

    video.play().catch(() => finish());
    video.addEventListener("ended", finish);
    const safeTimeout = setTimeout(finish, 12_000);

    return () => {
      video.removeEventListener("ended", finish);
      clearTimeout(safeTimeout);
    };
  }, [onDone]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#111214", // combina com o fundo escuro do vídeo
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.6s ease-out",
      }}
    >
      {/* Vídeo em largura total — barra superior/inferior some no fundo escuro */}
      <video
        ref={videoRef}
        src="/splash.mp4"
        playsInline
        muted
        autoPlay
        preload="auto"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
    </div>
  );
}
