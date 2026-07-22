import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, X, Megaphone, Tag, AlertTriangle, CheckCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface Notif {
  id: number;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  read: boolean;
  hasImage?: boolean;
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

const typeSolidBg = (type: string) => {
  if (type === "promo") return { bg: "#14532d", border: "#22c55e40", accent: "#4ade80" };
  if (type === "alert") return { bg: "#713f12", border: "#eab30840", accent: "#fbbf24" };
  return { bg: "#1e3a5f", border: "#3b82f640", accent: "#60a5fa" };
};

export function NotificationPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
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
    onSuccess: () => {
      queryClient.setQueryData(["/api/notifications"], (old: Notif[] | undefined) =>
        (old ?? []).map(n => ({ ...n, read: true }))
      );
    },
  });

  const markOneRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/notifications"], (old: Notif[] | undefined) =>
        (old ?? []).map(n => n.id === id ? { ...n, read: true } : n)
      );
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/notifications"], (old: Notif[] | undefined) =>
        (old ?? []).filter(n => n.id !== id)
      );
    },
  });

  const dismissAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/dismiss-all"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/notifications"], []);
      toast({ description: "Notificações limpas." });
    },
    onError: (e: any) => {
      console.error("dismissAll error:", e);
      toast({ variant: "destructive", description: "Erro ao limpar notificações." });
    },
  });

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelWidth = 300;
      const margin = 8;
      let left = rect.right - panelWidth;
      if (left < margin) left = margin;
      if (left + panelWidth > window.innerWidth - margin) left = window.innerWidth - panelWidth - margin;
      setPanelPos({ top: rect.bottom + 6, left });
    }
    setOpen(o => !o);
    if (unreadCount > 0) markAllRead.mutate();
  };

  const handleDismissAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dismissAll.mutate();
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
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998 }}
          onMouseDown={() => setOpen(false)}
        >
          <div
            style={{
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              width: 300,
              zIndex: 9999,
              background: "#1a1f2e",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "80vh",
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell className="w-4 h-4 text-white/70" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "white" }}>Notificações</span>
                {unreadCount > 0 && (
                  <Badge className="h-4 px-1.5 text-[9px] bg-red-500 text-white border-0">{unreadCount}</Badge>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {notifications.some(n => !n.read) && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => markAllRead.mutate()}
                    style={{ fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}
                  >
                    <CheckCheck className="w-3 h-3" /> Marcar tudo
                  </button>
                )}
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setOpen(false)}
                  style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <Bell className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Nenhuma notificação</p>
                </div>
              ) : (
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`rounded-xl border overflow-hidden transition-opacity ${!n.read ? "opacity-100" : "opacity-70"}`}
                      style={{ borderColor: n.hasImage ? "rgba(255,255,255,0.12)" : undefined }}
                    >
                      {n.hasImage && (
                        <div className="w-full h-28 overflow-hidden">
                          <img src={`/api/notifications/${n.id}/image`} alt={n.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className={`p-3 ${n.hasImage ? "bg-[#0f0f19]" : typeColor(n.type)}`}>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            {typeIcon(n.type)}
                            <p className="text-xs font-semibold text-white leading-tight">{n.title}</p>
                          </div>
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); dismiss.mutate(n.id); }}
                            className="flex-shrink-0 text-white/30 hover:text-red-400 transition-colors"
                            title="Excluir"
                            data-testid={`button-dismiss-notif-${n.id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
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

            {/* Footer — Limpar tudo */}
            {notifications.length > 0 && (
              <div
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 16px", flexShrink: 0 }}
                onMouseDown={e => e.stopPropagation()}
              >
                <button
                  onClick={handleDismissAll}
                  onMouseDown={e => e.stopPropagation()}
                  disabled={dismissAll.isPending}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "6px 0",
                    fontSize: 12,
                    color: dismissAll.isPending ? "rgba(255,255,255,0.3)" : "rgba(248,113,113,0.8)",
                    background: "none",
                    border: "none",
                    cursor: dismissAll.isPending ? "not-allowed" : "pointer",
                    borderRadius: 6,
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {dismissAll.isPending ? "Limpando..." : "Limpar tudo"}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function NotificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [visible, setVisible] = useState<Notif | null>(null);
  const [exiting, setExiting] = useState(false);
  const seenRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const hideBanner = (id: number) => {
    setExiting(true);
    setTimeout(() => {
      setVisible(null);
      setExiting(false);
      setDismissed(prev => new Set([...prev, id]));
    }, 280);
  };

  const dismissBanner = (id: number) => {
    markOneRead.mutate(id);
    hideBanner(id);
  };

  useEffect(() => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read && !dismissed.has(n.id) && !seenRef.current.has(n.id));
    if (unread.length === 0) return;

    const next = unread[0];
    seenRef.current.add(next.id);

    setVisible(null);
    setExiting(false);
    if (timerRef.current) clearTimeout(timerRef.current);

    setTimeout(() => {
      setVisible(next);
      timerRef.current = setTimeout(() => hideBanner(next.id), 6000);
    }, 100);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notifications.map(n => n.id).join(","), user?.cpf]);

  if (!user || !visible) return null;

  const colors = typeSolidBg(visible.type);

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: `translateX(-50%) translateY(${exiting ? "-120%" : "0"})`,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
        opacity: exiting ? 0 : 1,
        zIndex: 9990,
        width: "min(340px, calc(100vw - 32px))",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
      data-testid="notification-banner-popup"
    >
      <span style={{ flexShrink: 0, marginTop: 1 }}>{typeIcon(visible.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "white", lineHeight: 1.3, marginBottom: 2 }}>{visible.title}</p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>{visible.body}</p>
      </div>
      <button
        onClick={() => dismissBanner(visible.id)}
        style={{ flexShrink: 0, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", marginTop: 1, lineHeight: 1 }}
        data-testid="button-close-banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body
  );
}
