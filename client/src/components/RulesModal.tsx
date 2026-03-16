import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen } from "lucide-react";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  const { data, isLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/rules"],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="w-5 h-5 text-primary" />
            Regras do Site
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-auto pr-2">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
              ))}
            </div>
          ) : !data?.content ? (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Nenhuma regra cadastrada ainda.
            </p>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none py-2 rules-content"
              dangerouslySetInnerHTML={{ __html: data.content }}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
