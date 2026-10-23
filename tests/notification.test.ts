import type { ZhihuNotificationItem } from '../src/types/zhihu';
import {
  getNotificationBody,
  getNotificationPath,
} from '../src/utils/notification';

const base: ZhihuNotificationItem = {
  id: '10',
  type: 'synthetic',
  create_time: 1,
};

test.each([
  [{ extend: { text: '新格式' }, text: '旧格式' }, '新格式'],
  [{ text: '旧文字' }, '旧文字'],
  [{ title: '旧标题' }, '旧标题'],
  [{ sub_text: '旧副标题' }, '旧副标题'],
  [{ target: { text: '目标文字' } }, '目标文字'],
  [{ target: { title: '目标标题' } }, '目标标题'],
  ['字符串正文', '字符串正文'],
  [{}, '新的动态'],
])('keeps new and legacy notification text', (content, expected) => {
  expect(getNotificationBody({ ...base, content })).toBe(expected);
});

test('uses canonical link routing for nested answer and article targets', () => {
  expect(
    getNotificationPath({
      ...base,
      content: {
        target: {
          link: 'https://www.zhihu.com/question/42/answer/84?source=synthetic',
        },
      },
    }),
  ).toBe('/answer/84');
  expect(
    getNotificationPath({
      ...base,
      target: {
        link: 'https://zhuanlan.zhihu.com/p/42',
      },
    }),
  ).toBe('/article/42');
  expect(
    getNotificationPath({
      ...base,
      target: { type: 'member', id: 'synthetic-user' },
    }),
  ).toBe('/user/synthetic-user');
  expect(
    getNotificationPath({ ...base, target: { type: 'answer' } }),
  ).toBeNull();
});
