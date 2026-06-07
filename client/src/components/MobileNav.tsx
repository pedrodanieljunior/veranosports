import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { translateLeagueName } from "@/lib/leagueTranslations";

interface MobileNavProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string) => void;
  isLoading: boolean;
}

export function MobileNav({ sports, selectedSport, onSelectSport, isLoading }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleSelectSport = (sportKey: string) => {
    onSelectSport(sportKey);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="md:hidden inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors" data-testid="button-mobile-menu">
          <span className="text-sm">⚽</span>
          <span className="text-white font-bold text-[10px] whitespace-nowrap">Todas as Ligas</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 border-0" style={{ background: "linear-gradient(160deg, #7c4a00 0%, #b8750a 30%, #d4960f 55%, #c47c05 75%, #8a5200 100%)", borderRight: "1px solid rgba(201,162,39,0.4)" }}>
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b border-yellow-600/40">
            <SheetTitle className="flex items-center gap-2 text-[#fff8dc] text-sm font-bold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
              <span className="text-base">&#9917;</span>
              Ligas de Futebol
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full bg-white/20" />
                ))}
              </div>
            ) : (
              <div className="py-1">
                {sports.map((sport) => (
                  <button
                    key={sport.key}
                    onClick={() => handleSelectSport(sport.key)}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                      selectedSport === sport.key
                        ? "font-bold border-l-[3px] border-l-yellow-300"
                        : "border-l-[3px] border-l-transparent hover:bg-white/10"
                    }`}
                    style={selectedSport === sport.key
                      ? { background: "rgba(255,220,80,0.25)", color: "#fff8dc" }
                      : { color: "#ffe9a0" }}
                    data-testid={`button-mobile-sport-${sport.key}`}
                  >
                    {translateLeagueName(sport.key, sport.title)}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
