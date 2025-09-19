'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { 
  User, 
  LogOut, 
  Settings, 
  ChevronDown,
  LayoutDashboard
} from 'lucide-react';

export function UserDropdown() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  const menuItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Account Settings', href: '/dashboard/account', icon: Settings },
  ];

  if (!session?.user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-[rgb(var(--foreground))] hover:text-[rgb(var(--foreground))] focus:outline-none rounded-lg p-2 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className="h-8 w-8 rounded-full border border-[rgb(var(--border))]"
          />
        ) : (
          <div className="h-8 w-8 bg-[rgb(var(--card))] rounded-full flex items-center justify-center border border-[rgb(var(--border))]">
            <User className="h-4 w-4 text-[rgb(var(--muted-foreground))]" />
          </div>
        )}
        <ChevronDown className="w-4 h-4 text-[rgb(var(--muted-foreground))]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[rgb(var(--card))] rounded-lg shadow-lg py-2 z-50 border border-[rgb(var(--border))]">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-[rgb(var(--border))]">
            <div className="flex items-center space-x-3">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="h-10 w-10 bg-[rgb(var(--card))] rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-[rgb(var(--muted-foreground))]" />
                </div>
              )}
              <div>
                <div className="font-medium text-[rgb(var(--foreground))]">
                  {session.user.name}
                </div>
                <div className="text-sm text-[rgb(var(--muted-foreground))]">
                  {session.user.email}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {menuItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center px-4 py-2 text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="h-4 w-4 mr-3 text-[rgb(var(--muted-foreground))]" />
                {item.name}
              </Link>
            ))}
          </div>

          {/* Sign Out */}
          <div className="border-t border-[rgb(var(--border))] pt-2">
            <button
              onClick={handleSignOut}
              className="flex items-center w-full px-4 py-2 text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
            >
              <LogOut className="h-4 w-4 mr-3 text-[rgb(var(--muted-foreground))]" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}