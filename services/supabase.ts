import { createClient } from '@supabase/supabase-js';

// Função auxiliar para obter variáveis de ambiente com segurança
const getEnv = (key: string, fallback: string): string => {
  try {
    // Tenta obter do process.env (Vite define ou Node)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
    // Tenta obter do import.meta.env (Vite nativo)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[`VITE_${key}`]) {
      // @ts-ignore
      return import.meta.env[`VITE_${key}`] as string;
    }
  } catch (e) {}
  return fallback;
};

const supabaseUrl = getEnv('SUPABASE_URL', 'https://mmqjtswnezofrklgaowy.supabase.co');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY', 'sb_publishable_Vwp32EANk8gO3SplAvvEnw_zO4lZnsV');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
