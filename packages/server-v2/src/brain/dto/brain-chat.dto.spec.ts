import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendBrainMessageDto } from './brain-chat.dto.js';

describe('SendBrainMessageDto guidance selection', () => {
  it('accepts valid clarification and follow-up provenance', async () => {
    const dto = plainToInstance(SendBrainMessageDto, {
      message: '会员卡负债是多少？',
      timezone: 'Asia/Shanghai',
      guidanceSelection: { kind: 'follow_up', sourceRunId: 102, optionId: 'member_liability:1' },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects unknown guidance kinds and invalid source runs', async () => {
    const dto = plainToInstance(SendBrainMessageDto, {
      message: '查看会员卡情况',
      guidanceSelection: { kind: 'execute_without_permission', sourceRunId: 0, optionId: '' },
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'guidanceSelection')).toBe(true);
  });
});
