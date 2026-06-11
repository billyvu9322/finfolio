import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../../../config/env.js';
import type { AiAlertProvider, AlertContext, AlertResult } from './aiAlert.types.js';

const AlertOutput = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  message: z.string(),
});

const BatchOutput = z.object({
  alerts: z.array(
    z.object({
      coinSymbol: z.string(),
      wallet: z.string(),
      title: z.string(),
      message: z.string(),
    }),
  ),
});

const INSTRUCTIONS = [
  'Bạn là trợ lý phân tích kỹ thuật crypto cho nhà đầu tư cá nhân.',
  'Bạn nhận JSON gồm chỉ báo kỹ thuật (RSI, SMA, Bollinger), giá hiện tại, giá vốn và các tín hiệu đã tính sẵn.',
  'CHỈ diễn giải dữ liệu được cung cấp; TUYỆT ĐỐI không bịa số liệu mới.',
  'Trả lời tiếng Việt, ngắn gọn, bình tĩnh, kèm một gợi ý hành động thận trọng (không phải lời khuyên đầu tư ràng buộc).',
  'Giữ nguyên mức severity được cung cấp.',
  'Trả về JSON đúng dạng: { "severity": "info"|"warning"|"critical", "title": string, "message": string }.',
].join(' ');

const BATCH_INSTRUCTIONS = [
  'Bạn là trợ lý phân tích kỹ thuật crypto cho nhà đầu tư cá nhân.',
  'Bạn nhận một MẢNG JSON, mỗi phần tử là một coin trong danh mục với chỉ báo kỹ thuật (RSI, SMA, Bollinger), giá hiện tại, giá vốn và các tín hiệu đã tính sẵn.',
  'Phân tích TỪNG coin riêng. CHỈ diễn giải dữ liệu được cung cấp; TUYỆT ĐỐI không bịa số liệu mới.',
  'Trả lời tiếng Việt, ngắn gọn (1-2 câu mỗi coin), bình tĩnh, kèm một gợi ý hành động thận trọng (không phải lời khuyên đầu tư ràng buộc).',
  'Trả về JSON đúng dạng: { "alerts": [ { "coinSymbol": string, "wallet": string, "title": string, "message": string } ] }.',
  'Phải có đúng một phần tử cho mỗi coin trong input, giữ nguyên coinSymbol và wallet.',
].join(' ');

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  return client;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms)),
  ]);
}

export const agentAlertProvider: AiAlertProvider = {
  async generate(ctx: AlertContext) {
    const completion = await withTimeout(
      getClient().chat.completions.create({
        model: env.LLM_MODEL,
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(ctx) },
        ],
        response_format: { type: 'json_object' },
      }),
      8000,
    );
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('AI returned no output');
    const parsed = AlertOutput.parse(JSON.parse(raw));
    // Never let the LLM downgrade the computed severity.
    return { ...parsed, severity: ctx.severity };
  },
};

/**
 * One LLM call for the whole portfolio: send every coin's context as an array,
 * get a JSON array back. Returns results aligned to the input order; severity
 * always comes from the locally-computed value, never the model. Throws if the
 * model omits any coin (caller falls back to the per-coin rule provider).
 */
export async function generateBatch(contexts: AlertContext[]): Promise<AlertResult[]> {
  if (contexts.length === 0) return [];
  const completion = await withTimeout(
    getClient().chat.completions.create({
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: BATCH_INSTRUCTIONS },
        { role: 'user', content: JSON.stringify(contexts) },
      ],
      response_format: { type: 'json_object' },
    }),
    15000,
  );
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('AI returned no output');
  const parsed = BatchOutput.parse(JSON.parse(raw));
  const byKey = new Map(parsed.alerts.map((a) => [`${a.coinSymbol}|${a.wallet}`, a]));
  return contexts.map((ctx) => {
    const match = byKey.get(`${ctx.coinSymbol}|${ctx.wallet}`);
    if (!match) throw new Error(`AI batch missing coin ${ctx.coinSymbol}`);
    return { severity: ctx.severity, title: match.title, message: match.message };
  });
}
