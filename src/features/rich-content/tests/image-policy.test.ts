import assert from 'node:assert/strict';
import { DAILY_AVATAR_SIZE, hasHtmlClass, isDailyAvatar } from '../imagePolicy';

test('matches complete HTML class names', () => {
  assert.equal(hasHtmlClass('avatar featured', 'avatar'), true);
  assert.equal(hasHtmlClass('avatar-large', 'avatar'), false);
  assert.equal(hasHtmlClass(undefined, 'avatar'), false);
});

test('only treats avatar images in daily content as compact avatars', () => {
  assert.equal(DAILY_AVATAR_SIZE, 40);
  assert.equal(isDailyAvatar({ class: 'avatar' }, 'daily'), true);
  assert.equal(isDailyAvatar({ class: 'content-image' }, 'daily'), false);
  assert.equal(isDailyAvatar({ class: 'avatar' }, 'default'), false);
});
