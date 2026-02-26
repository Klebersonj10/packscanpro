
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
    const imageParts = validPhotos.map(prepareImagePart);
    
    const textPart = { 
      text: `VOCÊ É UM ANALISTA TÉCNICO DE EMBALAGENS PLÁSTICAS.
      Sua missão é extrair dados precisos destas fotos.
      
      IMPORTANTE: Se você conseguir extrair informação de apenas uma imagem e não das demais, NÃO FALHE. Forneça todos os dados que conseguir encontrar. Use "N/I" (Não Identificado) para campos impossíveis de determinar.
      
      INSTRUÇÃO TÉCNICA DE MOLDAGEM:
      Analise o fundo da embalagem. 
      - O que difere TERMOFORMADO de INJETADO é o PONTO DE INJEÇÃO.
      - INJETADO: Possui obrigatoriamente um ponto central (pequena marca circular ou cicatriz) de onde o plástico fluiu.
      - TERMOFORMADO: O fundo é liso, sem marcas centrais, podendo conter apenas marcas de vácuo nas bordas.
      
      DADOS A EXTRAIR:
      - Razão Social (Fabricante do produto), CNPJ (todos), Marca, Descrição, Conteúdo (peso/vol).
      - Fabricante da Embalagem, Moldagem (INJETADO ou TERMOFORMADO), Formato (REDONDO/QUADRADO/RETANGULAR/OVAL), Tipo e Modelo.` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Retorne estritamente um JSON. Padronize Moldagem para INJETADO/TERMOFORMADO e Formato para REDONDO/QUADRADO/RETANGULAR/OVAL. Nunca use 'CILÍNDRICO'. Use 'N/I' para dados ausentes.",
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
            moldagem: { type: Type.STRING, description: "INJETADO se houver ponto central, TERMOFORMADO se liso" },
            formatoEmbalagem: { type: Type.STRING },
            tipoEmbalagem: { type: Type.STRING },
            modeloEmbalagem: { type: Type.STRING }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou dados.");
    
    // Remove markdown code blocks if present
    const cleanJson = jsonText.replace(/```json\n?|```/g, "").trim();
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
