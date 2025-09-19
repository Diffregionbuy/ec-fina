'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Bot, Zap, Shield, DollarSign, ArrowRight, Star, TrendingUp, Users, CheckCircle } from 'lucide-react';
import { UserDropdown } from '@/components/layout/UserDropdown';

export default function Home() {
  // Use direct useSession without any redirect logic
  const { data: session, status } = useSession();
  
  console.log('🏠 Clean homepage - No auth redirects');


  const features = [
    {
      icon: Bot,
      title: 'Advanced Bot Setup',
      description: 'Deploy sophisticated Discord bots with enterprise-grade templates and automated configuration.',
    },
    {
      icon: DollarSign,
      title: 'OKX Integration',
      description: 'Seamless cryptocurrency payments with real-time processing and automated delivery systems.',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level security protocols with 99.99% uptime and advanced threat protection.',
    },
    {
      icon: Zap,
      title: 'Real-time Analytics',
      description: 'Comprehensive performance metrics and revenue tracking with advanced reporting tools.',
    },
  ];

  const stats = [
    { label: 'Active Servers', value: '10,000+', icon: Users },
    { label: 'Revenue Generated', value: '$2.5M+', icon: TrendingUp },
    { label: 'Uptime', value: '99.99%', icon: CheckCircle },
    { label: 'User Rating', value: '4.9/5', icon: Star },
  ];

  // Simple loading state without any redirect logic
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[rgb(var(--background))] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[rgb(var(--primary))] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))]">
      {/* Navigation */}
      <nav className="border-b border-[rgb(var(--border))] backdrop-blur-md bg-[rgb(var(--background))]/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">EcBot</span>
            </div>
            <div className="flex items-center space-x-4">
              {status === 'authenticated' ? (
                <UserDropdown />
              ) : (
                <Link href="/auth/signin">
                  <Button className="btn btn-primary px-6 py-2">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--background))] via-[rgb(var(--card))] to-[rgb(var(--background))]"></div>
        <div className="absolute inset-0 opacity-50" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center animate-fade-in">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-[rgb(var(--card))] border border-[rgb(var(--border))] mb-8">
              <Star className="w-4 h-4 text-[rgb(var(--primary))] mr-2" />
              <span className="text-sm text-[rgb(var(--muted-foreground))]">Trusted by 10,000+ Discord servers</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-[rgb(var(--foreground))] to-[rgb(var(--muted-foreground))] bg-clip-text text-transparent">
              Professional Discord
              <br />
              <span className="bg-gradient-to-r from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 bg-clip-text text-transparent">
                Commerce Platform
              </span>
            </h1>
            
            <p className="text-xl text-[rgb(var(--muted-foreground))] mb-12 max-w-3xl mx-auto leading-relaxed">
              Enterprise-grade Discord bot infrastructure for Minecraft servers. 
              Advanced payment processing, automated delivery, and comprehensive analytics.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link href="/auth/signin">
                <Button className="btn btn-primary px-8 py-4 text-lg font-medium animate-glow">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button className="btn btn-outline px-8 py-4 text-lg font-medium">
                View Documentation
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="flex items-center justify-center mb-2">
                    <stat.icon className="w-5 h-5 text-[rgb(var(--primary))] mr-2" />
                    <span className="text-2xl font-bold text-[rgb(var(--foreground))]">{stat.value}</span>
                  </div>
                  <p className="text-sm text-[rgb(var(--muted-foreground))]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-[rgb(var(--foreground))]">
              Enterprise-Grade Features
            </h2>
            <p className="text-xl text-[rgb(var(--muted-foreground))] max-w-3xl mx-auto">
              Built for scale with institutional-level security and performance standards.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="card card-hover p-8 group">
                <CardContent className="p-0">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-[rgb(var(--primary))]/10 rounded-xl flex items-center justify-center group-hover:bg-[rgb(var(--primary))]/20 transition-colors">
                      <feature.icon className="h-6 w-6 text-[rgb(var(--primary))]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-[rgb(var(--foreground))] mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-[rgb(var(--muted-foreground))] leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--primary))]/10 to-[rgb(var(--primary))]/5"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-[rgb(var(--foreground))] mb-6">
            Ready to Scale Your Community?
          </h2>
          <p className="text-xl text-[rgb(var(--muted-foreground))] mb-12 max-w-2xl mx-auto">
            Join the leading Discord commerce platform trusted by enterprise communities worldwide.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signin">
              <Button className="btn btn-primary px-8 py-4 text-lg font-medium">
                Get Started Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button className="btn btn-ghost px-8 py-4 text-lg font-medium">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgb(var(--border))] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary))]/80 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">EcBot</span>
            </div>
            <div className="text-sm text-[rgb(var(--muted-foreground))]">
              © 2024 EcBot. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}