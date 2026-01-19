import { createClient } from '@supabase/supabase-js';

// Função segura para acessar variáveis de ambiente sem quebrar o script
const getSafeEnv = (key: string, fallback: string): string => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
  } catch (e) {}
  return fallback;
};

const supabaseUrl = getSafeEnv('SUPABASE_URL', 'https://mmqjtswnezofrklgaowy.supabase.co');
const supabaseAnonKey = getSafeEnv('SUPABASE_ANON_KEY', 'sb_publishable_Vwp32EANk8gO3SplAvvEnw_zO4lZnsV');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});