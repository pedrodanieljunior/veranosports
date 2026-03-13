import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "@shared/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PromoBanners } from "./PromoBanners";

export function DesktopBannerCarousel() {
  const { data: banners = [] } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const activeBanners = banners.filter(b => b.active);

  if (activeBanners.length === 0) {
    return <PromoBanners />;
  }

  return <Carousel banners={activeBanners} />;
}

function Carousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    if (banners.length <= 1) return;
    setCurrent(prev => (prev + 1) % banners.length);
  }, [banners.length]);

  const prev = useCallback(() => {
    if (banners.length <= 1) return;
    setCurrent(prev => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(next, 4000);
    return () => clearInterval(interval);
  }, [next, banners.length]);

  useEffect(() => {
    if (current >= banners.length && banners.length > 0) {
      setCurrent(0);
    }
  }, [banners.length, current]);

  return (
    <div
      className="relative w-full max-w-[50%] ml-auto overflow-hidden rounded-xl shadow-md"
      data-testid="desktop-banner-carousel"
    >
      <div style={{ aspectRatio: "3/1" }} className="relative">
        {banners.map((banner, idx) => (
          <img
            key={banner.id}
            src={banner.url}
            alt={`Banner ${banner.slotNumber}`}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              idx === current ? "opacity-100" : "opacity-0"
            }`}
            data-testid={`desktop-banner-image-${banner.slotNumber}`}
          />
        ))}
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            data-testid="desktop-banner-prev"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            data-testid="desktop-banner-next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  idx === current ? "bg-white w-5" : "bg-white/50"
                }`}
                data-testid={`desktop-banner-dot-${idx}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}