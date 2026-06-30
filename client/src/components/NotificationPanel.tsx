import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, X, Megaphone, Tag, AlertTriangle, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface Notif {
  id: number;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  read: boolean;
}

const typeIcon = (type: string) => {
  if (type === "promo") return <Tag className="w-3.5 h-3.5 text-green-400" />;
  if (type === "alert") return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
  return <Megaphone className="w-3.5 h-3.5 text-blue-400" />;
};

const typeColor = (type: string) => {
  if (type === "promo") return "border-green-500/30 bg-green-500/10";
  if (type === "alert") return "border-yellow-500/30 bg-yellow-500/10";
  return "border-blue-500/30 bg-blue-500/10";
};

export function NotificationPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const { data: notifications = [] } = useQuery<Notif[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 15000,
    refetchOnMount: true,
    staleTime: 0,
    retry: 1,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markOneRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelWidth = 300;
      const margin = 8;
      // Align panel's right edge to button's right edge, but clamp so it doesn't overflow left
      let left = rect.right - panelWidth;
      if (left < margin) left = margin;
      // Also clamp so it doesn't overflow right
      if (left + panelWidth > window.innerWidth - margin) left = window.innerWidth - panelWidth - margin;
      setPanelPos({ top: rect.bottom + 6, left });
    }
    setOpen(o => !o);
    if (unreadCount > 0) markAllRead.mutate();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative flex items-center justify-center p-1 transition-opacity hover:opacity-70"
        data-testid="button-notifications"
      >
        <Bell className="w-4 h-4 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: 300,
              background: "#1a1f2e",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-white/70" />
                <span className="text-sm font-semibold text-white">Notificações</span>
                {unreadCount > 0 && (
                  <Badge className="h-4 px-1.5 text-[9px] bg-red-500 text-white border-0">{unreadCount}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifications.some(n => !n.read) && (
                  <button onClick={() => markAllRead.mutate()} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Marcar tudo
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/80">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/40">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`rounded-xl border overflow-hidden transition-opacity ${!n.read ? "opacity-100" : "opacity-70"}`}
                      style={{ borderColor: n.hasImage ? "rgba(255,255,255,0.12)" : undefined }}
                    >
                      {/* Banner de imagem */}
                      {n.hasImage && (
                        <div className="relative w-full h-24 overflow-hidden">
                          <img src={`/api/notifications/${n.id}/image`} alt={n.title} className="w-full h-full object-cover" style={{ filter: "brightness(0.8)" }} />
                          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(15,15,25,0.95) 100%)" }} />
                          {/* Dismiss no canto da imagem */}
                          <button
                            onClick={(e) => { e.stopPropagation(); dismiss.mutate(n.id); }}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 hover:bg-red-500/80 transition-colors"
                            title="Excluir"
                            data-testid={`button-dismiss-notif-${n.id}`}
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                          {/* Título sobre a imagem */}
                          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {typeIcon(n.type)}
                              <p className="text-xs font-bold text-white leading-tight drop-shadow">{n.title}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Corpo */}
                      <div className={`p-3 ${n.imageUrl ? "pt-2" : ""} ${n.imageUrl ? "bg-[#0f0f19]" : typeColor(n.type)}`}>
                        {!n.imageUrl && (
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              {typeIcon(n.type)}
                              <p className="text-xs font-semibold text-white leading-tight">{n.title}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); dismiss.mutate(n.id); }}
                              className="flex-shrink-0 text-white/30 hover:text-red-400 transition-colors"
                              title="Excluir"
                              data-testid={`button-dismiss-notif-${n.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-white/70 leading-snug">{n.body}</p>
                        <p className="text-[10px] text-white/40 mt-1">
                          {new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export function NotificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const { data: notifications = [] } = useQuery<Notif[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 15000,
    refetchOnMount: true,
    staleTime: 0,
    retry: 1,
  });

  const markOneRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  if (!user) return null;

  const visible = notifications.filter(n => !n.read && !dismissed.has(n.id));
  if (visible.length === 0) return null;

  const notif = visible[0];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b ${typeColor(notif.type)}`}
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <span className="mt-0.5 flex-shrink-0">{typeIcon(notif.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-tight">{notif.title}</p>
        <p className="text-[11px] text-white/70 mt-0.5 leading-snug">{notif.body}</p>
      </div>
      <button
        onClick={() => {
          markOneRead.mutate(notif.id);
          setDismissed(prev => new Set([...prev, notif.id]));
        }}
        className="flex-shrink-0 text-white/40 hover:text-white/80 mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
