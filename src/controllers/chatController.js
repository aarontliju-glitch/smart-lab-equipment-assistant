import { getGeminiClient, DEFAULT_MODEL, FALLBACK_MODELS } from '../config/gemini.js';
import { LAB_ASSISTANT_SYSTEM_INSTRUCTION } from '../prompts/systemInstructions.js';

export async function handleChat(req, res) {
  try {
    const { message, history } = req.body;

    // 1. Validation: Message existence and type
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "message" is required and must be a non-empty string.',
      });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "message" cannot be empty.',
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message length exceeds the 2,000 character limit. Please shorten your query.',
      });
    }

    // 2. Client & API Key availability check
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error:
          'GEMINI_API_KEY is not configured on the server. Please add your Gemini API key from Google AI Studio to the backend .env file (GEMINI_API_KEY=your_key) and restart the server.',
        code: 'MISSING_API_KEY',
      });
    }

    // 3. Format contents with optional conversational history
    let contents = [];

    if (Array.isArray(history) && history.length > 0) {
      for (const item of history.slice(-6)) {
        if (item && item.role && item.text) {
          const role = item.role === 'assistant' ? 'model' : 'user';
          contents.push({
            role: role,
            parts: [{ text: String(item.text).slice(0, 1000) }],
          });
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: trimmedMessage }],
    });

    // 4. Try generation with candidate models (handles high-demand spikes gracefully)
    const uniqueModels = [...new Set(FALLBACK_MODELS)];
    let lastError = null;

    for (const modelName of uniqueModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: LAB_ASSISTANT_SYSTEM_INSTRUCTION,
            temperature: 0.4,
            maxOutputTokens: 1500,
          },
        });

        const replyText = response.text;
        if (replyText) {
          return res.status(200).json({
            success: true,
            reply: replyText,
            model: modelName,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${modelName} call failed, trying next candidate. Error: ${err.message}`);
      }
    }

    // If all models failed
    const errorMessage = lastError?.message || 'AI service temporarily unavailable.';
    return res.status(500).json({
      success: false,
      error: `Gemini API error: ${errorMessage}`,
      code: lastError?.code || 'GEMINI_API_ERROR',
    });
  } catch (err) {
    console.error('Error in Gemini chat controller:', err);
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
      code: 'SERVER_ERROR',
    });
  }
}

export function handleHealth(req, res) {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  return res.status(200).json({
    status: 'ok',
    service: 'Smart Lab Equipment Assistant API',
    geminiConfigured: hasKey,
    model: DEFAULT_MODEL,
    timestamp: new Date().toISOString(),
  });
}
