"use client";

import React from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ServerProvider, useServerContext } from "@/contexts/ServerContext";
import { useServerAnalytics } from "@/hooks/useServerAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/skeleton";

// Simple chart component that doesn't rely on recharts
const SimpleChart = ({ type, data, dataKey, xAxisKey, color }: { 
  type: string, 
  data: any[], 
  dataKey: string, 
  xAxisKey: string, 
  color: string 
}) => {
  // Create a basic visualization without recharts
  const maxValue = Math.max(...data.map(item => item[dataKey]));
  
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between text-xs text-gray-500 mb-2">
        <span>0</span>
        <span>{maxValue}</span>
      </div>
      <div className="flex-1 flex items-end space-x-1">
        {data.map((item, index) => {
          const height = (item[dataKey] / maxValue) * 100;
          return (
            <div key={index} className="flex flex-col items-center flex-1">
              <div 
                className="w-full rounded-t" 
                style={{ 
                  height: `${height}%`, 
                  backgroundColor: color,
                  minHeight: '4px'
                }}
              />
              <div className="text-xs mt-1 truncate w-full text-center">
                {typeof item[xAxisKey] === 'string' ? 
                  item[xAxisKey].substring(0, 3) : 
                  item[xAxisKey]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Placeholder component to show while charts are loading
const ChartPlaceholder = ({ isLoading, hasData, message }: { isLoading: boolean, hasData: boolean, message: string }) => {
  if (isLoading) {
    return <Skeleton className="w-full h-full" />;
  }
  
  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }
  
  return null;
};

function AnalyticsPageContent({ serverId }: { serverId: string }) {
  // Pass undefined instead of empty string to properly handle the serverId
  const validServerId = serverId || undefined;
  const { data: analyticsData, isLoading, error } = useServerAnalytics(validServerId);
  const { setSelectedServerId } = useServerContext();

  // Set the selected server ID when the component mounts
  React.useEffect(() => {
    if (serverId) {
      setSelectedServerId(serverId);
    }
  }, [serverId, setSelectedServerId]);

  if (error) {
    console.error("Error loading analytics data:", error);
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Server Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily Orders Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Orders</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : analyticsData?.dailyOrders ? (
              <SimpleChart 
                type="line"
                data={analyticsData.dailyOrders}
                dataKey="count"
                xAxisKey="date"
                color="#8884d8"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">No order data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : analyticsData?.revenue ? (
              <SimpleChart 
                type="line"
                data={analyticsData.revenue}
                dataKey="amount"
                xAxisKey="date"
                color="#82ca9d"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">No revenue data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : analyticsData?.topProducts ? (
              <SimpleChart 
                type="bar"
                data={analyticsData.topProducts}
                dataKey="sales"
                xAxisKey="name"
                color="#8884d8"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">No product data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Activity */}
        <Card>
          <CardHeader>
            <CardTitle>User Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : analyticsData?.userActivity ? (
              <SimpleChart 
                type="line"
                data={analyticsData.userActivity}
                dataKey="users"
                xAxisKey="date"
                color="#ff7300"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">No user activity data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface AnalyticsPageProps {
  params: {
    serverId: string;
  };
}

export default function AnalyticsPage({ params }: AnalyticsPageProps) {
  return (
    <ProtectedRoute>
      <ServerProvider>
        <DashboardLayout>
          <AnalyticsPageContent serverId={params.serverId} />
        </DashboardLayout>
      </ServerProvider>
    </ProtectedRoute>
  );
}