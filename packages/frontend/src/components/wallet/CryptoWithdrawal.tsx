'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { toast } from '@/components/ui/Toast';
import { AddressBook } from './AddressBook';
import { Wallet } from '@/types/dashboard';
import { ChevronDown, Search, Wifi, WifiOff, BookOpen, CheckCircle } from 'lucide-react';
import { tatumApiService, ProcessedCoin, ProcessedNetwork } from '@/services/tatumApi';
import { apiClient } from '@/lib/api-client';

interface CryptoWithdrawalProps {
  wallet: Wallet | null;
  onSuccess: () => void;
}

// Elegant coin icon component with fallback
const CoinIcon = ({ src, symbol, size = 'md' }: { src: string; symbol: string; size?: 'sm' | 'md' | 'lg' }) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg'
  };

  if (imageError || !src) {
    return (
      <div className={`${sizeClasses[size]} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold ${textSizes[size]} shadow-md`}>
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} relative`}>
      {isLoading && (
        <div className={`${sizeClasses[size]} bg-gray-200 rounded-full animate-pulse`} />
      )}
      <img
        src={src}
        alt={symbol}
        className={`${sizeClasses[size]} rounded-full object-cover shadow-md transition-opacity duration-200 ${isLoading ? 'opacity-0 absolute inset-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setImageError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );
};

// Network status indicator
const NetworkStatus = ({ network }: { network: ProcessedNetwork }) => {
  const isActive = network.canWithdraw && network.canDeposit;
  
  return (
    <div className="flex items-center space-x-1">
      {isActive ? (
        <Wifi className="w-3 h-3 text-green-500" />
      ) : (
        <WifiOff className="w-3 h-3 text-red-500" />
      )}
      <span className={`text-xs ${isActive ? 'text-green-600' : 'text-red-600'}`}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
};

export function CryptoWithdrawal({ wallet, onSuccess }: CryptoWithdrawalProps) {
  const [coins, setCoins] = useState<ProcessedCoin[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<ProcessedCoin | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<ProcessedNetwork | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [memoTag, setMemoTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showCoinDropdown, setShowCoinDropdown] = useState(false);
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
  const [coinSearchTerm, setCoinSearchTerm] = useState('');
  const [networkSearchTerm, setNetworkSearchTerm] = useState('');
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [walletSetupSuccess, setWalletSetupSuccess] = useState(false);

  // Load coins and networks from OKX API
  useEffect(() => {
    const loadCoinsAndNetworks = async () => {
      setIsLoading(true);
      try {
        const processedCoins = await tatumApiService.getProcessedCoinsAndNetworks();
        console.log('[Wallet/CryptoWithdrawal] Loaded Tatum processedCoins:', processedCoins.length, processedCoins.slice(0, 5).map(c => ({ symbol: c.symbol, networks: c.networks.length })));
        setCoins(processedCoins);
        
        // Auto-select first coin and its first network
        if (processedCoins.length > 0) {
          const firstCoin = processedCoins[0];
          console.log('[Wallet/CryptoWithdrawal] Auto-selecting first coin:', firstCoin.symbol, 'networks:', firstCoin.networks.length);
          setSelectedCoin(firstCoin);
          if (firstCoin.networks.length > 0) {
            console.log('[Wallet/CryptoWithdrawal] Auto-selecting first network:', firstCoin.networks[0].name);
            setSelectedNetwork(firstCoin.networks[0]);
          }
        } else {
          console.warn('[Wallet/CryptoWithdrawal] No processed coins loaded. Check currencies endpoint/proxy and OKX credentials.');
        }
      } catch (error) {
        console.error('[Wallet/CryptoWithdrawal] Failed to load coins/networks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCoinsAndNetworks();
  }, []);

  // Filter coins based on search term
  const filteredCoins = coins.filter(coin =>
    coin.symbol.toLowerCase().includes(coinSearchTerm.toLowerCase()) ||
    coin.name.toLowerCase().includes(coinSearchTerm.toLowerCase())
  );

  // Filter networks based on search term
  const filteredNetworks = selectedCoin?.networks.filter(network =>
    network.name.toLowerCase().includes(networkSearchTerm.toLowerCase()) ||
    network.chain.toLowerCase().includes(networkSearchTerm.toLowerCase())
  ) || [];

  const handleCoinSelect = (coin: ProcessedCoin) => {
    setSelectedCoin(coin);
    setSelectedNetwork(coin.networks[0] || null);
    setShowCoinDropdown(false);
    setCoinSearchTerm('');
  };

  const handleNetworkSelect = (network: ProcessedNetwork) => {
    setSelectedNetwork(network);
    setShowNetworkDropdown(false);
    setNetworkSearchTerm('');
  };

  const handleAddressSelect = (savedAddress: {
    id: string;
    name: string;
    address: string;
    currency: string;
    network: string;
    tag?: string;
    createdAt: string;
    updatedAt: string;
  }) => {
    console.log('Selected address from AddressBook:', savedAddress);
    
    setWalletAddress(savedAddress.address);
    setMemoTag(savedAddress.tag || '');
    
    // Find and select the matching coin and network
    const matchingCoin = coins.find(coin => coin.symbol === savedAddress.currency);
    if (matchingCoin) {
      console.log('Found matching coin:', matchingCoin.symbol);
      setSelectedCoin(matchingCoin);
      const matchingNetwork = matchingCoin.networks.find(network => network.chain === savedAddress.network);
      if (matchingNetwork) {
        console.log('Found matching network:', matchingNetwork.name);
        setSelectedNetwork(matchingNetwork);
      } else {
        console.warn('No matching network found for:', savedAddress.network);
      }
    } else {
      console.warn('No matching coin found for:', savedAddress.currency);
    }
    
    setShowAddressBook(false);
    toast.success('Address loaded from address book', `Using ${savedAddress.name}`);
  };

  // Determine if memo/tag is required for the selected coin
  const requiresMemo = selectedCoin && selectedNetwork && (
    selectedCoin.symbol === 'XRP' ||
    selectedCoin.symbol === 'EOS' ||
    selectedCoin.symbol === 'XLM' ||
    selectedCoin.symbol === 'ATOM' ||
    selectedCoin.symbol === 'BNB' ||
    selectedCoin.symbol === 'MEMO' ||
    selectedCoin.symbol === 'KAVA' ||
    selectedCoin.symbol === 'LUNA' ||
    selectedCoin.symbol === 'OSMO'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress || !selectedCoin || !selectedNetwork) return;

    // Validate memo/tag if required
    if (requiresMemo && !memoTag.trim()) {
      toast.error(
        'Memo/Tag Required',
        `${selectedCoin.symbol === 'XRP' ? 'Destination tag' : 'Memo'} is required for ${selectedCoin.symbol} transactions.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiClient.setupWallet({
        wallet_address: walletAddress,
        ccy: selectedCoin.symbol,
        chain: selectedNetwork.chain,
        tag: requiresMemo ? memoTag.trim() : '',
      });

      
      // Show success feedback
      setWalletSetupSuccess(true);
      toast.success(
        'Wallet Setup Complete!',
        `Your ${selectedCoin.symbol} wallet address has been configured successfully.`
      );
      
      // Call the parent success handler
      onSuccess();
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setWalletSetupSuccess(false);
      }, 5000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to setup wallet. Please try again.';
      toast.error('Wallet Setup Failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-8">
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
            <span className="ml-3 text-gray-600">Loading supported cryptocurrencies...</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Success Message */}
      {walletSetupSuccess && (
        <Alert
          variant="success"
          title="Wallet Setup Complete!"
          description={`Your ${selectedCoin?.symbol} wallet address has been configured successfully. All future transactions will be automatically transferred to your specified address.`}
        >
          <div className="mt-3 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium">Ready to receive payments</span>
          </div>
        </Alert>
      )}

      <Card className="p-8">
        <div className="space-y-8">
          {/* Step 1: Select Coin */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Select Coin</h3>
              <div className="text-sm text-gray-500">({coins.length} supported)</div>
            </div>
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCoinDropdown(!showCoinDropdown)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {selectedCoin && (
                    <>
                      <CoinIcon src={selectedCoin.logoUrl} symbol={selectedCoin.symbol} size="md" />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{selectedCoin.symbol}</div>
                        <div className="text-sm text-gray-500">{selectedCoin.name}</div>
                      </div>
                    </>
                  )}
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showCoinDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showCoinDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-hidden">
                  {/* Search input */}
                  <div className="p-3 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search coins..."
                        value={coinSearchTerm}
                        onChange={(e) => setCoinSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                  
                  {/* Coin list */}
                  <div className="max-h-60 overflow-y-auto">
                    {filteredCoins.length > 0 ? (
                      filteredCoins.map((coin) => (
                        <button
                          key={coin.symbol}
                          onClick={() => handleCoinSelect(coin)}
                          className="w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                        >
                          <CoinIcon src={coin.logoUrl} symbol={coin.symbol} size="md" />
                          <div className="text-left flex-1">
                            <div className="font-medium text-gray-900">{coin.symbol}</div>
                            <div className="text-sm text-gray-500">{coin.name}</div>
                            <div className="text-xs text-gray-400">{coin.networks.length} networks</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No coins found matching "{coinSearchTerm}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Select Withdrawal Method */}
          {selectedCoin && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Select Withdrawal Method</h3>
              </div>


              {/* Network Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Network ({selectedCoin.networks.length} available)
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {selectedNetwork && (
                        <>
                          <CoinIcon src={selectedNetwork.logoUrl} symbol={selectedNetwork.symbol} size="md" />
                          <div className="text-left">
                            <div className="font-medium text-gray-900">{selectedNetwork.name}</div>
                            <div className="text-sm text-gray-500">Fee: {selectedNetwork.fee}</div>
                            <NetworkStatus network={selectedNetwork} />
                          </div>
                        </>
                      )}
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showNetworkDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showNetworkDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-hidden">
                      {/* Search input */}
                      <div className="p-3 border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search networks..."
                            value={networkSearchTerm}
                            onChange={(e) => setNetworkSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                      </div>
                      
                      {/* Network list */}
                      <div className="max-h-60 overflow-y-auto">
                        {filteredNetworks.length > 0 ? (
                          filteredNetworks.map((network) => (
                            <button
                              key={network.id}
                              onClick={() => handleNetworkSelect(network)}
                              className="w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                            >
                              <CoinIcon src={network.logoUrl} symbol={network.symbol} size="md" />
                              <div className="text-left flex-1">
                                <div className="font-medium text-gray-900">{network.name}</div>
                                <div className="text-sm text-gray-500">
                                  Fee: {network.fee} • Min: {network.minAmount} • Time: {network.withdrawalTime}
                                </div>
                                <NetworkStatus network={network} />
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center text-gray-500 text-sm">
                            No networks found matching "{networkSearchTerm}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Wallet Address */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddressBook(!showAddressBook)}
                    className="flex items-center space-x-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>{showAddressBook ? 'Hide' : 'Address Book'}</span>
                  </Button>
                </div>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Enter wallet address or select from address book"
                  className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                
                {/* Address Book - Now positioned right after the address input */}
                {showAddressBook && (
                  <div className="mt-4">
                    <AddressBook
                      onSelectAddress={handleAddressSelect}
                      selectedCurrency={selectedCoin?.symbol}
                      selectedNetwork={selectedNetwork?.chain}
                    />
                  </div>
                )}
              </div>

              {/* Memo/Destination Tag (conditional) */}
              {requiresMemo && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Memo/Destination Tag
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={memoTag}
                    onChange={(e) => setMemoTag(e.target.value)}
                    placeholder={`Enter ${selectedCoin?.symbol === 'XRP' ? 'destination tag' : 'memo'}`}
                    className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-amber-600">
                    ⚠️ {selectedCoin?.symbol} requires a {selectedCoin?.symbol === 'XRP' ? 'destination tag' : 'memo'}. 
                    Transactions without this may be lost permanently.
                  </p>
                </div>
              )}

              {/* Info about automatic transfers */}
              {selectedNetwork && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Automatic Transfer</p>
                    <p>All transactions will be automatically transferred to your specified wallet address.</p>
                    <p className="mt-2 text-xs">
                      Network fee: {selectedNetwork.fee} • Min amount: {selectedNetwork.minAmount} • Processing time: {selectedNetwork.withdrawalTime}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!walletAddress || !selectedCoin || !selectedNetwork || isSubmitting}
            className="w-full py-4 text-lg font-semibold"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Setting up wallet...
              </>
            ) : (
              'Set Withdrawal Address'
            )}
          </Button>

          {/* Disclaimer */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>• Please double-check the withdrawal address and network before confirming.</p>
            <p>• For coins requiring memo/tag (XRP, EOS, XLM, etc.), ensure the memo/tag is correct.</p>
            <p>• Withdrawals to incorrect addresses, networks, or memo/tags cannot be recovered.</p>
            <p>• Processing time may vary depending on network congestion.</p>
            <p>• Data provided by OKX API - {coins.length} cryptocurrencies supported across multiple networks.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
