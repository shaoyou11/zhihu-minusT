import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  analyzeFixtureCase,
  analyzeFixtureDirectory,
  analyzeHtml,
  analyzeSegmentInfos,
  analyzeStructuredContentPages,
  loadManifest,
  normalizeFixtureHtml,
} from '../tools/fixture-lib.mjs';

const manifestPath = path.join(__dirname, '../fixtures/manifest.json');

function structuredStats(
  result:
    | Awaited<ReturnType<typeof analyzeFixtureDirectory>>[number]
    | undefined,
) {
  assert.ok(result);
  assert.equal(result.sourceType, 'structured_content');
  return result.stats as ReturnType<
    typeof analyzeStructuredContentPages
  >['stats'];
}

test('normalizes captured escaped HTML values', () => {
  assert.equal(
    normalizeFixtureHtml('<p data-pid=\\"one\\">x</p>'),
    '<p data-pid="one">x</p>',
  );
  assert.equal(
    normalizeFixtureHtml('"<p>JSON value</p>"'),
    '<p>JSON value</p>',
  );
});

test('normalizes escaped closing tags from captured API values', () => {
  assert.deepEqual(normalizeFixtureHtml('<p>A<\\/p>'), '<p>A</p>');
});

test('discovers every unregistered inbox sample without manifest work', async () => {
  const directoryPath = await mkdtemp(
    path.join(tmpdir(), 'rich-content-fixtures-'),
  );
  try {
    await writeFile(
      path.join(directoryPath, 'new-answer.json'),
      JSON.stringify({ content: '<p>JSON answer</p>', type: 'answer' }),
    );
    await writeFile(
      path.join(directoryPath, 'new-feed-card.json'),
      JSON.stringify({
        type: 'question_feed_card',
        target: {
          content: '<p data-pid="paragraph-1">feed card answer</p>',
          segment_infos: [
            {
              pid: 'paragraph-1',
              text: 'feed card answer',
              marks: [
                {
                  start_index: 0,
                  end_index: 4,
                  seg_info: {
                    like_count: 0,
                    comment_count: 0,
                    is_like: false,
                    seg_ids: ['segment-1'],
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    await writeFile(path.join(directoryPath, 'README.md'), '# ignored');

    const results = await analyzeFixtureDirectory(directoryPath);
    assert.deepEqual(
      results.map(({ id }) => id),
      ['inbox:new-answer.json', 'inbox:new-feed-card.json'],
    );
    assert.equal(results[1].stats.segmentInfos, 1);
    assert.deepEqual(results[1].errors, []);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test('excludes noscript fallback images from active image counts', () => {
  const stats = analyzeHtml(
    '<figure><noscript><img src="fallback.jpg"></noscript><img src="active.jpg"></figure>',
  );
  assert.equal(stats.totalImages, 2);
  assert.equal(stats.activeImages, 1);
  assert.equal(stats.noscripts, 1);
});

test('scans every bundled structured case directly with counts and sanitized paging metadata', async () => {
  const results = await analyzeFixtureDirectory(
    path.join(__dirname, '../fixtures/inbox/structured-content'),
  );
  const synthetic = results.filter((result: { traits: string[] }) =>
    result.traits.includes('synthetic'),
  );
  const captured = results.filter((result: { traits: string[] }) =>
    result.traits.includes('capture-derived'),
  );
  assert.equal(synthetic.length, 5);
  assert.equal(captured.length, 7);
  for (const result of results) {
    assert.equal(result.sourceType, 'structured_content');
    assert.deepEqual(result.errors, [], result.id);
    const stats = structuredStats(result);
    assert.ok(stats.structuredSegments >= 4);
    assert.equal(stats.segmentInfos, 0);
    assert.ok(
      stats.paging.every(
        (paging: Record<string, unknown>) =>
          !('next' in paging) && !('previous' in paging),
      ),
    );
  }
  const list = structuredStats(
    results.find((result) => result.id.endsWith('list-formula.json')),
  );
  assert.equal(list.lists, 1);
  assert.equal(list.listItems, 4);
  assert.equal(list.formulaImages, 3);
  const overlap = structuredStats(
    results.find((result) => result.id.endsWith('heading-overlap.json')),
  );
  assert.equal(overlap.structuredPages, 2);
  assert.equal(overlap.structuredSegments, 8);
  assert.equal(overlap.mergedStructuredSegments, 7);
  assert.deepEqual(overlap.markTypes, {
    bold: 2,
    link: 0,
    entity_word: 1,
    formula: 0,
  });
  assert.equal(overlap.paging[0].is_end, false);
  assert.equal(overlap.paging[1].is_end, true);
  const dense = structuredStats(
    results.find((result) => result.id.endsWith('dense-formula.json')),
  );
  assert.equal(dense.horizontalRules, 1);
  assert.equal(dense.formulaImages, 6);
  assert.equal(
    captured.reduce(
      (sum, result) => sum + structuredStats(result).structuredSegments,
      0,
    ),
    106,
  );
  assert.equal(
    captured.reduce((sum, result) => sum + structuredStats(result).marks, 0),
    109,
  );
});

test('structured analysis reports malformed paging and ranges without leaking payload values', () => {
  const secret = 'synthetic-private-value';
  const analysis = analyzeStructuredContentPages([
    {
      paging: secret,
      segments: [
        {
          id: secret,
          type: 'paragraph',
          paragraph: {
            text: secret,
            marks: [{ type: 'bold', start_index: 0, end_index: 1000 }],
          },
        },
      ],
    },
  ]);
  assert.equal(analysis.errors.length, 2);
  assert.equal(JSON.stringify(analysis).includes(secret), false);
});

test('counts member mentions and topic tags in pin HTML', () => {
  const stats = analyzeHtml(
    '<a class="member_mention" href="/people/example">@example</a><a class="hash_tag" href="/topic/example">#example</a>',
  );
  assert.equal(stats.memberMentions, 1);
  assert.equal(stats.topicTags, 1);
});

test('validates segment info ranges and paragraph references', () => {
  const content = '<p data-pid="paragraph-1">正文</p>';
  const validDocument = {
    type: 'question_feed_card',
    target: {
      segment_infos: [
        {
          pid: 'paragraph-1',
          text: '正文',
          marks: [
            {
              start_index: 0,
              end_index: 2,
              seg_info: {
                like_count: 1,
                comment_count: 0,
                is_like: false,
                seg_ids: ['segment-1'],
              },
            },
          ],
        },
      ],
    },
  };

  assert.deepEqual(
    analyzeSegmentInfos(validDocument, 'question_feed_card', content),
    { count: 1, errors: [] },
  );

  const invalidDocument = {
    ...validDocument,
    target: {
      segment_infos: [
        {
          pid: 'missing-paragraph',
          text: '正文',
          marks: [
            {
              start_index: 0,
              end_index: 3,
              seg_info: {
                like_count: 0,
                comment_count: 0,
                is_like: false,
                seg_ids: [''],
              },
            },
          ],
        },
      ],
    },
  };
  const invalidResult = analyzeSegmentInfos(
    invalidDocument,
    'question_feed_card',
    content,
  );

  assert.equal(invalidResult.count, 1);
  assert.match(invalidResult.errors.join('\n'), /absent from content/);
  assert.match(invalidResult.errors.join('\n'), /range 0:3 is invalid/);
  assert.match(invalidResult.errors.join('\n'), /non-empty strings/);
});

test('counts daily avatar images separately from content images', () => {
  const stats = analyzeHtml(
    '<div class="meta"><img class="avatar" src="avatar.jpg"></div><img class="content-image" src="content.jpg">',
  );
  assert.equal(stats.activeImages, 2);
  assert.equal(stats.avatarImages, 1);
});

test('analyzes JSON API envelopes and asserts metadata beside content', async () => {
  const directoryPath = await mkdtemp(
    path.join(tmpdir(), 'rich-content-json-fixture-'),
  );
  try {
    await writeFile(
      path.join(directoryPath, 'answer.json'),
      JSON.stringify({
        type: 'answer',
        content:
          '<p data-pid="paragraph-1">正文</p><figure><img src="image.jpg" /></figure>',
        content_need_truncated: true,
        author: { vip_info: { is_vip: true } },
        endorsements: [{}, {}],
        segment_infos: [
          {
            pid: 'paragraph-1',
            text: '正文',
            marks: [
              {
                start_index: 0,
                end_index: 2,
                seg_info: {
                  like_count: 1,
                  comment_count: 0,
                  is_like: false,
                  seg_ids: ['segment-1'],
                },
              },
            ],
          },
        ],
      }),
    );
    const manifestFilePath = path.join(directoryPath, 'manifest.json');
    await writeFile(
      manifestFilePath,
      JSON.stringify({
        version: 2,
        cases: [
          {
            id: 'json-answer',
            file: './answer.json',
            contentPath: 'content',
            expected: {
              paragraphs: 1,
              figures: 1,
              activeImages: 1,
              segmentInfos: 1,
            },
            expectedMetadata: {
              type: 'answer',
              content_need_truncated: true,
              'author.vip_info.is_vip': true,
              'endorsements.length': 2,
            },
          },
        ],
      }),
    );

    const [fixture] = (await loadManifest(manifestFilePath)).cases;
    const result = await analyzeFixtureCase(fixture, manifestFilePath);
    assert.deepEqual(result.errors, []);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test('all registered real-world fixtures retain their expected structure', async () => {
  const manifest = await loadManifest(manifestPath);
  for (const fixtureCase of manifest.cases) {
    const result = await analyzeFixtureCase(fixtureCase, manifestPath);
    assert.deepEqual(result.errors, [], fixtureCase.id);
  }
});
