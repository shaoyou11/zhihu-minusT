import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Exercise the actual footer expression without mounting the entire home pager
// and its unrelated native screens, gestures, storage, and query subscriptions.
const source = ts.createSourceFile(
  'index.tsx',
  readFileSync(path.join(__dirname, '../src/app/(tabs)/index.tsx'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let footer;
function visit(node) {
  if (
    ts.isJsxAttribute(node) &&
    node.name.getText(source) === 'ListFooterComponent' &&
    node.initializer &&
    ts.isJsxExpression(node.initializer)
  ) {
    footer = node.initializer.expression;
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!footer) throw new Error('Feed footer was not found');
const { outputText } = ts.transpileModule(
  `const result = (${footer.getText(source)}); result;`,
  { compilerOptions: { jsx: ts.JsxEmit.React } },
);

function renderFooter(overrides = {}) {
  return runInNewContext(outputText, {
    React,
    ActivityIndicator: 'ActivityIndicator',
    QueryErrorView: 'QueryErrorView',
    BouncyButton: 'BouncyButton',
    Text: 'Text',
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isError: false,
    filterEnabled: true,
    localDedupEnabled: false,
    isRefreshing: false,
    isRefetching: false,
    isLoading: false,
    flattenedData: [],
    MIN_RENDERABLE_ITEMS: 8,
    hasNextPage: false,
    autoFetchExhausted: false,
    fetchNextPage: jest.fn(),
    ...overrides,
  });
}

test.each([
  { filterEnabled: true, localDedupEnabled: false },
  { filterEnabled: false, localDedupEnabled: true },
])(
  'a failed initial feed does not claim filtering exhausted the feed: %j',
  (settings) => {
    expect(renderFooter({ ...settings, isError: true })).toBeNull();
    expect(renderFooter(settings).props.children).toBe(
      '过滤后内容偏少，已无更多可加载',
    );
  },
);

test('a pagination failure retains its retry action instead of a filtering message', () => {
  const fetchNextPage = jest.fn();
  const footer = renderFooter({
    isError: true,
    isFetchNextPageError: true,
    fetchNextPage,
  });
  expect(footer.type).toBe('QueryErrorView');
  expect(footer.props.message).toBe('更多内容加载失败');
  footer.props.onRetry();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
});
