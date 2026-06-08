import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';

import { AppLayout } from '@/components/layout/AppLayout';
import { PagePlaceholder } from '@/components/PagePlaceholder';
import { LoginPage } from '@/features/auth/LoginPage';
import { useAuthStore } from '@/stores/auth';

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// Authenticated shell — guards every child route.
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

// Helper to declare a placeholder screen quickly.
const page = (path: string, title: string, description: string) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <PagePlaceholder title={title} description={description} />,
  });

const dashboardRoute = page('/dashboard', 'Dashboard', 'Tổng quan AUM, P&L và phân bổ tài sản.');
const goldRoute = page('/gold', 'Quản lý Vàng', 'Danh mục vàng và biểu đồ lãi/lỗ.');
const goldAddRoute = page('/gold/add', 'Nhập GD Vàng', 'Form nhập giao dịch vàng.');
const stocksRoute = page('/stocks', 'Quản lý Chứng khoán', 'Danh mục cổ phiếu và watchlist.');
const stocksAddRoute = page('/stocks/add', 'Nhập GD Cổ phiếu', 'Form nhập giao dịch cổ phiếu.');
const cryptoRoute = page('/crypto', 'Quản lý Crypto', 'Danh mục coin và ví lưu trữ.');
const cryptoAddRoute = page('/crypto/add', 'Nhập GD Crypto', 'Form nhập giao dịch crypto.');
const reportsRoute = page('/reports', 'Báo cáo', 'Báo cáo P&L và xuất CSV.');
const settingsRoute = page('/settings', 'Cài đặt', 'Hồ sơ, đơn vị tiền tệ, thông báo.');

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    goldRoute,
    goldAddRoute,
    stocksRoute,
    stocksAddRoute,
    cryptoRoute,
    cryptoAddRoute,
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
