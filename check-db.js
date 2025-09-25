import { createClient } from '@supabase/supabase-js';
import { setProcessEnv } from './src/config/credentials.js';

setProcessEnv();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkTables() {
  console.log('📊 Checking database table counts...\n');
  
  // Check Property table
  const { count: propertyCount, error: propertyError } = await supabase
    .from('Property')
    .select('*', { count: 'exact', head: true });
  
  if (propertyError) {
    console.error('❌ Property table error:', propertyError.message);
  } else {
    console.log(`🏠 Properties: ${propertyCount?.toLocaleString() || 0}`);
  }
  
  // Check Media table
  const { count: mediaCount, error: mediaError } = await supabase
    .from('Media')
    .select('*', { count: 'exact', head: true });
  
  if (mediaError) {
    console.error('❌ Media table error:', mediaError.message);
  } else {
    console.log(`📸 Media: ${mediaCount?.toLocaleString() || 0}`);
  }
  
  // Check PropertyRooms table
  const { count: roomsCount, error: roomsError } = await supabase
    .from('PropertyRooms')
    .select('*', { count: 'exact', head: true });
  
  if (roomsError) {
    console.error('❌ PropertyRooms table error:', roomsError.message);
  } else {
    console.log(`🏠 Rooms: ${roomsCount?.toLocaleString() || 0}`);
  }
  
  // Check OpenHouse table
  const { count: openHouseCount, error: openHouseError } = await supabase
    .from('OpenHouse')
    .select('*', { count: 'exact', head: true });
  
  if (openHouseError) {
    console.error('❌ OpenHouse table error:', openHouseError.message);
  } else {
    console.log(`🏠 Open Houses: ${openHouseCount?.toLocaleString() || 0}`);
  }
  
  console.log('\n✅ Database check completed');
}

checkTables().catch(console.error);
