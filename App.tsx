import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, ArrowLeft, Loader2, Scan, ChevronRight, 
  LayoutList, Camera, MapPin, LogOut, Table, 
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ShieldCheck,
  TrendingUp, Database, Sparkles, Edit3, Save, Send, Globe, Phone, Settings,
  Tag, BarChart3, PieChart, Info, Users, Box, Hash, Globe2, AlertTriangle, Search,
  Building2, ImageIcon, FileText, ClipboardList, X, Maximize2, Mail, ThumbsUp, ThumbsDown,
  Trash2, Clock, MessageSquare, CheckCircle
} from 'lucide-react';
import { InspectionList, ProductEntry, ListStatus, User, ExtractedData, AppNotification } from './types.ts';
import { SmartScanner } from './components/CameraCapture.tsx';
import { ManualUpload } from './components/ManualUpload.tsx';
import { extractDataFromPhotos } from './services/geminiService.ts';
import { supabase } from './services/supabase.ts';
import * as XLSX from 'xlsx';

const getErrorMessage = (err: any): string => {
  if (!err) return "Erro desconhecido";
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error_description && typeof err.error_description === 'string') return err.error_description;
  return JSON.stringify(err);
};

const getCnpjRaiz = (cnpj: string | string[]): string => {
  const value = Array.isArray(cnpj) ? (cnpj[0] || '') : (cnpj || '');
  if (!value || value === 'N/I') return '';
  const clean = value.replace(/\D/g, '');
  return clean.substring(0, 8);
};

const FALLBACK_CITIES = [
  "SÃO PAULO / SP", "RIO DE JANEIRO / RJ", "BRASÍLIA / DF", "SALVADOR / BA", "FORTALEZA / CE",
  "BELO HORIZONTE / MG", "MANAUS / AM", "CURITIBA / PR", "RECIFE / PE", "GOIÂNIA / GO",
  "BELÉM / PA", "PORTO ALEGRE / RS", "GUARULHOS / SP", "CAMPINAS / SP", "SÃO LUÍS / MA",
  "SÃO GONÇALO / RJ", "MACEIÓ / AL", "DUQUE DE CAXIAS / RJ", "NATAL / RN", "TERESINA / PI"
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [lists, setLists] = useState<InspectionList[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'create-list' | 'list-detail' | 'scanner' | 'upload' | 'master-table' | 'admin-settings' | 'bi-analytics'>('home');
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<(ExtractedData & { icComment?: string }) | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activePhotos, setActivePhotos] = useState<Record<string, number>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [biFilter, setBiFilter] = useState<'approved' | 'rejected' | 'pending' | null>(null);

  const [cityInput, setCityInput] = useState('');
  const [allCities, setAllCities] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const [globalConfig, setGlobalConfig] = useState<{ic_email: string, reference_cnpjs: string}>({
    ic_email: 'inteligencia.comercial@packscan.pro',
    reference_cnpjs: ''
  });

  const currentList = useMemo(() => lists.find(l => l.id === currentListId), [lists, currentListId]);
  
  const cleanRefCnpjs = useMemo(() => 
    globalConfig.reference_cnpjs.split(/[\n,;]/)
      .map(c => c.replace(/\D/g, ''))
      .filter(c => c.length >= 8), 
    [globalConfig.reference_cnpjs]
  );

  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return lists;
    const query = searchQuery.toLowerCase();
    return lists.filter(l => 
      l.name.toLowerCase().includes(query) ||
      l.establishment.toLowerCase().includes(query) ||
      l.city.toLowerCase().includes(query) ||
      l.entries.some(e => 
        e.data.cnpj.some(c => c.includes(query)) || 
        e.data.razaoSocial.toLowerCase().includes(query) ||
        e.data.marca.toLowerCase().includes(query)
      )
    );
  }, [lists, searchQuery]);

  const addNotification = (title: string, message: any, type: 'success' | 'info' | 'warning') => {
    const id = Math.random().toString(36).substr(2, 9);
    const msgString = getErrorMessage(message);
    setNotifications(prev => [{ id, title, message: msgString, type, timestamp: new Date().toISOString(), read: false }, ...prev].slice(0, 5));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  useEffect(() => {
    const fetchIBGECities = async () => {
      try {
        const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
        if (!response.ok) throw new Error("Erro na rede IBGE");
        const data = await response.json();
        const formatted = data.map((item: any) => {
          const nome = item.nome?.toUpperCase() || 'N/I';
          const uf = item.microrregiao?.mesorregiao?.UF?.sigla || '??';
          return `${nome} / ${uf}`;
        });
        setAllCities(formatted);
      } catch (err) {
        setAllCities(FALLBACK_CITIES);
      }
    };
    fetchIBGECities();
  }, []);

  useEffect(() => {
    if (cityInput.length > 2) {
      const search = cityInput.toUpperCase();
      const filtered = allCities.filter(c => c.includes(search)).slice(0, 10);
      setCitySuggestions(filtered);
      setShowCitySuggestions(filtered.length > 0);
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  }, [cityInput, allCities]);

  const fetchGlobalSettings = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
      if (!error && data) {
        setGlobalConfig({
          ic_email: data.ic_email || 'inteligencia.comercial@packscan.pro',
          reference_cnpjs: data.reference_cnpjs || ''
        });
      }
    } catch (err) {
      console.warn("Settings fetch error:", err);
    }
  };

  const saveGlobalSettings = async (email: string, cnpjs: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('app_settings').upsert({ 
        id: 1, 
        ic_email: email, 
        reference_cnpjs: cnpjs,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      if (error) throw error;
      setGlobalConfig({ ic_email: email, reference_cnpjs: cnpjs });
      addNotification("Sucesso", "Base Master Global atualizada.", "success");
    } catch (err: any) {
      addNotification("Erro", getErrorMessage(err), "warning");
    }
  };

  const syncUserProfile = async (authUser: any) => {
    if (!supabase) return;
    try {
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (!profile) {
        const role = authUser.email?.toLowerCase().includes('admin') ? 'admin' : 'usuario';
        const name = authUser.user_metadata?.name || authUser.email?.split('@')[0].toUpperCase();
        const { data: newProfile, error } = await supabase.from('profiles').insert([{ id: authUser.id, name, role }]).select().single();
        if (!error) profile = newProfile;
      }
      setCurrentUser({
        id: authUser.id,
        name: profile?.name || "USUÁRIO",
        email: authUser.email || '',
        role: (profile?.role as 'admin' | 'usuario') || 'usuario',
        createdAt: profile?.created_at || new Date().toISOString()
      });
    } catch (err) { console.error("Sync Profile Error:", err); }
  };

  const fetchLists = async () => {
    if (!supabase || !currentUser) return;
    try {
      let query = supabase.from('inspection_lists').select('*, product_entries(*)');
      if (currentUser.role !== 'admin') {
        query = query.eq('inspector_id', currentUser.id);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      const remoteLists = (data || []).map(l => ({
        id: l.id, name: l.name, establishment: l.establishment, city: l.city,
        inspectorName: l.inspector_name, inspectorId: l.inspector_id,
        createdAt: new Date(l.created_at).toLocaleString('pt-BR'),
        status: l.status as ListStatus, isClosed: l.is_closed,
        entries: (l.product_entries || []).map((e: any) => ({
          id: e.id, listId: e.list_id, photos: Array.isArray(e.photos) ? e.photos : [], 
          icComment: e.ic_comment || "",
          data: {
            razaoSocial: e.razao_social || "N/I",
            cnpj: Array.isArray(e.cnpj) ? e.cnpj : [e.cnpj].filter(Boolean),
            marca: e.marca || "N/I",
            descricaoProduto: e.descricao_produto || "N/I",
            conteudo: e.conteudo || "N/I",
            endereco: e.endereco || "N/I",
            cep: e.cep || "N/I",
            telefone: e.telefone || "N/I",
            site: e.site || "N/I",
            fabricanteEmbalagem: e.fabricante_embalagem || "N/I",
            moldagem: e.moldagem || "N/I",
            formatoEmbalagem: e.formato_embalagem || "N/I",
            tipoEmbalagem: e.tipo_embalagem || "N/I",
            modeloEmbalagem: e.modelo_embalagem || "N/I",
            dataLeitura: new Date(e.created_at).toLocaleString('pt-BR')
          },
          isNewProspect: e.is_new_prospect, checkedAt: new Date(e.created_at).toLocaleString('pt-BR'),
          reviewStatus: e.review_status || 'pending', inspectorId: e.inspector_id
        }))
      }));
      setLists(remoteLists);
    } catch (err: any) { 
      console.error("Fetch Error:", err.message);
    }
  };

  useEffect(() => {
    if (!supabase) { setIsLoadingAuth(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => { 
      if (session?.user) syncUserProfile(session.user);
      setIsLoadingAuth(false); 
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setCurrentUser(null); setLists([]); } 
      else if (session?.user) syncUserProfile(session.user);
    });
    fetchGlobalSettings();
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (currentUser) fetchLists(); }, [currentUser]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      if (isLoginView) {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: authForm.email, 
          password: authForm.password 
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
          email: authForm.email, 
          password: authForm.password, 
          options: { data: { name: authForm.name } } 
        });
        if (error) throw error;
        addNotification("Sucesso", "Conta criada! Verifique seu e-mail.", "success");
        setIsLoginView(true);
      }
    } catch (err: any) { 
      console.error("Auth Error:", err);
      setAuthError(getErrorMessage(err)); 
    } finally { 
      setIsLoadingAuth(false); 
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    try {
      setCurrentUser(null); setLists([]); setActiveView('home'); setCurrentListId(null);
      await supabase.auth.signOut();
      addNotification("Sessão Encerrada", "Você saiu do sistema.", "info");
    } catch (err: any) {
      window.localStorage.clear(); addNotification("Sessão Encerrada", "Desconectado.", "info");
    }
  };

  const handleSendToIntelligence = async (listId: string) => {
    if (!supabase || !currentList) return;
    try {
      const { error } = await supabase.from('inspection_lists').update({ status: 'waiting_ic' }).eq('id', listId);
      if (error) throw error;
      await fetchLists();
      const recipient = globalConfig.ic_email || 'inteligencia.comercial@packscan.pro';
      const subject = `NOVA LEITURA PACKSCAN PRO: ${currentList.name}`;
      const body = `Lista de leitura concluída e pronta para análise.\nPDV: ${currentList.establishment}\nCidade: ${currentList.city}`;
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      addNotification("Sucesso", "Lista enviada para IC.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleUpdateEntry = async (entryId: string) => {
    if (!editFormData || !supabase) return;
    try {
      const raiz = getCnpjRaiz(editFormData.cnpj);
      const inRef = cleanRefCnpjs.some(ref => raiz.includes(ref) || ref.includes(raiz));
      const { data: dbExisting } = await supabase.from('product_entries').select('id').eq('cnpj_raiz', raiz).neq('id', entryId).limit(1);
      const isNew = !inRef && (!dbExisting || dbExisting.length === 0);

      const updatePayload: any = {
        razao_social: editFormData.razaoSocial,
        marca: editFormData.marca,
        descricao_produto: editFormData.descricaoProduto,
        conteudo: editFormData.conteudo,
        fabricante_embalagem: editFormData.fabricanteEmbalagem,
        moldagem: editFormData.moldagem,
        formato_embalagem: editFormData.formatoEmbalagem,
        tipo_embalagem: editFormData.tipoEmbalagem,
        modelo_embalagem: editFormData.modeloEmbalagem,
        endereco: editFormData.endereco,
        telefone: editFormData.telefone,
        site: editFormData.site,
        cep: editFormData.cep,
        cnpj: editFormData.cnpj,
        cnpj_raiz: raiz,
        is_new_prospect: isNew
      };

      if (currentUser?.role === 'admin') {
        updatePayload.ic_comment = editFormData.icComment;
      }

      const { error } = await supabase.from('product_entries').update(updatePayload).eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      setEditingEntryId(null);
      addNotification("Sucesso", "Dados atualizados.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleSetReviewStatus = async (entryId: string, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    if (currentUser?.role !== 'admin') {
      addNotification("Acesso Negado", "Apenas administradores podem validar registros para o Relatório.", "warning");
      return;
    }
    try {
      const { error } = await supabase.from('product_entries').update({ review_status: status }).eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      addNotification("Sucesso", "Status BI atualizado no Relatório.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!supabase || !window.confirm("Deseja realmente excluir este item?")) return;
    try {
      const { error } = await supabase.from('product_entries').delete().eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      addNotification("Sucesso", "Item removido da lista.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleDeleteList = async (listId: string) => {
    if (!supabase || !window.confirm("Excluir lista completa? Esta ação é irreversível.")) return;
    try {
      await supabase.from('product_entries').delete().eq('list_id', listId);
      const { error } = await supabase.from('inspection_lists').delete().eq('id', listId);
      if (error) throw error;
      setActiveView('home'); setCurrentListId(null); await fetchLists();
      addNotification("Sucesso", "Lista excluída permanentemente.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleProcessImages = async (photos: string[]) => {
    if (!currentListId || !currentUser || !supabase) return;
    setIsProcessing(true);
    try {
      const extracted = await extractDataFromPhotos(photos);
      const raiz = getCnpjRaiz(extracted.cnpj);
      const inRef = cleanRefCnpjs.some(ref => raiz.includes(ref) || ref.includes(raiz));
      const { data: dbExisting } = await supabase.from('product_entries').select('id').eq('cnpj_raiz', raiz).limit(1);
      const isNew = !inRef && (!dbExisting || dbExisting.length === 0);
      
      const { error } = await supabase.from('product_entries').insert({
        list_id: currentListId, inspector_id: currentUser.id, photos,
        razao_social: extracted.razaoSocial, cnpj: extracted.cnpj, cnpj_raiz: raiz,
        marca: extracted.marca, descricao_produto: extracted.descricaoProduto, conteudo: extracted.conteudo,
        endereco: extracted.endereco, cep: extracted.cep, telefone: extracted.telefone, site: extracted.site,
        fabricante_embalagem: extracted.fabricanteEmbalagem, moldagem: extracted.moldagem,
        formato_embalagem: extracted.formatoEmbalagem, tipo_embalagem: extracted.tipoEmbalagem,
        modelo_embalagem: extracted.modeloEmbalagem, is_new_prospect: isNew, review_status: 'pending'
      });
      if (error) throw error;
      await fetchLists();
      setActiveView('list-detail');
      addNotification("Sucesso", "Extração inteligente completa.", "success");
    } catch (err: any) { addNotification("ERRO IA", getErrorMessage(err), "warning"); } 
    finally { setIsProcessing(false); }
  };

  const handleCreateList = async (formData: FormData) => {
    if (!currentUser || !supabase) return;
    const name = (formData.get('name') as string)?.trim()?.toUpperCase();
    const establishment = (formData.get('establishment') as string)?.trim()?.toUpperCase();
    const city = cityInput?.trim()?.toUpperCase();
    if (!name || !establishment || !city) {
        addNotification("Campos Obrigatórios", "Preencha todos os campos da lista.", "info");
        return;
    }
    setIsCreatingList(true);
    try {
      const { data, error } = await supabase.from('inspection_lists').insert([{ 
        name, establishment, city, inspector_name: currentUser.name, inspector_id: currentUser.id, status: 'executing' 
      }]).select('*');
      if (error) throw error;
      await fetchLists();
      setCurrentListId(data[0].id); setActiveView('list-detail');
      addNotification("Sucesso", "Lista de campo iniciada.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); } 
    finally { setIsCreatingList(false); }
  };

  const analytics = useMemo(() => {
    const all = lists.flatMap(l => l.entries || []);
    const total = all.length;
    const filteredEntriesByBI = biFilter ? all.filter(e => e.reviewStatus === biFilter) : [];
    
    const manufacturersRaw = all.reduce<any>((acc, e) => { const m = e.data.fabricanteEmbalagem || 'N/I'; acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    const moldingRaw = all.reduce<any>((acc, e) => { const m = (e.data.moldagem || 'N/I').toUpperCase(); acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    const citiesRaw = lists.reduce<any>((acc, l) => { acc[l.city] = (acc[l.city] || 0) + 1; return acc; }, {});
    const pdvRaw = lists.reduce<any>((acc, l) => { acc[l.establishment] = (acc[l.establishment] || 0) + (l.entries?.length || 0); return acc; }, {});

    return {
      total,
      approvedCount: all.filter(e => e.reviewStatus === 'approved').length,
      rejectedCount: all.filter(e => e.reviewStatus === 'rejected').length,
      pendingCount: all.filter(e => e.reviewStatus === 'pending').length,
      pdvRanking: Object.entries(pdvRaw).sort((a,b) => (b[1] as any) - (a[1] as any)).slice(0, 10),
      cityRanking: Object.entries(citiesRaw).sort((a,b) => (b[1] as any) - (a[1] as any)).slice(0, 10),
      manufacturerRanking: Object.entries(manufacturersRaw).sort((a,b) => (b[1] as any) - (a[1] as any)).slice(0, 10),
      moldingRanking: Object.entries(moldingRaw).sort((a,b) => (b[1] as any) - (a[1] as any)),
      biFilteredEntries: filteredEntriesByBI
    };
  }, [lists, biFilter]);

  if (isLoadingAuth) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl border border-slate-100">
          <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Scan className="w-10 h-10 text-white" /></div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-8 leading-none text-slate-900">PackScan <span className="text-blue-600">Pro</span></h1>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLoginView && <input required placeholder="NOME COMPLETO" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>}
            <input required type="email" placeholder="E-MAIL" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>
            <input required type="password" placeholder="SENHA" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>
            <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">Acessar Sistema</button>
          </form>
          <button onClick={() => setIsLoginView(!isLoginView)} className="w-full mt-6 text-blue-600 font-bold text-[10px] uppercase">
            {isLoginView ? 'Solicitar Acesso' : 'Já possui conta? Entrar'}
          </button>
          {authError && <p className="mt-4 text-rose-500 text-[10px] font-black uppercase">{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans tracking-tight">
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm flex flex-col gap-2 px-6 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-2xl shadow-2xl flex items-start gap-3 border ${n.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-700 text-white'}`}>
            <CheckCircle2 className="w-5 h-5 shrink-0" /><div><p className="text-[10px] font-black uppercase tracking-widest">{n.title}</p><p className="text-[11px] font-medium opacity-90">{n.message}</p></div>
          </div>
        ))}
      </div>

      <header className="bg-white border-b border-slate-200 sticky top-0 z-[100] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveView('home')}><Scan className="w-6 h-6 text-blue-600" /><h1 className="text-xl font-black uppercase italic tracking-tighter leading-none text-slate-900">PackScan <span className="text-blue-600">Pro</span></h1></div>
        <div className="flex items-center gap-4"><div className="text-right"><p className="text-[10px] font-black uppercase italic text-slate-900 leading-none">{currentUser.name}</p><p className="text-[8px] font-bold uppercase text-blue-600 mt-1">{currentUser.role === 'admin' ? 'Gestão Master' : 'Consultor Campo'}</p></div><button onClick={handleLogout} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-colors"><LogOut className="w-5 h-5" /></button></div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {activeView === 'home' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4">
              <h2 className="text-xl font-black uppercase italic tracking-tighter">{currentUser.role === 'admin' ? 'Monitoramento Master' : 'Minhas Coletas'}</h2>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-grow md:w-80">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input type="text" placeholder="BUSCAR LISTA, PDV OU CNPJ..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 pl-10 pr-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-blue-400 shadow-sm" />
                </div>
                <button onClick={() => { setCityInput(''); setActiveView('create-list'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100">+ Nova Lista</button>
              </div>
            </div>
            <div className="grid gap-4">
              {filteredLists.length === 0 ? (
                <div className="bg-white p-20 rounded-[50px] border border-dashed border-slate-200 text-center">
                  <LayoutList className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-[0.2em]">Nenhum registro encontrado</p>
                </div>
              ) : (
                filteredLists.map(list => (
                  <div key={list.id} className="bg-white p-6 rounded-[35px] border border-slate-200 flex items-center justify-between hover:shadow-xl group transition-all" onClick={() => { setCurrentListId(list.id); setActiveView('list-detail'); }}>
                    <div className="flex items-center gap-5 flex-grow cursor-pointer"><div className="w-14 h-14 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner"><LayoutList /></div><div><h3 className="font-black text-lg uppercase italic leading-none">{list.name}</h3><p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3" /> {list.establishment} • {list.city}</p></div></div>
                    <div className="flex items-center gap-3"><button onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }} className="p-3 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></button><ChevronRight className="w-6 h-6 text-slate-200" /></div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeView === 'list-detail' && currentList && (
          <div className="space-y-6 animate-in fade-in pb-10">
             <div className="bg-white p-6 md:p-10 rounded-[50px] border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 w-full md:w-auto overflow-hidden">
                   <button onClick={() => setActiveView('home')} className="shrink-0 p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-blue-600 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                   <div className="min-w-0">
                      <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight truncate">{currentList.name}</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest flex items-center gap-2 truncate"><MapPin className="w-3 h-3 text-blue-600 shrink-0" /> {currentList.establishment} • {currentList.city}</p>
                   </div>
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 w-full md:w-auto">
                   <button onClick={() => handleDeleteList(currentList.id)} className="bg-rose-50 text-rose-500 p-4 rounded-2xl border border-rose-100 hover:bg-rose-500 hover:text-white transition-all"><Trash2 className="w-5 h-5" /></button>
                   <button onClick={() => handleSendToIntelligence(currentList.id)} className={`px-4 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl transition-all ${currentList.status === 'waiting_ic' ? 'bg-amber-100 text-amber-600' : 'bg-amber-500 text-white shadow-amber-100 hover:bg-amber-600'}`}><Send className="w-4 h-4" /> ENVIAR IC</button>
                   <button onClick={() => setActiveView('upload')} className="bg-slate-900 text-white px-4 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-black transition-all"><Upload className="w-4 h-4" /> UPLOAD</button>
                   <button onClick={() => setActiveView('scanner')} className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"><Camera className="w-4 h-4" /> ESCANEAR</button>
                </div>
             </div>

             <div className="grid gap-8">
                {currentList.entries.map(entry => (
                  <div key={entry.id} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm group hover:shadow-xl transition-all relative overflow-hidden">
                     <div className={`absolute top-0 right-10 px-6 py-2 rounded-b-2xl text-[10px] font-black uppercase italic tracking-widest shadow-sm z-10 ${entry.isNewProspect ? 'bg-amber-400 text-white' : 'bg-blue-600 text-white'}`}>
                       {entry.isNewProspect ? 'Novo Prospect' : 'Já cadastrado na Base'}
                     </div>

                     <div className="flex flex-col lg:flex-row gap-8 mt-4">
                        <div className="w-full lg:w-56 shrink-0 flex flex-col gap-3">
                           <div onClick={() => setZoomImage(entry.photos[activePhotos[entry.id] || 0])} className="w-full h-56 bg-slate-100 rounded-[30px] overflow-hidden relative border border-slate-200 cursor-zoom-in group/img shadow-inner">
                              <img src={entry.photos[activePhotos[entry.id] || 0]} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500" alt="Produto" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white"><Maximize2 className="w-8 h-8" /></div>
                           </div>
                           <div className="flex gap-2">{entry.photos.map((img, idx) => (<button key={idx} onClick={() => setActivePhotos({...activePhotos, [entry.id]: idx})} className={`flex-grow h-14 rounded-xl overflow-hidden border-2 transition-all ${(activePhotos[entry.id] || 0) === idx ? 'border-blue-500 ring-2 ring-blue-50' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={img} className="w-full h-full object-cover" /></button>))}</div>
                        </div>
                        <div className="flex-grow min-w-0">
                           <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                              <div className="flex-grow pr-4 overflow-hidden">
                                {editingEntryId === entry.id ? (
                                  <div className="space-y-3">
                                    <input className="font-black text-xl uppercase italic text-slate-900 bg-slate-50 border p-3 rounded-xl w-full outline-none focus:border-blue-400" value={editFormData?.razaoSocial} onChange={e => setEditFormData(prev => prev ? {...prev, razaoSocial: e.target.value} : null)} placeholder="RAZÃO SOCIAL" />
                                    <input className="text-[10px] font-black text-slate-500 bg-slate-50 border p-2 rounded-lg w-full outline-none" value={editFormData?.cnpj[0] || ''} onChange={e => setEditFormData(prev => prev ? {...prev, cnpj: [e.target.value]} : null)} placeholder="CNPJ" />
                                  </div>
                                ) : (
                                  <div className="min-w-0">
                                    <h4 className="font-black text-xl uppercase italic leading-none text-slate-900 truncate">{entry.data.razaoSocial}</h4>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-2 italic tracking-widest truncate flex items-center gap-1"><Hash className="w-2 h-2" /> CNPJ: {entry.data.cnpj[0] || 'N/I'}</p>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                {editingEntryId === entry.id ? (
                                  <button onClick={() => handleUpdateEntry(entry.id)} className="bg-blue-600 text-white p-3 rounded-xl shadow-lg hover:bg-blue-700 transition-all"><Save className="w-5 h-5" /></button>
                                ) : (
                                  <button onClick={() => { setEditingEntryId(entry.id); setEditFormData({...entry.data, icComment: entry.icComment}); }} className="bg-slate-50 text-slate-400 p-3 rounded-xl hover:text-blue-600 hover:bg-blue-50 transition-all"><Edit3 className="w-5 h-5" /></button>
                                )}
                                <button onClick={() => handleDeleteEntry(entry.id)} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="bg-blue-50/30 p-5 rounded-[30px] border border-blue-100/50">
                                <h5 className="text-[9px] font-black text-blue-600 uppercase italic border-b pb-2 flex items-center gap-2"><Tag className="w-3 h-3" /> Identificação</h5>
                                <div className="mt-4 space-y-3">
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Marca</p>
                                    {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.marca} onChange={e => setEditFormData(prev => prev ? {...prev, marca: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800">{entry.data.marca}</p>}
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Descrição</p>
                                    {editingEntryId === entry.id ? <textarea className="w-full text-[10px] font-black p-2 bg-white border rounded-lg h-16" value={editFormData?.descricaoProduto} onChange={e => setEditFormData(prev => prev ? {...prev, descricaoProduto: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800 leading-tight">{entry.data.descricaoProduto}</p>}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-slate-50 p-5 rounded-[30px] border border-slate-200/50">
                                <h5 className="text-[9px] font-black text-slate-500 uppercase italic border-b pb-2 flex items-center gap-2"><MapPin className="w-3 h-3" /> Localização</h5>
                                <div className="mt-4 space-y-3">
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Endereço</p>
                                    {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.endereco} onChange={e => setEditFormData(prev => prev ? {...prev, endereco: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800 leading-tight">{entry.data.endereco}</p>}
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">CEP / Tel / Site</p>
                                    {editingEntryId === entry.id ? <div className="space-y-1"><input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.cep} onChange={e => setEditFormData(prev => prev ? {...prev, cep: e.target.value} : null)} /><input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.telefone} onChange={e => setEditFormData(prev => prev ? {...prev, telefone: e.target.value} : null)} /></div> : <p className="text-[10px] font-black uppercase text-slate-800">{entry.data.cep} • {entry.data.telefone}</p>}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-emerald-50/30 p-5 rounded-[30px] border border-emerald-100/50">
                                <h5 className="text-[9px] font-black text-emerald-600 uppercase italic border-b pb-2 flex items-center gap-2"><Box className="w-3 h-3" /> Embalagem</h5>
                                <div className="mt-4 space-y-3">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Fabricante Peça</p>
                                      {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.fabricanteEmbalagem} onChange={e => setEditFormData(prev => prev ? {...prev, fabricanteEmbalagem: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800 truncate">{entry.data.fabricanteEmbalagem}</p>}
                                    </div>
                                    <div>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Conteúdo</p>
                                      {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.conteudo} onChange={e => setEditFormData(prev => prev ? {...prev, conteudo: e.target.value} : null)} /> : <p className="text-[10px] font-black text-blue-600 uppercase">{entry.data.conteudo}</p>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Moldagem</p>
                                      {editingEntryId === entry.id ? <select className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.moldagem} onChange={e => setEditFormData(prev => prev ? {...prev, moldagem: e.target.value} : null)}><option value="INJETADO">INJETADO</option><option value="TERMOFORMADO">TERMOFORMADO</option></select> : <p className="text-[10px] font-black text-emerald-600 uppercase">{entry.data.moldagem}</p>}
                                    </div>
                                    <div>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Formato</p>
                                      {editingEntryId === entry.id ? <select className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.formatoEmbalagem} onChange={e => setEditFormData(prev => prev ? {...prev, formatoEmbalagem: e.target.value} : null)}><option value="REDONDO">REDONDO</option><option value="QUADRADO">QUADRADO</option><option value="RETANGULAR">RETANGULAR</option><option value="OVAL">OVAL</option></select> : <p className="text-[10px] font-black text-slate-800 uppercase">{entry.data.formatoEmbalagem}</p>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                           </div>

                           <div className="mt-6 p-5 bg-slate-900/5 rounded-[30px] border border-slate-900/10">
                              <h5 className="text-[9px] font-black text-slate-900 uppercase italic flex items-center gap-2 mb-3"><MessageSquare className="w-3 h-3" /> Comentários Inteligência Comercial</h5>
                              {editingEntryId === entry.id && currentUser?.role === 'admin' ? (
                                <textarea className="w-full text-[10px] font-black p-4 bg-white border rounded-2xl h-20 outline-none focus:border-slate-400 shadow-inner" placeholder="Observações técnicas da IC..." value={editFormData?.icComment} onChange={e => setEditFormData(prev => prev ? {...prev, icComment: e.target.value} : null)} />
                              ) : (
                                <p className="text-[11px] font-bold text-slate-600 italic leading-relaxed">{entry.icComment || "Nenhuma observação técnica disponível para este registro."}</p>
                              )}
                           </div>
                           
                           <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase italic tracking-widest ${entry.reviewStatus === 'pending' ? 'bg-amber-50 text-amber-600' : entry.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                 STATUS BI: {entry.reviewStatus === 'pending' ? 'PENDENTE ANALISE' : entry.reviewStatus === 'approved' ? 'APROVADO IC' : 'REPROVADO IC'}
                               </span>
                             </div>
                             <div className="flex gap-3">
                               <button 
                                 onClick={() => handleSetReviewStatus(entry.id, 'rejected')} 
                                 className={`p-4 rounded-2xl flex items-center gap-2 transition-all ${entry.reviewStatus === 'rejected' ? 'bg-rose-600 text-white shadow-lg' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
                               >
                                 <ThumbsDown className="w-5 h-5 shrink-0" />
                               </button>
                               <button 
                                 onClick={() => handleSetReviewStatus(entry.id, 'approved')} 
                                 className={`p-4 rounded-2xl flex items-center gap-2 transition-all ${entry.reviewStatus === 'approved' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'}`}
                               >
                                 <ThumbsUp className="w-5 h-5 shrink-0" />
                               </button>
                             </div>
                           </div>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeView === 'bi-analytics' && (
          <div className="space-y-10 animate-in fade-in pb-16">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-6 border-b border-slate-100">
              <div className="flex items-center gap-5">
                <div className="bg-blue-600 w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl shadow-blue-200"><BarChart3 className="text-white w-8 h-8" /></div>
                <div><h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 leading-none">Relatório de Inteligência</h2><p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest italic">Análise de Performance PackScan Pro</p></div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button onClick={() => setBiFilter(biFilter === 'approved' ? null : 'approved')} className={`bg-white p-10 rounded-[45px] border flex items-center gap-8 text-left transition-all hover:scale-[1.02] ${biFilter === 'approved' ? 'ring-4 ring-emerald-500/20 border-emerald-500 shadow-xl' : 'border-slate-50'}`}><div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center shrink-0"><ThumbsUp className="w-10 h-10 text-emerald-500" /></div><div><p className="text-[11px] font-black text-slate-300 uppercase italic leading-none mb-3">Aprovados IC</p><p className="text-5xl font-black text-emerald-600 leading-none">{analytics.approvedCount}</p></div></button>
              <button onClick={() => setBiFilter(biFilter === 'rejected' ? null : 'rejected')} className={`bg-white p-10 rounded-[45px] border flex items-center gap-8 text-left transition-all hover:scale-[1.02] ${biFilter === 'rejected' ? 'ring-4 ring-rose-500/20 border-rose-500 shadow-xl' : 'border-slate-50'}`}><div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center shrink-0"><ThumbsDown className="w-10 h-10 text-rose-500" /></div><div><p className="text-[11px] font-black text-slate-300 uppercase italic leading-none mb-3">Reprovados IC</p><p className="text-5xl font-black text-rose-500 leading-none">{analytics.rejectedCount}</p></div></button>
              <button onClick={() => setBiFilter(biFilter === 'pending' ? null : 'pending')} className={`bg-white p-10 rounded-[45px] border flex items-center gap-8 text-left transition-all hover:scale-[1.02] ${biFilter === 'pending' ? 'ring-4 ring-amber-500/20 border-amber-500 shadow-xl' : 'border-slate-50'}`}><div className="w-20 h-20 bg-amber-50 rounded-[28px] flex items-center justify-center shrink-0"><Clock className="w-10 h-10 text-amber-500" /></div><div><p className="text-[11px] font-black text-slate-300 uppercase italic leading-none mb-3">Pendentes de Análise</p><p className="text-5xl font-black text-amber-600 leading-none">{analytics.pendingCount}</p></div></button>
            </div>

            {biFilter && (
              <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-xl space-y-8 animate-in slide-in-from-top-4 overflow-hidden">
                 <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                    <h3 className="text-sm font-black uppercase italic tracking-widest flex items-center gap-3"><LayoutList className="w-5 h-5 text-blue-600" /> {biFilter === 'pending' ? 'Pendentes para Validação' : `Itens: ${biFilter.toUpperCase()}`}</h3>
                    <button onClick={() => setBiFilter(null)} className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors"><X className="w-4 h-4" /></button>
                 </div>
                 <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {analytics.biFilteredEntries.length === 0 ? (
                      <p className="text-center py-20 text-[10px] font-black uppercase text-slate-300">Nenhum registro nesta categoria</p>
                    ) : (
                      analytics.biFilteredEntries.map(e => (
                        <div key={e.id} className="p-6 bg-slate-50/50 rounded-[25px] border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-md transition-all">
                           <div className="flex items-center gap-5 min-w-0">
                              <div className="w-16 h-16 rounded-[20px] overflow-hidden shrink-0 border border-slate-200 shadow-sm"><img src={e.photos[0]} className="w-full h-full object-cover" /></div>
                              <div className="min-w-0"><p className="text-[12px] font-black uppercase italic text-slate-900 truncate leading-none">{e.data.razaoSocial}</p><p className="text-[9px] font-bold text-slate-400 mt-2">CNPJ: {e.data.cnpj[0]} | Conteúdo: {e.data.conteudo}</p><p className="text-[8px] font-black text-blue-500 uppercase mt-1 tracking-widest">{e.data.marca}</p></div>
                           </div>
                           <div className="flex gap-2 shrink-0">
                              <button onClick={() => handleSetReviewStatus(e.id, 'rejected')} className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><ThumbsDown className="w-5 h-5" /></button>
                              <button onClick={() => handleSetReviewStatus(e.id, 'approved')} className="p-4 bg-emerald-50 text-emerald-500 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all"><ThumbsUp className="w-5 h-5" /></button>
                              <button onClick={() => { setCurrentListId(e.listId); setActiveView('list-detail'); }} className="p-4 bg-white text-blue-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white transition-all"><Maximize2 className="w-5 h-5" /></button>
                           </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-900 border-b pb-4 mb-6 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-600" /> Ranking por PDV</h3>
                <div className="space-y-4">
                  {analytics.pdvRanking.map(([name, count], i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">#{i+1}</span>
                        <p className="text-[11px] font-black uppercase italic text-slate-900 truncate max-w-[200px]">{name}</p>
                      </div>
                      <span className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-900 border-b pb-4 mb-6 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600" /> Cobertura de Cidades</h3>
                <div className="space-y-4">
                  {analytics.cityRanking.map(([name, count], i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-black">{i+1}</span>
                        <p className="text-[11px] font-black uppercase italic text-slate-900 truncate max-w-[200px]">{name}</p>
                      </div>
                      <span className="text-slate-400 font-bold text-[10px]">{count} COLETA(S)</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-900 border-b pb-4 mb-6 flex items-center gap-2"><PieChart className="w-4 h-4 text-blue-600" /> Share de Fabricantes</h3>
                <div className="space-y-4">
                  {analytics.manufacturerRanking.map(([name, count], i) => (
                    <div key={i} className="space-y-2">
                       <div className="flex justify-between text-[10px] font-black uppercase italic">
                         <span className="text-slate-900">{name}</span>
                         <span className="text-blue-600">{count}</span>
                       </div>
                       <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                         <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${(count as number / analytics.total) * 100}%` }}></div>
                       </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-900 border-b pb-4 mb-6 flex items-center gap-2"><Box className="w-4 h-4 text-blue-600" /> Tipo de Moldagem</h3>
                <div className="space-y-6 mt-8">
                  {analytics.moldingRanking.map(([type, count], i) => (
                    <div key={i} className="flex items-center gap-6">
                      <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shrink-0 ${type === 'INJETADO' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
                        <Hash className="w-6 h-6" />
                      </div>
                      <div className="flex-grow">
                        <div className="flex justify-between items-end mb-2">
                          <p className="text-[12px] font-black uppercase italic text-slate-900 leading-none">{type}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase italic leading-none">{count} ITENS</p>
                        </div>
                        <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${type === 'INJETADO' ? 'bg-blue-600' : 'bg-emerald-600'}`} style={{ width: `${(count as number / analytics.total) * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'master-table' && (
          <div className="space-y-6 animate-in slide-in-from-right-5 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 leading-none">Database Master</h2>
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative flex-grow md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="BUSCAR CNPJ, RAZÃO OU MARCA..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 pl-10 pr-4 py-4 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-blue-400 shadow-sm" />
                 </div>
                 <button onClick={() => { 
                  const data = lists.flatMap(l => (l.entries || []).map(e => ({ 
                    DATA: e.checkedAt.split(' ')[0],
                    PDV: l.establishment,
                    CIDADE: l.city,
                    RAZAO_SOCIAL: e.data.razaoSocial,
                    CNPJ: e.data.cnpj[0],
                    BASE: e.isNewProspect ? 'NOVO PROSPECT' : 'CADASTRO REFERENCIA',
                    FABRICANTE_PECA: e.data.fabricanteEmbalagem,
                    MOLDAGEM: e.data.moldagem,
                    FORMATO: e.data.formatoEmbalagem,
                    MARCA: e.data.marca,
                    CONTEUDO: e.data.conteudo,
                    DESCRICAO: e.data.descricaoProduto,
                    TIPO: e.data.tipoEmbalagem,
                    MODELO: e.data.modeloEmbalagem,
                    STATUS_IC: e.reviewStatus.toUpperCase(),
                    OBSERVACAO: e.icComment || '',
                    ENDERECO: e.data.endereco,
                    CEP: e.data.cep,
                    TELEFONE: e.data.telefone,
                    SITE: e.data.site,
                    INSPETOR: l.inspectorName
                  })));
                  const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Master Global"); XLSX.writeFile(wb, `PackScan_Master_21cols_${new Date().toISOString().split('T')[0]}.xlsx`); 
                }} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2 shrink-0 hover:bg-emerald-700 transition-colors"><FileSpreadsheet className="w-5 h-5" /> Exportar Master (21 Colunas)</button>
              </div>
            </div>
            <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-2xl overflow-x-auto">
                <table className="w-full text-left text-[11px] whitespace-nowrap">
                  <thead className="bg-slate-900 text-white uppercase italic">
                    <tr>
                      {["Data", "PDV", "Cidade", "Razão Social", "CNPJ", "Base", "Fabricante Peça", "Moldagem", "Formato", "Marca", "Conteúdo", "Descrição", "Tipo", "Modelo", "Status IC", "Observação"].map(h => 
                        <th key={h} className="px-6 py-5 font-black tracking-widest border-r border-slate-800 last:border-0">{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lists.flatMap(listRow => (listRow.entries || []).map(e => ({ ...e, _list: listRow })))
                      .filter(e => {
                        const q = searchQuery.toLowerCase();
                        return !searchQuery.trim() || e.data.cnpj.some(c => c.includes(q)) || e.data.razaoSocial.toLowerCase().includes(q) || e.data.marca.toLowerCase().includes(q);
                      })
                      .map((e, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-400 font-bold italic">{e.checkedAt.split(' ')[0]}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e._list.establishment}</td>
                        <td className="px-6 py-4 font-bold text-slate-500 uppercase">{e._list.city}</td>
                        <td className="px-6 py-4 font-black text-slate-900 italic uppercase">{e.data.razaoSocial}</td>
                        <td className="px-6 py-4 font-bold text-slate-500">{e.data.cnpj[0]}</td>
                        <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${e.isNewProspect ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{e.isNewProspect ? 'Novo' : 'Ref'}</span></td>
                        <td className="px-6 py-4 font-black text-blue-800">{e.data.fabricanteEmbalagem}</td>
                        <td className="px-6 py-4 font-bold text-emerald-600 uppercase">{e.data.moldagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-600 uppercase">{e.data.formatoEmbalagem}</td>
                        <td className="px-6 py-4 font-black text-slate-900 uppercase italic">{e.data.marca}</td>
                        <td className="px-6 py-4 font-black text-blue-600 uppercase">{e.data.conteudo}</td>
                        <td className="px-6 py-4 font-bold text-slate-500 truncate max-w-[200px]">{e.data.descricaoProduto}</td>
                        <td className="px-6 py-4 font-bold text-slate-500 uppercase">{e.data.tipoEmbalagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-400">{e.data.modeloEmbalagem}</td>
                        <td className="px-6 py-4"><span className={`px-4 py-1 rounded-full font-black text-[8px] uppercase ${e.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-600' : e.reviewStatus === 'rejected' ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-500'}`}>{e.reviewStatus}</span></td>
                        <td className="px-6 py-4 font-bold text-slate-400 italic truncate max-w-[150px]">{e.icComment || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {activeView === 'admin-settings' && (currentUser?.role === 'admin') && (
          <div className="max-w-3xl mx-auto py-12 space-y-8">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-8">
              <h1 className="font-black uppercase italic tracking-tighter text-2xl text-slate-900">Configurações Master IC</h1>
              <div className="space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail para Recebimento IC</label><input type="email" value={globalConfig.ic_email} onChange={e => setGlobalConfig({...globalConfig, ic_email: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-sm font-bold outline-none focus:border-blue-400 shadow-inner" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base de Referência (CNPJs Cadastrados)</label><textarea value={globalConfig.reference_cnpjs} onChange={e => setGlobalConfig({...globalConfig, reference_cnpjs: e.target.value})} className="w-full bg-slate-50 border p-6 rounded-[30px] text-xs font-mono min-h-[250px] outline-none focus:border-blue-400 shadow-inner" placeholder="Cole aqui os CNPJs separados por vírgula ou linha..." /></div>
                <button onClick={() => saveGlobalSettings(globalConfig.ic_email, globalConfig.reference_cnpjs)} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all">Salvar Configurações Master</button>
              </div>
            </div>
          </div>
        )}

        {activeView === 'create-list' && (
          <div className="max-w-md mx-auto py-12 animate-in slide-in-from-bottom-10">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-8">
              <h1 className="font-black uppercase italic tracking-tighter text-2xl text-slate-900">Nova Coleta</h1>
              <form onSubmit={e => { e.preventDefault(); handleCreateList(new FormData(e.currentTarget)); }} className="space-y-5">
                <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Identificador</label><input name="name" required placeholder="EX: ROTA NORTE 01" className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 text-slate-900"/></div>
                <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Ponto de Venda (PDV)</label><input name="establishment" required placeholder="EX: SUPERMERCADO ABC" className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 text-slate-900"/></div>
                <div className="space-y-2 relative">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Município / UF</label>
                  <input value={cityInput} onChange={e => setCityInput(e.target.value)} required placeholder="BUSCAR CIDADE..." autoComplete="off" className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 text-slate-900" />
                  {showCitySuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[500] max-h-48 overflow-y-auto">
                      {citySuggestions.map((city, idx) => (
                        <button key={idx} type="button" onClick={() => { setCityInput(city); setShowCitySuggestions(false); }} className="w-full text-left px-5 py-4 text-[10px] font-black uppercase italic text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0">{city}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={isCreatingList} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-90 hover:bg-blue-700 transition-all mt-4 disabled:opacity-50">
                    {isCreatingList ? 'Processando...' : 'Iniciar Coleta'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeView === 'scanner' && <SmartScanner onAllCaptured={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
        {activeView === 'upload' && <ManualUpload onComplete={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-6 flex justify-around items-center z-[100] shadow-lg">
          <button onClick={() => setActiveView('home')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'home' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><LayoutList className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Listas</span></button>
          <button onClick={() => setActiveView('bi-analytics')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'bi-analytics' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><BarChart3 className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Relatório</span></button>
          <button onClick={() => { if(currentListId) setActiveView('scanner'); else setActiveView('create-list'); }} className="bg-blue-600 text-white w-16 h-16 rounded-[25px] flex items-center justify-center -mt-14 border-8 border-slate-50 shadow-2xl active:scale-90 shadow-blue-400/50 transition-transform"><Plus className="w-10 h-10" /></button>
          <button onClick={() => setActiveView('master-table')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'master-table' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Database className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Master</span></button>
          <button onClick={() => { if(currentUser?.role === 'admin') setActiveView('admin-settings'); else addNotification("Acesso Negado", "Funcionalidade disponível apenas para administradores.", "info"); }} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin-settings' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Settings className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Ajustes</span></button>
      </footer>

      {isProcessing && (<div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[300] flex flex-col items-center justify-center text-white text-center p-6"><Loader2 className="w-20 h-20 text-blue-600 animate-spin mb-8" /><h3 className="text-2xl font-black uppercase italic tracking-tighter">Processando Inteligência PackScan</h3><p className="text-slate-400 text-[10px] font-bold uppercase mt-4 tracking-[0.2em] animate-pulse">Cruzando dados com Base Master Global em tempo real...</p></div>)}
      {zoomImage && (<div onClick={() => setZoomImage(null)} className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 cursor-zoom-out"><img src={zoomImage} className="max-w-full max-h-full rounded-2xl shadow-2xl animate-in zoom-in-95" alt="Zoom" /></div>)}
    </div>
  );
};

export default App;
