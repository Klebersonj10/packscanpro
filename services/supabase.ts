import { createClient } from '@supabase/supabase-js';

// Função para capturar variáveis de ambiente de forma segura
const getEnv = (key: string): string => {
  if (typeof window !== 'undefined' && (window as any).process?.env?.[key]) {
    return (window as any).process.env[key];
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string;
  }
  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL') || 'https://oocyvbexigpaqgucqcwc.supabase.co';
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY') || 'sb_publishable_UE3CY9AkCcnRTPNVyvPQaQ_2DNwzY_w';

const createSafeClient = () => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    console.error("Supabase Error: Configurações ausentes ou URL inválida.", { url: supabaseUrl });
    return null;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
};

export const supabase = createSafeClient();