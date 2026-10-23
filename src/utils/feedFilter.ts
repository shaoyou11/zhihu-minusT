/**
 * 本地推荐流过滤管线。
 *
 * 字段依据见 api/zhihu/feed.ts 的 FeedItem 注释——所有信号都来自实测推荐流可用字段，
 * 不依赖项目过往读取过但接口实际不返回的字段（favlists_count / author.followers_count）。
 *
 * 过滤包含独立的可调规则：
 *   - 推广/营销：盐选、广告平台、知乎学堂、微信引流、推广标注、机构号、广告主
 *   - 内容质量：三档强度阈值，按内容类型走组合条件
 *   - 自定义正则：匹配完整正文的纯文本
 *
 * 豁免（关注作者 / 关注者赞过）作为独立开关，且默认开启，判在广告与质量之前。
 */

import type { FeedItem } from '@/api/zhihu';
import { getInMemoryFeedKey } from '@/utils/feedIdentity';
import { matchesFeedRegex } from '@/utils/feedRegex';

const LOCAL_FEED_FILTER_TABS = new Set(['recommend']);

/** 仅推荐流参与本地过滤。 */
export function supportsLocalFeedFilter(tab: string): boolean {
  return LOCAL_FEED_FILTER_TABS.has(tab);
}

export type FilterMode = 'collapse' | 'hide';
export type FilterQualityLevel = 'loose' | 'standard' | 'strict';

/** 由 useSettingsStore 的扁平字段派生出的过滤规则集。 */
export interface FeedFilterRules {
  /** 推广 / 营销类开关 */
  blockPaid: boolean;
  blockAdPlatform: boolean;
  blockZhihuSchool: boolean;
  blockWeChat: boolean;
  blockLabeled: boolean;
  blockOrgAuthor: boolean;
  blockAdvertiser: boolean;
  /** 内容质量过滤总开关 */
  enableQuality: boolean;
  qualityLevel: FilterQualityLevel;
  /** 自定义正则源；空数组表示不启用。 */
  regexPatterns: string[];
  /** 永不过滤（豁免） */
  keepFollowing: boolean;
  keepUpvotedByFollowee: boolean;
}

export type FilterCategory = 'ad' | 'quality' | 'regex';

export interface FilterVerdict {
  /** null = 保留；非空字符串为人类可读过滤原因。 */
  reason: string | null;
  category: FilterCategory;
}

const KEEP: FilterVerdict = { reason: null, category: 'ad' };

/** 折叠模式下合并连续命中项形成的占位行。 */
export interface CollapsedGroup {
  kind: 'collapsed';
  /** 组内首条的内存 key，保证 FlashList key 在折叠 / 展开切换间稳定。 */
  groupKey: string;
  items: FeedItem[];
  /** 去重后的原因文案列表。 */
  reasons: string[];
}

export type FilteredFeedItem = FeedItem | CollapsedGroup;

/**
 * 三档强度阈值。「标准」采用 Zhihu++ 实测值。
 * 问题类型当且仅当 answerCount / followerCount 缺失时跳过判定——
 * 推荐流几乎不返回 question 类型的 feed 项，缺失即保留，避免误杀。
 */
const QUALITY_THRESHOLDS: Record<
  FilterQualityLevel,
  {
    answerVote: number;
    articleVote: number;
    pinVote: number;
    questionAnswer: number;
    questionFollower: number;
  }
> = {
  loose: {
    answerVote: 5,
    articleVote: 10,
    pinVote: 10,
    questionAnswer: 3,
    questionFollower: 20,
  },
  standard: {
    answerVote: 10,
    articleVote: 20,
    pinVote: 20,
    questionAnswer: 5,
    questionFollower: 50,
  },
  strict: {
    answerVote: 50,
    articleVote: 50,
    pinVote: 50,
    questionAnswer: 10,
    questionFollower: 100,
  },
};

/** 在折叠 / 隐藏模式都需要对单项的判定。 */
export function evaluateFeedItem(
  item: FeedItem,
  rules: FeedFilterRules,
): FilterVerdict {
  // 1. 豁免最先：放在后面会导致关注作者的低赞内容先命中质量规则。
  if (rules.keepFollowing && item.isFollowingAuthor) return KEEP;
  if (rules.keepUpvotedByFollowee && item.upvotedByFollowee) return KEEP;

  // 2. 推广 / 营销
  if (rules.blockPaid && isPaidAnswer(item)) {
    return { reason: '知乎盐选付费内容', category: 'ad' };
  }
  const content = typeof item.content === 'string' ? item.content : '';
  if (
    rules.blockAdPlatform &&
    (item.isAdPromotion || content.includes('xg.zhihu.com'))
  ) {
    return { reason: '知乎广告平台推广', category: 'ad' };
  }
  if (
    rules.blockZhihuSchool &&
    (content.includes('d.zhihu.com') || content.includes('data-edu-card-id'))
  ) {
    return { reason: '知乎学堂课程卡片', category: 'ad' };
  }
  if (rules.blockWeChat && content.includes('mp.weixin.qq.com')) {
    return { reason: '微信公众号引流文章', category: 'ad' };
  }
  if (rules.blockLabeled && item.isLabeled) {
    return { reason: '带推广标记的内容', category: 'ad' };
  }
  if (rules.blockOrgAuthor && item.isOrgAuthor) {
    return { reason: '机构号发布的内容', category: 'ad' };
  }
  if (rules.blockAdvertiser && item.isAdvertiser) {
    return { reason: '广告主发布的内容', category: 'ad' };
  }

  // 3. 自定义正则与质量开关独立，沿用关注豁免与展示方式。
  if (matchesFeedRegex(item, rules.regexPatterns)) {
    return { reason: '命中自定义正则', category: 'regex' };
  }

  // 4. 内容质量：按类型的组合条件
  if (rules.enableQuality) {
    const t = QUALITY_THRESHOLDS[rules.qualityLevel];
    const reason = qualityReason(item, t);
    if (reason) return { reason, category: 'quality' };
  }

  return KEEP;
}

/** 盐选判定。双信号（answer_type === 'PAID' 或 paid_info != null）已在
 * parseRecommendData 解析阶段归一成 answerType === 'PAID'，这里只读结果。 */
function isPaidAnswer(item: FeedItem): boolean {
  return item.answerType === 'PAID';
}

type QualityThreshold = (typeof QUALITY_THRESHOLDS)[FilterQualityLevel];

function qualityReason(item: FeedItem, t: QualityThreshold): string | null {
  switch (item.type) {
    case 'answers':
      if (item.voteCount < t.answerVote) return `赞同数 < ${t.answerVote}`;
      return null;
    case 'articles':
      if (item.voteCount < t.articleVote) return `赞同数 < ${t.articleVote}`;
      return null;
    case 'pins':
      if (item.voteCount < t.pinVote) return `赞同数 < ${t.pinVote}`;
      return null;
    case 'questions':
      if (item.answerCount == null || item.followerCount == null) return null;
      if (
        item.answerCount < t.questionAnswer &&
        item.followerCount < t.questionFollower
      ) {
        return `回答数 < ${t.questionAnswer} / 关注数 < ${t.questionFollower}`;
      }
      return null;
    default:
      return null;
  }
}

/** 把过滤后展平的列表转成可包含折叠占位的数组。 */
export function applyFeedFilter(
  items: FeedItem[],
  rules: FeedFilterRules,
  mode: FilterMode,
  hideAdPlaceholders = false,
): FilteredFeedItem[] {
  if (mode === 'hide') {
    return items.filter(
      (item) => evaluateFeedItem(item, rules).reason === null,
    );
  }

  const out: FilteredFeedItem[] = [];
  let pending: { items: FeedItem[]; reasons: Set<string> } | null = null;

  const flush = () => {
    if (!pending || pending.items.length === 0) {
      pending = null;
      return;
    }
    const groupContentKey = pending.items
      .map((i) => getInMemoryFeedKey(i) || i.id)
      .join(',');
    out.push({
      kind: 'collapsed',
      groupKey: `collapsed:${groupContentKey}`,
      items: pending.items,
      reasons: Array.from(pending.reasons),
    });
    pending = null;
  };

  for (const item of items) {
    const verdict = evaluateFeedItem(item, rules);
    if (
      hideAdPlaceholders &&
      verdict.reason !== null &&
      verdict.category === 'ad'
    ) {
      continue;
    }
    if (verdict.reason === null) {
      flush();
      out.push(item);
    } else {
      if (!pending) pending = { items: [], reasons: new Set() };
      pending.items.push(item);
      pending.reasons.add(verdict.reason);
    }
  }
  flush();
  return out;
}

/** 判断列表项是否为折叠占位行（keyExtractor / renderItem 前置判断用）。 */
export function isCollapsedGroup(item: unknown): item is CollapsedGroup {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as CollapsedGroup).kind === 'collapsed'
  );
}

/** 供设置页「实时效果条」估算过滤率与原因分布，不发请求。 */
export interface FilterStats {
  total: number;
  filtered: number;
  rate: number; // 0 ~ 1
  reasons: Record<string, number>;
}

export function computeFilterStats(
  items: FeedItem[],
  rules: FeedFilterRules,
): FilterStats {
  let filtered = 0;
  const reasons: Record<string, number> = {};
  for (const item of items) {
    const v = evaluateFeedItem(item, rules);
    if (v.reason !== null) {
      filtered += 1;
      reasons[v.reason] = (reasons[v.reason] ?? 0) + 1;
    }
  }
  const total = items.length;
  return { total, filtered, rate: total === 0 ? 0 : filtered / total, reasons };
}
