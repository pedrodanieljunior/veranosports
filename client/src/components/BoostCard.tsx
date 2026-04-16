import { Zap } from "lucide-react";
import { BoostCard as BoostCardType } from "@shared/schema";
import { Selection } from "@shared/schema";
import { fmtOdds } from "@/lib/formatOdds";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BoostCardProps {
  card: BoostCardType;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function BoostCard({ card, selections, onToggleSelection }: BoostCardProps) {
  const selectionId = `boost-${card.id}`;
  const isSelected = selections.some(s => s.id === selectionId);

  const handleClick = () => {
    const sel: Selection = {
      id: selectionId,
      gameId: `boost-${card.id}`,
      homeTeam: card.matchTitle,
      awayTeam: "",
      commenceTime: card.endsAt,
      sportTitle: card.eventName,
      marketKey: "boost",
      bookmaker: "FW Sports",
      outcome: "Super Boost",
      odds: card.boostedOdds,
      originalOdds: card.originalOdds,
    };
    onToggleSelection(sel);
  };

  const startDate = new Date(card.startsAt);
  const today = new Date();
  const isToday = startDate.toDateString() === today.toDateString();
  const dateLabel = isToday
    ? `Hoje, ${format(startDate, "HH:mm", { locale: ptBR })}`
    : format(startDate, "dd/MM • HH:mm", { locale: ptBR });

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer mx-3 mb-3"
      style={{
        background: "linear-gradient(135deg, #1a1a1a 0%, #222 60%, #1c1a10 100%)",
        border: isSelected ? "2px solid #f5c518" : "2px solid #333",
        boxShadow: isSelected
          ? "0 0 0 1px #f5c51840, 0 8px 32px #f5c51830"
          : "0 4px 24px rgba(0,0,0,0.5)",
      }}
      onClick={handleClick}
      data-testid={`boost-card-${card.id}`}
    >
      {/* Golden left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8a800 100%)" }} />

      <div className="pl-4 pr-4 pt-4 pb-3">
        {/* Event name */}
        <p className="text-center text-xs font-medium mb-1" style={{ color: "#aaa" }}>
          {card.eventName}
        </p>

        {/* Match title */}
        <h3 className="text-center text-white font-bold text-base leading-tight mb-1">
          {card.matchTitle}
        </h3>

        {/* Date */}
        <p className="text-center text-xs mb-3" style={{ color: "#888" }}>
          {dateLabel}
        </p>

        {/* Divider */}
        <div className="border-t mb-3" style={{ borderColor: "#333" }} />

        {/* SUPER BOOST badge */}
        <div className="mb-3">
          <span
            className="inline-block text-xs font-black italic px-2.5 py-1 rounded-full"
            style={{
              color: "#f5c518",
              border: "1.5px solid #f5c518",
              letterSpacing: "0.05em",
              background: "#f5c51812",
            }}
          >
            ⚡ SUPER BOOST
          </span>
        </div>

        {/* Description (optional) */}
        {card.description && (
          <p className="text-xs mb-2" style={{ color: "#aaa" }}>{card.description}</p>
        )}

        {/* Selections list */}
        {card.selections.length > 0 && (
          <div className="relative pl-3 mb-3 space-y-1.5">
            {/* Vertical line */}
            <div
              className="absolute left-0 top-1 bottom-1 w-px"
              style={{ background: "#555" }}
            />
            {card.selections.map((sel, idx) => (
              <p key={idx} className="text-sm" style={{ color: "#ddd" }}>
                {sel.description}
              </p>
            ))}
          </div>
        )}

        {/* Odds bar */}
        <div
          className="flex items-center justify-center gap-3 rounded-xl px-4 py-2.5 mt-1"
          style={{ background: "#111", border: "1px solid #2a2a2a" }}
        >
          <span
            className="text-base font-semibold line-through"
            style={{ color: "#777", textDecorationColor: "#555" }}
          >
            {fmtOdds(card.originalOdds)}
          </span>
          <Zap className="w-5 h-5 flex-shrink-0" style={{ color: "#f5c518", fill: "#f5c518" }} />
          <span className="text-2xl font-extrabold" style={{ color: "#f5c518" }}>
            {fmtOdds(card.boostedOdds)}
          </span>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <div className="mt-2.5 text-center">
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "#f5c51820", color: "#f5c518", border: "1px solid #f5c51850" }}>
              ✓ Adicionado ao bilhete
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
