import {
  extractCustomerPhoneTail,
  extractSpecificCustomerNameFromMention,
} from './brain-customer-identity.js';

describe('brain customer identity helpers', () => {
  it('normalizes natural phone-tail expressions', () => {
    expect(extractCustomerPhoneTail('手机号后四位是7636')).toBe('7636');
    expect(extractCustomerPhoneTail('手机尾号 0522')).toBe('0522');
  });

  it('keeps a concrete name while removing appended phone evidence', () => {
    expect(extractSpecificCustomerNameFromMention('胡静怡（手机号后四位7636）')).toBe('胡静怡');
    expect(extractSpecificCustomerNameFromMention('马美琳，手机尾号6325')).toBe('马美琳');
    expect(extractSpecificCustomerNameFromMention('手机号后四位7636的客户')).toBeUndefined();
    expect(extractSpecificCustomerNameFromMention('老客')).toBeUndefined();
  });
});
