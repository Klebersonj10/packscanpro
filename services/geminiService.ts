
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    console.error("ERRO: GEMINI_API_KEY não configurada corretamente.");
    return {
      razaoSocial: "ERRO: CHAVE API NÃO CONFIGURADA NO VERCEL",
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

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    const validPhotos = photos.filter(p => p && p.length > 50);
    if (validPhotos.length === 0) throw new Error("Nenhuma foto válida capturada.");
    
    const imageParts = validPhotos.map(prepareImagePart);
    
    const textPart = { 
      text: `VOCÊ É UM ANALISTA TÉCNICO DE EMBALAGENS PLÁSTICAS.
      Sua missão é extrair dados com PRECISÃO TOTAL destas fotos.
      
      DIFERENCIAÇÃO DE MOLDAGEM (DADOS TÉCNICOS CRUCIAIS):
      - INJETADO: Observe o fundo externo da embalagem. Procure obrigatoriamente por um PONTO CENTRAL (uma pequena marca circular, relevo ou cicatriz exata no centro do fundo, de onde o plástico fluiu para o molde). Se houver esse ponto central, classifique obrigatoriamente como INJETADO.
      - TERMOFORMADO: Se o fundo for totalmente liso no centro, sem marca de injeção, classifique como TERMOFORMADO.
      
      DADOS A EXTRAIR:
      - CNPJs (procure por 14 dígitos), Razão Social, Marca, Descrição do Produto, Conteúdo.
      - Fabricante da Embalagem, Moldagem, Formato (REDONDO, OVAL, QUADRADO, RETANGULAR).
      
      Retorne apenas o JSON.` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um técnico especialista em embalagens plásticas. Extraia dados em formato JSON. Use 'N/I' para campos não identificados.",
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
