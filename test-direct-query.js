const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: './packages/backend/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDirectQuery() {
  try {
    const serverId = '417297319814496256';
    
    console.log('Testing the exact query from bot-service.ts...');
    
    // This is the exact query from the backend
    const { data: server, error } = await supabase
      .from('servers')
      .select('bot_config, name, subscription_tier')
      .eq('discord_server_id', serverId)
      .single();

    console.log('Query result:');
    console.log('Error:', error);
    console.log('Data:', server);
    
    if (server) {
      console.log('\nBot config keys:', Object.keys(server.bot_config || {}));
      console.log('Templates keys:', Object.keys(server.bot_config?.templates || {}));
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testDirectQuery().then(() => {
  process.exit(0);
});