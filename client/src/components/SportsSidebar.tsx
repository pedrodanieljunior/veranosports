import { Sport } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, Circle } from "lucide-react";

interface SportsSidebarProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string) => void;
  isLoading: boolean;
}

export function SportsSidebar({ sports, selectedSport, onSelectSport, isLoading }: SportsSidebarProps) {
  if (isLoading) {
    return (
      <div className="w-64 bg-sidebar border-r border-sidebar-border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <Circle className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sidebar-foreground">Ligas</h2>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-sidebar-accent" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-sidebar-border">
        <Circle className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-sidebar-foreground">Ligas de Futebol</h2>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sports.map((sport) => (
            <button
              key={sport.key}
              onClick={() => onSelectSport(sport.key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm text-left transition-colors hover-elevate ${
                selectedSport === sport.key
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80"
              }`}
              data-testid={`button-sport-${sport.key}`}
            >
              <span className="truncate">{sport.title}</span>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${
                selectedSport === sport.key ? "text-primary" : "text-muted-foreground"
              }`} />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
