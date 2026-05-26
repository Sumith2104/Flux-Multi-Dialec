process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const baseAi = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
});

const FALLBACK_MODELS = [
  'googleai/gemini-2.5-flash',
  'googleai/gemini-2.0-flash',
  'googleai/gemini-1.5-flash',
  'googleai/gemini-1.5-pro',
];


const THIRD_PARTY_PROVIDERS = ['groq', 'xai', 'openai', 'nvidia'];

function describeZodSchema(schema: any): any {
  if (!schema) return 'any';
  if (schema._def) {
    const typeName = schema._def.typeName;
    if (typeName === 'ZodObject') {
      const shape = schema.shape;
      const res: any = {};
      for (const key of Object.keys(shape)) {
        res[key] = describeZodSchema(shape[key]);
      }
      return res;
    } else if (typeName === 'ZodArray') {
      return [describeZodSchema(schema._def.type)];
    } else if (typeName === 'ZodEffects') {
      return describeZodSchema(schema._def.schema);
    } else if (typeName === 'ZodOptional') {
      return describeZodSchema(schema._def.innerType);
    } else if (typeName === 'ZodNullable') {
      return describeZodSchema(schema._def.innerType);
    } else if (typeName === 'ZodString') {
      return 'string';
    } else if (typeName === 'ZodNumber') {
      return 'number';
    } else if (typeName === 'ZodBoolean') {
      return 'boolean';
    }
  }
  return 'any';
}

async function tryThirdPartyProvider(provider: string, prompt: string, schema: any) {
  let url = '';
  let apiKey = '';
  let model = '';

  if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    apiKey = process.env.GROQ_API_KEY || '';
    model = 'llama-3.3-70b-versatile';
  } else if (provider === 'xai') {
    url = 'https://api.x.ai/v1/chat/completions';
    apiKey = process.env.XAI_API_KEY || '';
    model = 'grok-2-latest';
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    apiKey = process.env.OPENAI_API_KEY || '';
    model = 'gpt-4o-mini';
  } else if (provider === 'nvidia') {
    url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    apiKey = process.env.NVIDIA_API_KEY || '';
    model = 'nvidia/llama-3.1-nemotron-70b-instruct';
  }


  if (!apiKey) {
    throw new Error(`API key for ${provider} is not set.`);
  }

  let finalPrompt = prompt;
  if (schema) {
    finalPrompt += `\n\nCRITICAL REQUIREMENT: You MUST respond with a valid JSON object conforming exactly to this JSON schema shape:\n${JSON.stringify(describeZodSchema(schema))}\nDo not wrap the JSON in markdown code blocks like \`\`\`json. Return raw JSON.`;
  }

  console.log(`[AI] Dispatching fetch to third-party provider ${provider} (${model})...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: finalPrompt }],
      response_format: schema ? { type: 'json_object' } : undefined,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${provider} request failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';

  let output = null;
  if (schema) {
    try {
      output = JSON.parse(rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch (e: any) {
      console.error(`[AI] Failed to parse JSON response from ${provider}:`, e);
      throw new Error(`Invalid JSON format returned by ${provider}`);
    }
  }

  return {
    text: rawText,
    output,
    message: { content: [{ text: rawText }] }
  };
}

export const ai = new Proxy(baseAi, {
  get(target, prop, receiver) {
    if (prop === 'generate') {
      return async (options: any) => {
        let lastError: any = null;
        
        // 1. Try Gemini Models first
        const requestedModel = options.model || 'googleai/gemini-2.5-flash';

        const modelsToTry = [
          requestedModel,
          ...FALLBACK_MODELS.filter(m => m !== requestedModel)
        ];

        for (const model of modelsToTry) {
          try {
            console.log(`[AI] Attempting generation with model: ${model}`);
            return await target.generate({
              ...options,
              model,
            });
          } catch (err: any) {
            console.error(`[AI] Model ${model} failed:`, err.message || err);
            lastError = err;
          }
        }

        // 2. Try Third Party Providers
        for (const provider of THIRD_PARTY_PROVIDERS) {
          const keys: Record<string, string | undefined> = {
            groq: process.env.GROQ_API_KEY,
            xai: process.env.XAI_API_KEY,
            openai: process.env.OPENAI_API_KEY,
            nvidia: process.env.NVIDIA_API_KEY
          };
          const key = keys[provider];
          if (key) {
            try {
              return await tryThirdPartyProvider(provider, options.prompt, options.output?.schema);
            } catch (err: any) {
              console.error(`[AI] Provider ${provider} failed:`, err.message || err);
              lastError = err;
            }
          }
        }

        
        throw lastError || new Error("All fallback models and providers failed.");
      };
    }
    return Reflect.get(target, prop, receiver);
  }
}) as typeof baseAi;


