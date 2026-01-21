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
      text: `Analise cuidadosamente as 3 fotos da embalagem (Frente, Verso/Dados e Fundo). 
      Extraia o máximo de informações possível, mesmo que parciais. NÃO aborte se faltar algo.
      
      INSTRUÇÃO TÉCNICA DE MOLDAGEM:
      - Examine a foto do FUNDO (peça plástica).
      - Procure por um pequeno ponto circular central (marca de entrada da resina).
      - Se houver ponto central: Moldagem = 'INJETADO'.
      - Se o fundo for liso, sem ponto central, com marcas de borda de corte: Moldagem = 'TERMOFORMADO'.

      DADOS A EXTRAIR:
      - Razão Social (Fabricante do produto)
      - CNPJ (Formato 00.000.000/0000-00)
      - Marca (Nome de maior destaque no rótulo)
      - Descrição do Produto (Ex: Bebida Láctea, Doce)
      - Conteúdo Líquido (Ex: 170g, 500ml)
      - Endereço, CEP, Telefone e Site
      - Fabricante da Embalagem Plástica (Relevo no fundo: PRAFESTA, THERMOVAC, etc.)
      - Moldagem: INJETADO ou TERMOFORMADO (Siga a instrução técnica acima).
      - Formato: REDONDO, QUADRADO, RETANGULAR ou OVAL. (Nunca use cilíndrico).
      - Tipo: POTE, TAMPA, BALDE, FRASCO.
      - Modelo: Ref. técnica ou modelo da peça.` 
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, textPart] },
      config: {
        systemInstruction: "Você é um analista de embalagens. Extraia os dados e retorne stritamente um JSON. Caso não localize algum dado, use 'N/I'. Padronize Moldagem (INJETADO/TERMOFORMADO) e Formato (REDONDO/QUADRADO/RETANGULAR/OVAL).",
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
    console.error("Gemini Error:", error);
    // Em caso de erro, retorna um objeto vazio estruturado para não quebrar a aplicação
    return {
      razaoSocial: "N/I", cnpj: ["N/I"], marca: "N/I", descricaoProduto: "N/I", conteudo: "N/I",
      endereco: "N/I", cep: "N/I", telefone: "N/I", site: "N/I", fabricanteEmbalagem: "N/I",
      moldagem: "TERMOFORMADO", formatoEmbalagem: "REDONDO", tipoEmbalagem: "POTE", modeloEmbalagem: "N/I",
      dataLeitura: new Date().toLocaleString('pt-BR')
    };
  }
}
