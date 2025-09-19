'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider } from '@/contexts/ServerContext';
import { CryptoWithdrawal } from '@/components/wallet/CryptoWithdrawal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export default function WalletPage() {
  const [custodyMode, setCustodyMode] = useState<'non_custody' | 'custody'>('non_custody');
  const [loadingMode, setLoadingMode] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiClient.getWalletMode();
        if (mounted && res?.data?.mode) setCustodyMode(res.data.mode as any);
      } catch {}
      finally { if (mounted) setLoadingMode(false); }
    })();
    return () => { mounted = false; };
  }, []);

  async function onCustodyChange(value: string) {
    const mode = value === 'custody' ? 'custody' : 'non_custody';
    setCustodyMode(mode);
    try { await apiClient.setWalletMode(mode); } catch {}
  }

  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <div className="p-8 space-y-8 max-w-4xl">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Wallet</h1>
              <p className="text-gray-600">
                Manage crypto payouts now, with fiat options coming soon.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <Tabs defaultValue="crypto" className="space-y-4">
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="fiat">Fiat</TabsTrigger>
                  </TabsList>
                  <div className="text-sm text-gray-500">Choose how funds are handled</div>
                </div>

                <TabsContent value="crypto" className="space-y-4">
                  <div>
                    <Tabs value={custodyMode} onValueChange={onCustodyChange}>
                      <TabsList>
                        <TabsTrigger value="non_custody">Non-Custody</TabsTrigger>
                        <TabsTrigger value="custody">Custody</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="text-sm text-gray-600">
                    {custodyMode === 'non_custody'
                      ? 'We send proceeds directly to your external wallet address.'
                      : 'Funds are held in your platform balance until you withdraw.'}
                  </div>
                  {/* Two dropdowns (coin + network) and a textbox (address) with optional memo/tag */}
                  <CryptoWithdrawal wallet={null} onSuccess={() => {}} />
                </TabsContent>

                <TabsContent value="fiat" className="space-y-2">
                  <h2 className="text-xl font-semibold">Fiat</h2>
                  <p className="text-gray-600">
                    Fiat deposits and withdrawals will be available here.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}
