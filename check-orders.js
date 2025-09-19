const { createClient } = require('@supabase/supabase-js');

// Read environment variables from backend .env
require('dotenv').config({ path: './packages/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
  try {
    console.log('Checking recent payment orders...');
    
    const { data: orders, error } = await supabase
      .from('payment_orders')
      .select('id, order_number, status, crypto_info, created_at, expected_amount')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }
    
    console.log('Recent orders:');
    orders.forEach(order => {
      console.log(`- ${order.id} (${order.order_number})`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Expected: ${order.expected_amount}`);
      console.log(`  Address: ${order.crypto_info?.address || 'N/A'}`);
      console.log(`  Coin: ${order.crypto_info?.coin || 'N/A'}`);
      console.log(`  Created: ${order.created_at}`);
      console.log('');
    });
    
    // Test with the first order
    if (orders.length > 0) {
      const testOrder = orders[0];
      console.log(`Testing with order: ${testOrder.id}`);
      
      // Check if the order has crypto_info
      if (!testOrder.crypto_info?.address) {
        console.log('❌ Order has no crypto address');
      } else {
        console.log('✅ Order has crypto address:', testOrder.crypto_info.address);
      }
    }
    
  } catch (error) {
    console.error('Failed to check orders:', error);
  }
}

checkOrders();