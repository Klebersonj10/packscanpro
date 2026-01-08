import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  // Inicialização estritamente conforme as diretrizes: usar process.env.API_KEY diretamente.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    const imageParts = photos.map(prepareImagePart);
    const textPart = { 
      text: "Atue como Auditor de Embalagens Industriais. Analise as imagens e extraia os 14 campos solicitados. IMPORTANTE: No fundo da embalagem, identifique o fabricante plástico (ex: FIBRASA, BOMIX, RIOPLASTIC). Se for impossível ler, use 'N/I'." 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um especialista em prospecção industrial. Extraia dados de embalagens plásticas. Gere um JSON com: razaoSocial, cnpj (array), marca, descricaoProduto, conteudo, endereco, cep, telefone, site, fabricanteEmbalagem, moldagem (TERMOFORMADO ou INJETADO), formatoEmbalagem (REDONDO, RETANGULAR, QUADRADO, OVAL), tipoEmbalagem (BALDE, COPO, POTE), modeloEmbalagem. Não use Markdown, retorne apenas o JSON puro.",
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 },
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
          },
          required: ["razaoSocial", "cnpj", "tipoEmbalagem", "moldagem"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("A IA não retornou conteúdo.");
    
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const raw = JSON.parse(cleanJson);
    
    // Sanitização para garantir que todos os campos sejam strings, prevenindo [object Object] na UI
    const toString = (val: any) => val === null || val === undefined ? "N/I" : (typeof val === 'object' ? JSON.stringify(val) : String(val));

    return {
      razaoSocial: toString(raw.razaoSocial),
      cnpj: Array.isArray(raw.cnpj) ? raw.cnpj.map(c => toString(c)) : [toString(raw.cnpj)].filter(c => c !== "N/I"),
      marca: toString(raw.marca),
      descricaoProduto: toString(raw.descricaoProduto),
      conteudo: toString(raw.conteudo),
      endereco: toString(raw.endereco),
      cep: toString(raw.cep),
      telefone: toString(raw.telefone),
      site: toString(raw.site),
      fabricanteEmbalagem: toString(raw.fabricanteEmbalagem),
      moldagem: toString(raw.moldagem || "TERMOFORMADO").toUpperCase(),
      formatoEmbalagem: toString(raw.formatoEmbalagem || "REDONDO").toUpperCase(),
      tipoEmbalagem: toString(raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: toString(raw.modeloEmbalagem),
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  } catch (error) {
    console.error("Erro Gemini Service:", error);
    throw error;
  }
}