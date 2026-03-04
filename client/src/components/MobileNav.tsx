import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu } from "lucide-react";
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
        <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-white/20" data-testid="button-mobile-menu">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 border-0" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8b206 50%, #d4960a 100%)" }}>
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b border-yellow-400/50">
            <SheetTitle className="flex items-center gap-2 text-white text-sm font-bold drop-shadow">
              <span className="text-base">&#9917;</span>
              Ligas de Futebol
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full bg-white/30" />
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
                        ? "bg-white/30 text-white font-bold border-l-[3px] border-l-white"
                        : "text-white/90 hover:bg-white/20 border-l-[3px] border-l-transparent"
                    }`}
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
