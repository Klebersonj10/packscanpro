import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, ArrowLeft, Loader2, Scan, ChevronRight, 
  LayoutList, Camera, MapPin, LogOut, Table, 
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ShieldCheck,
  TrendingUp, Database, Sparkles, Edit3, Save, Send, Globe, Phone, Settings,
  Tag, BarChart3, PieChart, Info, Users, Box, Hash, Globe2, AlertTriangle, Search,
  Building2, ImageIcon, FileText, ClipboardList, X, Maximize2, Mail, ThumbsUp, ThumbsDown,
  Trash2, Clock
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
  return String(err);
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
  const [editFormData, setEditFormData] = useState<ExtractedData | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activePhotos, setActivePhotos] = useState<Record<string, number>>({});

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
        console.error("Erro ao carregar municípios, usando fallback:", err);
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
      console.warn("Global settings fetch error:", err);
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
      addNotification("Erro no Salvamento", getErrorMessage(err), "warning");
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
    } catch (err) { console.error(err); }
  };

  const fetchLists = async () => {
    if (!supabase || !currentUser) return;
    try {
      let query = supabase
        .from('inspection_lists')
        .select('*, product_entries(*)');
        
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
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) syncUserProfile(session.user); else { setCurrentUser(null); setLists([]); }
      setIsLoadingAuth(false);
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
        const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password, options: { data: { name: authForm.name } } });
        if (error) throw error;
        addNotification("Sucesso", "Conta criada!", "success");
        setIsLoginView(true);
      }
    } catch (err: any) { 
      setAuthError(getErrorMessage(err)); 
    } finally { 
      setIsLoadingAuth(false); 
    }
  };

  const handleSendToIntelligence = async (listId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('inspection_lists')
        .update({ status: 'waiting_ic' })
        .eq('id', listId);
      
      if (error) throw error;
      
      await fetchLists();
      addNotification("Sucesso", `Lista enviada. E-mail de notificação encaminhado para: ${globalConfig.ic_email}`, "success");
    } catch (err: any) {
      addNotification("Erro no Envio", getErrorMessage(err), "warning");
    }
  };

  const handleUpdateEntry = async (entryId: string) => {
    if (!editFormData || !supabase) return;
    try {
      const raiz = getCnpjRaiz(editFormData.cnpj);
      const isNew = !cleanRefCnpjs.some(ref => {
        const firstCnpj = (editFormData.cnpj[0] || '').replace(/\D/g, '');
        return firstCnpj.includes(ref) || ref.includes(firstCnpj);
      });

      const { error } = await supabase.from('product_entries').update({
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
      }).eq('id', entryId);
      
      if (error) throw error;
      await fetchLists();
      setEditingEntryId(null);
      addNotification("Sucesso", "Dados atualizados.", "success");
    } catch (err: any) { 
      addNotification("Erro", getErrorMessage(err), "warning"); 
    }
  };

  const handleSetReviewStatus = async (entryId: string, status: 'approved' | 'rejected') => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('product_entries').update({ review_status: status }).eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      addNotification("Sucesso", `Item ${status === 'approved' ? 'aprovado' : 'reprovado'} para o BI.`, "success");
    } catch (err: any) {
      addNotification("Erro", getErrorMessage(err), "warning");
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!supabase) return;
    if (!window.confirm("Excluir item?")) return;
    try {
      const { error } = await supabase.from('product_entries').delete().eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      addNotification("Sucesso", "Item removido.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleDeleteList = async (listId: string) => {
    if (!supabase) return;
    if (!window.confirm("Excluir lista completa?")) return;
    try {
      const { error } = await supabase.from('inspection_lists').delete().eq('id', listId);
      if (error) throw error;
      setActiveView('home');
      await fetchLists();
      addNotification("Sucesso", "Lista excluída.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); }
  };

  const handleProcessImages = async (photos: string[]) => {
    if (!currentListId || !currentUser || !supabase) return;
    setIsProcessing(true);
    try {
      const extracted = await extractDataFromPhotos(photos);
      const raiz = getCnpjRaiz(extracted.cnpj);
      
      const isNew = !cleanRefCnpjs.some(ref => {
        const firstCnpj = (extracted.cnpj[0] || '').replace(/\D/g, '');
        return firstCnpj.includes(ref) || ref.includes(firstCnpj);
      });
      
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
      addNotification("Sucesso", "Extração via IA completa.", "success");
    } catch (err: any) { 
      addNotification("Erro IA", getErrorMessage(err), "warning"); 
    } finally { setIsProcessing(false); }
  };

  const handleCreateList = async (formData: FormData) => {
    if (!currentUser || !supabase) return;
    setIsCreatingList(true);
    try {
      const { data, error } = await supabase.from('inspection_lists').insert([{ 
        name: (formData.get('name') as string).toUpperCase(), 
        establishment: (formData.get('establishment') as string).toUpperCase(), 
        city: cityInput.toUpperCase(), 
        inspector_name: currentUser.name, 
        inspector_id: currentUser.id, 
        status: 'executing' 
      }]).select().single();
      if (error) throw error;
      await fetchLists();
      if (data) { setCurrentListId(data.id); setActiveView('list-detail'); }
      addNotification("Sucesso", "Lista criada.", "success");
    } catch (err: any) { addNotification("Erro", getErrorMessage(err), "warning"); } finally { setIsCreatingList(false); }
  };

  const analytics = useMemo(() => {
    const all = lists.flatMap(l => l.entries || []);
    const total = all.length;
    const manufacturersRaw = all.reduce<any>((acc, e) => { const m = e.data.fabricanteEmbalagem || 'N/I'; acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    const manufacturers = Object.entries(manufacturersRaw).sort((a,b) => (b[1] as any) - (a[1] as any));
    const maxManufacturer = Math.max(...Object.values(manufacturersRaw) as number[], 1);

    const moldingRaw = all.reduce<any>((acc, e) => { const m = (e.data.moldagem || 'N/I').toUpperCase(); acc[m] = (acc[m] || 0) + 1; return acc; }, {});
    const molding = Object.entries(moldingRaw).sort((a,b) => (b[1] as any) - (a[1] as any));
    const maxMolding = Math.max(...Object.values(moldingRaw) as number[], 1);

    return {
      total,
      approvedCount: all.filter(e => e.reviewStatus === 'approved').length,
      rejectedCount: all.filter(e => e.reviewStatus === 'rejected').length,
      pendingCount: all.filter(e => e.reviewStatus === 'pending').length,
      pdvRanking: Object.entries(lists.reduce<any>((acc, l) => { acc[l.establishment] = (acc[l.establishment] || 0) + (l.entries?.length || 0); return acc; }, {})).sort((a,b) => (b[1] as any) - (a[1] as any)).slice(0,5),
      cityRanking: Object.entries(lists.reduce<any>((acc, l) => { acc[l.city] = (acc[l.city] || 0) + (l.entries?.length || 0); return acc; }, {})).sort((a,b) => (b[1] as any) - (a[1] as any)).slice(0,5),
      manufacturerRanking: manufacturers.slice(0, 5),
      maxManufacturer,
      moldingRanking: molding,
      maxMolding
    };
  }, [lists]);

  if (isLoadingAuth) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl border border-slate-100">
          <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Scan className="w-10 h-10 text-white" /></div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-8 leading-none text-slate-900">PackScan <span className="text-blue-600">Pro</span></h1>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLoginView && <input required placeholder="NOME" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>}
            <input required type="email" placeholder="E-MAIL" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>
            <input required type="password" placeholder="SENHA" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none"/>
            <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">Acessar</button>
          </form>
          <button onClick={() => setIsLoginView(!isLoginView)} className="w-full mt-6 text-blue-600 font-bold text-[10px] uppercase">{isLoginView ? 'Solicitar Acesso' : 'Já possui conta'}</button>
          {authError && <p className="mt-4 text-rose-500 text-[10px] font-bold uppercase">{authError}</p>}
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
        <div className="flex items-center gap-4"><div className="text-right"><p className="text-[10px] font-black uppercase italic text-slate-900 leading-none">{currentUser.name}</p><p className="text-[8px] font-bold uppercase text-blue-600 mt-1">{currentUser.role === 'admin' ? 'Gestão Master' : 'Campo'}</p></div><button onClick={() => supabase?.auth.signOut()} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-colors"><LogOut className="w-5 h-5" /></button></div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {activeView === 'home' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center pt-4"><h2 className="text-xl font-black uppercase italic tracking-tighter">{currentUser.role === 'admin' ? 'Todas as Listas (Admin)' : 'Minhas Listas'}</h2><button onClick={() => { setCityInput(''); setActiveView('create-list'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 transition-all active:scale-95">+ Nova Lista</button></div>
            <div className="grid gap-4">
              {lists.map(list => (
                <div key={list.id} className="bg-white p-6 rounded-[35px] border border-slate-200 flex items-center justify-between hover:shadow-xl group transition-all" onClick={() => { setCurrentListId(list.id); setActiveView('list-detail'); }}>
                   <div className="flex items-center gap-5 flex-grow cursor-pointer"><div className="w-14 h-14 bg-slate-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner"><LayoutList /></div><div><h3 className="font-black text-lg uppercase italic leading-none">{list.name}</h3><p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest"><MapPin className="w-3 h-3 inline" /> {list.establishment} • {list.city} {currentUser.role === 'admin' && `• Por: ${list.inspectorName}`}</p></div></div>
                   <div className="flex items-center gap-3"><button onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button><ChevronRight className="w-6 h-6 text-slate-200 group-hover:text-blue-600 transition-colors" /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'list-detail' && currentList && (
          <div className="space-y-6 animate-in fade-in pb-10">
             <div className="bg-white p-10 rounded-[50px] border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm">
                <div className="flex items-center gap-4"><button onClick={() => setActiveView('home')} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-blue-600 transition-colors"><ArrowLeft className="w-5 h-5" /></button><div><h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight">{currentList.name}</h2><p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest flex items-center gap-2"><MapPin className="w-3 h-3 text-blue-600" /> {currentList.establishment} • {currentList.city}</p></div></div>
                <div className="flex gap-3">
                   <button onClick={() => handleDeleteList(currentList.id)} className="bg-rose-50 text-rose-500 px-6 py-4 rounded-2xl font-black text-[10px] uppercase border border-rose-100"><Trash2 className="w-4 h-4" /></button>
                   <button onClick={() => handleSendToIntelligence(currentList.id)} className={`px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl transition-all ${currentList.status === 'waiting_ic' ? 'bg-amber-100 text-amber-600 shadow-amber-50' : 'bg-amber-500 text-white shadow-amber-100 hover:bg-amber-600'}`}>
                     <Send className="w-4 h-4" /> {currentList.status === 'waiting_ic' ? 'Enviado para IC' : 'Enviar para IC'}
                   </button>
                   <button onClick={() => setActiveView('upload')} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2"><Upload className="w-4 h-4" /> Upload</button>
                   <button onClick={() => setActiveView('scanner')} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl"><Camera className="w-4 h-4" /> Escanear</button>
                </div>
             </div>
             <div className="grid gap-8">
                {currentList.entries.map(entry => (
                  <div key={entry.id} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm group hover:shadow-xl transition-all relative overflow-hidden">
                     <div className={`absolute top-0 right-10 px-6 py-2 rounded-b-2xl text-[10px] font-black uppercase italic tracking-widest shadow-sm ${entry.isNewProspect ? 'bg-amber-400 text-white' : 'bg-blue-600 text-white'}`}>
                       {entry.isNewProspect ? 'Novo Prospect' : 'Já Cadastrado na Base'}
                     </div>

                     <div className="flex flex-col lg:flex-row gap-8 mt-4">
                        <div className="w-full lg:w-56 shrink-0 flex flex-col gap-3">
                           <div onClick={() => setZoomImage(entry.photos[activePhotos[entry.id] || 0])} className="w-full h-56 bg-slate-100 rounded-[30px] overflow-hidden relative border border-slate-200 cursor-zoom-in">
                              <img src={entry.photos[activePhotos[entry.id] || 0]} className="w-full h-full object-cover" alt="Produto" />
                           </div>
                           <div className="flex gap-2">{entry.photos.map((img, idx) => (<button key={idx} onClick={() => setActivePhotos({...activePhotos, [entry.id]: idx})} className={`flex-grow h-14 rounded-xl overflow-hidden border-2 transition-all ${(activePhotos[entry.id] || 0) === idx ? 'border-blue-500' : 'border-transparent opacity-60'}`}><img src={img} className="w-full h-full object-cover" /></button>))}</div>
                        </div>
                        <div className="flex-grow">
                           <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                              <div className="flex-grow pr-4">
                                {editingEntryId === entry.id ? (
                                  <div className="space-y-3">
                                    <input className="font-black text-xl uppercase italic text-slate-900 bg-slate-50 border p-3 rounded-xl w-full" value={editFormData?.razaoSocial} onChange={e => setEditFormData(prev => prev ? {...prev, razaoSocial: e.target.value} : null)} placeholder="RAZÃO SOCIAL" />
                                    <input className="text-[10px] font-black text-slate-500 bg-slate-50 border p-2 rounded-lg w-full" value={editFormData?.cnpj[0] || ''} onChange={e => setEditFormData(prev => prev ? {...prev, cnpj: [e.target.value]} : null)} placeholder="CNPJ" />
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="font-black text-xl uppercase italic leading-none text-slate-900">{entry.data.razaoSocial}</h4>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-2 italic tracking-widest">CNPJ: {entry.data.cnpj[0] || 'N/I'}</p>
                                  </>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {editingEntryId === entry.id ? (
                                  <button onClick={() => handleUpdateEntry(entry.id)} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg"><Save className="w-5 h-5" /></button>
                                ) : (
                                  <button onClick={() => { setEditingEntryId(entry.id); setEditFormData({...entry.data}); }} className="bg-slate-50 text-slate-400 p-3 rounded-xl hover:text-blue-600 transition-colors"><Edit3 className="w-5 h-5" /></button>
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
                                    {editingEntryId === entry.id ? <textarea className="w-full text-[10px] font-black p-2 bg-white border rounded-lg h-20" value={editFormData?.descricaoProduto} onChange={e => setEditFormData(prev => prev ? {...prev, descricaoProduto: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800">{entry.data.descricaoProduto}</p>}
                                  </div>
                                </div>
                              </div>
                              <div className="bg-slate-50 p-5 rounded-[30px] border border-slate-200/50">
                                <h5 className="text-[9px] font-black text-slate-500 uppercase italic border-b pb-2 flex items-center gap-2"><MapPin className="w-3 h-3" /> Localização</h5>
                                <div className="mt-4 space-y-3">
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Endereço</p>
                                    {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.endereco} onChange={e => setEditFormData(prev => prev ? {...prev, endereco: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800 truncate">{entry.data.endereco}</p>}
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">CEP / Tel</p>
                                    {editingEntryId === entry.id ? <div className="grid grid-cols-2 gap-2"><input className="text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.cep} onChange={e => setEditFormData(prev => prev ? {...prev, cep: e.target.value} : null)} /><input className="text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.telefone} onChange={e => setEditFormData(prev => prev ? {...prev, telefone: e.target.value} : null)} /></div> : <p className="text-[10px] font-black uppercase text-slate-800">{entry.data.cep} • {entry.data.telefone}</p>}
                                  </div>
                                </div>
                              </div>
                              <div className="bg-emerald-50/30 p-5 rounded-[30px] border border-emerald-100/50">
                                <h5 className="text-[9px] font-black text-emerald-600 uppercase italic border-b pb-2 flex items-center gap-2"><Box className="w-3 h-3" /> Embalagem</h5>
                                <div className="mt-4 space-y-3">
                                  <div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Fabricante Peça</p>
                                    {editingEntryId === entry.id ? <input className="w-full text-[10px] font-black p-2 bg-white border rounded-lg" value={editFormData?.fabricanteEmbalagem} onChange={e => setEditFormData(prev => prev ? {...prev, fabricanteEmbalagem: e.target.value} : null)} /> : <p className="text-[10px] font-black uppercase text-slate-800 truncate">{entry.data.fabricanteEmbalagem}</p>}
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
                           
                           <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase italic tracking-widest ${entry.reviewStatus === 'pending' ? 'bg-amber-50 text-amber-600' : entry.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                 Status BI: {entry.reviewStatus === 'pending' ? 'Pendente Analise' : entry.reviewStatus === 'approved' ? 'Aprovado IC' : 'Reprovado IC'}
                               </span>
                             </div>
                             <div className="flex gap-3">
                               <button onClick={() => handleSetReviewStatus(entry.id, 'rejected')} className={`p-4 rounded-2xl flex items-center gap-2 transition-all ${entry.reviewStatus === 'rejected' ? 'bg-rose-600 text-white shadow-lg' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}>
                                 <ThumbsDown className="w-5 h-5" />
                               </button>
                               <button onClick={() => handleSetReviewStatus(entry.id, 'approved')} className={`p-4 rounded-2xl flex items-center gap-2 transition-all ${entry.reviewStatus === 'approved' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'}`}>
                                 <ThumbsUp className="w-5 h-5" />
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
            <div className="flex items-center gap-5 py-6">
              <div className="bg-blue-600 w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl shadow-blue-200">
                <BarChart3 className="text-white w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Ranking BI Comercial</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-10 rounded-[45px] border border-slate-50 shadow-sm flex items-center gap-8">
                <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center">
                  <ThumbsUp className="w-10 h-10 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest leading-none mb-3 italic">Aprovados IC</p>
                  <p className="text-5xl font-black text-emerald-600 leading-none">{analytics.approvedCount}</p>
                </div>
              </div>

              <div className="bg-white p-10 rounded-[45px] border border-slate-50 shadow-sm flex items-center gap-8">
                <div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center">
                  <ThumbsDown className="w-10 h-10 text-rose-500" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest leading-none mb-3 italic">Reprovados IC</p>
                  <p className="text-5xl font-black text-rose-500 leading-none">{analytics.rejectedCount}</p>
                </div>
              </div>

              <div className="bg-white p-10 rounded-[45px] border border-slate-50 shadow-sm flex items-center gap-8">
                <div className="w-20 h-20 bg-amber-50 rounded-[28px] flex items-center justify-center">
                  <Clock className="w-10 h-10 text-amber-500" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest leading-none mb-3 italic">Pendentes Analise</p>
                  <p className="text-5xl font-black text-amber-600 leading-none">{analytics.pendingCount}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-12 rounded-[50px] border border-slate-50 shadow-sm space-y-8">
                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-4 italic leading-none">
                  <Building2 className="w-6 h-6 text-blue-600" /> Ranking por PDV
                </h3>
                <div className="space-y-4">
                  {analytics.pdvRanking.map(([name, count], i) => (
                    <div key={i} className="flex justify-between items-center p-6 bg-slate-50/50 rounded-[28px] font-black uppercase italic group transition-all">
                      <span className="text-sm text-slate-900">{i + 1}. {name}</span>
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">{count} itens</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-12 rounded-[50px] border border-slate-50 shadow-sm space-y-8">
                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-4 italic leading-none">
                  <MapPin className="w-6 h-6 text-emerald-500" /> Cobertura por Cidade
                </h3>
                <div className="space-y-4">
                  {analytics.cityRanking.map(([city, count], i) => (
                    <div key={i} className="flex justify-between items-center p-6 bg-slate-50/50 rounded-[28px] font-black uppercase italic">
                      <span className="text-sm text-slate-900">{city}</span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full">{count} itens</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-12 rounded-[50px] border border-slate-50 shadow-sm space-y-10">
                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-4 italic leading-none">
                  <Database className="w-6 h-6 text-amber-500" /> Share de Fabricantes
                </h3>
                <div className="space-y-8">
                  {analytics.manufacturerRanking.map(([name, count], i) => (
                    <div key={i} className="space-y-4">
                      <div className="flex justify-between font-black uppercase italic text-xs">
                        <span className="text-slate-900">{name}</span>
                        <span className="text-blue-600">{count}</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-400 rounded-full transition-all duration-1000" 
                          style={{ width: `${((count as number) / analytics.maxManufacturer) * 100}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-12 rounded-[50px] border border-slate-50 shadow-sm space-y-10">
                <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-4 italic leading-none">
                  <Box className="w-6 h-6 text-purple-600" /> Tipo de Moldagem
                </h3>
                <div className="space-y-8">
                  {analytics.moldingRanking.map(([name, count], i) => (
                    <div key={i} className="space-y-4">
                      <div className="flex justify-between font-black uppercase italic text-xs">
                        <span className="text-slate-900">{name}</span>
                        <span className="text-slate-400">{count}</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full transition-all duration-1000" 
                          style={{ width: `${((count as number) / analytics.maxMolding) * 100}%` }} 
                        />
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
            <div className="flex justify-between items-center pt-4">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Database Master</h2>
              <button onClick={() => { 
                const data = lists.flatMap(l => (l.entries || []).map(e => ({ 
                  DATA_LEITURA: e.checkedAt, 
                  INSPETOR: l.inspectorName, 
                  PDV: l.establishment, 
                  CIDADE: l.city, 
                  ESTADO_UF: l.city.split('/').pop()?.trim() || 'N/I',
                  RAZAO_SOCIAL: e.data.razaoSocial, 
                  MARCA: e.data.marca, 
                  DESCRICAO: e.data.descricaoProduto, 
                  CONTEUDO: e.data.conteudo,
                  CNPJ: e.data.cnpj[0], 
                  STATUS_BASE: e.isNewProspect ? 'Novo Prospect' : 'Já Cadastrado',
                  FABRICANTE_EMBALAGEM: e.data.fabricanteEmbalagem, 
                  MOLDAGEM: e.data.moldagem, 
                  FORMATO: e.data.formatoEmbalagem,
                  TIPO_EMBALAGEM: e.data.tipoEmbalagem,
                  MODELO_EMBALAGEM: e.data.modeloEmbalagem,
                  ENDERECO: e.data.endereco,
                  CEP: e.data.cep,
                  TELEFONE: e.data.telefone,
                  SITE: e.data.site,
                  STATUS_IC: e.reviewStatus 
                })));
                const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Master"); XLSX.writeFile(wb, `PackScan_Master_21_Cols_${new Date().toISOString().split('T')[0]}.xlsx`); 
              }} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Exportar 21 Colunas XLSX</button>
            </div>
            <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] whitespace-nowrap">
                  <thead className="bg-slate-900 text-white uppercase italic">
                    <tr>
                      {["Data", "PDV", "Cidade", "Razão Social", "CNPJ", "Base", "Fabricante Peça", "Moldagem", "Formato", "Marca", "Descrição", "Tipo", "Modelo", "Status IC"].map(h => <th key={h} className="px-6 py-5 font-black tracking-widest">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lists.flatMap(listRow => (listRow.entries || []).map(e => ({ ...e, _list: listRow }))).map((e, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/50">
                        <td className="px-6 py-4 text-slate-400 font-bold">{e.checkedAt.split(' ')[0]}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e._list.establishment}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e._list.city}</td>
                        <td className="px-6 py-4 font-black text-slate-900 italic uppercase">{e.data.razaoSocial}</td>
                        <td className="px-6 py-4 font-bold text-slate-500">{e.data.cnpj[0]}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full font-black text-[8px] uppercase ${e.isNewProspect ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {e.isNewProspect ? 'Novo' : 'Cadastrado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-blue-800">{e.data.fabricanteEmbalagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e.data.moldagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e.data.formatoEmbalagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e.data.marca}</td>
                        <td className="px-6 py-4 font-bold text-slate-500 max-w-[150px] truncate">{e.data.descricaoProduto}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e.data.tipoEmbalagem}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{e.data.modeloEmbalagem}</td>
                        <td className="px-6 py-4">
                          <span className={`px-4 py-1 rounded-full font-black text-[8px] uppercase ${e.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-600' : e.reviewStatus === 'rejected' ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-500'}`}>
                            {e.reviewStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'admin-settings' && (currentUser?.role === 'admin') && (
          <div className="max-w-3xl mx-auto py-12 space-y-8">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-8">
              <h1 className="font-black uppercase italic tracking-tighter text-2xl text-slate-900">Gestão Master IC</h1>
              <div className="space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail IC</label><input type="email" value={globalConfig.ic_email} onChange={e => setGlobalConfig({...globalConfig, ic_email: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-sm font-bold outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base de CNPJs de Referência (Compartilhada)</label><textarea value={globalConfig.reference_cnpjs} onChange={e => setGlobalConfig({...globalConfig, reference_cnpjs: e.target.value})} className="w-full bg-slate-50 border p-6 rounded-[30px] text-xs font-mono min-h-[200px] outline-none" placeholder="CNPJ1, CNPJ2..." /></div>
                <button onClick={() => saveGlobalSettings(globalConfig.ic_email, globalConfig.reference_cnpjs)} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Gravar Configurações Master</button>
              </div>
            </div>
          </div>
        )}

        {activeView === 'create-list' && (
          <div className="max-w-md mx-auto py-12 animate-in slide-in-from-bottom-10">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-8">
              <h1 className="font-black uppercase italic tracking-tighter text-2xl text-slate-900">Nova Lista</h1>
              <form onSubmit={e => { e.preventDefault(); handleCreateList(new FormData(e.currentTarget)); }} className="space-y-5">
                <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Lista</label><input name="name" required placeholder="EX: ROTA NORTE 01" className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 transition-colors text-slate-900"/></div>
                <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">PDV</label><input name="establishment" required placeholder="EX: MERCADO CENTRAL" className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 transition-colors text-slate-900"/></div>
                <div className="space-y-2 relative">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade / UF</label>
                  <input 
                    value={cityInput}
                    onChange={e => setCityInput(e.target.value)}
                    required 
                    placeholder="DIGITE PARA BUSCAR..." 
                    autoComplete="off"
                    className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:border-blue-400 transition-colors text-slate-900"
                  />
                  {showCitySuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[500] max-h-48 overflow-y-auto animate-in slide-in-from-top-2">
                      {citySuggestions.map((city, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setCityInput(city); setShowCitySuggestions(false); }}
                          className="w-full text-left px-5 py-4 text-[10px] font-black uppercase italic text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors border-b border-slate-50 last:border-0"
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-90 hover:bg-blue-700 transition-all mt-4">Criar Lista</button>
              </form>
            </div>
          </div>
        )}

        {activeView === 'scanner' && <SmartScanner onAllCaptured={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
        {activeView === 'upload' && <ManualUpload onComplete={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-6 flex justify-around items-center z-[100] shadow-lg">
          <button onClick={() => setActiveView('home')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'home' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><LayoutList className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Rotas</span></button>
          <button onClick={() => setActiveView('bi-analytics')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'bi-analytics' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><BarChart3 className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">BI</span></button>
          <button onClick={() => { if(currentListId) setActiveView('scanner'); else setActiveView('create-list'); }} className="bg-blue-600 text-white w-16 h-16 rounded-[25px] flex items-center justify-center -mt-14 border-8 border-slate-50 shadow-2xl active:scale-90"><Plus className="w-10 h-10" /></button>
          <button onClick={() => setActiveView('master-table')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'master-table' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Database className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Master</span></button>
          <button onClick={() => { if(currentUser?.role === 'admin') setActiveView('admin-settings'); else addNotification("Aviso", "Apenas Administradores", "info"); }} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin-settings' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Settings className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Gestão</span></button>
      </footer>

      {isProcessing && (<div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[300] flex flex-col items-center justify-center text-white text-center p-6"><Loader2 className="w-20 h-20 text-blue-600 animate-spin mb-8" /><h3 className="text-2xl font-black uppercase italic tracking-tighter">Processando Inteligência PackScan</h3><p className="text-slate-400 text-[10px] font-bold uppercase mt-4 tracking-[0.2em] animate-pulse">Consultando Base Master Global</p></div>)}
      {zoomImage && (<div onClick={() => setZoomImage(null)} className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 cursor-zoom-out"><img src={zoomImage} className="max-w-full max-h-full rounded-2xl shadow-2xl animate-in zoom-in-95" alt="Zoom" /></div>)}
    </div>
  );
};

export default App;