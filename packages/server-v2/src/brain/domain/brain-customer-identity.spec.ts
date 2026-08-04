import {
  extractCustomerPhoneTail,
  extractSpecificCustomerNameFromMention,
  extractSpecificCustomerNameFromQuestion,
  isSpecificCustomerProjectRecommendationQuestion,
  isSpecificCustomerReadOnlyQuestion,
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
    expect(extractSpecificCustomerNameFromMention('金卡会员')).toBeUndefined();
    expect(extractSpecificCustomerNameFromMention('高价值客户')).toBeUndefined();
    expect(extractSpecificCustomerNameFromMention('过敏健康档案客户')).toBeUndefined();
  });

  it.each([
    ['何思琪累计消费了多少钱', '何思琪'],
    ['何思琪是从哪个渠道来的', '何思琪'],
    ['王思琪适合推荐什么项目，为什么', '王思琪'],
    ['帮我查一下客户马美琳的余额', '马美琳'],
  ])('extracts a concrete customer directly from the question: %s', (question, expected) => {
    expect(extractSpecificCustomerNameFromQuestion(question)).toBe(expected);
    expect(isSpecificCustomerReadOnlyQuestion(question)).toBe(true);
  });

  it('does not treat generic scopes or write requests as exact-customer read-only questions', () => {
    expect(extractSpecificCustomerNameFromQuestion('全店累计消费了多少钱')).toBeUndefined();
    expect(isSpecificCustomerReadOnlyQuestion('全店累计消费了多少钱')).toBe(false);
    expect(extractSpecificCustomerNameFromQuestion('最近30天到店的客户有多少')).toBeUndefined();
    expect(isSpecificCustomerReadOnlyQuestion('最近30天到店的客户有多少')).toBe(false);
    expect(extractSpecificCustomerNameFromQuestion('查看今天预约客户的原始会员等级和接待准备')).toBeUndefined();
    expect(isSpecificCustomerReadOnlyQuestion('查看今天预约客户的原始会员等级和接待准备')).toBe(false);
    expect(isSpecificCustomerReadOnlyQuestion('给何思琪充值100元')).toBe(false);
  });

  it('classifies a named-customer project recommendation without classifying ordinary facts as recommendations', () => {
    expect(isSpecificCustomerProjectRecommendationQuestion('王思琪适合推荐什么项目，为什么')).toBe(true);
    expect(isSpecificCustomerProjectRecommendationQuestion('何思琪累计消费了多少钱')).toBe(false);
  });
});
