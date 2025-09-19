import { lazy, ComponentType } from 'react';

// Dynamic import utility with error boundary
export function createLazyComponent<T = {}>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  fallback?: ComponentType
) {
  const LazyComponent = lazy(importFn);
  
  // Add display name for debugging
  LazyComponent.displayName = `Lazy(${importFn.toString().match(/\/([^\/]+)\.tsx?/)?.[1] || 'Component'})`;
  
  return LazyComponent;
}

// Preload function for critical components
export function preloadComponent(importFn: () => Promise<any>) {
  // Start loading the component
  const componentImport = importFn();
  
  // Return a function to get the preloaded component
  return () => componentImport;
}

// Common dashboard components with lazy loading
export const LazyComponents = {
  // Dashboard components
  DashboardOverview: createLazyComponent(() => 
    import('@/components/dashboard/DashboardOverview').then(m => ({ default: m.DashboardOverview }))
  ),
  
  ServerOverview: createLazyComponent(() => 
    import('@/components/dashboard/ServerOverview').then(m => ({ default: m.ServerOverview }))
  ),
  
  QuickActions: createLazyComponent(() => 
    import('@/components/dashboard/QuickActions').then(m => ({ default: m.QuickActions }))
  ),
  
  BotSettings: createLazyComponent(() => 
    import('@/components/dashboard/BotSettings').then(m => ({ default: m.BotSettings }))
  ),
  
  // Product components
  ProductList: createLazyComponent(() => 
    import('@/components/products/ProductList').then(m => ({ default: m.ProductList }))
  ),
  
  ProductForm: createLazyComponent(() => 
    import('@/components/products/ProductForm').then(m => ({ default: m.ProductForm }))
  ),
  
  // Wallet components
  WalletOverview: createLazyComponent(() => 
    import('@/components/wallet/WalletOverview').then(m => ({ default: m.WalletOverview }))
  ),
  
  TransactionHistory: createLazyComponent(() => 
    import('@/components/wallet/TransactionHistory').then(m => ({ default: m.TransactionHistory }))
  ),
  
  CryptoWithdrawal: createLazyComponent(() => 
    import('@/components/wallet/CryptoWithdrawal').then(m => ({ default: m.CryptoWithdrawal }))
  ),
  
  // Monitoring components
  PerformanceDashboard: createLazyComponent(() => 
    import('@/components/monitoring/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard }))
  ),
};

// Preload critical components on app start
export function preloadCriticalComponents() {
  // Preload components that are likely to be used soon
  const criticalComponents = [
    () => import('@/components/dashboard/DashboardOverview'),
    () => import('@/components/dashboard/ServerOverview'),
    () => import('@/components/products/ProductList'),
  ];
  
  criticalComponents.forEach(importFn => {
    preloadComponent(importFn);
  });
}

// Route-based preloading
export const RoutePreloader = {
  dashboard: () => {
    preloadComponent(() => import('@/components/dashboard/DashboardOverview'));
    preloadComponent(() => import('@/components/dashboard/ServerOverview'));
  },
  
  products: () => {
    preloadComponent(() => import('@/components/products/ProductList'));
    preloadComponent(() => import('@/components/products/ProductForm'));
  },
  
  wallet: () => {
    preloadComponent(() => import('@/components/wallet/WalletOverview'));
    preloadComponent(() => import('@/components/wallet/TransactionHistory'));
  },
  
  settings: () => {
    preloadComponent(() => import('@/components/dashboard/BotSettings'));
  },
};

// Component size tracking for optimization
export const ComponentSizes = {
  small: ['QuickActions', 'ServerOverview'], // < 50KB
  medium: ['ProductList', 'BotSettings'], // 50-200KB
  large: ['PerformanceDashboard', 'TransactionHistory'], // > 200KB
};

export default LazyComponents;