import type {
  FeedItem,
  RawFeedItem,
  RawFeedTarget,
} from '../src/api/zhihu/feed';
import {
  applyFeedFilter,
  computeFilterStats,
  evaluateFeedItem,
  type FeedFilterRules,
} from '../src/utils/feedFilter';
import { parseRecommendData } from '../src/utils/recommendFeed';

function rawItem(
  promotionExtra: unknown,
  targetOverrides: Partial<RawFeedTarget> = {},
): RawFeedItem {
  return {
    id: 'synthetic-feed',
    type: 'feed',
    promotion_extra: promotionExtra,
    target: {
      id: 'synthetic-article',
      type: 'article',
      title: '合成文章标题',
      excerpt: '合成摘要',
      content: '<p>合成正文</p>',
      voteup_count: 100,
      is_labeled: false,
      author: {
        id: 'synthetic-author',
        name: '合成作者',
        is_advertiser: false,
        is_org: false,
        is_following: false,
      },
      ...targetOverrides,
    },
  };
}

function parsedItem(
  promotionExtra: unknown,
  targetOverrides: Partial<RawFeedTarget> = {},
): FeedItem {
  const parsed = parseRecommendData(rawItem(promotionExtra, targetOverrides));
  if (!parsed) throw new Error('Expected a supported recommendation item');
  return parsed;
}

function rules(overrides: Partial<FeedFilterRules> = {}): FeedFilterRules {
  return {
    blockPaid: true,
    blockAdPlatform: true,
    blockZhihuSchool: true,
    blockWeChat: true,
    blockLabeled: true,
    blockOrgAuthor: false,
    blockAdvertiser: true,
    regexPatterns: [],
    enableQuality: false,
    qualityLevel: 'standard',
    keepFollowing: true,
    keepUpvotedByFollowee: true,
    ...overrides,
  };
}

const promotion = { is_card: true, id: 'synthetic-promotion' };
const promotionVerdict = { reason: '知乎广告平台推广', category: 'ad' };

describe('recommendation promotion metadata', () => {
  test.each<{
    type: 'article' | 'answer';
    encoding: string;
    extra: unknown;
  }>([
    { type: 'article', encoding: 'JSON', extra: JSON.stringify(promotion) },
    { type: 'article', encoding: 'object', extra: promotion },
    { type: 'answer', encoding: 'JSON', extra: JSON.stringify(promotion) },
    { type: 'answer', encoding: 'object', extra: promotion },
  ])(
    'filters an unlabeled $type with $encoding promotion metadata',
    ({ type, extra }) => {
      const item = parsedItem(extra, { type });

      expect(item).toMatchObject({
        isAdPromotion: true,
        isLabeled: false,
        isAdvertiser: false,
        isFollowingAuthor: false,
      });
      expect(item).not.toHaveProperty('promotion_extra');
      expect(evaluateFeedItem(item, rules())).toEqual(promotionVerdict);
    },
  );

  test.each<[string, unknown]>([
    ['missing', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace', '  '],
    ['malformed JSON', '{"is_card":true'],
    ['empty object', {}],
    ['empty JSON object', '{}'],
    ['nonpromotion object', { is_card: false }],
    ['nonpromotion JSON', '{"is_card":false}'],
    ['unrelated metadata', { id: 'synthetic-metadata' }],
    ['object with string flag', { is_card: 'true' }],
    ['JSON with string flag', '{"is_card":"true"}'],
    ['object with numeric flag', { is_card: 1 }],
    ['JSON with numeric flag', '{"is_card":1}'],
    ['array', [promotion]],
    ['JSON array', JSON.stringify([promotion])],
    ['boolean', true],
    ['JSON boolean', 'true'],
    ['number', 1],
    ['JSON number', '1'],
    ['JSON null', 'null'],
    ['nested JSON string', JSON.stringify(JSON.stringify(promotion))],
  ])('retains content with %s metadata', (_label, extra) => {
    const item = parsedItem(extra);

    expect(item.isAdPromotion).toBeFalsy();
    expect(evaluateFeedItem(item, rules()).reason).toBeNull();
  });

  test('stores only the promotion signal through a cache JSON roundtrip', () => {
    const extra = {
      ...promotion,
      click_tracks: ['https://tracking.example.invalid/click'],
      view_tracks: ['https://tracking.example.invalid/view'],
      impression_tracks: ['https://tracking.example.invalid/impression'],
      conversion_tracks: ['https://tracking.example.invalid/conversion'],
    };
    const item = parsedItem(JSON.stringify(extra));
    const serialized = JSON.stringify(item);
    const restored: FeedItem = JSON.parse(serialized);

    expect(serialized).not.toContain('tracking.example.invalid');
    expect(serialized).not.toContain('synthetic-promotion');
    for (const key of Object.keys(extra).filter((key) => key !== 'id')) {
      expect(restored).not.toHaveProperty(key);
    }
    expect(restored.id).toBe('synthetic-article');
    expect(restored).not.toHaveProperty('promotion_extra');
    expect(restored.isAdPromotion).toBe(true);
    expect(evaluateFeedItem(restored, rules())).toEqual(promotionVerdict);
    expect(applyFeedFilter([restored], rules(), 'hide')).toEqual([]);
  });

  test('retains paid_info as a paid answer signal after parser extraction', () => {
    const item = parsedItem(undefined, {
      type: 'answer',
      answer_type: 'normal',
      paid_info: { type: 'synthetic-paid-answer' },
    });

    expect(item.answerType).toBe('PAID');
    expect(evaluateFeedItem(item, rules())).toEqual({
      reason: '知乎盐选付费内容',
      category: 'ad',
    });
  });

  test('retains answer endorsements independently of a truncated body', () => {
    const endorsements = [
      { elements: [{ type: 'TEXT', content: '合成正文标签' }] },
    ];
    const item = parsedItem(undefined, {
      type: 'answer',
      endorsements,
      content: '<p>合成截断正文</p>',
      content_need_truncated: true,
    });

    expect(item).toMatchObject({
      type: 'answers',
      endorsements,
      contentNeedTruncated: true,
    });
  });

  test('the ad platform switch controls promotion metadata independently of labels', () => {
    const item = parsedItem(JSON.stringify(promotion));

    expect(
      evaluateFeedItem(item, rules({ blockAdPlatform: false })).reason,
    ).toBe(null);
    expect(evaluateFeedItem(item, rules({ blockLabeled: false }))).toEqual(
      promotionVerdict,
    );
  });

  test.each<{
    label: string;
    target: Partial<RawFeedTarget>;
    disabledExemption: Partial<FeedFilterRules>;
  }>([
    {
      label: 'followed author',
      target: {
        author: { id: 'synthetic-followed-author', is_following: true },
      },
      disabledExemption: { keepFollowing: false },
    },
    {
      label: 'upvoted by a followee',
      target: {
        relationship: { upvoted_followee_ids: ['synthetic-followee'] },
      },
      disabledExemption: { keepUpvotedByFollowee: false },
    },
  ])('preserves the $label exemption', ({ target, disabledExemption }) => {
    const item = parsedItem(promotion, target);

    expect(evaluateFeedItem(item, rules()).reason).toBeNull();
    expect(evaluateFeedItem(item, rules(disabledExemption))).toEqual(
      promotionVerdict,
    );
  });

  test('hide, collapse and statistics agree on normalized promotion signals', () => {
    const promotedArticle = parsedItem(JSON.stringify(promotion));
    const promotedAnswer = parsedItem(promotion, {
      id: 'synthetic-answer',
      type: 'answer',
    });
    const retained = parsedItem(undefined, { id: 'synthetic-organic-article' });
    const items = [promotedArticle, promotedAnswer, retained];
    const filterRules = rules();

    expect(applyFeedFilter(items, filterRules, 'hide')).toEqual([retained]);
    expect(applyFeedFilter(items, filterRules, 'collapse')).toEqual([
      expect.objectContaining({
        kind: 'collapsed',
        items: [promotedArticle, promotedAnswer],
        reasons: ['知乎广告平台推广'],
      }),
      retained,
    ]);
    expect(computeFilterStats(items, filterRules)).toEqual({
      total: 3,
      filtered: 2,
      rate: 2 / 3,
      reasons: { 知乎广告平台推广: 2 },
    });
  });
});
