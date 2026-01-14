import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://mmqjtswnezofrklgaowy.supabase.co';
const DEFAULT_KEY = 'sb_publishable_Vwp32EANk8gO3SplAvvEnw_zO4lZnsV';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

const initSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === "" || supabaseAnonKey === "") {
    console.error("Erro: Credenciais do Supabase não encontradas.");
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        flowType: 'pkce'
      }
    });
  } catch (err) {
    console.error("Erro ao inicializar cliente Supabase:", err);
    return null;
  }
};

export const supabase = initSupabase();