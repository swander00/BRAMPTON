import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { config } from './credentials.js';

// Create Supabase client for general use (with anon key)
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Create Supabase admin client for backend operations (with service role key)
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Log connection status
logger.info('Supabase clients initialized', {
  url: config.supabase.url,
  hasAdminClient: !!supabaseAdmin
});

export default supabase;
