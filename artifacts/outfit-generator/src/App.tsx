import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { LayoutProvider } from '@/context/LayoutContext';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import BackupPage from './pages/backup';
import WelcomePage from './pages/welcome';
import HeroSplash from './pages/hero-splash';
import { LockedScreen } from './components/LockedScreen';
import { queryClient } from '@/lib/queryClient';
import { useState, useEffect } from 'react';
import { initRevenueCat } from '@/lib/revenuecat';
import { syncWithRevenueCat } from '@/hooks/useEntitlements';
import { warmUpBackgroundRemoval } from '@/lib/backgroundRemoval';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { BiometricLockContext } from '@/contexts/BiometricLockContext';
import { AnimatePresence, motion } from 'framer-motion';
import { useVisionIndexer } from '@/hooks/useVisionIndexer';

// Kick off RevenueCat configuration as early as possible.
// initRevenueCat() returns a Promise — fire it now so configure() has
// maximum time to finish before the first purchase attempt.
initRevenueCat().catch((e) => console.error('[RevenueCat] Init failed:', e));

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

/** Mounts after the splash is done — runs the vision indexer and shows a toast. */
function AppEntry() {
  const { isIndexing, done, total } = useVisionIndexer();
  return (
    <>
      <Router />
      <AnimatePresence>
        {isIndexing && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-20 left-0 right-0 flex justify-center z-[200] pointer-events-none px-4"
          >
            <div className="bg-black/80 text-white text-[11px] font-medium px-4 py-2 rounded-full
                            backdrop-blur-sm shadow-lg max-w-xs text-center">
              Preparing photo search… {done}/{total}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function AppShell() {
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  const [splash, setSplash] = useState<"hero" | "welcome" | "entered">(() => isPreview ? "entered" : "hero");
  const { enabled, isLocked, authenticate, enableLock, disableLock } = useBiometricLock();

  // Pre-warm the ONNX background-removal model after the first paint so the
  // first real "Clean Up Photo" invocation feels instant. Deferred with
  // setTimeout(0) so it runs after React has finished the initial render.
  useEffect(() => {
    const id = setTimeout(() => {
      warmUpBackgroundRemoval();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Sync entitlements from RevenueCat on launch and every time the app
  // returns to the foreground. This ensures refunded or expired purchases
  // are reflected automatically without relying on the local cache.
  useEffect(() => {
    // Await SDK configuration before the first sync so we don't query
    // CustomerInfo before Purchases.configure() has resolved.
    initRevenueCat().then(() => syncWithRevenueCat());

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncWithRevenueCat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <BiometricLockContext.Provider value={{ enabled, enableLock, disableLock }}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        {/* App only mounts after splash — prevents any flash of the main UI */}
        {splash === "entered" && <AppEntry />}
        {splash === "hero" && (
          <HeroSplash onContinue={() => setSplash("welcome")} />
        )}
        {splash === "welcome" && (
          <WelcomePage onEnter={() => setSplash("entered")} />
        )}
      </WouterRouter>

      {/* Biometric lock gate — sits above everything including the welcome splash */}
      <AnimatePresence>
        {isLocked && (
          <LockedScreen key="locked" onAuthenticate={authenticate} />
        )}
      </AnimatePresence>
    </BiometricLockContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutProvider>
        <AppShell />
      </LayoutProvider>
    </QueryClientProvider>
  );
}

export default App;
