
export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'usuario'; 
  avatar?: string;
  lastLogin?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning';
  timestamp: string;
  read: boolean;
}

export interface ExtractedData {
  razaoSocial: string;      
  cnpj: string[];           
  marca: string;            
  descricaoProduto: string; 
  conteudo: string;         
  endereco: string;         
  cep: string;              
  telefone: string;         
  site: string;             
  fabricanteEmbalagem: string; 
  moldagem: string;         
  formatoEmbalagem: string; 
  tipoEmbalagem: string;    
  modeloEmbalagem: string;  
  dataLeitura: string;
}

export interface ProductEntry {
  id: string;
  photos: string[];
  data: ExtractedData;
  isNewProspect: boolean; 
  checkedAt: string;
  reviewStatus: 'approved' | 'rejected' | 'pending'; 
  inspectorId: string;
  listId: string;
}

export type ListStatus = 'executing' | 'waiting_ic' | 'approved' | 'partial' | 'rejected';

export interface InspectionList {
  id: string;
  name: string;
  establishment: string;
  city: string;
  inspectorName: string;
  inspectorId: string; 
  createdAt: string;
  entries: ProductEntry[];
  isClosed: boolean;
  status: ListStatus;
}

export interface AnalyticsStats {
  totalEntries: number;
  newProspects: number;
  approvedCount: number;
  citiesCount: number;
  establishmentsCount: number;
  cityBreakdown: { name: string, count: number }[];
  establishmentBreakdown: { name: string, count: number }[];
  topBrands: { name: string, count: number }[];
  typeDistribution: { type: string, count: number }[];
  moldingDistribution: { type: string, count: number }[];
}
