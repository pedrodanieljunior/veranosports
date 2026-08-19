import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { lazy, Suspense, useEffect, useRef, useState, useCallback, type ReactNode } from "react";

// Força modo claro enquanto montado (ex: painel admin).
// Usa MutationObserver para remover a classe "dark" imediatamente
// caso o ThemeProvider pai tente re-adicioná-la.
function ForceLight({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");

    const observer = new MutationObserver(() => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      if (hadDark) root.classList.add("dark");
    };
  }, []);
  return <>{children}</>;
}
import Home from "@/pages/Home";
import Copa from "@/pages/Copa";
import NotFound from "@/pages/not-found";
import { setupNativeStatusBar, hideSplashScreen, isNative, registerPushToken } from "@/lib/platform";
import NativeSplash from "@/components/NativeSplash";

// Lazy load páginas pesadas — só compilam quando o usuário navega até elas
const Admin = lazy(() => import("@/pages/Admin"));
const LiveControl = lazy(() => import("@/pages/LiveControl"));

// Mostra splash animado só uma vez por sessão no app nativo
const SPLASH_DONE_KEY = "verano_splash_done";
function shouldShowSplash() {
  if (!isNative()) return false;
  // No preview de browser (?native=1) pula o splash — só roda no Capacitor real
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("native") === "1") return false;
  if (sessionStorage.getItem(SPLASH_DONE_KEY)) return false;
  return true;
}

// Registra o token de push FORA de qualquer fluxo de modal/login.
// Chama registerPushToken 3s após o usuário autenticar para garantir
// que nenhum dialog nativo do Android apareça enquanto o WebView está
// processando animações de UI (o diálogo de permissão nativo congela o WebView).
function PushRegistrar() {
  const { user } = useAuth();
  const registered = useRef(false);
  useEffect(() => {
    if (user && !registered.current && isNative()) {
      registered.current = true;
      // 30s — dá tempo suficiente para o usuário navegar sem que o callback
      // nativo do Firebase (evaluateJavascript) interrompa o toque do WebView.
      const t = setTimeout(() => { registerPushToken(); }, 30000);
      return () => clearTimeout(t);
    }
  }, [user]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <Switch>
        <Route path="/"><Redirect to="/copa" /></Route>
        <Route path="/home" component={Home} />
        <Route path="/copa" component={Copa} />
        <Route path="/painel-gm7x9k2">
          <ForceLight><Admin /></ForceLight>
        </Route>
        <Route path="/live-control" component={LiveControl} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(shouldShowSplash);

  useEffect(() => {
    setupNativeStatusBar();
    if (!showSplash) hideSplashScreen();
  }, [showSplash]);

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem(SPLASH_DONE_KEY, "1");
    setShowSplash(false);
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushRegistrar />
          <TooltipProvider>
            <Toaster />
            {showSplash && <NativeSplash onDone={handleSplashDone} />}
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
