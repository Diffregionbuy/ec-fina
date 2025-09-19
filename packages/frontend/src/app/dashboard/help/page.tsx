'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider } from '@/contexts/ServerContext';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  HelpCircle, 
  MessageCircle, 
  Book, 
  Video, 
  Mail, 
  ExternalLink,
  Search,
  Zap,
  Users,
  Settings
} from 'lucide-react';

export default function HelpPage() {
  const helpCategories = [
    {
      title: 'Getting Started',
      icon: Zap,
      color: 'bg-green-500',
      articles: [
        'Setting up your first Discord bot',
        'Inviting the bot to your server',
        'Creating your first product',
        'Understanding bot permissions'
      ]
    },
    {
      title: 'Bot Configuration',
      icon: Settings,
      color: 'bg-blue-500',
      articles: [
        'Customizing bot appearance',
        'Setting up commands and prefixes',
        'Configuring welcome messages',
        'Managing roles and permissions'
      ]
    },
    {
      title: 'Store Management',
      icon: Users,
      color: 'bg-purple-500',
      articles: [
        'Adding and organizing products',
        'Setting up categories',
        'Managing inventory and stock',
        'Processing orders and deliveries'
      ]
    }
  ];

  const quickActions = [
    {
      title: 'Contact Support',
      description: 'Get help from our support team',
      icon: MessageCircle,
      action: 'mailto:support@ecbot.com',
      color: 'bg-indigo-600'
    },
    {
      title: 'Join Discord',
      description: 'Connect with the community',
      icon: Users,
      action: 'https://discord.gg/ecbot',
      color: 'bg-indigo-600'
    },
    {
      title: 'Video Tutorials',
      description: 'Watch step-by-step guides',
      icon: Video,
      action: 'https://youtube.com/ecbot',
      color: 'bg-red-600'
    },
    {
      title: 'Documentation',
      description: 'Read detailed guides',
      icon: Book,
      action: 'https://docs.ecbot.com',
      color: 'bg-gray-600'
    }
  ];

  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <div className="p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Help & Support</h1>
              <p className="text-gray-600">
                Find answers to your questions and get help with EcBot
              </p>
            </div>

            {/* Search Bar */}
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search for help articles, guides, or common questions..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {quickActions.map((action) => (
                <a
                  key={action.title}
                  href={action.action}
                  target={action.action.startsWith('http') ? '_blank' : undefined}
                  rel={action.action.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="group"
                >
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardContent className="p-6 text-center">
                      <div className={`${action.color} w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform`}>
                        <action.icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">{action.title}</h3>
                      <p className="text-sm text-gray-600">{action.description}</p>
                      <ExternalLink className="w-4 h-4 text-gray-400 mx-auto mt-2 group-hover:text-gray-600" />
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>

            {/* Help Categories */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {helpCategories.map((category) => (
                <Card key={category.title}>
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <div className={`${category.color} w-10 h-10 rounded-lg flex items-center justify-center`}>
                        <category.icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{category.title}</h3>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <ul className="space-y-3">
                      {category.articles.map((article) => (
                        <li key={article}>
                          <a
                            href="#"
                            className="text-gray-600 hover:text-indigo-600 hover:underline text-sm transition-colors"
                          >
                            {article}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <Button variant="outline" size="sm" className="w-full mt-4">
                      View All Articles
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* FAQ Section */}
            <Card className="mt-8">
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <HelpCircle className="w-5 h-5 mr-2" />
                  Frequently Asked Questions
                </h3>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none">
                      <span>How do I invite the bot to my Discord server?</span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24">
                          <path d="m6 9 6 6 6-6"></path>
                        </svg>
                      </span>
                    </summary>
                    <p className="text-gray-600 mt-3 text-sm">
                      You can invite the bot by clicking the "Invite Bot" button in your server settings or during the onboarding process. Make sure you have "Manage Server" permissions on your Discord server.
                    </p>
                  </details>

                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none">
                      <span>What permissions does the bot need?</span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24">
                          <path d="m6 9 6 6 6-6"></path>
                        </svg>
                      </span>
                    </summary>
                    <p className="text-gray-600 mt-3 text-sm">
                      The bot needs permissions to send messages, embed links, manage roles, and read message history. These permissions are automatically requested when you invite the bot.
                    </p>
                  </details>

                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none">
                      <span>How do I create and sell products?</span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24">
                          <path d="m6 9 6 6 6-6"></path>
                        </svg>
                      </span>
                    </summary>
                    <p className="text-gray-600 mt-3 text-sm">
                      Navigate to the Products section in your server dashboard, click "Add Product", fill in the details like name, price, and description, then save. Your product will be available for purchase through Discord commands.
                    </p>
                  </details>

                  <details className="group">
                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none">
                      <span>How do I withdraw my earnings?</span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24">
                          <path d="m6 9 6 6 6-6"></path>
                        </svg>
                      </span>
                    </summary>
                    <p className="text-gray-600 mt-3 text-sm">
                      Go to your Wallet page, set up your payment method (crypto wallet address), and request a withdrawal. Minimum withdrawal amount is $10, and processing typically takes 1-3 business days.
                    </p>
                  </details>
                </div>
              </CardContent>
            </Card>

            {/* Contact Support */}
            <Card className="mt-8 bg-indigo-50 border-indigo-200">
              <CardContent className="p-6 text-center">
                <Mail className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-indigo-900 mb-2">Still need help?</h3>
                <p className="text-indigo-700 mb-4">
                  Our support team is here to help you with any questions or issues.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button className="bg-indigo-600 hover:bg-indigo-700">
                    <Mail className="w-4 h-4 mr-2" />
                    Email Support
                  </Button>
                  <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Live Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}