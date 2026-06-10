import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../../../config/env.js';
import type { AiAlertProvider, AlertContext } from './aiAlert.types.js';

const AlertOutput = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  message: z.string(),
});

const INSTRUCTIONS = [
  'Bạn là trợ lý phân tích kỹ thuật crypto cho nhà đầu tư cá nhân.',
  'Bạn nhận JSON gồm chỉ báo kỹ thuật (RSI, SMA, Bollinger), giá hiện tại, giá vốn và các tín hiệu đã tính sẵn.',
  'CHỈ diễn giải dữ liệu được cung cấp; TUYỆT ĐỐI không bịa số liệu mới.',
  'Trả lời tiếng Việt, ngắn gọn, bình tĩnh, kèm một gợi ý hành động thận trọng (không phải lời khuyên đầu tư ràng buộc).',
  'Giữ nguyên mức severity được cung cấp.',
  'Trả về JSON đúng dạng: { "severity": "info"|"warning"|"critical", "title": string, "message": string }.',
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
