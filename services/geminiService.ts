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
      text: `VOCÊ É UM ANALISTA TÉCNICO DE EMBALAGENS PLÁSTICAS E OCR DE ALTA PRECISÃO.
      Sua tarefa é analisar estas 3 fotos de um produto e extrair informações cruciais.
      As imagens podem conter reflexos ou textos pequenos. Examine cada detalhe.

      DADOS PRIORITÁRIOS:
      1. CNPJ e RAZÃO SOCIAL: Procure no rótulo traseiro ou lateral (Ex: 'Fabricado por: PRODUTOS ALIMENTÍCIOS CRISPETES LTDA', 'CNPJ: 59.279.737/0001-38').
      2. MOLDAGEM (DEFINIÇÃO TÉCNICA):
         - Procure na foto que mostra a parte plástica (fundo ou tampa).
         - Verifique a presença de um pequeno círculo central (Ponto de Injeção).
         - Se houver ponto de injeção: 'INJETADO'.
         - Se a superfície for lisa ou com marcas de vácuo nas bordas: 'TERMOFORMADO'.
      3. MARCA E PRODUTO: Identifique o nome principal (Ex: 'DANNY BALL') e o sabor/tipo.
      4. CONTEÚDO: Localize o peso ou volume (Ex: '900g', '500ml').

      REGRAS DE RETORNO:
      - Extraia o máximo possível. Use 'N/I' para o que não for visível.
      - Retorne estritamente um JSON válido seguindo o schema.
      - Padronize Moldagem (INJETADO/TERMOFORMADO) e Formato (REDONDO/QUADRADO/RETANGULAR/OVAL).` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Especialista em visão computacional industrial. Extração cirúrgica de dados de rótulos. Foco em ponto de injeção central para moldagem.",
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
    if (!jsonText) throw new Error("A IA não retornou conteúdo.");
    
    const raw = JSON.parse(jsonText.trim());
    const sanitize = (val: any) => (val === null || val === undefined || val === "" || val === "N/I") ? "N/I" : String(val);

    let formato = sanitize(raw.formatoEmbalagem).toUpperCase();
    if (formato.includes("CILIN")) formato = "REDONDO";

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
    console.error("Gemini Vision Error:", error);
    return {
      razaoSocial: "N/I", cnpj: ["N/I"], marca: "N/I", descricaoProduto: "N/I", conteudo: "N/I",
      endereco: "N/I", cep: "N/I", telefone: "N/I", site: "N/I", fabricanteEmbalagem: "N/I",
      moldagem: "TERMOFORMADO", formatoEmbalagem: "REDONDO", tipoEmbalagem: "POTE", modeloEmbalagem: "N/I",
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  }
}
