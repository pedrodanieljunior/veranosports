import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BoostCard as BoostCardType, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { BoostCard } from "./BoostCard";

interface BoostCarouselProps {
  cards: BoostCardType[];
  selections: Selection[];
  onToggleSelection: (s: Selection) => void;
  betHistory: BetSlipType[];
  user: any;
}

function isUsedByUser(card: BoostCardType, betHistory: BetSlipType[], user: any): boolean {
  if (!user) return false;
  return betHistory.some(
    (b) =>
      Array.isArray(b.selections) &&
      b.selections.some((s: any) => s.gameId === `boost-${card.id}`)
  );
}

export function BoostCarousel({ cards, selections, onToggleSelection, betHistory, user }: BoostCarouselProps) {
  const [idx, setIdx] = useState(0);

  // Single card — plain render, no chrome
  if (cards.length <= 1) {
    return cards.length === 0 ? null : (
      <BoostCard
        card={cards[0]}
        selections={selections}
        onToggleSelection={onToggleSelection}
        usedByUser={isUsedByUser(cards[0], betHistory, user)}
      />
    );
  }

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(cards.length - 1, i + 1));

  return (
    <div>
      {/* Card display — only the active card is rendered */}
      <div style={{ position: "relative" }}>
        <BoostCard
          key={cards[idx].id}
          card={cards[idx]}
          selections={selections}
          onToggleSelection={onToggleSelection}
          usedByUser={isUsedByUser(cards[idx], betHistory, user)}
        />

        {/* Left arrow */}
        {idx > 0 && (
          <button
            onClick={prev}
            aria-label="Anterior"
            style={{
              position: "absolute",
              left: 10,
              top: "40%",
              transform: "translateY(-50%)",
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
        )}

        {/* Right arrow */}
        {idx < cards.length - 1 && (
          <button
            onClick={next}
            aria-label="Próximo"
            style={{
              position: "absolute",
              right: 10,
              top: "40%",
              transform: "translateY(-50%)",
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
            }}
          >
            <ChevronRight style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8, paddingBottom: 4 }}>
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Card ${i + 1}`}
            style={{
              height: 6,
              width: i === idx ? 18 : 6,
              borderRadius: 9999,
              background: i === idx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
              transition: "all 0.3s",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
