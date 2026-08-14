import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { lazy, Suspense, useEffect } from "react";
import Home from "@/pages/Home";
import Copa from "@/pages/Copa";
import NotFound from "@/pages/not-found";
import { setupNativeStatusBar, hideSplashScreen } from "@/lib/platform";

// Lazy load páginas pesadas — só compilam quando o usuário navega até elas
const Admin = lazy(() => import("@/pages/Admin"));
const LiveControl = lazy(() => import("@/pages/LiveControl"));

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
  // Inicialização nativa (status bar, splash screen) — silencioso no web
  useEffect(() => {
    setupNativeStatusBar();
    hideSplashScreen();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
