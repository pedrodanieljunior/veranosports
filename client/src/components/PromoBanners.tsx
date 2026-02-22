import { useState, useEffect } from "react";
import banner1a from "@assets/WhatsApp_Image_2026-02-22_at_11.16.47_1771773609205.jpeg";
import banner1b from "@assets/WhatsApp_Image_2026-02-22_at_11.16.43_1771773609209.jpeg";
import banner2a from "@assets/WhatsApp_Image_2026-02-22_at_11.17.46_1771773621872.jpeg";
import banner2b from "@assets/WhatsApp_Image_2026-02-22_at_11.17.47_1771773621874.jpeg";

function RotatingBanner({ images, interval = 4000 }: { images: string[]; interval?: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl shadow-md" style={{ aspectRatio: "2/1" }}>
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            i === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === current ? "bg-white" : "bg-white/40"
            }`}
            data-testid={`banner-dot-${i}`}
          />
        ))}
      </div>
    </div>
  );
}

export function PromoBanners() {
  return (
    <div className="flex gap-3 w-full">
      <div className="flex-1">
        <RotatingBanner images={[banner1a, banner1b]} interval={4000} />
      </div>
      <div className="flex-1">
        <RotatingBanner images={[banner2a, banner2b]} interval={5000} />
      </div>
    </div>
  );
}
