import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, ChevronRight } from "lucide-react";
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
        <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/20" data-testid="button-mobile-menu">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-white">
        <SheetHeader className="p-4 border-b border-gray-200">
          <SheetTitle className="flex items-center gap-2 text-gray-800">
            <span className="text-lg">&#9917;</span>
            Ligas de Futebol
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-80px)]">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="py-1">
              {sports.map((sport) => (
                <button
                  key={sport.key}
                  onClick={() => handleSelectSport(sport.key)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors border-l-3 ${
                    selectedSport === sport.key
                      ? "bg-yellow-50 text-yellow-800 border-l-yellow-500 font-semibold"
                      : "text-gray-600 border-l-transparent hover:bg-gray-50"
                  }`}
                  data-testid={`button-mobile-sport-${sport.key}`}
                >
                  <span className="truncate">{translateLeagueName(sport.key, sport.title)}</span>
                  <ChevronRight className={`w-3 h-3 flex-shrink-0 ${
                    selectedSport === sport.key ? "text-yellow-600" : "text-gray-400"
                  }`} />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
