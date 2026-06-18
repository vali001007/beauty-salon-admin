import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service.js';

type LegacyMessage = {
  role?: string;
  content?: unknown;
};

type LegacyMessagesBody = {
  model?: string;
  system?: unknown;
  messages?: LegacyMessage[];
};

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text ?? '');
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as { text?: unknown }).text ?? '');
  }
  return content == null ? '' : JSON.stringify(content);
}

@ApiTags('AI Legacy')
@Controller('v1')
export class LegacyMessagesController {
  constructor(private readonly aiService: AiService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Legacy Anthropic-compatible messages proxy' })
  async create(@Body() body: LegacyMessagesBody = {}) {
    const messages = this.normalizeMessages(body);
    const result = await this.aiService.chat(messages);
    const model = result.usage?.model || body.model || 'ami-core-mock-llm';

    return {
      id: result.id,
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: result.text || '' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: result.usage?.inputTokens ?? 0,
        output_tokens: result.usage?.outputTokens ?? 0,
      },
    };
  }

  private normalizeMessages(body: LegacyMessagesBody) {
    const normalized = Array.isArray(body.messages)
      ? body.messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: textFromContent(message.content),
        }))
      : [];
    const system = textFromContent(body.system);

    return system ? [{ role: 'user', content: `System instruction:\n${system}` }, ...normalized] : normalized;
  }
}
