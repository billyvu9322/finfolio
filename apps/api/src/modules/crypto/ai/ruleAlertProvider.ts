import type { AiAlertProvider, AlertContext, Severity } from './aiAlert.types.js';

const SEV_LABEL: Record<Severity, string> = { info: 'Theo dõi', warning: 'Lưu ý', critical: 'Cảnh báo' };

export const ruleAlertProvider: AiAlertProvider = {
  async generate(ctx: AlertContext) {
    if (ctx.signals.length === 0) {
      return { severity: 'info', title: `${ctx.coinSymbol} ổn định`, message: 'Không có tín hiệu kỹ thuật đáng chú ý.' };
    }
    const lines = ctx.signals.map((s) => `• ${s.detail}`);
    const top = ctx.signals[0]!;
    const action =
      top.dir === 'bearish'
        ? 'Cân nhắc giảm tỷ trọng / đặt cắt lỗ.'
        : top.dir === 'bullish'
          ? 'Có thể cân nhắc chốt lời một phần hoặc giữ.'
          : 'Theo dõi sát biến động.';
    return {
      severity: ctx.severity,
      title: `${SEV_LABEL[ctx.severity]}: ${ctx.coinSymbol} (${ctx.wallet})`,
      message: `${lines.join('\n')}\n${action}`,
    };
  },
};
