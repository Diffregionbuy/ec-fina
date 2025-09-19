import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get server analytics data
router.get('/servers/:serverId/analytics', authenticateToken, async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Mock data for demonstration - in a real implementation, this would fetch from a database
    const analyticsData = {
      dailyOrders: [
        { date: '2025-08-15', count: 5 },
        { date: '2025-08-16', count: 8 },
        { date: '2025-08-17', count: 12 },
        { date: '2025-08-18', count: 10 },
        { date: '2025-08-19', count: 15 },
        { date: '2025-08-20', count: 18 },
        { date: '2025-08-21', count: 20 },
      ],
      topProducts: [
        { name: 'Premium Role', sales: 45 },
        { name: 'VIP Access', sales: 32 },
        { name: 'Custom Emotes', sales: 28 },
        { name: 'Server Boost', sales: 24 },
        { name: 'Private Channel', sales: 18 }
      ],
      revenue: [
        { date: '2025-08-15', amount: 125 },
        { date: '2025-08-16', amount: 210 },
        { date: '2025-08-17', amount: 350 },
        { date: '2025-08-18', amount: 275 },
        { date: '2025-08-19', amount: 425 },
        { date: '2025-08-20', amount: 510 },
        { date: '2025-08-21', amount: 580 },
      ],
      userActivity: [
        { date: '2025-08-15', users: 120 },
        { date: '2025-08-16', users: 145 },
        { date: '2025-08-17', users: 165 },
        { date: '2025-08-18', users: 152 },
        { date: '2025-08-19', users: 178 },
        { date: '2025-08-20', users: 195 },
        { date: '2025-08-21', users: 210 },
      ]
    };

    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

export default router;
