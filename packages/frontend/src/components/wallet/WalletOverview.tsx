'use client';

import React from 'react';

interface WalletOverviewProps {
  className?: string;
}

export const WalletOverview: React.FC<WalletOverviewProps> = ({ className }) => {
  return (
    <div className={`wallet-overview ${className || ''}`}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Wallet Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800">Total Balance</h3>
            <p className="text-2xl font-bold text-blue-600">$0.00</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800">Available</h3>
            <p className="text-2xl font-bold text-green-600">$0.00</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800">Pending</h3>
            <p className="text-2xl font-bold text-yellow-600">$0.00</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletOverview;