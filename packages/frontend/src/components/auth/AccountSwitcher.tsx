'use client';

import { useState } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { 
  User, 
  ChevronDown, 
  LogOut, 
  UserPlus,
  AlertCircle 
} from 'lucide-react';

interface DiscordAccount {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string;
}

export function AccountSwitcher() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<DiscordAccount[]>([]);

  const currentAccount = session?.user;

  const handleSwitchAccount = async () => {
    // Sign out current session and prompt for new login
    await signOut({ redirect: false });
    await signIn('discord');
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (!currentAccount) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {currentAccount.image ? (
          <img
            src={currentAccount.image}
            alt={currentAccount.name || 'User'}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-gray-600" />
          </div>
        )}
        <div className="text-left">
          <div className="text-sm font-medium text-gray-900">
            {currentAccount.name}
          </div>
          <div className="text-xs text-gray-500">
            Discord Account
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
            {/* Current Account */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                {currentAccount.image ? (
                  <img
                    src={currentAccount.image}
                    alt={currentAccount.name || 'User'}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div>
                  <div className="font-medium text-gray-900">
                    {currentAccount.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {currentAccount.email}
                  </div>
                  <div className="text-xs text-green-600 font-medium">
                    Currently Active
                  </div>
                </div>
              </div>
            </div>

            {/* Account Actions */}
            <div className="py-2">
              <button
                onClick={handleSwitchAccount}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <UserPlus className="w-4 h-4 mr-3 text-gray-400" />
                Switch Discord Account
              </button>
              
              <div className="px-4 py-2">
                <div className="flex items-start space-x-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Multiple Accounts Detected</div>
                    <div>Use "Switch Account" to change your active Discord account</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-2 mt-2">
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-3 text-gray-400" />
                  Sign Out Completely
                </button>
              </div>
            </div>
          </div>

          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        </>
      )}
    </div>
  );
}