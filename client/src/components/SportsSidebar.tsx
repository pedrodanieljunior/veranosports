import { Sport } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight } from "lucide-react";
import { translateLeagueName } from "@/lib/leagueTranslations";

interface SportsSidebarProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string) => void;
  isLoading: boolean;
}

export function SportsSidebar({ sports, selectedSport, onSelectSport, isLoading }: SportsSidebarProps) {
  if (isLoading) {
    return (
      <div className="w-60 bg-white border-r border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-lg">&#9917;</span>
          <h2 className="font-semibold text-gray-800">Ligas</h2>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <span className="text-lg">&#9917;</span>
        <h2 className="font-bold text-gray-800 text-sm">Ligas de Futebol</h2>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="py-1">
          {sports.map((sport) => (
            <button
              key={sport.key}
              onClick={() => onSelectSport(sport.key)}
              className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-left transition-colors border-l-3 ${
                selectedSport === sport.key
                  ? "bg-yellow-50 text-yellow-800 border-l-yellow-500 font-semibold"
                  : "text-gray-600 border-l-transparent hover:bg-gray-50 hover:text-gray-800"
              }`}
              data-testid={`button-sport-${sport.key}`}
            >
              <span className="truncate">{translateLeagueName(sport.key, sport.title)}</span>
              <ChevronRight className={`w-3 h-3 flex-shrink-0 ${
                selectedSport === sport.key ? "text-yellow-600" : "text-gray-400"
              }`} />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
