'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  Bot, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle,
  ArrowLeft,
  Copy,
  Shield,
  MessageSquare,
  Users
} from 'lucide-react';

function InvitePageContent() {
  const params = useParams();
  const router = useRouter();
  const { servers, selectedServer, setSelectedServerId } = useServerContext();
  const [copied, setCopied] = useState(false);
  
  const serverId = params.serverId as string;
  
  useEffect(() => {
    if (servers.length > 0 && serverId) {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        setSelectedServerId(serverId);
      }
    }
  }, [servers, serverId, setSelectedServerId]);

  const generateInviteUrl = () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_BOT_CLIENT_ID || '1390575948134350928';
    const permissions = '8'; // Administrator permissions
    const scope = 'bot%20applications.commands';
    
    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}&guild_id=${serverId}`;
  };

  const copyInviteUrl = async () => {
    try {
      await navigator.clipboard.writeText(generateInviteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleInviteBot = () => {
    window.open(generateInviteUrl(), '_blank');
  };

  const handleBackToDashboard = () => {
    router.push(`/dashboard/servers/${serverId}`);
  };

  if (!selectedServer) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" className="mr-3" />
          <span className="text-lg text-gray-600">Loading server...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={handleBackToDashboard}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Invite EcBot to {selectedServer.name}
        </h1>
        <p className="text-gray-600">
          Add EcBot to your Discord server to start selling products and managing your community.
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Invite Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Invite EcBot</h3>
                <p className="text-gray-600">Add the bot to your Discord server</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">What EcBot will do:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  Create and manage product listings
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  Process customer orders and payments
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  Send automated messages and notifications
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  Manage customer roles and permissions
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleInviteBot}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                size="lg"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Invite EcBot to Discord
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={generateInviteUrl()}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
                />
                <Button
                  onClick={copyInviteUrl}
                  variant="outline"
                  size="sm"
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permissions Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Permissions</h3>
                <p className="text-gray-600">What EcBot needs to function</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Administrator Permission</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      EcBot requests administrator permissions to ensure it can manage all aspects of your store, including creating channels, managing roles, and processing orders.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Key permissions include:</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center">
                    <MessageSquare className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />
                    Send and manage messages
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    Manage roles and permissions
                  </div>
                  <div className="flex items-center">
                    <Shield className="w-4 h-4 text-purple-500 mr-2 flex-shrink-0" />
                    Create and manage channels
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Security Note:</strong> You can always modify or revoke these permissions later in your Discord server settings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Steps */}
      <Card className="mt-8">
        <CardHeader>
          <h3 className="text-xl font-semibold text-gray-900">After Inviting the Bot</h3>
          <p className="text-gray-600">Complete these steps to get your store running</p>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Configure Bot</h4>
              <p className="text-sm text-gray-600">
                Set up your bot's appearance, prefix, and basic settings
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold">2</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Add Products</h4>
              <p className="text-sm text-gray-600">
                Create your first products and organize them into categories
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold">3</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Start Selling</h4>
              <p className="text-sm text-gray-600">
                Your store is ready! Customers can now browse and purchase
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <InvitePageContent />
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}