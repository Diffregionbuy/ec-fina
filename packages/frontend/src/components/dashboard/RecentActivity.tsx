'use client';

import { useState, useEffect } from 'react';
import { Server, Order } from '@/types/dashboard';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient } from '@/lib/api-client';
import { 
  ShoppingBag, 
  User, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  TrendingUp,
  Calendar
} from 'lucide-react';

interface RecentActivityProps {
  server: Server;
}

export function RecentActivity({ server }: RecentActivityProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentOrders();
  }, [server.id]);

  const fetchRecentOrders = async () => {
    try {
      setLoading(true);
      
      // For now, use empty orders since we don't have orders API yet
      // In the future, this would call: apiClient.getRecentOrders(server.id)
      setOrders([]);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch recent orders:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return CheckCircle;
      case 'paid':
        return Clock;
      case 'pending':
        return AlertCircle;
      case 'failed':
        return XCircle;
      default:
        return AlertCircle;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'text-green-600 bg-green-100';
      case 'paid':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    }
  };

  const getTodayStats = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= today;
    });

    const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total_amount, 0);
    
    return {
      orders: todayOrders.length,
      revenue: todayRevenue
    };
  };

  const todayStats = getTodayStats();

  return (
    <div className="space-y-6">
      {/* Today's Stats */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Today's Performance</h3>
          <p className="text-gray-600">Sales activity for today</p>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-900">{todayStats.orders}</div>
              <div className="text-sm text-blue-600">Orders</div>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-green-900">
                {formatCurrency(todayStats.revenue)}
              </div>
              <div className="text-sm text-green-600">Revenue</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
              <p className="text-gray-600">Latest transactions from your server</p>
            </div>
            <a
              href={`/dashboard/servers/${server.id}/orders`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All
            </a>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" className="mr-2" />
              <span className="text-gray-600">Loading recent activity...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No recent orders</p>
              <p className="text-sm text-gray-400">
                Orders will appear here once customers start purchasing
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {order.items.map(item => item.product_name).join(', ')}
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <span>User #{order.discord_user_id.slice(-4)}</span>
                        <span>•</span>
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatTimeAgo(order.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(order.total_amount)}
                    </div>
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {(() => {
                        const StatusIcon = getStatusIcon(order.status);
                        return <StatusIcon className="w-3 h-3 mr-1" />;
                      })()}
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}