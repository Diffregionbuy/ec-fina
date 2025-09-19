const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: './packages/backend/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findServer() {
  try {
    const testId = '417297319814496256';
    
    console.log(`Looking for Discord server ID: ${testId}`);
    
    // Get all servers to see their discord_server_id values
    const { data: allServers, error: allError } = await supabase
      .from('servers')
      .select('id, name, discord_server_id, bot_config')
      .order('created_at', { ascending: false });
    
    if (allError) {
      console.error('Error fetching all servers:', allError);
      return;
    }
    
    console.log('\nAll servers in database:');
    allServers.forEach((server, index) => {
      console.log(`${index + 1}. Name: ${server.name}`);
      console.log(`   UUID: ${server.id}`);
      console.log(`   Discord Server ID: "${server.discord_server_id}" (type: ${typeof server.discord_server_id})`);
      console.log(`   Bot Config: ${server.bot_config ? Object.keys(server.bot_config).length + ' keys' : 'null/empty'}`);
      console.log('');
    });
    
    // Try exact match
    const { data: exactMatch, error: exactError } = await supabase
      .from('servers')
      .select('*')
      .eq('discord_server_id', testId);
    
    console.log(`\nExact match for "${testId}":`, exactError ? `ERROR: ${exactError.message}` : `Found ${exactMatch?.length || 0} results`);
    
    if (exactMatch && exactMatch.length > 0) {
      console.log('Matched server:', JSON.stringify(exactMatch[0], null, 2));
    }
    
    // Try to find partial matches
    const matches = allServers.filter(s => s.discord_server_id && s.discord_server_id.includes(testId.slice(-6)));
    console.log(`\nPartial matches (last 6 digits):`, matches.length);
    matches.forEach(match => {
      console.log(`- ${match.name}: ${match.discord_server_id}`);
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

findServer().then(() => {
  process.exit(0);
});