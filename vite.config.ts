import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function generateContentWithFallback(ai: GoogleGenAI, prompt: string): Promise<string> {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });
        if (response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        const isTransient =
          err?.status === 503 ||
          err?.status === 429 ||
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTransient && attempt < 2) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 350));
          continue;
        }
        break;
      }
    }
  }

  let friendlyMessage = 'This model is currently experiencing high demand. Automatic retries failed — please try again in a few moments.';
  if (lastError) {
    try {
      const parsed = typeof lastError.message === 'string' ? JSON.parse(lastError.message) : lastError;
      if (parsed?.error?.message) {
        friendlyMessage = parsed.error.message;
      } else if (lastError.message) {
        friendlyMessage = lastError.message;
      }
    } catch {
      friendlyMessage = lastError.message || friendlyMessage;
    }
  }
  throw new Error(friendlyMessage);
}

function sheetGptApiPlugin(): Plugin {
  return {
    name: 'sheetgpt-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const readBody = (): Promise<any> => {
          return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', chunk => {
              data += chunk;
            });
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch (e) {
                reject(e);
              }
            });
            req.on('error', reject);
          });
        };

        if (req.method === 'POST' && req.url === '/api/ai-clean') {
          try {
            const body = await readBody();
            const { columns, instruction } = body;

            if (!columns || !Array.isArray(columns) || columns.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'No columns provided' }));
            }

            if (!instruction || instruction.trim() === '') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'No cleaning instruction provided' }));
            }

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Gemini API key is not configured' }));
            }

            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            });

            const csvPreview = columns
              .map((col: any) => `${col.header}: ${(col.values || []).join(', ')}`)
              .join('\n');

            const prompt = `You are a data cleaning assistant. You will receive CSV column data and a cleaning instruction.
Apply the instruction to every value in each column and return the cleaned values.

Cleaning instruction: "${instruction}"

Column data (header: value1, value2, ...):
${csvPreview}

Return ONLY a JSON array where each element has "header" (the column name) and "values" (an array of cleaned string values, same length as input).
Do not include any explanation, markdown, or code fences. Return only the raw JSON array.

Example output:
[{"header":"name","values":["John Doe","Jane Smith"]},{"header":"email","values":["john@example.com","jane@example.com"]}]`;

            const text = await generateContentWithFallback(ai, prompt);

            let cleanedColumns;
            try {
              cleanedColumns = JSON.parse(text);
            } catch {
              const match = text.match(/\[[\s\S]*\]/);
              if (!match) throw new Error('Could not parse Gemini response as JSON');
              cleanedColumns = JSON.parse(match[0]);
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ columns: cleanedColumns }));
          } catch (err: any) {
            console.error('AI Clean error:', err?.message || err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: err?.message || 'AI request failed' }));
          }
        }

        if (req.method === 'POST' && req.url === '/api/ai-sentiment') {
          try {
            const body = await readBody();
            const { header, values } = body;

            if (!header || !values || !Array.isArray(values)) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Missing header or values' }));
            }

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Gemini API key is not configured' }));
            }

            // Using @google/generative-ai SDK with GEMINI_API_KEY
            const genAI = new GoogleGenerativeAI(apiKey);

            const rowsText = values
              .map((v: any, i: number) => `${i + 1}. "${v}"`)
              .join('\n');

            const prompt = `You are an expert sentiment classification engine.
Analyze each text entry below and categorize its sentiment as strictly one of: "Positive", "Neutral", or "Negative".

Column header: "${header}"
Entries to categorize:
${rowsText}

Return ONLY a strictly formatted JSON array of strings with exactly ${values.length} elements in the same order as the entries.
Each string element must be one of: "Positive", "Neutral", or "Negative".

Example output for 3 items:
["Positive", "Neutral", "Negative"]`;

            // Call gemini-1.5-flash with fallback to gemini-3.1-flash-lite / gemini-flash-latest
            const modelsToTry = ['gemini-1.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
            let text = '';
            let lastError: any = null;

            for (const modelName of modelsToTry) {
              try {
                const model = genAI.getGenerativeModel({
                  model: modelName,
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                  },
                });
                const result = await model.generateContent(prompt);
                text = result.response.text();
                if (text) break;
              } catch (err: any) {
                lastError = err;
                continue;
              }
            }

            if (!text) {
              try {
                const ai = new GoogleGenAI({
                  apiKey,
                  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
                });
                text = await generateContentWithFallback(ai, prompt);
              } catch (fallbackErr) {
                // keep original lastError
              }
            }

            if (!text) {
              throw lastError || new Error('Failed to classify sentiment');
            }

            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch {
              const match = text.match(/\[[\s\S]*\]/);
              if (!match) throw new Error('Could not parse Gemini response as JSON');
              parsed = JSON.parse(match[0]);
            }

            const sentiments: string[] = [];
            for (let i = 0; i < values.length; i++) {
              const item = Array.isArray(parsed) ? parsed[i] : null;
              if (typeof item === 'string' && ['Positive', 'Neutral', 'Negative'].includes(item)) {
                sentiments.push(item);
              } else if (item && typeof item === 'object') {
                const val = item.sentiment || item.label || item.value || 'Neutral';
                sentiments.push(['Positive', 'Neutral', 'Negative'].includes(val) ? val : 'Neutral');
              } else {
                sentiments.push('Neutral');
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ values: sentiments }));
          } catch (err: any) {
            console.error('AI Sentiment error:', err?.message || err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: err?.message || 'Sentiment analysis failed' }));
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), sheetGptApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
