import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  SUPABASE_SERVICE_ROLE_KEY 
} from './config.js';

// Create Supabase client for general use (with anon key)
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Create Supabase admin client for backend operations (with service role key)
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Log connection status
logger.info('Supabase clients initialized', {
  url: SUPABASE_URL,
  hasAdminClient: !!supabaseAdmin
});

export default supabase;
