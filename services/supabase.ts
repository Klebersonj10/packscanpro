import { createClient } from '@supabase/supabase-js';

/**
 * Configuração do Supabase.
 * Utilizamos os valores fornecidos diretamente no código como fallback para garantir
 * que o cliente seja inicializado mesmo se as variáveis de ambiente do Vite falharem.
 */

const DEFAULT_URL = 'https://mmqjtswnezofrklgaowy.supabase.co';
const DEFAULT_KEY = 'sb_publishable_Vwp32EANk8gO3SplAvvEnw_zO4lZnsV';

// O Vite substitui process.env.* durante o build. Usamos fallbacks para segurança total.
const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;

const initSupabase = () => {
  // Validação final das chaves para evitar erros silenciosos
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === '' || supabaseAnonKey === '') {
    console.error("ERRO: Credenciais do Supabase não detectadas ou inválidas.");
    return null;
  }

  // Verifica se a URL é válida antes de tentar criar o cliente
  if (!supabaseUrl.startsWith('http')) {
    console.error("ERRO: URL do Supabase inválida:", supabaseUrl);
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.error("Falha crítica ao criar cliente Supabase:", err);
    return null;
  }
};

export const supabase = initSupabase();