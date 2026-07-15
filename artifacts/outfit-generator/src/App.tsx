import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import BackupPage from './pages/backup';
import WelcomePage from './pages/welcome';
import HeroSplash from './pages/hero-splash';
import { queryClient } from '@/lib/queryClient';
import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { initRevenueCat } from '@/lib/revenuecat';

// Initialise RevenueCat as early as possible
try {
  initRevenueCat();
} catch (e) {
  console.error('[RevenueCat] Init failed:', e);
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <h1 className="text-6xl font-display font-bold text-primary drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">404</h1>
      <p className="text-xl font-bold uppercase">As if! This page is totally lost.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={WardrobePage} />
        <Route path="/generate" component={GeneratePage} />
        <Route path="/saved" component={SavedPage} />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/backup" component={BackupPage} />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

/**
 * App flow every session:
 *   welcome (lights) → hero image (1 s) → main app
 */
type Phase = 'welcome' | 'hero' | 'entered';

function AppShell() {
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';

  const [phase, setPhase] = useState<Phase>(() => isPreview ? 'entered' : 'welcome');

  // Called when the vanity lights finish their animation
  const handleLightsUp = useCallback(() => setPhase('hero'), []);

  // Called when the hero image 1-second hold ends
  const handleHeroDone = useCallback(() => setPhase('entered'), []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />

      {/* Step 1 — vanity lights screen */}
      {phase === 'welcome' && (
        <WelcomePage onEnter={handleLightsUp} />
      )}

      {/* Step 2 — full-screen hero image (1 s inspiration moment) */}
      <AnimatePresence>
        {phase === 'hero' && (
          <HeroSplash onContinue={handleHeroDone} />
        )}
      </AnimatePresence>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

export default App;
