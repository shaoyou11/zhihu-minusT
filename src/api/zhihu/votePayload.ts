export type ZhihuVoteType = 'up' | 'neutral' | 'down' | 'like' | 'unlike';

export type VoteContentType =
  | 'answers'
  | 'articles'
  | 'questions'
  | 'pins'
  | 'comments';

export interface NormalizedVoteResult {
  voted: -1 | 0 | 1;
  voteCount?: number;
}

type StandardVoteContentType = 'answers' | 'articles' | 'questions';
type ObjectRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNestedRecord(
  value: ObjectRecord,
  ...keys: string[]
): ObjectRecord | undefined {
  let current: unknown = value;
  for (const key of keys) {
    if (!isObjectRecord(current)) return undefined;
    current = current[key];
  }
  return isObjectRecord(current) ? current : undefined;
}

function getBoolean(value: ObjectRecord, key: string): boolean | undefined {
  return typeof value[key] === 'boolean' ? value[key] : undefined;
}

function getNumber(value: ObjectRecord, key: string): number | undefined {
  const candidate = value[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

function getFirstNumber(
  value: ObjectRecord,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const candidate = getNumber(value, key);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function normalizeVoteValue(value: unknown): -1 | 0 | 1 | undefined {
  if (value === -1 || value === 0 || value === 1) return value;
  if (typeof value !== 'string') return undefined;

  switch (value.toUpperCase()) {
    case 'UP':
      return 1;
    case 'DOWN':
      return -1;
    case 'NEUTRAL':
      return 0;
    default:
      return undefined;
  }
}

function getRequestedVoteState(voteType: ZhihuVoteType): -1 | 0 | 1 {
  if (voteType === 'up' || voteType === 'like') return 1;
  if (voteType === 'down') return -1;
  return 0;
}

export function buildVotePayload(
  type: StandardVoteContentType,
  voteType: ZhihuVoteType,
): { voting: -1 | 0 | 1 } | { type: ZhihuVoteType } {
  if (type === 'articles') {
    return {
      voting: voteType === 'up' ? 1 : voteType === 'down' ? -1 : 0,
    };
  }
  return { type: voteType };
}

/**
 * Read the current interaction state from either a mutation response or a
 * content record. Pins use the reaction/like fields: their API can report a
 * successful like while still returning `voting: 0`.
 */
export function getContentVoteState(
  type: VoteContentType,
  value: unknown,
): -1 | 0 | 1 | undefined {
  if (!isObjectRecord(value)) return undefined;

  const relationship = getNestedRecord(value, 'relationship');
  const reactionRelation = getNestedRecord(value, 'reaction', 'relation');
  const legacyReactionRelation = getNestedRecord(value, 'reaction_relation');

  if (type === 'pins') {
    const directReactionState = getBoolean(value, 'reaction_state');
    if (directReactionState !== undefined) return directReactionState ? 1 : 0;

    for (const key of ['is_liked', 'red_heart_has_set'] as const) {
      const state = getBoolean(value, key);
      if (state !== undefined) return state ? 1 : 0;
    }

    const virtuals = getNestedRecord(value, 'virtuals');
    const virtualLike = virtuals ? getBoolean(virtuals, 'is_liked') : undefined;
    if (virtualLike !== undefined) return virtualLike ? 1 : 0;

    const reactionLike = reactionRelation
      ? getBoolean(reactionRelation, 'liked')
      : undefined;
    if (reactionLike !== undefined) return reactionLike ? 1 : 0;

    const relationshipLike = relationship
      ? getBoolean(relationship, 'is_liked')
      : undefined;
    if (relationshipLike !== undefined) return relationshipLike ? 1 : 0;

    // Older feed variants only expose the reaction vote value for pins.
    return (
      normalizeVoteValue(legacyReactionRelation?.like) ??
      normalizeVoteValue(legacyReactionRelation?.vote) ??
      normalizeVoteValue(reactionRelation?.vote)
    );
  }

  const directVoting = normalizeVoteValue(value.voting);
  if (directVoting !== undefined) return directVoting;

  const relationshipVoting = normalizeVoteValue(relationship?.voting);
  if (relationshipVoting !== undefined) return relationshipVoting;

  const reactionVote = normalizeVoteValue(reactionRelation?.vote);
  if (reactionVote !== undefined) return reactionVote;

  const legacyReactionVote = normalizeVoteValue(legacyReactionRelation?.vote);
  if (legacyReactionVote !== undefined) return legacyReactionVote;

  if (type === 'comments') {
    for (const key of ['liked', 'is_liked'] as const) {
      const state = getBoolean(value, key);
      if (state !== undefined) return state ? 1 : 0;
    }
  }

  const reactionValue = value.reaction_value;
  if (typeof reactionValue === 'string' && reactionValue !== '') {
    return normalizeVoteValue(reactionValue);
  }
  const reactionState = getBoolean(value, 'reaction_state');
  if (reactionState === false) return 0;
  if (reactionState === true) return 1;

  if (getBoolean(value, 'is_upped') === true) return 1;
  if (getBoolean(value, 'is_up') === true) return 1;
  return undefined;
}

export function getContentVoteCount(
  type: VoteContentType,
  value: unknown,
): number | undefined {
  if (!isObjectRecord(value)) return undefined;

  if (type === 'pins') {
    const directCount = getFirstNumber(value, [
      'reaction_count',
      'liked_count',
      'red_heart_count',
      'like_count',
    ]);
    if (directCount !== undefined) return directCount;

    const statistics = getNestedRecord(value, 'reaction', 'statistics');
    return statistics
      ? getFirstNumber(statistics, ['up_vote_count', 'like_count'])
      : undefined;
  }

  return getFirstNumber(value, [
    'voteup_count',
    'up_count',
    'reaction_count',
    'like_count',
  ]);
}

export function getVoteSuccessMessage(
  type: VoteContentType,
  previousState: number,
  resolvedState: -1 | 0 | 1,
): string {
  if (resolvedState === -1) return '已反对';
  if (resolvedState === 0 && previousState === -1) return '已取消反对';

  const usesLikeCopy = type === 'pins' || type === 'comments';
  if (resolvedState === 1) return usesLikeCopy ? '已点赞' : '已赞同';
  return usesLikeCopy ? '已取消点赞' : '已取消赞同';
}

export function normalizeVoteMutationResponse(
  type: VoteContentType,
  voteType: ZhihuVoteType,
  value: unknown,
): NormalizedVoteResult {
  const expectedState = getRequestedVoteState(voteType);
  const response = isObjectRecord(value) ? value : undefined;

  if (response?.success === false) {
    throw new Error('知乎没有接受这次投票，请重试');
  }

  const responseState = getContentVoteState(type, response);
  if (responseState !== undefined && responseState !== expectedState) {
    throw new Error('知乎未确认投票状态，请重试');
  }

  return {
    voted: responseState ?? expectedState,
    voteCount: getContentVoteCount(type, response),
  };
}
