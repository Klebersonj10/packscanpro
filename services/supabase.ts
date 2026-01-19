
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://mmqjtswnezofrklgaowy.supabase.co';
const DEFAULT_KEY = 'sb_publishable_Vwp32EANk8gO3SplAvvEnw_zO4lZnsV';

const getEnvVar = (key: string, fallback: string): string => {
  const val = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  if (!val || val === 'undefined' || val === 'null' || val === '') return fallback;
  return String(val);
};

const supabaseUrl = getEnvVar('SUPABASE_URL', DEFAULT_URL);
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY', DEFAULT_KEY);

const initSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    console.warn("Aviso: Credenciais do Supabase não configuradas corretamente. Usando defaults.");
  }

  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: storage,
        flowType: 'pkce'
      }
    });
  } catch (err) {
    console.error("Erro ao inicializar cliente Supabase:", err);
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    });
  }
};

export const supabase = initSupabase();
