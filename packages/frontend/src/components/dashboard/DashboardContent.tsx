'use client';

import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Bot, Users, ShoppingBag, Wallet, TrendingUp, Activity } from 'lucide-react';

export function DashboardContent() {
  const { user } = useAuth();

  const stats = [
    {
      name: 'Total Revenue',
      value: '$2,847.50',
      change: '+12.5%',
      changeType: 'positive' as const,
      icon: Wallet,
      color: 'bg-green-500',
    },
    {
      name: 'Active Servers',
      value: '3',
      change: '+1',
      changeType: 'positive' as const,
      icon: Bot,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Customers',
      value: '1,247',
      change: '+23',
      changeType: 'positive' as const,
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      name: 'Products Sold',
      value: '89',
      change: '+5.2%',
      changeType: 'positive' as const,
      icon: ShoppingBag,
      color: 'bg-orange-500',
    },
  ];

  const recentActivity = [
    {
      id: '1',
      type: 'sale',
      description: 'VIP Rank purchased by @user123',
      amount: '$25.00',
      time: '2 minutes ago',
      server: 'My Awesome Server',
    },
    {
      id: '2',
      type: 'server',
      description: 'Bot invited to Gaming Community',
      time: '1 hour ago',
      server: 'Gaming Community',
    },
    {
      id: '3',
      type: 'sale',
      description: 'Diamond Kit purchased by @player456',
      amount: '$15.00',
      time: '3 hours ago',
      server: 'My Awesome Server',
    },
    {
      id: '4',
      type: 'withdrawal',
      description: 'Withdrawal request processed',
      amount: '$150.00',
      time: '1 day ago',
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.name}!
        </h1>
        <p className="text-gray-600 mt-1">
          Here's an overview of your Discord bot performance and earnings across all servers.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <Card key={stat.name} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-600">
                    {stat.name}
                  </p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {stat.value}
                    </p>
                    <span className={`ml-2 text-sm font-medium ${
                      stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stat.change}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Quick Actions
            </h3>
            <p className="text-gray-600">
              Common tasks to manage your Discord bots
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <h4 className="font-medium text-gray-900">Add New Server</h4>
                  <p className="text-sm text-gray-600">
                    Invite the bot to a new Discord server
                  </p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                  Add Server
                </button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <h4 className="font-medium text-gray-900">Create Product</h4>
                  <p className="text-sm text-gray-600">
                    Add a new product to sell in your servers
                  </p>
                </div>
                <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                  Create
                </button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div>
                  <h4 className="font-medium text-gray-900">View Analytics</h4>
                  <p className="text-sm text-gray-600">
                    Check detailed performance metrics
                  </p>
                </div>
                <button className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors">
                  View
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Recent Activity
            </h3>
            <p className="text-gray-600">
              Latest updates from all your servers
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'sale' ? 'bg-green-500' :
                    activity.type === 'server' ? 'bg-blue-500' :
                    'bg-orange-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.description}
                    </p>
                    {activity.server && (
                      <p className="text-xs text-gray-500">
                        {activity.server}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {activity.time}
                    </p>
                  </div>
                  {activity.amount && (
                    <div className="text-sm font-medium text-green-600">
                      {activity.amount}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium">
                View All Activity
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}