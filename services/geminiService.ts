import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
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
      text: `Analise estas fotos de uma embalagem industrial. 
      Extraia os seguintes dados:
      - Razão Social (Fabricante do produto final)
      - CNPJ (Todos os encontrados)
      - Marca do produto
      - Descrição do Produto
      - Conteúdo Líquido (Ex: 500g, 1kg)
      - Endereço Completo, CEP, Telefone e Site
      - Fabricante da Embalagem Plástica (Verificar no relevo do fundo da peça)
      - Moldagem: Deve ser apenas 'INJETADO' ou 'TERMOFORMADO'
      - Formato: Deve ser apenas 'REDONDO', 'QUADRADO', 'RETANGULAR' ou 'OVAL'. JAMAIS utilize o termo 'CILÍNDRICO'.
      - Tipo de Embalagem (Ex: POTE, TAMPA, BALDE)
      - Modelo da Embalagem (Ex: P500, B10)` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um especialista em OCR industrial. Retorne estritamente um JSON. Padronize Moldagem para INJETADO/TERMOFORMADO e Formato para REDONDO/QUADRADO/RETANGULAR/OVAL. Não use 'CILÍNDRICO'. Use 'N/I' para dados ausentes.",
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
          },
          required: ["razaoSocial", "cnpj", "marca"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou dados válidos.");
    
    const raw = JSON.parse(jsonText.trim());
    const sanitize = (val: any) => (val === null || val === undefined || val === "" || val === "N/I") ? "N/I" : String(val);

    // Validação forçada de Formato para evitar "Cilindrico"
    let formato = sanitize(raw.formatoEmbalagem).toUpperCase();
    if (formato.includes("CILIN") || formato.includes("CILÍN")) {
      formato = "REDONDO";
    }

    return {
      razaoSocial: sanitize(raw.razaoSocial).toUpperCase(),
      cnpj: Array.isArray(raw.cnpj) ? raw.cnpj.map(c => sanitize(c)) : [sanitize(raw.cnpj)].filter(c => c !== "N/I"),
      marca: sanitize(raw.marca).toUpperCase(),
      descricaoProduto: sanitize(raw.descricaoProduto).toUpperCase(),
      conteudo: sanitize(raw.conteudo).toUpperCase(),
      endereco: sanitize(raw.endereco).toUpperCase(),
      cep: sanitize(raw.cep).toUpperCase(),
      telefone: sanitize(raw.telefone).toUpperCase(),
      site: sanitize(raw.site).toLowerCase(),
      fabricanteEmbalagem: sanitize(raw.fabricanteEmbalagem).toUpperCase(),
      moldagem: sanitize(raw.moldagem || "TERMOFORMADO").toUpperCase(),
      formatoEmbalagem: formato,
      tipoEmbalagem: sanitize(raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: sanitize(raw.modeloEmbalagem).toUpperCase(),
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  } catch (error) {
    console.error("Erro no Gemini Service:", error);
    throw new Error("Falha na extração de dados. Tente novamente com fotos mais nítidas.");
  }
}