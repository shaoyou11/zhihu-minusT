import assert from 'node:assert/strict';
import {
  buildVotePayload,
  getContentVoteCount,
  getContentVoteState,
  getVoteSuccessMessage,
  normalizeVoteMutationResponse,
} from '../src/api/zhihu/votePayload';

test('maps article votes to the numeric voting payload expected by Zhihu', () => {
  assert.deepEqual(buildVotePayload('articles', 'up'), { voting: 1 });
  assert.deepEqual(buildVotePayload('articles', 'neutral'), { voting: 0 });
  assert.deepEqual(buildVotePayload('articles', 'down'), { voting: -1 });
});

test('keeps the type payload used by answer and question votes', () => {
  assert.deepEqual(buildVotePayload('answers', 'up'), { type: 'up' });
  assert.deepEqual(buildVotePayload('answers', 'neutral'), {
    type: 'neutral',
  });
  assert.deepEqual(buildVotePayload('questions', 'down'), { type: 'down' });
});

test('normalizes an article vote from the returned voting state and count', () => {
  assert.deepEqual(
    normalizeVoteMutationResponse('articles', 'up', {
      success: true,
      voting: 1,
      voteup_count: 1,
      reaction_state: true,
      reaction_value: 'up',
    }),
    { voted: 1, voteCount: 1 },
  );
});

test('uses reaction fields for pins even when voting remains neutral', () => {
  const response = {
    success: true,
    reaction_state: true,
    reaction_count: 271,
    is_liked: true,
    liked_count: 271,
    voting: 0,
    voteup_count: 0,
  };

  assert.deepEqual(normalizeVoteMutationResponse('pins', 'like', response), {
    voted: 1,
    voteCount: 271,
  });
});

test('reads pin detail state from virtuals and reaction_count', () => {
  const pin = {
    reaction_count: 270,
    virtuals: { is_liked: true },
    reaction: {
      relation: { vote: 'NEUTRAL', liked: true },
      statistics: { up_vote_count: 270, like_count: 2 },
    },
  };

  assert.equal(getContentVoteState('pins', pin), 1);
  assert.equal(getContentVoteCount('pins', pin), 270);
});

test('rejects a response that explicitly contradicts the requested state', () => {
  assert.throws(
    () =>
      normalizeVoteMutationResponse('articles', 'up', {
        success: true,
        voting: 0,
        voteup_count: 0,
      }),
    /未确认投票状态/,
  );
});

test('falls back to the requested state when an endpoint returns no state', () => {
  assert.deepEqual(normalizeVoteMutationResponse('comments', 'unlike', {}), {
    voted: 0,
    voteCount: undefined,
  });
});

test('uses content-specific copy for the resolved response state', () => {
  assert.equal(getVoteSuccessMessage('pins', 0, 1), '已点赞');
  assert.equal(getVoteSuccessMessage('pins', 1, 0), '已取消点赞');
  assert.equal(getVoteSuccessMessage('articles', 0, 1), '已赞同');
  assert.equal(getVoteSuccessMessage('articles', -1, 0), '已取消反对');
});
