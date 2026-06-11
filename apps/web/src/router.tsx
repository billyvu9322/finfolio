import { Suspense, lazy, type ComponentType } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';

import { AppLayout } from '@/components/layout/AppLayout';
import { RouteFallback } from '@/components/RouteFallback';
import { LoginPage } from '@/features/auth/LoginPage';
import { useAuthStore } from '@/stores/auth';

type RoutePage = () => JSX.Element;

/**
 * Wraps a dynamic import so a stale lazy-chunk (hash changed after a redeploy →
 * old `assets/*.js` is gone → "Failed to fetch dynamically imported module")
 * triggers exactly one full reload to pull the fresh index.html + new hashes.
 * A sessionStorage guard prevents a reload loop; it clears on any success.
 */
const RELOAD_KEY = 'chunk-reload';
function importWithReload<T>(loader: () => Promise<T>): Promise<T> {
  return loader().then(
    (module) => {
      sessionStorage.removeItem(RELOAD_KEY);
      return module;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isChunkError = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
      if (isChunkError && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        return new Promise<T>(() => {}); // hang until the reload swaps the page
      }
      throw err;
    },
  );
}

function lazyPage<M extends Record<string, ComponentType<Record<string, never>>>>(loader: () => Promise<M>, name: keyof M): RoutePage {
  const Component = lazy(() => importWithReload(loader).then((module) => ({ default: module[name] as ComponentType<Record<string, never>> })));
  return () => (
    <Suspense fallback={<RouteFallback />}>
      <Component />
    </Suspense>
  );
}

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: lazyPage(() => import('@/features/auth/RegisterPage'), 'RegisterPage') });
const forgotPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/forgot-password', component: lazyPage(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage') });
const resetPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reset-password', component: lazyPage(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage') });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});

const child = <TPath extends string>(path: TPath, component: RoutePage) => createRoute({ getParentRoute: () => appRoute, path, component });

const dashboardRoute = child('/dashboard', lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'));
const goldRoute = child('/gold', lazyPage(() => import('@/features/gold/GoldPage'), 'GoldPage'));
const goldAddRoute = child('/gold/add', lazyPage(() => import('@/features/gold/GoldAddPage'), 'GoldAddPage'));
const GoldEditLazy = lazy(() => importWithReload(() => import('@/features/gold/GoldAddPage')).then((module) => ({ default: module.GoldAddPage })));
const goldEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gold/$transactionId',
  component: () => {
    const params = goldEditRoute.useParams();
    return (
      <Suspense fallback={<RouteFallback />}>
        <GoldEditLazy transactionId={params.transactionId} />
      </Suspense>
    );
  },
});
const stocksRoute = child('/stocks', lazyPage(() => import('@/features/stock/StockPortfolioPage'), 'StockPortfolioPage'));
const stocksAddRoute = child('/stocks/add', lazyPage(() => import('@/features/stock/StockAddPage'), 'StockAddPage'));
const StockDetailLazy = lazy(() => importWithReload(() => import('@/features/stock/StockDetailPage')).then((module) => ({ default: module.StockDetailPage })));
const stockDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stocks/$symbol',
  component: () => {
    const params = stockDetailRoute.useParams();
    return (
      <Suspense fallback={<RouteFallback />}>
        <StockDetailLazy symbol={params.symbol} />
      </Suspense>
    );
  },
});
const cryptoRoute = child('/crypto', lazyPage(() => import('@/features/crypto/CryptoPortfolioPage'), 'CryptoPortfolioPage'));
const cryptoAddRoute = child('/crypto/add', lazyPage(() => import('@/features/crypto/CryptoAddPage'), 'CryptoAddPage'));
const CryptoEditLazy = lazy(() => importWithReload(() => import('@/features/crypto/CryptoAddPage')).then((module) => ({ default: module.CryptoAddPage })));
const cryptoEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/crypto/$transactionId',
  component: () => {
    const params = cryptoEditRoute.useParams();
    return (
      <Suspense fallback={<RouteFallback />}>
        <CryptoEditLazy transactionId={params.transactionId} />
      </Suspense>
    );
  },
});
const reportsRoute = child('/reports', lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage'));
const settingsRoute = child('/settings', lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage'));

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    goldRoute,
    goldAddRoute,
    goldEditRoute,
    stocksRoute,
    stocksAddRoute,
    stockDetailRoute,
    cryptoRoute,
    cryptoAddRoute,
    cryptoEditRoute,
    reportsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
