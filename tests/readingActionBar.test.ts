import { nextReadingActionBarOffset as next } from '../src/utils/readingActionBar';

test('reading forward retracts actions, reversing reveals them immediately', () => {
  expect(next(0, 20, 60, 1000, 100)).toBe(40);
  expect(next(90, 60, 500, 1000, 100)).toBe(100);
  expect(next(100, 500, 490, 1000, 100)).toBe(90);
  expect(next(90, 490, 350, 1000, 100)).toBe(0);
});

test('top and short content keep actions available', () => {
  expect(next(80, 20, -40, 1000, 100)).toBe(0);
  expect(next(0, -40, 0, 1000, 100)).toBe(0);
  expect(next(50, 0, 20, 0, 100)).toBe(0);
});

test('bottom rubber band does not reveal actions or add hidden travel', () => {
  expect(next(100, 1000, 1040, 1000, 100)).toBe(100);
  expect(next(100, 1040, 1000, 1000, 100)).toBe(100);
  expect(next(100, 1000, 990, 1000, 100)).toBe(90);
});
