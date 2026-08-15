import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import Home from "@/pages/Home";
import Copa from "@/pages/Copa";
import NotFound from "@/pages/not-found";
import { setupNativeStatusBar, hideSplashScreen, isNative } from "@/lib/platform";
import NativeSplash from "@/components/NativeSplash";

// Lazy load páginas pesadas — só compilam quando o usuário navega até elas
const Admin = lazy(() => import("@/pages/Admin"));
const LiveControl = lazy(() => import("@/pages/LiveControl"));

// Mostra splash animado só uma vez por sessão no app nativo
const SPLASH_DONE_KEY = "verano_splash_done";
function shouldShowSplash() {
  if (!isNative()) return false;
  if (sessionStorage.getItem(SPLASH_DONE_KEY)) return false;
  return true;
}

function Router() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <Switch>
        <Route path="/"><Redirect to="/copa" /></Route>
        <Route path="/home" component={Home} />
        <Route path="/copa" component={Copa} />
        <Route path="/painel-gm7x9k2" component={Admin} />
        <Route path="/live-control" component={LiveControl} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(shouldShowSplash);

  // Inicialização nativa (status bar) — hideSplashScreen é chamado pelo NativeSplash
  useEffect(() => {
    setupNativeStatusBar();
    // No web ou quando splash já foi exibido, esconde a splash nativa imediatamente
    if (!showSplash) hideSplashScreen();
  }, [showSplash]);

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem(SPLASH_DONE_KEY, "1");
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          {showSplash && <NativeSplash onDone={handleSplashDone} />}
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
