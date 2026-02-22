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
      <SheetContent side="left" className="w-72 p-0 bg-white">
        <div className="flex h-full">
          <div className="w-1.5 flex-shrink-0" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8b206 50%, #d4960a 100%)" }} />
          <div className="flex-1 flex flex-col">
            <SheetHeader className="p-4 border-b border-gray-100">
              <SheetTitle className="flex items-center gap-2 text-gray-700 text-sm">
                <span className="text-base">&#9917;</span>
                Ligas de Futebol
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
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
                          ? "bg-yellow-50 text-yellow-800 font-semibold border-l-[3px] border-l-yellow-500"
                          : "text-gray-600 hover:bg-gray-50 border-l-[3px] border-l-transparent"
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
