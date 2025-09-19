import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from '@/providers/Providers';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingComponents';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap', // Optimize font loading
  preload: true
});

export const metadata = {
  title: 'EcBot - Discord Bot Platform',
  description: 'Create and manage Discord bots for your Minecraft server',
  keywords: 'Discord bot, Minecraft, server management, automation',
  authors: [{ name: 'EcBot Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Preload critical resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//api.discord.com" />
        <link rel="dns-prefetch" href="//cdn.discordapp.com" />
      </head>
      <body className={inter.className}>
        <Suspense fallback={<LoadingSpinner />}>
          <Providers>
            {children}
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}