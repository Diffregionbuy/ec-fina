import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setup Your Bot | EcBot',
  description: 'Set up your Discord bot for your server',
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
}