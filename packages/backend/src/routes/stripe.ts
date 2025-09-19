import express from 'express';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Mock Stripe data for development
const mockPaymentMethods = [
  {
    id: 'pm_1234567890',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2025,
    },
    created: Date.now() - 86400000, // 1 day ago
    customer: 'cus_mock_customer',
  },
  {
    id: 'pm_0987654321',
    type: 'us_bank_account',
    us_bank_account: {
      account_type: 'checking',
      bank_name: 'Chase Bank',
      last4: '6789',
      routing_number: '021000021',
    },
    created: Date.now() - 172800000, // 2 days ago
    customer: 'cus_mock_customer',
  },
];

const mockWithdrawals = [
  {
    id: 'po_1234567890',
    amount: 10000, // $100.00 in cents
    currency: 'usd',
    status: 'paid',
    arrival_date: Date.now() + 86400000, // Tomorrow
    method: mockPaymentMethods[0],
    fee: 250, // $2.50 in cents
    created: Date.now() - 3600000, // 1 hour ago
  },
  {
    id: 'po_0987654321',
    amount: 5000, // $50.00 in cents
    currency: 'usd',
    status: 'in_transit',
    arrival_date: Date.now() + 172800000, // Day after tomorrow
    method: mockPaymentMethods[1],
    fee: 250, // $2.50 in cents
    created: Date.now() - 7200000, // 2 hours ago
  },
];

// Get user's payment methods
router.get('/payment-methods', authenticateToken, async (req, res) => {
  try {
    // In a real implementation, you would:
    // 1. Get the user's Stripe customer ID from the database
    // 2. Call Stripe API to get their payment methods
    // 3. Return the formatted payment methods
    
    // For now, return mock data
    res.json({
      success: true,
      data: mockPaymentMethods,
    });
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch payment methods',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Create setup intent for adding new payment method
router.post('/setup-intent', authenticateToken, async (req, res) => {
  try {
    // In a real implementation, you would:
    // 1. Get or create a Stripe customer for the user
    // 2. Create a SetupIntent with Stripe
    // 3. Return the client_secret
    
    // For now, return mock setup intent
    res.json({
      success: true,
      data: {
        client_secret: 'seti_mock_client_secret_' + Date.now(),
      },
    });
  } catch (error) {
    console.error('Failed to create setup intent:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create setup intent',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Create a withdrawal
router.post('/withdrawals', authenticateToken, async (req, res) => {
  try {
    const { amount, currency, payment_method_id, description } = req.body;

    // Validate request
    if (!amount || !currency || !payment_method_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: amount, currency, payment_method_id',
        },
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Amount must be greater than 0',
        },
      });
    }

    // Find the payment method
    const paymentMethod = mockPaymentMethods.find(pm => pm.id === payment_method_id);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Payment method not found',
        },
      });
    }

    // Calculate fee based on payment method type
    let fee = 0;
    if (paymentMethod.type === 'card') {
      fee = Math.round(amount * 0.025); // 2.5% for cards
    } else if (paymentMethod.type === 'us_bank_account' || paymentMethod.type === 'bank_account') {
      fee = 250; // $2.50 for bank transfers
    } else {
      fee = Math.round(amount * 0.015); // 1.5% default
    }

    // In a real implementation, you would:
    // 1. Verify user has sufficient balance
    // 2. Create a payout with Stripe
    // 3. Update user's balance in database
    // 4. Create transaction record
    
    // Create mock withdrawal
    const withdrawal = {
      id: 'po_mock_' + Date.now(),
      amount,
      currency,
      status: 'pending',
      arrival_date: Date.now() + (paymentMethod.type === 'card' ? 0 : 86400000 * 3), // Instant for cards, 3 days for bank
      method: paymentMethod,
      fee,
      created: Date.now(),
    };

    // Add to mock withdrawals
    mockWithdrawals.unshift(withdrawal);

    res.json({
      success: true,
      data: withdrawal,
    });
  } catch (error) {
    console.error('Failed to create withdrawal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create withdrawal',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Get withdrawal history
router.get('/withdrawals', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    // In a real implementation, you would:
    // 1. Query withdrawals from database for the authenticated user
    // 2. Apply pagination and filtering
    // 3. Return formatted results
    
    const withdrawals = mockWithdrawals.slice(0, limit);
    
    res.json({
      success: true,
      data: withdrawals,
    });
  } catch (error) {
    console.error('Failed to fetch withdrawals:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch withdrawals',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Delete a payment method
router.delete('/payment-methods/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find payment method
    const methodIndex = mockPaymentMethods.findIndex(pm => pm.id === id);
    if (methodIndex === -1) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Payment method not found',
        },
      });
    }

    // In a real implementation, you would:
    // 1. Verify the payment method belongs to the authenticated user
    // 2. Call Stripe API to detach the payment method
    // 3. Update database records
    
    // Remove from mock data
    mockPaymentMethods.splice(methodIndex, 1);

    res.json({
      success: true,
      data: { message: 'Payment method deleted successfully' },
    });
  } catch (error) {
    console.error('Failed to delete payment method:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete payment method',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;