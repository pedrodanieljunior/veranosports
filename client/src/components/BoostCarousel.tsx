import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BoostCard as BoostCardType } from "@shared/schema";
import { Selection, BetSlip as BetSlipType } from "@shared/schema";
import { BoostCard } from "./BoostCard";

interface BoostCarouselProps {
  cards: BoostCardType[];
  selections: Selection[];
  onToggleSelection: (s: Selection) => void;
  betHistory: BetSlipType[];
  user: any;
}

export function BoostCarousel({ cards, selections, onToggleSelection, betHistory, user }: BoostCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Single card — render without carousel chrome
  if (cards.length === 1) {
    return (
      <BoostCard
        card={cards[0]}
        selections={selections}
        onToggleSelection={onToggleSelection}
        usedByUser={user ? betHistory.some((b: BetSlipType) => Array.isArray(b.selections) && b.selections.some((s: any) => s.gameId === `boost-${cards[0].id}`)) : false}
      />
    );
  }

  const scrollTo = useCallback((idx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[idx] as HTMLElement | undefined;
    if (!child) return;
    track.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
    setActiveIdx(idx);
  }, []);

  const prev = () => scrollTo(Math.max(0, activeIdx - 1));
  const next = () => scrollTo(Math.min(cards.length - 1, activeIdx + 1));

  // Sync active dot on manual scroll
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width === 0) return;
    const idx = Math.round(track.scrollLeft / width);
    setActiveIdx(idx);
  };

  return (
    <div className="relative">
      {/* Scroll track */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex overflow-x-auto"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            style={{ scrollSnapAlign: "start", flex: "0 0 100%", minWidth: 0 }}
          >
            <BoostCard
              card={card}
              selections={selections}
              onToggleSelection={onToggleSelection}
              usedByUser={user ? betHistory.some((b: BetSlipType) => Array.isArray(b.selections) && b.selections.some((s: any) => s.gameId === `boost-${card.id}`)) : false}
            />
          </div>
        ))}
      </div>

      {/* Arrow buttons */}
      {activeIdx > 0 && (
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.2)" }}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
      )}
      {activeIdx < cards.length - 1 && (
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.2)" }}
          aria-label="Próximo"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-2 pb-1">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === activeIdx ? 18 : 6,
              height: 6,
              background: i === activeIdx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
            }}
            aria-label={`Card ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
