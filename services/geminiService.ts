import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData } from "../types";

/**
 * Comprime uma imagem base64 mantendo a legibilidade para OCR.
 * Isso reduz drasticamente o tamanho do payload, economiza tokens e aumenta a estabilidade.
 */
function compressImage(base64: string, maxWidth: number = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth && img.height <= maxWidth) {
        resolve(base64);
        return;
      }

      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Salva como JPEG com 82% de qualidade para manter a nitidez do OCR
      const compressed = canvas.toDataURL("image/jpeg", 0.82);
      resolve(compressed);
    };
    img.onerror = (err) => {
      console.warn("Falha ao carregar imagem para compressão, enviando original:", err);
      resolve(base64);
    };
    img.src = base64;
  });
}

/**
 * Traduz e formata erros da API Gemini para mensagens amigáveis em português.
 */
function parseGeminiError(error: any): { title: string; detail: string } {
  if (!error) return { title: "ERRO DESCONHECIDO", detail: "Tente novamente." };

  let errorStr = "";
  if (typeof error === "string") {
    errorStr = error;
  } else if (error.message && typeof error.message === "string") {
    errorStr = error.message;
  } else {
    try {
      errorStr = JSON.stringify(error);
    } catch {
      errorStr = String(error);
    }
  }

  // Tenta extrair objeto de erro estruturado em JSON
  let parsedJson: any = null;
  try {
    const startIdx = errorStr.indexOf("{");
    const endIdx = errorStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      parsedJson = JSON.parse(errorStr.substring(startIdx, endIdx + 1));
    } else {
      parsedJson = JSON.parse(errorStr);
    }
  } catch {
    // Não é JSON
  }

  const apiError = parsedJson?.error || parsedJson;
  const code = apiError?.code || error?.status || error?.code;
  const message = apiError?.message || errorStr;

  if (code === 429 || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("quota")) {
    return {
      title: "LIMITE DE REQUISIÇÕES (429)",
      detail: "O limite de cota gratuita da API do Gemini foi atingido. Aguarde 1 minuto e tente novamente, ou insira uma chave de produção nas variáveis de ambiente."
    };
  }

  if (code === 503 || errorStr.includes("503") || errorStr.includes("UNAVAILABLE") || errorStr.includes("high demand")) {
    return {
      title: "SERVIDORES GEMINI CONGESTIONADOS (503)",
      detail: "Os servidores gratuitos do Google estão sob alta demanda temporária neste momento. Por favor, tente enviar novamente em instantes."
    };
  }

  if (code === 400 && (errorStr.includes("API key") || errorStr.includes("key not valid") || errorStr.includes("INVALID_ARGUMENT"))) {
    return {
      title: "CHAVE API CONFIGURADA INCORRETAMENTE (400)",
      detail: "A chave API do Gemini configurada nas variáveis de ambiente está inválida, incompleta ou expirada. Verifique as configurações de ambiente no painel."
    };
  }

  return {
    title: `FALHA NA EXTRAÇÃO (${code || "API"})`,
    detail: message || errorStr
  };
}

export async function extractDataFromPhotos(photos: string[]): Promise<ExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY || (process.env as any).API_KEY;
  
  if (apiKey && apiKey !== "undefined" && apiKey.length > 5) {
    const masked = apiKey.length > 6 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "***";
    console.log(`[GeminiService] Chave API carregada com sucesso (${masked})`);
  } else {
    console.error("ERRO: Nenhuma chave API (GEMINI_API_KEY ou API_KEY) foi encontrada ou configurada corretamente.");
    return {
      razaoSocial: "ERRO: CHAVE API NÃO ENCONTRADA (Verifique se adicionou 'API_KEY' no Vercel e realizou um novo DEPLOY)",
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
      dataLeitura: new Date().toLocaleString("pt-BR")
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prepareImagePart = (base64: string) => {
      const match = base64.match(/^data:(image\/[a-zA-Z0-9\-\+\.]+);base64,/);
      const mimeType = match ? match[1] : "image/jpeg";
      const data = base64.includes(",") ? base64.split(",")[1] : base64;
      return { inlineData: { mimeType, data } };
    };

    const validPhotos = photos.filter((p) => p && p.length > 50);
    if (validPhotos.length === 0) throw new Error("Nenhuma foto válida capturada.");

    // Compressão automática das fotos para otimizar desempenho e evitar estouro de tokens
    const compressedPhotos = await Promise.all(
      validPhotos.map((photo) => compressImage(photo, 1200))
    );

    const imageParts = compressedPhotos.map(prepareImagePart);

    const textPart = {
      text: `VOCÊ É UM ANALISTA TÉCNICO EXPERT EM MOLDAGEM E DESIGN DE EMBALAGENS PLÁSTICAS.
      Sua missão é realizar OCR e análise técnica visual extremamente criteriosa das fotos enviadas para extrair dados estruturados.

      DIFERENCIAÇÃO CRÍTICA DE MOLDAGEM (DADOS TÉCNICOS CRUCIAIS):
      Você deve analisar com máxima atenção o fundo externo (a base do pote/copo/embalagem):
      
      1. INJETADO: Procure obrigatoriamente por um "PONTO DE INJEÇÃO" CENTRAL. Trata-se de um pequeno círculo em relevo, cicatriz de entrada do material, ou rebarba central exata no centro geométrico do fundo (de onde o plástico derretido fluiu para preencher o molde). Se identificar esse pequeno ponto central cicatrizado ou relevo no centro exato da base, classifique obrigatoriamente como "INJETADO".
      
      2. TERMOFORMADO: O fundo/centro geométrico é liso e plano.
         ATENÇÃO EXTREMA: Logotipos de marcas (ex: "Fibrasa"), símbolos de reciclabilidade (como triângulos com números 5 PP, 6 PS, etc.), códigos numéricos de cavidade ou círculos concêntricos gravados na base NÃO SÃO pontos de injeção. Se o centro geométrico da base for liso, sem a cicatriz pontual circular de injeção descrita acima, classifique obrigatoriamente como "TERMOFORMADO".

      DADOS ADICIONAIS A EXTRAIR:
      - CNPJ: Procure por sequências de 14 dígitos (ex: 00.000.000/0000-00).
      - RAZÃO SOCIAL: Nome da empresa fabricante do conteúdo (produto alimentício, etc.).
      - MARCA: Nome comercial do produto.
      - FABRICANTE DA EMBALAGEM: Identifique logos ou nomes gravados no próprio plástico (ex: Fibrasa, Brasilpack, Copobras, Berry).
      - FORMATO: REDONDO, OVAL, QUADRADO, RETANGULAR.
      
      Retorne estritamente em JSON.`
    };

    // Modelos ordenados de maior compatibilidade, menor consumo de token e estabilidade superior
    const modelsToTry = [
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash",
      "gemini-flash-latest"
    ];

    let response = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      let attempts = 2; // Realiza até 2 tentativas por modelo em caso de erro temporário
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          console.log(`Tentando extração de dados com o modelo: ${modelName} (Tentativa ${attempt}/${attempts})`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [...imageParts, textPart] },
            config: {
              systemInstruction:
                "Você é um engenheiro sênior especialista em embalagens plásticas e OCR. Analise criteriosamente as imagens para extrair informações precisas. Para classificar a moldagem (INJETADO vs TERMOFORMADO), lembre-se: INJETADO tem obrigatoriamente ponto central (cicatriz de injeção), TERMOFORMADO tem centro liso (mesmo que tenha logotipos ou símbolos de reciclagem gravados na base).",
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

          if (response && response.text) {
            console.log(`Extração de dados concluída com sucesso usando o modelo: ${modelName}`);
            break;
          }
        } catch (err: any) {
          const errStr = err?.message || String(err);
          console.warn(`O modelo ${modelName} falhou na tentativa ${attempt}:`, errStr);
          lastError = err;

          // Se for erro temporário de cota (429) ou congestionamento (503), e houver novas tentativas, aguarda backoff
          if (
            attempt < attempts &&
            (errStr.includes("503") ||
              errStr.includes("429") ||
              errStr.includes("UNAVAILABLE") ||
              errStr.includes("RESOURCE_EXHAUSTED"))
          ) {
            const delay = attempt * 1500;
            console.log(`Erro temporário (${errStr.includes("429") ? "429" : "503"}). Aguardando ${delay}ms para tentar novamente...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            break; // Sai do loop interno e pula para tentar o próximo modelo
          }
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error("Nenhum dos modelos disponíveis conseguiu processar as imagens.");
    }

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou dados.");

    let cleanJson = jsonText.trim();
    const firstBracket = cleanJson.indexOf("{");
    const lastBracket = cleanJson.lastIndexOf("}");

    if (firstBracket !== -1 && lastBracket !== -1) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    const raw = JSON.parse(cleanJson);
    const sanitize = (val: any) =>
      val === null || val === undefined || val === "" || val === "N/I" ? "N/I" : String(val);

    let formato = sanitize(raw.formatoEmbalagem).toUpperCase();
    if (formato.includes("CILIN") || formato.includes("CILÍN")) {
      formato = "REDONDO";
    }

    let moldagem = sanitize(raw.moldagem).toUpperCase();
    if (moldagem.includes("INJET")) moldagem = "INJETADO";
    else if (moldagem.includes("TERMO")) moldagem = "TERMOFORMADO";
    else moldagem = "TERMOFORMADO";

    return {
      razaoSocial: sanitize(raw.razaoSocial).toUpperCase(),
      cnpj: Array.isArray(raw.cnpj) ? raw.cnpj.map((c: any) => sanitize(c)) : [sanitize(raw.cnpj)].filter((c) => c !== "N/I"),
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
      tipoEmbalagem: sanitize(raw.tipoEmbalagem || "POTE").toUpperCase(),
      modeloEmbalagem: sanitize(raw.modeloEmbalagem).toUpperCase(),
      dataLeitura: new Date().toLocaleString("pt-BR")
    };
  } catch (error: any) {
    console.error("Erro no Gemini Service:", error);
    
    // Processamento amigável e traduzido do erro para exibição no card do front-end
    const parsed = parseGeminiError(error);
    
    return {
      razaoSocial: `${parsed.title} - ${parsed.detail}`,
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
      dataLeitura: new Date().toLocaleString("pt-BR")
    };
  }
}
