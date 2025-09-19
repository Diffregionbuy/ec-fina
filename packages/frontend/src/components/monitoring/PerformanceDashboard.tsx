'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database, 
  Download,
  RefreshCw,
  Server,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';

interface PerformanceData {
  performance: {
    overview: {
      totalRequests: number;
      totalErrors: number;
      avgResponseTime: number;
      errorRate: number;
      cacheHitRate: number;
      slowQueries: number;
      memoryLeaks: number;
      cpuSpikes: number;
    };
    endpoints: Array<{
      endpoint: string;
      count: number;
      totalTime: number;
      errors: number;
      avgResponseTime: number;
      p95ResponseTime: number;
      p99ResponseTime: number;
      errorRate: number;
    }>;
    hourlyTrends: Array<{
      hour: string;
      requests: number;
      errors: number;
      avgResponseTime: number;
      errorRate: number;
    }>;
  };
  systemHealth: {
    memory: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    cpu: {
      user: number;
      system: number;
    };
    system: {
      uptime: number;
      loadAverage: number[];
      freeMemory: number;
      totalMemory: number;
      cpuCount: number;
    };
  };
  optimization: {
    score: number;
    recommendations: string[];
    criticalIssues: string[];
  };
  cache: {
    stats: {
      hits: number;
      misses: number;
      sets: number;
      deletes: number;
      errors: number;
      hitRate: number;
      avgCachedResponseTime: number;
      avgTotalResponseTime: number;
      totalRequests: number;
    };
    health: {
      redis: boolean;
      memory: any;
    };
  };
  trends: {
    responseTime: { trend: string; change: number };
    errorRate: { trend: string; change: number };
    throughput: { trend: string; change: number };
  };
  alerts: Array<{
    type: string;
    category: string;
    message: string;
    severity: string;
    timestamp: string;
  }>;
}

export default function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/monitoring/dashboard', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch monitoring data');
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data.dashboard);
        setError(null);
      } else {
        throw new Error(result.error?.message || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  const exportData = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/monitoring/export?format=${format}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-data-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getTrendIcon = (trend: string, change: number) => {
    if (trend === 'increasing') {
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    } else if (trend === 'decreasing') {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return <div className="h-4 w-4" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading performance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return <div>No data available</div>;
  }

  const chartColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time monitoring and analytics for your Discord Shop Bot SaaS
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto Refresh On' : 'Auto Refresh Off'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportData('json')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportData('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Active Alerts</h2>
          {data.alerts.slice(0, 5).map((alert, index) => (
            <Alert key={index} variant={getSeverityColor(alert.severity) as any}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="capitalize">{alert.severity} - {alert.category}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance Score</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.optimization.score}/100</div>
            <Progress value={data.optimization.score} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {data.optimization.score >= 80 ? 'Excellent' : 
               data.optimization.score >= 60 ? 'Good' : 
               data.optimization.score >= 40 ? 'Fair' : 'Poor'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div className="text-2xl font-bold">
                {data.performance.overview.avgResponseTime.toFixed(0)}ms
              </div>
              {getTrendIcon(data.trends.responseTime.trend, data.trends.responseTime.change)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.trends.responseTime.change > 0 ? '+' : ''}{data.trends.responseTime.change.toFixed(1)}% from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div className="text-2xl font-bold">
                {data.performance.overview.errorRate.toFixed(1)}%
              </div>
              {getTrendIcon(data.trends.errorRate.trend, data.trends.errorRate.change)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.performance.overview.totalErrors} errors out of {data.performance.overview.totalRequests} requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.performance.overview.cacheHitRate.toFixed(1)}%
            </div>
            <Progress value={data.performance.overview.cacheHitRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {data.cache.stats.hits} hits, {data.cache.stats.misses} misses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Response Time Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Response Time Trends</CardTitle>
                <CardDescription>Hourly average response times</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.performance.hourlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                      formatter={(value: number) => [`${value.toFixed(0)}ms`, 'Response Time']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avgResponseTime" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Error Rate Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Error Rate Trends</CardTitle>
                <CardDescription>Hourly error rates</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.performance.hourlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Error Rate']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="errorRate" 
                      stroke="#ff7300" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Optimization Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Optimization Recommendations</CardTitle>
              <CardDescription>AI-powered suggestions to improve performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.optimization.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <span className="text-sm">{recommendation}</span>
                  </div>
                ))}
                {data.optimization.recommendations.length === 0 && (
                  <p className="text-muted-foreground">No recommendations at this time. Your system is performing well!</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Memory Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
                <CardDescription>Current memory consumption</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Heap Used</span>
                      <span>{data.systemHealth.memory.heapUsed}MB</span>
                    </div>
                    <Progress 
                      value={(data.systemHealth.memory.heapUsed / data.systemHealth.memory.heapTotal) * 100} 
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>System Memory</span>
                      <span>{((data.systemHealth.system.totalMemory - data.systemHealth.system.freeMemory) / data.systemHealth.system.totalMemory * 100).toFixed(1)}%</span>
                    </div>
                    <Progress 
                      value={((data.systemHealth.system.totalMemory - data.systemHealth.system.freeMemory) / data.systemHealth.system.totalMemory) * 100} 
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Info */}
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Server health and status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Uptime</span>
                    <span className="text-sm font-medium">{formatUptime(data.systemHealth.system.uptime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Load Average</span>
                    <span className="text-sm font-medium">{data.systemHealth.system.loadAverage[0].toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">CPU Cores</span>
                    <span className="text-sm font-medium">{data.systemHealth.system.cpuCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Free Memory</span>
                    <span className="text-sm font-medium">{data.systemHealth.system.freeMemory}MB</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Performance</CardTitle>
              <CardDescription>Response times and error rates by endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.performance.endpoints.slice(0, 10).map((endpoint, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{endpoint.endpoint}</div>
                      <div className="text-xs text-muted-foreground">
                        {endpoint.count} requests • {endpoint.errors} errors
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">{endpoint.avgResponseTime.toFixed(0)}ms</div>
                        <div className="text-xs text-muted-foreground">avg</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{endpoint.p95ResponseTime.toFixed(0)}ms</div>
                        <div className="text-xs text-muted-foreground">p95</div>
                      </div>
                      <Badge variant={endpoint.errorRate > 5 ? "destructive" : endpoint.errorRate > 1 ? "default" : "secondary"}>
                        {endpoint.errorRate.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cache Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Cache Performance</CardTitle>
                <CardDescription>Redis cache statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Cache Status</span>
                    <Badge variant={data.cache.health.redis ? "default" : "destructive"}>
                      {data.cache.health.redis ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Hit Rate</span>
                    <span className="text-sm font-medium">{data.cache.stats.hitRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Requests</span>
                    <span className="text-sm font-medium">{data.cache.stats.totalRequests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Cache Operations</span>
                    <span className="text-sm font-medium">{data.cache.stats.sets + data.cache.stats.deletes}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cache Hit/Miss Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Cache Hit/Miss Ratio</CardTitle>
                <CardDescription>Visual representation of cache performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Hits', value: data.cache.stats.hits, fill: '#82ca9d' },
                        { name: 'Misses', value: data.cache.stats.misses, fill: '#ff7300' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {[
                        { name: 'Hits', value: data.cache.stats.hits, fill: '#82ca9d' },
                        { name: 'Misses', value: data.cache.stats.misses, fill: '#ff7300' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}