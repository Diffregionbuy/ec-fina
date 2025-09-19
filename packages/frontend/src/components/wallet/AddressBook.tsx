'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert } from '@/components/ui/Alert';
import { toast } from '@/components/ui/Toast';
import { Plus, Edit2, Trash2, Copy, Check, BookOpen } from 'lucide-react';

interface SavedAddress {
  id: string;
  name: string;
  address: string;
  currency: string;
  network: string;
  tag?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddressBookProps {
  onSelectAddress: (address: SavedAddress) => void;
  selectedCurrency?: string;
  selectedNetwork?: string;
}

export function AddressBook({ onSelectAddress, selectedCurrency, selectedNetwork }: AddressBookProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const loadInFlightRef = useRef(false);

  // Server-backed main wallet; no local persistence

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    currency: selectedCurrency || '',
    network: selectedNetwork || '',
    tag: '',
  });

  useEffect(() => {
    // Only load if we haven't loaded successfully before
    if (!hasLoadedOnce) {
      console.log('🔄 AddressBook: Initial load triggered');
      loadAddresses();
    } else {
      console.log('✅ AddressBook: Already loaded, skipping');
    }
  }, [hasLoadedOnce]);

  // Quiet noisy debug logs during typing/renders
  // (Remove or re-enable locally if needed)

  useEffect(() => {
    // Update form currency/network when props change
    if (selectedCurrency && selectedNetwork) {
      setFormData(prev => ({
        ...prev,
        currency: selectedCurrency,
        network: selectedNetwork,
      }));
    }
  }, [selectedCurrency, selectedNetwork]);

  const loadAddresses = async () => {
    try {
      if (loadInFlightRef.current) {
        return; // prevent duplicate loads (StrictMode double-invoke, rapid clicks)
      }
      loadInFlightRef.current = true;
      setIsLoading(true);
      console.log('Loading addresses from Supabase API...'); // Debug log
      
      // Use shared client (adds dedupe + session handling)
      const result = await apiClient.getWalletAddresses();
      console.log('API response:', result); // Debug log
      const addressesData = (result as any)?.data?.addresses || (result as any)?.addresses || (result as any)?.data || result;
      
      if (Array.isArray(addressesData)) {
        console.log('Setting addresses:', addressesData);
        setAddresses(addressesData);
        setHasLoadedOnce(true); // Mark as successfully loaded
      } else {
        console.warn('API did not return an array:', addressesData);
        // Only set empty if we haven't loaded successfully before
        if (!hasLoadedOnce) {
          setAddresses([]);
        }
      }
    } catch (error) {
      console.error('Failed to load addresses from API:', error);
      toast.error('Failed to load saved addresses');
      // Only set empty if we haven't loaded successfully before
      if (!hasLoadedOnce) {
        setAddresses([]);
      }
    } finally {
      setIsLoading(false);
      loadInFlightRef.current = false;
    }
  };

  const saveAddress = async (addressData: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('Saving address to Supabase API:', addressData); // Debug log
      
      const response = await fetch('/api/backend/wallet/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addressData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Save address API response:', result); // Debug log
      
      // Reload addresses after successful save
      setHasLoadedOnce(false); // Reset to allow reload
      await loadAddresses();
      
      return result;
    } catch (error) {
      console.error('Failed to save address to API:', error);
      toast.error('Failed to save address');
      throw error;
    }
  };

  const updateAddress = async (id: string, addressData: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('Updating address via API:', id, addressData); // Debug log
      
      const response = await fetch(`/api/backend/wallet/addresses/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addressData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Update address API response:', result); // Debug log
      
      // Reload addresses after successful update
      setHasLoadedOnce(false); // Reset to allow reload
      await loadAddresses();
      
      return result;
    } catch (error) {
      console.error('Failed to update address via API:', error);
      toast.error('Failed to update address');
      throw error;
    }
  };

  const deleteAddress = async (id: string) => {
    try {
      console.log('Deleting address via API:', id); // Debug log
      
      const response = await fetch(`/api/backend/wallet/addresses/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Delete address API response:', result); // Debug log
      
      // Reload addresses after successful delete
      setHasLoadedOnce(false); // Reset to allow reload
      await loadAddresses();
      
      return result;
    } catch (error) {
      console.error('Failed to delete address via API:', error);
      toast.error('Failed to delete address');
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.address.trim() || !formData.currency || !formData.network) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingAddress) {
        // Update existing address
        await updateAddress(editingAddress.id, formData);
        toast.success('Address updated successfully');
        setEditingAddress(null);
      } else {
        // Add new address
        await saveAddress(formData);
        toast.success('Address saved successfully');
      }

      // Reset form
      setFormData({
        name: '',
        address: '',
        currency: selectedCurrency || '',
        network: selectedNetwork || '',
        tag: '',
      });
      setShowAddForm(false);
    } catch (error) {
      // Error handling is done in the API functions
      console.error('Form submission error:', error);
    }
  };

  const handleEdit = (address: SavedAddress) => {
    setEditingAddress(address);
    setFormData({
      name: address.name,
      address: address.address,
      currency: address.currency,
      network: address.network,
      tag: address.tag || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this address?')) {
      try {
        await deleteAddress(id);
        toast.success('Address deleted successfully');
      } catch (error) {
        // Error handling is done in the deleteAddress function
        console.error('Delete error:', error);
      }
    }
  };

  const handleCopy = async (address: string, id: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy address');
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingAddress(null);
    setFormData({
      name: '',
      address: '',
      currency: selectedCurrency || '',
      network: selectedNetwork || '',
      tag: '',
    });
  };

  // Show ALL saved addresses regardless of selected coin/network
  const filteredAddresses = addresses;

  // Do not auto-select default to avoid flashing when opening Address Book

  const setAsMain = async (addr: SavedAddress) => {
    try {
      const resp = await fetch(`/api/backend/wallet/addresses/${addr.id}/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast.success('Set as main wallet');
      // Reload addresses to reflect server state
      setHasLoadedOnce(false);
      await loadAddresses();
      try { onSelectAddress(addr); } catch {}
    } catch (e) {
      toast.error('Failed to set main wallet');
    }
  };

  // Suppress per-render debug logs to avoid console spam while typing

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
          <span className="ml-3 text-gray-600">Loading address book...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Address Book</h3>
          <span className="text-sm text-gray-500">({addresses.length} saved)</span>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <Card className="p-4 bg-gray-50 border-dashed">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., My Main Wallet"
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    placeholder="e.g., BTC, ETH, USDT"
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Network <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.network}
                    onChange={(e) => setFormData(prev => ({ ...prev, network: e.target.value }))}
                    placeholder="e.g., BTC-Bitcoin, USDT-TRC20"
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Memo/Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={(e) => setFormData(prev => ({ ...prev, tag: e.target.value }))}
                    placeholder="Required for XRP, EOS, etc."
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Enter wallet address"
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div className="flex items-center space-x-3">
                <Button type="submit" size="sm">
                  {editingAddress ? 'Update Address' : 'Save Address'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Address List */}
        {addresses.length === 0 ? (
          <Alert
            variant="default"
            title="No saved addresses"
            description={"Start by adding your frequently used wallet addresses for quick access."}
          />
        ) : (
          <div className="space-y-3">
            {addresses.map((address) => (
              <Card key={address.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="font-medium text-gray-900">{address.name}</h4>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {address.currency}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        {address.network}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 mb-1">
                      <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded truncate max-w-md">
                        {address.address}
                      </code>
                      <button
                        onClick={() => handleCopy(address.address, address.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Copy address"
                      >
                        {copiedId === address.id ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {address.tag && (
                      <div className="text-sm text-gray-500">
                        Memo/Tag: <code className="bg-gray-100 px-1 rounded">{address.tag}</code>
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-2">
                      Added {new Date(address.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {address.isDefault ? (
                      <span
                        className="px-3 py-1 text-sm rounded-md bg-blue-100 text-blue-700 font-medium"
                        title={`Main Wallet for ${address.currency} on ${address.network}`}
                      >
                        Main Wallet
                      </span>
                    ) : (
                      <Button
                        onClick={() => setAsMain(address)}
                        size="sm"
                        variant="outline"
                      >
                        Set as Main Wallet
                      </Button>
                    )}
                    <button
                      onClick={() => handleEdit(address)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit address"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(address.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete address"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
