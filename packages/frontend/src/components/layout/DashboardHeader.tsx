'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useState } from 'react';
import { useAccountManager } from '@/hooks/useAccountManager';
import { 
  Bot, 
  User, 
  LogOut, 
  Settings, 
  Wallet, 
  CreditCard,
  HelpCircle,
  ChevronDown,
  UserPlus,
  AlertTriangle
} from 'lucide-react';

export function DashboardHeader() {
  const { data: session } = useSession();
  const {
    currentAccount,
    isMultipleAccounts,
    switchAccount,
    clearAllAccounts
  } = useAccountManager();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  const userMenuItems = [
    { name: 'Account Settings', href: '/dashboard/account', icon: Settings },
    { name: 'Billing & Wallet', href: '/dashboard/wallet', icon: Wallet },
    { name: 'Subscription', href: '/dashboard/subscription', icon: CreditCard },
    { name: 'Help & Support', href: '/dashboard/help', icon: HelpCircle },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">EcBot</span>
          </Link>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg p-2 transition-colors"
            >
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
              )}
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium text-gray-900">
                  {session?.user?.name}
                </div>
                <div className="text-xs text-gray-500">
                  {session?.user?.email}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* User Dropdown */}
            {isUserMenuOpen && (
              <>
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
                  {/* User Info */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      {session?.user?.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || 'User'}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="h-10 w-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-600" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {session?.user?.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {session?.user?.email}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Multiple Accounts Warning */}
                  {isMultipleAccounts && (
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="flex items-start space-x-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium">Multiple Discord Accounts</div>
                          <div className="text-amber-700">You have multiple Discord accounts. Use "Switch Account" to change.</div>
                        </div>
                      </div>
                      <button
                        onClick={switchAccount}
                        className="flex items-center w-full mt-2 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 rounded transition-colors"
                      >
                        <UserPlus className="w-3 h-3 mr-2" />
                        Switch Discord Account
                      </button>
                    </div>
                  )}

                  {/* Menu Items */}
                  <div className="py-2">
                    {userMenuItems.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <item.icon className="h-4 w-4 mr-3 text-gray-400" />
                        {item.name}
                      </Link>
                    ))}
                  </div>

                  {/* Sign Out */}
                  <div className="border-t border-gray-100 pt-2">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4 mr-3 text-gray-400" />
                      Sign Out
                    </button>
                  </div>
                </div>

                {/* Overlay */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}