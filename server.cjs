var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
import_dotenv.default.config();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  app.post("/api/validate-key", async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ valid: false, error: "Nenhuma chave foi fornecida." });
    }
    const testModels = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let response = null;
    let lastError = null;
    for (const modelName of testModels) {
      try {
        const tempAi = new import_genai.GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        response = await tempAi.models.generateContent({
          model: modelName,
          contents: "Diga apenas 'Chave V\xE1lida' em portugu\xEAs."
        });
        if (response && response.text) {
          lastError = null;
          break;
        }
      } catch (error) {
        console.warn(`Validation failed for model ${modelName}:`, error.message || error);
        lastError = error;
        const errMsg = error.message || "";
        if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("not valid") || errMsg.includes("unauthorized") || errMsg.includes("400")) {
          break;
        }
      }
    }
    if (response && response.text) {
      return res.json({ valid: true });
    } else {
      console.error("API Key validation completely failed:", lastError);
      let displayError = "Chave de API inv\xE1lida ou expirada.";
      if (lastError && lastError.message) {
        if (lastError.message.includes("UNAVAILABLE") || lastError.message.includes("503")) {
          displayError = "Os modelos do Gemini est\xE3o com alta demanda tempor\xE1ria no momento. Por favor, aguarde alguns segundos e tente novamente.";
        } else {
          displayError = lastError.message;
        }
      }
      return res.status(400).json({
        valid: false,
        error: displayError
      });
    }
  });
  app.post("/api/transform-image", async (req, res) => {
    const { image, prompt, apiKey, aspectRatio } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Nenhum desenho foi enviado para a IA." });
    }
    const activeKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return res.status(400).json({
        error: "Chave de API do Gemini n\xE3o encontrada. Configure a sua chave de API do Gemini no painel para usar a transforma\xE7\xE3o por IA."
      });
    }
    const aiClient = new import_genai.GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    let cleanBase64 = image;
    let mimeType = "image/png";
    if (image.startsWith("data:")) {
      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        cleanBase64 = matches[2];
      }
    }
    const promptText = `Transforme essa imagem em foto real, respeitando o desenho, apenas completando conforme o contexto${prompt ? `. Contexto: ${prompt}` : ""}`;
    const imageModels = ["gemini-2.5-flash-image", "gemini-3.1-flash-image"];
    let lastImageError = null;
    let response = null;
    for (const imageModel of imageModels) {
      try {
        response = await aiClient.models.generateContent({
          model: imageModel,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType
                }
              },
              {
                text: promptText
              }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio || "4:3"
            }
          }
        });
        if (response) {
          lastImageError = null;
          break;
        }
      } catch (error) {
        console.warn(`Image generation failed for model ${imageModel}:`, error);
        lastImageError = error;
      }
    }
    if (!response) {
      console.log("Direct image model failed or is unavailable on free-tier key. Activating Intelligent Hybrid Fallback (Gemini Free Multimodal + Pollinations.ai)...");
      try {
        const textModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-3.5-flash"];
        let descriptionResponse = null;
        let lastTextModelError = null;
        const freePromptText = `Transforme essa imagem em foto real, respeitando o desenho, apenas completando conforme o contexto${prompt ? `. Contexto: ${prompt}` : ""}. Escreva apenas o prompt de imagem otimizado correspondente, em ingl\xEAs, em um \xFAnico par\xE1grafo curto.`;
        for (const textModel of textModels) {
          try {
            descriptionResponse = await aiClient.models.generateContent({
              model: textModel,
              contents: [
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType
                  }
                },
                {
                  text: freePromptText
                }
              ]
            });
            if (descriptionResponse && descriptionResponse.text) {
              lastTextModelError = null;
              break;
            }
          } catch (err) {
            console.warn(`Fallback text model ${textModel} failed:`, err);
            lastTextModelError = err;
          }
        }
        if (!descriptionResponse || !descriptionResponse.text) {
          throw lastTextModelError || new Error("N\xE3o foi poss\xEDvel gerar a descri\xE7\xE3o do desenho com o Gemini.");
        }
        const generatedPrompt = descriptionResponse.text.trim();
        console.log("Generated prompt for Pollinations:", generatedPrompt);
        let width = 1024;
        let height = 1024;
        if (aspectRatio === "4:3") {
          width = 1024;
          height = 768;
        } else if (aspectRatio === "16:9") {
          width = 1024;
          height = 576;
        } else if (aspectRatio === "3:4") {
          width = 768;
          height = 1024;
        } else if (aspectRatio === "1:1") {
          width = 1024;
          height = 1024;
        }
        const pollinationUrl = `https://image.pollinations.ai/p/${encodeURIComponent(generatedPrompt)}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
        console.log("Fetching from Pollinations.ai:", pollinationUrl);
        const imgRes = await fetch(pollinationUrl);
        if (!imgRes.ok) {
          throw new Error(`Erro ao gerar imagem com Pollinations (Status ${imgRes.status}).`);
        }
        const buffer = await imgRes.arrayBuffer();
        const generatedBase64 = Buffer.from(buffer).toString("base64");
        return res.json({
          success: true,
          image: `data:image/png;base64,${generatedBase64}`,
          feedback: `Seu desenho foi processado com sucesso de forma 100% gratuita! Usamos o Gemini (gr\xE1tis) para analisar os contornos do desenho e o Pollinations para renderizar a imagem sem custo.`
        });
      } catch (fallbackError) {
        console.error("Fallback hybrid flow failed:", fallbackError);
        const finalErrorMsg = lastImageError?.message || fallbackError.message || "Erro desconhecido na gera\xE7\xE3o h\xEDbrida.";
        let displayError = `Limite de cota excedido ou faturamento necess\xE1rio no Gemini. Tentamos utilizar o provedor de imagem gratuito alternativo, mas ocorreu o seguinte erro: ${finalErrorMsg}`;
        if (finalErrorMsg.includes("UNAVAILABLE") || finalErrorMsg.includes("503")) {
          displayError = "Os modelos do Gemini est\xE3o indispon\xEDveis por alta demanda tempor\xE1ria. Por favor, tente novamente em alguns instantes.";
        }
        return res.status(500).json({ error: displayError });
      }
    }
    try {
      let generatedBase64 = null;
      let textFeedback = "";
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            generatedBase64 = part.inlineData.data;
          } else if (part.text) {
            textFeedback += part.text;
          }
        }
      }
      if (generatedBase64) {
        return res.json({
          success: true,
          image: `data:image/png;base64,${generatedBase64}`,
          feedback: textFeedback || "Sua foto real foi gerada com perfei\xE7\xE3o pela IA do Gemini!"
        });
      } else {
        return res.status(500).json({
          error: "O modelo interpretou o desenho mas n\xE3o conseguiu gerar uma nova imagem. Tente adicionar mais tra\xE7os ou modificar o seu prompt.",
          textResponse: textFeedback
        });
      }
    } catch (error) {
      console.error("Processing generated image failed:", error);
      return res.status(500).json({ error: "Erro ao processar a imagem gerada pelo modelo." });
    }
  });
  app.post("/api/transform-selection", async (req, res) => {
    const { croppedImage, contextImage, prompt, apiKey } = req.body;
    if (!croppedImage) {
      return res.status(400).json({ error: "Nenhum desenho selecionado foi enviado para a IA." });
    }
    const activeKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return res.status(400).json({
        error: "Chave de API do Gemini n\xE3o encontrada. Configure a sua chave de API do Gemini no painel para usar a transforma\xE7\xE3o por IA."
      });
    }
    const aiClient = new import_genai.GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const parseBase64 = (dataUrl) => {
      let data = dataUrl;
      let mimeType = "image/png";
      if (dataUrl.startsWith("data:")) {
        const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          data = matches[2];
        }
      }
      return { data, mimeType };
    };
    const parsedCropped = parseBase64(croppedImage);
    const parsedContext = contextImage ? parseBase64(contextImage) : null;
    const directPromptText = `Voc\xEA \xE9 um transformador inteligente de tra\xE7os selecionados em imagens realistas.
A primeira imagem \xE9 a croppedSelection, que \xE9 o desenho que o usu\xE1rio selecionou e quer que voc\xEA transforme de acordo com o seguinte comando: "${prompt}".
A segunda imagem \xE9 a contextImage, que mostra todo o desenho ao redor da sele\xE7\xE3o para dar contexto de estilo, ilumina\xE7\xE3o, cores e \xE2ngulo.
Sua miss\xE3o \xE9 transformar a croppedSelection em um objeto fotorrealista completo baseado no comando do usu\xE1rio, harmonizando com o estilo e as cores vistos na contextImage.
MUITO IMPORTANTE: Renderize o objeto final gerado sobre um fundo BRANCO completamente s\xF3lido e liso (#ffffff) sem sombras de fundo, molduras ou elementos adicionais. Isso \xE9 essencial para podermos isolar o objeto com fundo transparente na tela de pintura.`;
    const imageModels = ["gemini-2.5-flash-image", "gemini-3.1-flash-image"];
    let lastImageError = null;
    let response = null;
    for (const imageModel of imageModels) {
      try {
        const contentsParts = [
          {
            inlineData: {
              data: parsedCropped.data,
              mimeType: parsedCropped.mimeType
            }
          }
        ];
        if (parsedContext) {
          contentsParts.push({
            inlineData: {
              data: parsedContext.data,
              mimeType: parsedContext.mimeType
            }
          });
        }
        contentsParts.push({ text: directPromptText });
        response = await aiClient.models.generateContent({
          model: imageModel,
          contents: { parts: contentsParts },
          config: {
            imageConfig: {
              aspectRatio: "1:1"
            }
          }
        });
        if (response) {
          lastImageError = null;
          break;
        }
      } catch (error) {
        console.warn(`Direct selection image generation failed for model ${imageModel}:`, error);
        lastImageError = error;
      }
    }
    if (!response) {
      console.log("Direct image generation failed or unavailable. Activating selection-based Intelligent Hybrid Fallback...");
      try {
        const textModels = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
        let descriptionResponse = null;
        let lastTextModelError = null;
        const fallbackPromptText = `Analise as duas imagens enviadas:
1. croppedSelection (o desenho selecionado pelo usu\xE1rio).
2. contextImage (o desenho completo ao redor para te dar contexto geral de \xE2ngulo, cores e ilumina\xE7\xE3o).
O usu\xE1rio quer transformar os tra\xE7os da croppedSelection em um objeto realista correspondente a: "${prompt}".
Escreva um prompt de gera\xE7\xE3o de imagem em ingl\xEAs extremamente descritivo, rico em detalhes, que represente esse objeto realista transformado.
O prompt gerado deve OBRIGATORIAMENTE herdar as cores, ilumina\xE7\xE3o e posicionamento apropriados da contextImage.
REQUISITO CRUCIAL: O prompt deve solicitar explicitamente que o objeto seja gerado centralizado e isolado sobre um fundo BRANCO s\xF3lido, limpo e impec\xE1vel ("solid, clean, plain white background, #ffffff"), sem nenhuma sombra no fundo, vinheta, molduras ou outros elementos ao redor, para que possamos torn\xE1-lo transparente.
Escreva APENAS o prompt gerado em ingl\xEAs, em um \xFAnico par\xE1grafo curto, sem nenhuma palavra de introdu\xE7\xE3o ou formata\xE7\xE3o Markdown.`;
        for (const textModel of textModels) {
          try {
            const contentsParts = [
              {
                inlineData: {
                  data: parsedCropped.data,
                  mimeType: parsedCropped.mimeType
                }
              }
            ];
            if (parsedContext) {
              contentsParts.push({
                inlineData: {
                  data: parsedContext.data,
                  mimeType: parsedContext.mimeType
                }
              });
            }
            contentsParts.push({ text: fallbackPromptText });
            descriptionResponse = await aiClient.models.generateContent({
              model: textModel,
              contents: contentsParts
            });
            if (descriptionResponse && descriptionResponse.text) {
              lastTextModelError = null;
              break;
            }
          } catch (err) {
            console.warn(`Fallback text model ${textModel} failed:`, err);
            lastTextModelError = err;
          }
        }
        if (!descriptionResponse || !descriptionResponse.text) {
          throw lastTextModelError || new Error("N\xE3o foi poss\xEDvel analisar as imagens de sele\xE7\xE3o com o Gemini.");
        }
        const generatedPrompt = descriptionResponse.text.trim();
        console.log("Generated prompt for selection with Pollinations:", generatedPrompt);
        const pollinationUrl = `https://image.pollinations.ai/p/${encodeURIComponent(generatedPrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
        console.log("Fetching selection from Pollinations:", pollinationUrl);
        const imgRes = await fetch(pollinationUrl);
        if (!imgRes.ok) {
          throw new Error(`Erro ao gerar imagem de sele\xE7\xE3o com Pollinations (Status ${imgRes.status}).`);
        }
        const buffer = await imgRes.arrayBuffer();
        const generatedBase64 = Buffer.from(buffer).toString("base64");
        return res.json({
          success: true,
          image: `data:image/png;base64,${generatedBase64}`,
          feedback: `Sua sele\xE7\xE3o foi processada com sucesso de forma gratuita! A IA analisou o contexto do seu desenho e gerou uma vers\xE3o integrada.`
        });
      } catch (fallbackError) {
        console.error("Fallback hybrid flow failed for selection:", fallbackError);
        const finalErrorMsg = lastImageError?.message || fallbackError.message || "Erro desconhecido na gera\xE7\xE3o h\xEDbrida de sele\xE7\xE3o.";
        return res.status(500).json({ error: `Ocorreu um erro ao processar a transforma\xE7\xE3o de sele\xE7\xE3o por IA: ${finalErrorMsg}` });
      }
    }
    try {
      let generatedBase64 = null;
      let textFeedback = "";
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            generatedBase64 = part.inlineData.data;
          } else if (part.text) {
            textFeedback += part.text;
          }
        }
      }
      if (generatedBase64) {
        return res.json({
          success: true,
          image: `data:image/png;base64,${generatedBase64}`,
          feedback: textFeedback || "Sua sele\xE7\xE3o foi transformada com sucesso!"
        });
      } else {
        return res.status(500).json({
          error: "O modelo interpretou o desenho mas n\xE3o conseguiu gerar uma nova imagem de sele\xE7\xE3o.",
          textResponse: textFeedback
        });
      }
    } catch (error) {
      console.error("Processing selection image failed:", error);
      return res.status(500).json({ error: "Erro ao processar a imagem de sele\xE7\xE3o gerada pelo modelo." });
    }
  });
  app.post("/api/generate-sketch", async (req, res) => {
    const { prompt, apiKey, contextImage } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Nenhum comando de desenho foi fornecido." });
    }
    const activeKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return res.status(400).json({
        error: "Chave de API do Gemini n\xE3o encontrada. Configure a sua chave de API do Gemini no painel para usar a IA desenhista."
      });
    }
    const aiClient = new import_genai.GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const systemInstruction = `You are a professional human sketch artist drawing on a 1000x700 canvas.
Your task is to translate natural language prompts into beautiful hand-drawn "pencil" strokes, lines, rectangles, circles, triangles, arrows, or text labels, depending on what works best for the requested design.
Guidelines:
1. You can generate freehand curves ('pencil') OR vector shape primitives ('line', 'rectangle', 'circle', 'triangle', 'arrow', 'text'). Choose whatever shapes and styles represent the subject beautifully and precisely.
2. The canvas coordinate system is 1000 wide by 700 high. Center your drawing nicely in the middle (typically within X: 150 to 850, Y: 80 to 620).
3. To ensure fast, reliable, and smooth JSON delivery, represent the drawing using 15 to 45 items in the 'strokes' array.
4. For 'pencil' strokes, provide a continuous sequence of 8 to 40 closely-spaced sequential points that trace a curve or details. Denser and closer points will make the strokes extremely high resolution and fluid.
5. For geometric shape primitives ('rectangle', 'circle', 'line', 'triangle', 'arrow'), provide EXACTLY 2 points in the 'points' array representing the primary bounds or vertices (e.g., points[0] is start/corner, points[1] is end/opposite corner).
6. For 'text' elements, provide EXACTLY 1 point in the 'points' array (representing the start/top-left placement), and fill the 'text' field with the short text label.
7. Use beautiful, colorful strokes when appropriate by specifying a CSS hex color in the 'color' field (e.g., green for trees, yellow for sun, pink/red for flowers/hearts, blue/cyan for water, orange/brown for animals, black or purple for accents/shadows). Use a wide range of gorgeous colors to make the sketch extremely vibrant and beautiful.
8. If drawing a cohesive scene, align your elements perfectly in 2D space without gaps. Ensure parts connect accurately.`;
    try {
      let responseText = "";
      let lastError = null;
      const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"];
      for (const modelName of modelsToTry) {
        let attempts = 3;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            console.log(`Tentando gerar desenho com o modelo ${modelName} (tentativa ${attempt}/${attempts})...`);
            const contentsParts = [];
            if (contextImage) {
              const matches = contextImage.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
              if (matches) {
                contentsParts.push({
                  inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                  }
                });
              }
            }
            const promptText = contextImage ? `Voc\xEA est\xE1 visualizando o desenho atual da tela de pintura (fornecido acima). Desenhe de forma colorida, fofa, detalhada e rica \xE0 l\xE1pis/formas: "${prompt}". Integre perfeitamente o novo desenho ao contexto, conte\xFAdo e elementos existentes no desenho atual na tela, complementando ou interagindo com ele de forma inteligente.` : `Desenhe de forma colorida, fofa e detalhada \xE0 l\xE1pis/formas: "${prompt}"`;
            contentsParts.push({ text: promptText });
            const response = await aiClient.models.generateContent({
              model: modelName,
              contents: contentsParts,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    description: {
                      type: import_genai.Type.STRING,
                      description: "A short Portuguese description of what you are drawing"
                    },
                    strokes: {
                      type: import_genai.Type.ARRAY,
                      description: "Array of drawing elements (strokes, shapes, or text annotations)",
                      items: {
                        type: import_genai.Type.OBJECT,
                        properties: {
                          type: {
                            type: import_genai.Type.STRING,
                            description: "Type of shape: 'pencil' (default freehand brush/line), 'line', 'rectangle', 'circle', 'triangle', 'arrow', or 'text'"
                          },
                          points: {
                            type: import_genai.Type.ARRAY,
                            description: "Sequence of points. For 'pencil', a path of 8-40 points. For geometric primitives, exactly 2 points (starting and ending/opposite corner). For 'text', exactly 1 point.",
                            items: {
                              type: import_genai.Type.OBJECT,
                              properties: {
                                x: { type: import_genai.Type.INTEGER },
                                y: { type: import_genai.Type.INTEGER }
                              },
                              required: ["x", "y"]
                            }
                          },
                          color: {
                            type: import_genai.Type.STRING,
                            description: "The CSS hex color for this element (e.g. '#ef4444', '#22c55e', '#3b82f6', '#eab308', etc.)"
                          },
                          text: {
                            type: import_genai.Type.STRING,
                            description: "The string text content if type is 'text'"
                          },
                          width: {
                            type: import_genai.Type.NUMBER,
                            description: "The thickness/width of the stroke (1 to 5) or font size (for text, 12 to 32)"
                          }
                        },
                        required: ["points"]
                      }
                    }
                  },
                  required: ["strokes"]
                }
              }
            });
            if (response && response.text) {
              responseText = response.text.trim();
              break;
            } else {
              throw new Error("O modelo n\xE3o retornou nenhum texto.");
            }
          } catch (error) {
            lastError = error;
            console.error(`Tentativa ${attempt} com ${modelName} falhou:`, error.message || error);
            const isRateLimitOrBusy = error.message?.includes("503") || error.message?.includes("UNAVAILABLE") || error.message?.includes("429") || JSON.stringify(error).includes("503") || JSON.stringify(error).includes("UNAVAILABLE") || JSON.stringify(error).includes("429");
            if (isRateLimitOrBusy && attempt < attempts) {
              const delay = attempt * 1200;
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              break;
            }
          }
        }
        if (responseText) {
          break;
        }
      }
      if (responseText) {
        const jsonResult = JSON.parse(responseText);
        return res.json({
          success: true,
          description: jsonResult.description || `Desenho de: ${prompt}`,
          strokes: jsonResult.strokes || []
        });
      } else {
        throw lastError || new Error("N\xE3o foi poss\xEDvel obter resposta de nenhum modelo Gemini.");
      }
    } catch (error) {
      console.error("Sketch generation failed completely:", error);
      let errMsg = error.message || "Erro desconhecido ao gerar o desenho.";
      if (errMsg.includes("UNAVAILABLE") || errMsg.includes("503")) {
        errMsg = "Os servidores do Gemini est\xE3o ocupados no momento devido \xE0 alta demanda. Por favor, tente novamente em alguns segundos.";
      }
      return res.status(500).json({ error: errMsg });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
