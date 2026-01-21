import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  const apiKey = process.env.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(',') ? base64.split(',')[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    const imageParts = photos.map(prepareImagePart);
    const textPart = { 
      text: `Analise as 3 fotos da embalagem industrial fornecidas. 
      Extraia os seguintes dados técnicos com PRECISÃO MÁXIMA:
      - Razão Social (Fabricante do produto)
      - CNPJ (Extraia todos os encontrados, formate como 00.000.000/0000-00)
      - Marca (O nome comercial de maior destaque)
      - Descrição do Produto (O que é o produto, ex: "IOGURTE DESNATADO")
      - Conteúdo Líquido (Ex: 170g, 500ml, 1kg)
      - Endereço Completo, CEP, Telefone e Site
      - Fabricante da Embalagem Plástica (Geralmente no relevo do fundo. Procure por marcas como PRAFESTA, THERMOVAC, GALVANOTEK, COPOBRAS, etc.)
      - Moldagem: Deve ser obrigatoriamente 'INJETADO' ou 'TERMOFORMADO'. Se houver ponto de injeção central no fundo é INJETADO.
      - Formato: Deve ser 'REDONDO', 'QUADRADO', 'RETANGULAR' ou 'OVAL'. (NÃO utilize "Cilíndrico").
      - Tipo de Embalagem (Ex: POTE, TAMPA, BALDE, FRASCO)
      - Modelo da Embalagem (Procure referências técnicas como "P170", "MOD 123")` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um especialista em OCR industrial. Retorne estritamente um JSON. Padronize Moldagem para INJETADO/TERMOFORMADO e Formato para REDONDO/QUADRADO/RETANGULAR/OVAL. Use 'N/I' para dados ausentes. Se houver múltiplos CNPJs, coloque-os em um array de strings.",
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
    if (!jsonText) throw new Error("Resposta vazia da IA.");
    
    const raw = JSON.parse(jsonText.trim());
    const sanitize = (val: any) => (val === null || val === undefined || val === "" || val === "N/I") ? "N/I" : String(val);

    let formato = sanitize(raw.formatoEmbalagem).toUpperCase();
    if (formato.includes("CILIN")) {
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
    throw new Error("Falha na extração de dados. Tente novamente garantindo que o CNPJ e o fundo da peça estão visíveis.");
  }
}