import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, ChevronRight, Circle } from "lucide-react";
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
        <Button variant="outline" size="icon" className="lg:hidden" data-testid="button-mobile-menu">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0 bg-sidebar">
        <SheetHeader className="p-4 border-b border-sidebar-border">
          <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
            <Circle className="w-5 h-5 text-primary" />
            Ligas de Futebol
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-80px)]">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-sidebar-accent" />
              ))}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sports.map((sport) => (
                <button
                  key={sport.key}
                  onClick={() => handleSelectSport(sport.key)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm text-left transition-colors hover-elevate ${
                    selectedSport === sport.key
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80"
                  }`}
                  data-testid={`button-mobile-sport-${sport.key}`}
                >
                  <span className="truncate">{translateLeagueName(sport.key, sport.title)}</span>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${
                    selectedSport === sport.key ? "text-primary" : "text-muted-foreground"
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
