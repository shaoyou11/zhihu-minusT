import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { FeedItem } from '../src/api/zhihu';
import {
  applyFeedFilter,
  computeFilterStats,
  evaluateFeedItem,
  type FeedFilterRules,
  isCollapsedGroup,
  supportsLocalFeedFilter,
} from '../src/utils/feedFilter';
import {
  FEED_REGEX_LIMITS,
  matchesFeedRegex,
  normalizeFeedRegexPatterns,
  parseFeedRegexInput,
} from '../src/utils/feedRegex';

const SHORT_BODY_PATTERN = '^.{0,50}$';

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'synthetic-answer',
    isIdStable: true,
    type: 'answers',
    title: '合成问题标题',
    excerpt: '合成摘要',
    content: '<p>合成正文</p>',
    author: { id: 'synthetic-author', name: '合成作者', avatar: '' },
    image: null,
    voteCount: 100,
    commentCount: 0,
    voted: 0,
    ...overrides,
  };
}

function rules(overrides: Partial<FeedFilterRules> = {}): FeedFilterRules {
  return {
    blockPaid: false,
    blockAdPlatform: false,
    blockZhihuSchool: false,
    blockWeChat: false,
    blockLabeled: false,
    blockOrgAuthor: false,
    blockAdvertiser: false,
    regexPatterns: [],
    enableQuality: false,
    qualityLevel: 'standard',
    keepFollowing: true,
    keepUpvotedByFollowee: true,
    ...overrides,
  };
}

describe('custom feed regex input', () => {
  test('normalizes persisted patterns without retaining malformed values', () => {
    const saved = [
      `  ${SHORT_BODY_PATTERN}  `,
      '',
      '[',
      null,
      42,
      SHORT_BODY_PATTERN,
      '推广',
    ];
    expect(normalizeFeedRegexPatterns(saved)).toEqual([
      SHORT_BODY_PATTERN,
      '推广',
    ]);
    expect(saved[0]).toBe(`  ${SHORT_BODY_PATTERN}  `);
    expect(normalizeFeedRegexPatterns(undefined)).toEqual([]);
    expect(normalizeFeedRegexPatterns(SHORT_BODY_PATTERN)).toEqual([]);
    expect(normalizeFeedRegexPatterns({ pattern: SHORT_BODY_PATTERN })).toEqual(
      [],
    );
  });

  test('reports invalid input lines while preserving the other rules', () => {
    expect(
      parseFeedRegexInput(` ${SHORT_BODY_PATTERN} \r\n[\r\n\r\n推广\r\n(`),
    ).toEqual({
      patterns: [SHORT_BODY_PATTERN, '推广'],
      invalidLines: [2, 5],
    });
    expect(parseFeedRegexInput('  \n\r\n')).toEqual({
      patterns: [],
      invalidLines: [],
    });
  });
});

describe('feed regex matching', () => {
  test.each([
    [50, true],
    [51, false],
  ])(
    'matches the requested short-answer boundary at %i characters',
    (length, matches) => {
      expect(
        matchesFeedRegex(item({ content: `<p>${'字'.repeat(length)}</p>` }), [
          SHORT_BODY_PATTERN,
        ]),
      ).toBe(matches);
    },
  );

  test('matches the complete body without adding the title or short excerpt', () => {
    expect(
      matchesFeedRegex(
        item({
          title: '标题'.repeat(100),
          excerpt: '摘要'.repeat(100),
          content: '<p>短回答</p>',
        }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(
        item({ excerpt: '短摘要', content: `<p>${'长'.repeat(100)}</p>` }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
  });

  test('preserves paragraph and br line breaks and matches across them', () => {
    expect(
      matchesFeedRegex(
        item({ content: '<p>第一段<br>第二段</p><p>第三段</p>' }),
        ['^第一段\\n第二段\\n第三段$'],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(
        item({ content: `<p>${'字'.repeat(25)}</p><p>${'字'.repeat(25)}</p>` }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
    expect(
      matchesFeedRegex(item({ content: '<p>两行<br>回答</p>' }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(true);
  });

  test('counts Unicode code points rather than UTF-16 code units', () => {
    expect(
      matchesFeedRegex(item({ content: '😀'.repeat(50) }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(true);
    expect(
      matchesFeedRegex(item({ content: '😀'.repeat(51) }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(false);
  });

  test('matches visible text with HTML entities decoded and whitespace normalized', () => {
    expect(
      matchesFeedRegex(
        item({
          content:
            '<p data-label="推广">&lt;例&gt;&amp;&nbsp;&#x4E2D;&#25991;</p>',
        }),
        ['^<例>& 中文$'],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(item({ content: '<p>第一行\r\n第二行</p>' }), [
        '^第一行\\n第二行$',
      ]),
    ).toBe(true);
  });

  test('does not match attributes, scripts, styles, noscript fallbacks or card titles', () => {
    expect(
      matchesFeedRegex(
        item({
          title: '推广',
          excerpt: '推广',
          content:
            '<script>推广</script><style>推广</style><noscript>推广</noscript><p class="推广"><a href="https://example.test/推广">保留正文</a></p>',
        }),
        ['推广'],
      ),
    ).toBe(false);
  });

  test.each<Partial<FeedItem>>([
    { content: undefined },
    { content: '' },
    { content: ' \n\t ' },
    { content: '<p>&nbsp;</p>' },
    { content: '<script>短正文</script><style>短正文</style>' },
    { content: '<img alt="短正文" src="https://example.test/image.png">' },
    { content: '<p>短正文</p>', contentNeedTruncated: true },
    { type: 'articles', content: '<p>短正文</p>', contentNeedTruncated: true },
  ])('retains missing, truncated and empty bodies: %j', (overrides) => {
    expect(
      matchesFeedRegex(item({ excerpt: '短摘要', ...overrides }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(false);
  });

  test('combines every pin text segment including own_text without matching media metadata', () => {
    const pin = item({
      type: 'pins',
      content: [
        { type: 'text', content: '<p>第一段</p>' },
        { type: 'image', url: 'https://example.test/推广.png' },
        { type: 'text', own_text: '第二段' },
        { type: 'link_card', title: '推广', url: 'https://example.test/' },
      ],
    });
    expect(matchesFeedRegex(pin, ['^第一段\\s+第二段$'])).toBe(true);
    expect(matchesFeedRegex(pin, ['推广'])).toBe(false);
    expect(
      matchesFeedRegex(
        item({
          type: 'pins',
          content: [
            { type: 'text', content: '字'.repeat(30) },
            { type: 'text', content: '字'.repeat(30) },
          ],
        }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
    expect(
      matchesFeedRegex(
        item({ type: 'pins', content: [{ type: 'image', title: '短正文' }] }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
  });

  test('ignores malformed regexes and still evaluates later valid rules', () => {
    const answer = item({ content: '<p>短正文</p>' });
    expect(matchesFeedRegex(answer, ['['])).toBe(false);
    expect(matchesFeedRegex(answer, ['[', '没有这个词', '短正文'])).toBe(true);
    expect(matchesFeedRegex(answer, [])).toBe(false);
  });

  test('repeated matching stays stable across feed items and rule changes', () => {
    const short = item({ content: '<p>短正文</p>' });
    const long = item({ content: '字'.repeat(51) });
    const patterns = [SHORT_BODY_PATTERN];
    for (let pass = 0; pass < 3; pass += 1) {
      expect(matchesFeedRegex(short, patterns)).toBe(true);
      expect(matchesFeedRegex(long, patterns)).toBe(false);
    }
    expect(matchesFeedRegex(short, ['长正文'])).toBe(false);
    expect(matchesFeedRegex(short, ['短正文'])).toBe(true);
  });
});

describe('feed filter rule integration', () => {
  test.each<Partial<FeedItem>>([
    { isFollowingAuthor: true },
    { upvotedByFollowee: true },
  ])(
    'keeps followed content ahead of ad, regex and quality rules: %j',
    (relationship) => {
      expect(
        evaluateFeedItem(
          item({ answerType: 'PAID', voteCount: 0, ...relationship }),
          rules({
            blockPaid: true,
            regexPatterns: [SHORT_BODY_PATTERN],
            enableQuality: true,
          }),
        ).reason,
      ).toBeNull();
    },
  );

  test('allows an exemption to be turned off and preserves ad priority', () => {
    expect(
      evaluateFeedItem(
        item({ isFollowingAuthor: true }),
        rules({ keepFollowing: false, regexPatterns: [SHORT_BODY_PATTERN] }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    expect(
      evaluateFeedItem(
        item({ upvotedByFollowee: true }),
        rules({
          keepUpvotedByFollowee: false,
          regexPatterns: [SHORT_BODY_PATTERN],
        }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    expect(
      evaluateFeedItem(
        item({ answerType: 'PAID', voteCount: 0 }),
        rules({
          blockPaid: true,
          regexPatterns: [SHORT_BODY_PATTERN],
          enableQuality: true,
        }),
      ),
    ).toEqual({ reason: '知乎盐选付费内容', category: 'ad' });
    expect(
      evaluateFeedItem(
        item({ content: '<a href="https://xg.zhihu.com/">推广</a>' }),
        rules({ blockAdPlatform: true, regexPatterns: [SHORT_BODY_PATTERN] }),
      ),
    ).toEqual({ reason: '知乎广告平台推广', category: 'ad' });
  });

  test('evaluates custom regexes independently of the quality toggle', () => {
    expect(
      evaluateFeedItem(
        item({ voteCount: 100 }),
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: false }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    const lowVote = item({ voteCount: 0, content: '字'.repeat(51) });
    expect(
      evaluateFeedItem(
        lowVote,
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: true }),
      ),
    ).toEqual({ reason: '赞同数 < 10', category: 'quality' });
    expect(
      evaluateFeedItem(
        lowVote,
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: false }),
      ).reason,
    ).toBeNull();
  });

  test('uses the same regex verdict for hide mode, collapse groups and effect stats', () => {
    const first = item({ id: 'short-one' });
    const second = item({ id: 'short-two' });
    const retained = item({ id: 'long', content: '字'.repeat(51) });
    const third = item({ id: 'short-three' });
    const items = [first, second, retained, third];
    const filterRules = rules({ regexPatterns: [SHORT_BODY_PATTERN] });

    expect(applyFeedFilter(items, filterRules, 'hide')).toEqual([retained]);
    const collapsed = applyFeedFilter(items, filterRules, 'collapse');
    expect(collapsed).toHaveLength(3);
    expect(isCollapsedGroup(collapsed[0])).toBe(true);
    expect(collapsed[0]).toMatchObject({
      kind: 'collapsed',
      items: [first, second],
      reasons: ['命中自定义正则'],
    });
    expect(collapsed[1]).toBe(retained);
    expect(collapsed[2]).toMatchObject({
      kind: 'collapsed',
      items: [third],
      reasons: ['命中自定义正则'],
    });
    expect(computeFilterStats(items, filterRules)).toEqual({
      total: 4,
      filtered: 3,
      rate: 0.75,
      reasons: { 命中自定义正则: 3 },
    });
  });

  test('leaves feeds outside recommend out of the local filter pipeline', () => {
    expect(supportsLocalFeedFilter('recommend')).toBe(true);
    for (const tab of ['following', 'hot', 'local', 'unknown']) {
      expect(supportsLocalFeedFilter(tab)).toBe(false);
    }
  });
});

describe('bounded RE2 feed rules', () => {
  test.each([
    '(?=广告)广告',
    '广告(?!推广)',
    '(?<=广告)推广',
    '(?<!广告)推广',
    '(广告)\\1',
    '(?<word>广告)\\k<word>',
    String.raw`\u{1F600}`,
    String.raw`\u4E2D`,
  ])(
    'rejects unsupported syntax instead of falling back or changing its meaning: %s',
    (pattern) => {
      expect(normalizeFeedRegexPatterns([pattern])).toEqual([]);
      expect(parseFeedRegexInput(pattern)).toEqual({
        patterns: [],
        invalidLines: [1],
      });
      expect(
        matchesFeedRegex(item({ content: '广告推广广告😀中' }), [pattern]),
      ).toBe(false);
    },
  );

  test('accepts RE2 Unicode classes and hexadecimal code-point escapes', () => {
    const han = String.raw`^\p{Han}+$`;
    const emoji = String.raw`^\x{1F600}$`;
    expect(normalizeFeedRegexPatterns([han, emoji])).toEqual([han, emoji]);
    expect(matchesFeedRegex(item({ content: '汉字回答' }), [han])).toBe(true);
    expect(matchesFeedRegex(item({ content: '汉字😀' }), [han])).toBe(false);
    expect(matchesFeedRegex(item({ content: '😀' }), [emoji])).toBe(true);
  });

  test('searches substrings with several rules and reuses a cached rule set', () => {
    const patterns = ['不在正文中的词', '关键词'];
    const matching = item({
      content: `${'字'.repeat(100)}关键词${'字'.repeat(100)}`,
    });
    const retained = item({ content: '另一段内容' });
    for (let pass = 0; pass < 3; pass += 1) {
      expect(matchesFeedRegex(matching, patterns)).toBe(true);
      expect(matchesFeedRegex(retained, patterns)).toBe(false);
    }
  });

  test('counts only distinct valid rules toward the saved rule limit', () => {
    const patterns = Array.from(
      { length: FEED_REGEX_LIMITS.patterns + 1 },
      (_, index) => `^合成规则${index}$`,
    );
    const retained = patterns.slice(0, FEED_REGEX_LIMITS.patterns);
    expect(normalizeFeedRegexPatterns(['[', ...patterns, patterns[0]])).toEqual(
      retained,
    );
    expect(parseFeedRegexInput([...patterns, patterns[0]].join('\n'))).toEqual({
      patterns: retained,
      invalidLines: [FEED_REGEX_LIMITS.patterns + 1],
    });
    expect(
      matchesFeedRegex(
        item({ content: `合成规则${FEED_REGEX_LIMITS.patterns}` }),
        patterns,
      ),
    ).toBe(false);
  });

  test('accepts the source length boundary and rejects a longer rule', () => {
    const accepted = 'x'.repeat(FEED_REGEX_LIMITS.patternLength);
    const rejected = `${accepted}x`;
    expect(normalizeFeedRegexPatterns([accepted, rejected, '保留'])).toEqual([
      accepted,
      '保留',
    ]);
    expect(parseFeedRegexInput(`${accepted}\n${rejected}\n保留`)).toEqual({
      patterns: [accepted, '保留'],
      invalidLines: [2],
    });
    expect(matchesFeedRegex(item({ content: accepted }), [accepted])).toBe(
      true,
    );
    expect(matchesFeedRegex(item({ content: rejected }), [rejected])).toBe(
      false,
    );
  });

  test('rejects an oversized editor payload before splitting or compiling it', () => {
    const exact = `广告\n${' '.repeat(FEED_REGEX_LIMITS.inputLength - 3)}`;
    expect(exact.length).toBe(FEED_REGEX_LIMITS.inputLength);
    expect(parseFeedRegexInput(exact)).toEqual({
      patterns: ['广告'],
      invalidLines: [],
    });
    expect(parseFeedRegexInput(`${exact} `)).toEqual({
      patterns: [],
      invalidLines: [1],
    });
  });

  test('bounds the number of pin segments even when most contain no text', () => {
    const exact: NonNullable<FeedItem['content']> = Array.from(
      { length: FEED_REGEX_LIMITS.segments - 1 },
      () => ({ type: 'image' }),
    );
    exact.push({ type: 'text', content: '短正文' });
    expect(
      matchesFeedRegex(item({ type: 'pins', content: exact }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(true);
    expect(
      matchesFeedRegex(
        item({
          type: 'pins',
          content: [...exact, { type: 'text', content: '尾部关键词' }],
        }),
        [SHORT_BODY_PATTERN, '短正文', '尾部关键词'],
      ),
    ).toBe(false);
  });

  test('rejects short sources whose compiled program exceeds the state budget', () => {
    const oversizedProgram = '(abcdef){1000}';
    expect(oversizedProgram.length).toBeLessThan(
      FEED_REGEX_LIMITS.patternLength,
    );
    expect(normalizeFeedRegexPatterns([oversizedProgram, '普通规则'])).toEqual([
      '普通规则',
    ]);
    expect(parseFeedRegexInput(oversizedProgram)).toEqual({
      patterns: [],
      invalidLines: [1],
    });
    expect(
      matchesFeedRegex(item({ content: 'abcdef'.repeat(1000) }), [
        oversizedProgram,
      ]),
    ).toBe(false);
  });

  test('skips oversized HTML even when it would produce a short visible answer', () => {
    const body = '<p>短正文</p>';
    const comment = `<!--${'x'.repeat(FEED_REGEX_LIMITS.htmlLength - body.length - 7)}-->`;
    const exact = `${body}${comment}`;
    expect(exact.length).toBe(FEED_REGEX_LIMITS.htmlLength);
    expect(
      matchesFeedRegex(item({ content: exact }), [SHORT_BODY_PATTERN]),
    ).toBe(true);
    expect(
      matchesFeedRegex(item({ content: `${exact}x` }), [SHORT_BODY_PATTERN]),
    ).toBe(false);
    expect(matchesFeedRegex(item({ content: `${exact}x` }), ['短正文'])).toBe(
      false,
    );
    expect(
      matchesFeedRegex(item({ content: `${exact}<p>尾部关键词</p>` }), [
        '尾部关键词',
      ]),
    ).toBe(false);
  });

  test('skips oversized full text rather than matching a truncated prefix', () => {
    const exact = 'a'.repeat(FEED_REGEX_LIMITS.textLength);
    expect(matchesFeedRegex(item({ content: exact }), ['^a+$'])).toBe(true);
    expect(matchesFeedRegex(item({ content: `${exact}a` }), ['a'])).toBe(false);
    expect(
      matchesFeedRegex(item({ content: `${exact}a` }), [SHORT_BODY_PATTERN]),
    ).toBe(false);
    expect(
      matchesFeedRegex(item({ content: `${exact}尾部关键词` }), [
        'a',
        '尾部关键词',
      ]),
    ).toBe(false);
  });

  test('applies raw HTML and visible text budgets across all pin text segments', () => {
    const short = '<p>短正文</p>';
    const comment = `<!--${'x'.repeat(FEED_REGEX_LIMITS.htmlLength - short.length)}-->`;
    expect(comment.length).toBeLessThan(FEED_REGEX_LIMITS.htmlLength);
    expect(
      matchesFeedRegex(
        item({
          type: 'pins',
          content: [
            { type: 'text', content: short },
            { type: 'text', own_text: comment },
            { type: 'text', content: '尾部关键词' },
          ],
        }),
        [SHORT_BODY_PATTERN, '短正文', '尾部关键词'],
      ),
    ).toBe(false);
    const segmentLength = Math.floor(FEED_REGEX_LIMITS.textLength / 2) + 1;
    expect(
      matchesFeedRegex(
        item({
          type: 'pins',
          content: [
            { type: 'text', content: 'a'.repeat(segmentLength) },
            { type: 'text', own_text: 'b'.repeat(segmentLength) },
          ],
        }),
        ['a', 'b'],
      ),
    ).toBe(false);
  });
});

test('finishes pathological and diverse Unicode matches in an isolated process with a hard deadline', () => {
  // Exercise the actual helper. A native-RegExp regression is killed by the parent,
  // instead of freezing Jest before it can report the availability failure.
  // Diverse code points also expose unbounded Unicode transition-cache scans.
  const script = String.raw`
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const Module = require('node:module');
    const babel = require('@babel/core');
    const helperPath = path.resolve('src/utils/feedRegex.ts');
    const compiled = babel.transformFileSync(helperPath, {
      configFile: path.resolve('babel.config.js'),
      envName: 'test',
      caller: { name: 'jest', supportsStaticESM: false },
    });
    assert.ok(compiled && compiled.code);
    const helper = new Module(helperPath, module);
    helper.filename = helperPath;
    helper.paths = Module._nodeModulePaths(path.dirname(helperPath));
    helper._compile(compiled.code, helperPath);
    const { matchesFeedRegex, parseFeedRegexInput } = helper.exports;
    const negative = { type: 'answers', content: 'a'.repeat(32000) + '!' };
    const positive = { type: 'answers', content: 'a'.repeat(32) };
    for (const pattern of ['(a+)+$', '^(a|aa)+$']) {
      assert.deepEqual(parseFeedRegexInput(pattern).invalidLines, []);
      const patterns = [pattern];
      for (let pass = 0; pass < 3; pass += 1) {
        assert.equal(matchesFeedRegex(negative, patterns), false);
        assert.equal(matchesFeedRegex(positive, patterns), true);
      }
    }
    const codePoints = [];
    for (let value = 0x100; value <= 0xffff; value += 1) {
      if (value < 0xd800 || value > 0xdfff) {
        codePoints.push(String.fromCharCode(value));
      }
    }
    const unicodeBody = codePoints.join('');
    assert.ok(unicodeBody.length > 62000 && unicodeBody.length < 64000);
    const unicodePatterns = Array.from(
      { length: 20 },
      (_, index) => '.*RE2_TARGET_' + index + ':',
    );
    assert.deepEqual(parseFeedRegexInput(unicodePatterns.join('\n')).invalidLines, []);
    const unicodeNegative = { type: 'answers', content: unicodeBody };
    const unicodePositive = {
      type: 'answers',
      content: unicodeBody + 'RE2_TARGET_19:',
    };
    assert.equal(matchesFeedRegex(unicodeNegative, unicodePatterns), false);
    assert.equal(matchesFeedRegex(unicodePositive, unicodePatterns), true);
    for (let index = 0; index < unicodePatterns.length; index += 1) {
      const patterns = [unicodePatterns[index]];
      const matching = {
        type: 'answers',
        content: unicodeBody + 'RE2_TARGET_' + index + ':',
      };
      assert.equal(matchesFeedRegex(unicodeNegative, patterns), false);
      assert.equal(matchesFeedRegex(matching, patterns), true);
    }
    const noLiteralPatterns = ['.*\\p{Hiragana}$', '.*\\p{Greek}$'];
    assert.deepEqual(parseFeedRegexInput(noLiteralPatterns.join('\n')).invalidLines, []);
    assert.equal(matchesFeedRegex(unicodeNegative, noLiteralPatterns), false);
    assert.equal(
      matchesFeedRegex({ type: 'answers', content: unicodeBody + 'あ' }, noLiteralPatterns),
      true,
    );
    assert.equal(
      matchesFeedRegex({ type: 'answers', content: unicodeBody + 'Ω' }, noLiteralPatterns),
      true,
    );
    process.stdout.write('ok\n');
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(output).toBe('ok\n');
}, 20000);

describe('advertising placeholders', () => {
  test('hides promotion rows while retaining quality placeholders and normal items', () => {
    const ad = item({ id: 'ad', isLabeled: true });
    const low = item({ id: 'low', voteCount: 0 });
    const normal = item({ id: 'normal' });
    const config = rules({ blockLabeled: true, enableQuality: true });
    const result = applyFeedFilter([ad, low, normal], config, 'collapse', true);
    expect(result).toHaveLength(2);
    expect(isCollapsedGroup(result[0]) && result[0].items).toEqual([low]);
    expect(result[1]).toBe(normal);
    expect(applyFeedFilter([ad], config, 'collapse', false)).toHaveLength(1);
  });
  test('preserves exemptions and disabled ad rules', () => {
    const normal = item({
      id: 'kept',
      isLabeled: true,
      isFollowingAuthor: true,
    });
    expect(
      applyFeedFilter(
        [normal],
        rules({ blockLabeled: true }),
        'collapse',
        true,
      ),
    ).toEqual([normal]);
    expect(
      applyFeedFilter(
        [normal],
        rules({ keepFollowing: false }),
        'collapse',
        true,
      ),
    ).toEqual([normal]);
  });
});
