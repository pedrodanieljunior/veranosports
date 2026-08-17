/**
 * NativeBottomNav — barra de navegação inferior exclusiva do app nativo.
 *
 * Só é renderizada quando o código está rodando dentro do Capacitor
 * (Android / iOS). No browser / desktop, retorna null.
 *
 * Abas:
 *   🏠 Jogos   — lista principal de jogos
 *   🔴 Ao Vivo — filtro de jogos ao vivo
 *   🎫 Apostas — abre o bet slip
 *   👤 Conta   — perfil / login
 */

import { useState, useEffect } from "react";
import { isNative, NativeTab, dispatchNativeTabChange, dispatchNativeOpenBetSlip, dispatchNativeOpenHistory, dispatchNativeOpenProfile, hapticLight, NATIVE_EVENTS } from "@/lib/platform";
import { useAuth } from "@/lib/auth";

interface NativeBottomNavProps {
  selectionsCount?: number;
}

export function NativeBottomNav({ selectionsCount = 0 }: NativeBottomNavProps) {
  const [activeTab, setActiveTab] = useState<NativeTab>("jogos");
  const { user } = useAuth();

  // Ouvir mudanças externas de tab (por ex: Copa.tsx pode trocar a aba programaticamente)
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab } = (e as CustomEvent<{ tab: NativeTab }>).detail;
      setActiveTab(tab);
    };
    window.addEventListener(NATIVE_EVENTS.TAB_CHANGE, handler);
    return () => window.removeEventListener(NATIVE_EVENTS.TAB_CHANGE, handler);
  }, []);

  // Não renderizar no browser
  if (!isNative()) return null;

  const handleTab = async (tab: NativeTab) => {
    await hapticLight();
    setActiveTab(tab);

    if (tab === "apostas") {
      dispatchNativeOpenHistory();
      return;
    }
    if (tab === "conta") {
      dispatchNativeOpenProfile();
      return;
    }
    dispatchNativeTabChange(tab);
  };

  const tabs: Array<{
    id: NativeTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: "jogos",
      label: "Jogos",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          {/* Pentágono central */}
          <polygon points="12,7.8 16,10.7 14.5,15.4 9.5,15.4 8,10.7"/>
          {/* Costuras do pentágono até a borda */}
          <line x1="12"   y1="7.8"  x2="12"   y2="2"/>
          <line x1="16"   y1="10.7" x2="21.5" y2="8.9"/>
          <line x1="14.5" y1="15.4" x2="17.9" y2="20.1"/>
          <line x1="9.5"  y1="15.4" x2="6.1"  y2="20.1"/>
          <line x1="8"    y1="10.7" x2="2.5"  y2="8.9"/>
        </svg>
      ),
    },
    {
      id: "aovivo",
      label: "Ao Vivo",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M7.76 7.76a6 6 0 0 0 0 8.49" />
          <path d="M20.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M3.93 4.93a10 10 0 0 0 0 14.14" />
        </svg>
      ),
    },
    {
      id: "apostas",
      label: "Apostas",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      ),
      badge: selectionsCount > 0 ? selectionsCount : undefined,
    },
    {
      id: "conta",
      label: user ? "Perfil" : "Entrar",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 1 0-16 0" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Espaçador para o conteúdo não ficar atrás da barra */}
      <div className="h-20 shrink-0" aria-hidden="true" />

      {/* Barra fixa na base */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: "linear-gradient(180deg, rgba(15,21,35,0.97) 0%, rgba(10,14,24,1) 100%)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTab(tab.id)}
              className="relative flex flex-1 flex-col items-center justify-center py-2 gap-0.5 transition-all duration-150 active:scale-95"
              style={{
                color: isActive ? "hsl(142 70% 45%)" : "rgba(255,255,255,0.45)",
                background: "transparent",
                border: "none",
                outline: "none",
                minHeight: 56,
              }}
            >
              {/* Indicador ativo */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                  style={{ background: "hsl(142 70% 45%)" }}
                />
              )}

              {/* Ícone com badge */}
              <span className="relative">
                {tab.icon}
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: "hsl(142 70% 45%)", padding: "0 4px" }}
                  >
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </span>

              {/* Label */}
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>

              {/* Ponto vermelho animado no Ao Vivo */}
              {tab.id === "aovivo" && (
                <span
                  className="absolute top-2.5 right-[calc(50%-14px)] w-2 h-2 rounded-full"
                  style={{ background: "#ef4444", animation: "pulse 1.5s ease-in-out infinite" }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
