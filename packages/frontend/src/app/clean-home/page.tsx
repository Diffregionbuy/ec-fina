'use client';

import Link from 'next/link';

export default function CleanHome() {
  console.log('🧹 Clean homepage loaded - no auth logic at all');
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Simple Navigation */}
      <nav className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-xl font-bold">EcBot</div>
          <div className="space-x-4">
            <Link href="/auth/signin" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">
            Professional Discord
            <br />
            <span className="text-blue-400">Commerce Platform</span>
          </h1>
          
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Enterprise-grade Discord bot infrastructure for Minecraft servers. 
            Advanced payment processing, automated delivery, and comprehensive analytics.
          </p>
          
          <div className="flex gap-4 justify-center">
            <Link href="/auth/signin" className="bg-blue-600 hover:bg-blue-700 px-8 py-4 text-lg font-medium rounded">
              Start Free Trial
            </Link>
            <button className="border border-gray-600 hover:border-gray-500 px-8 py-4 text-lg font-medium rounded">
              View Documentation
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-xl font-bold mb-4">EcBot</div>
          <div className="text-sm text-gray-400">
            © 2024 EcBot. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}