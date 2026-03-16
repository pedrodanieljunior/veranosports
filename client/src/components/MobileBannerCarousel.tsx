import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "@shared/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MobileBannerCarousel() {
  const { data: banners = [] } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const [current, setCurrent] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const activeBanners = banners.filter(b => b.active);

  const next = useCallback(() => {
    if (activeBanners.length <= 1) return;
    setCurrent(prev => (prev + 1) % activeBanners.length);
  }, [activeBanners.length]);

  const prev = useCallback(() => {
    if (activeBanners.length <= 1) return;
    setCurrent(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(next, 4000);
    return () => clearInterval(interval);
  }, [next, activeBanners.length]);

  useEffect(() => {
    if (current >= activeBanners.length && activeBanners.length > 0) {
      setCurrent(0);
    }
  }, [activeBanners.length, current]);

  if (activeBanners.length === 0) return null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl mb-3"
      data-testid="banner-carousel"
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart === null) return;
        const diff = touchStart - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
          diff > 0 ? next() : prev();
        }
        setTouchStart(null);
      }}
    >
      <div className="aspect-[3/1] relative">
        {activeBanners.map((banner, idx) => (
          <img
            key={banner.id}
            src={`${banner.url}?t=${new Date(banner.updatedAt).getTime()}`}
            alt={`Banner ${banner.slotNumber}`}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              idx === current ? "opacity-100" : "opacity-0"
            }`}
            data-testid={`banner-image-${banner.slotNumber}`}
          />
        ))}
      </div>

      {activeBanners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors"
            data-testid="banner-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors"
            data-testid="banner-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {activeBanners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === current ? "bg-white w-4" : "bg-white/50"
                }`}
                data-testid={`banner-dot-${idx}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}