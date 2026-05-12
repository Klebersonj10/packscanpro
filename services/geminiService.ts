
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  // Use API key directly from process.env.GEMINI_API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    // Filtra fotos válidas para evitar processamento de strings vazias
    const validPhotos = photos.filter(p => p && p.length > 50);
    if (validPhotos.length === 0) throw new Error("Nenhuma foto válida capturada.");
    
    const imageParts = validPhotos.map(prepareImagePart);
    
    const textPart = { 
      text: `VOCÊ É UM ESPECIALISTA EM OCR E ANÁLISE TÉCNICA DE EMBALAGENS PLÁSTICAS.
      Sua missão é extrair dados com precisão total destas fotos.
      
      FOCO EM EXTRAÇÃO:
      1. CNPJs: Procure por sequências de 14 dígitos (ex: 00.000.000/0000-00).
      2. RAZÃO SOCIAL: Nome da empresa fabricante (ex: CREMOLAP FRIOS E LATICÍNIOS LTDA).
      3. FABRICANTE DA EMBALAGEM: Identifique logos ou nomes gravados no plástico (ex: Brasilpack, Fibrasa, Berry).
      
      REGRAS TÉCNICAS DE MOLDAGEM (DIFERENCIAÇÃO FUNDAMENTAL):
      Analise o fundo (lado externo) da embalagem nas fotos:
      1. INJETADO: Verifique se existe um PONTO DE INJEÇÃO central (uma pequena marca circular, relevo ou cicatriz exata no centro do fundo, de onde o plástico fluiu para o molde). Se houver esse ponto central, classifique obrigatoriamente como INJETADO.
      2. TERMOFORMADO: O fundo é liso, sem marcas de ponto central. Pode ter marcas de vácuo, mas nunca o ponto central de injeção.
      
      Retorne os dados estritamente em JSON.` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um especialista em embalagens. Extraia dados em JSON. MOLDAGEM: Se houver um ponto/marca circular no centro exato do fundo, é INJETADO. Se o fundo for totalmente liso, é TERMOFORMADO. Formatos: REDONDO, QUADRADO, RETANGULAR, OVAL.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            razaoSocial: { type: Type.STRING },
            cnpj: { type: Type.ARRAY, items: { type: Type.STRING } },
            marca: { type: Type.STRING },
            descricaoProduto: { type: Type.STRING },
            conteudo: { type: Type.STRING },
            endereco: { type: Type.STRING },
            cep: { type: Type.STRING },
            telefone: { type: Type.STRING },
            site: { type: Type.STRING },
            fabricanteEmbalagem: { type: Type.STRING },
            moldagem: { type: Type.STRING },
            formatoEmbalagem: { type: Type.STRING },
            tipoEmbalagem: { type: Type.STRING },
            modeloEmbalagem: { type: Type.STRING }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou dados.");
    
    // Extração robusta de JSON: procura o primeiro '{' e o último '}'
    let cleanJson = jsonText.trim();
    const firstBracket = cleanJson.indexOf('{');
    const lastBracket = cleanJson.lastIndexOf('}');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }
    
    const raw = JSON.parse(cleanJson);
    const sanitize = (val: any) => (val === null || val === undefined || val === "" || val === "N/I") ? "N/I" : String(val);

    let formato = sanitize(raw.formatoEmbalagem).toUpperCase();
    if (formato.includes("CILIN") || formato.includes("CILÍN")) {
      formato = "REDONDO";
    }

    // Reforço da lógica de moldagem caso o modelo falhe na normalização
    let moldagem = sanitize(raw.moldagem).toUpperCase();
    if (moldagem.includes("INJET")) moldagem = "INJETADO";
    else if (moldagem.includes("TERMO")) moldagem = "TERMOFORMADO";
    else moldagem = "TERMOFORMADO"; // Default mais comum

    return {
      razaoSocial: sanitize(raw.razaoSocial).toUpperCase(),
      cnpj: Array.isArray(raw.cnpj) ? raw.cnpj.map((c: any) => sanitize(c)) : [sanitize(raw.cnpj)].filter(c => c !== "N/I"),
      marca: sanitize(raw.marca).toUpperCase(),
      descricaoProduto: sanitize(raw.descricaoProduto).toUpperCase(),
      conteudo: sanitize(raw.conteudo).toUpperCase(),
      endereco: sanitize(raw.endereco).toUpperCase(),
      cep: sanitize(raw.cep).toUpperCase(),
      telefone: sanitize(raw.telefone).toUpperCase(),
      site: sanitize(raw.site).toLowerCase(),
      fabricanteEmbalagem: sanitize(raw.fabricanteEmbalagem).toUpperCase(),
      moldagem: moldagem,
      formatoEmbalagem: formato,
      // Fixed: Property access should match the schema (camelCase)
      tipoEmbalagem: sanitize(raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: sanitize(raw.modeloEmbalagem).toUpperCase(),
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  } catch (error) {
    console.error("Erro no Gemini Service:", error);
    // Fallback para não quebrar a aplicação, retornando o que for possível
    return {
      razaoSocial: "ERRO NA EXTRAÇÃO - TENTE NOVAMENTE",
      cnpj: ["N/I"],
      marca: "N/I",
      descricaoProduto: "N/I",
      conteudo: "N/I",
      endereco: "N/I",
      cep: "N/I",
      telefone: "N/I",
      site: "N/I",
      fabricanteEmbalagem: "N/I",
      moldagem: "N/I",
      formatoEmbalagem: "N/I",
      tipoEmbalagem: "N/I",
      modeloEmbalagem: "N/I",
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  }
}
