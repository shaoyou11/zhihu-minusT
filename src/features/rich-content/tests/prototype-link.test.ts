import {
  parseRichContentDevelopmentUrl,
  parseZhihuUrl,
} from '../../../utils/url';

describe('synthetic prototype development links', () => {
  it('preserves a case identifier for the prototype route', () => {
    expect(
      parseRichContentDevelopmentUrl(
        'zhihu--:///dev/rich-content/prototype?caseId=attachments',
      ),
    ).toBe('/dev/rich-content/prototype?caseId=attachments');
  });

  it('decodes a safe case identifier while ignoring unrelated parameters', () => {
    expect(
      parseRichContentDevelopmentUrl(
        '/dev/rich-content/prototype?unused=yes&caseId=%73egments#other',
      ),
    ).toBe('/dev/rich-content/prototype?caseId=segments');
  });

  it.each(['%zz', '%2Fattachments', 'a'.repeat(65)])(
    'discards malformed or out-of-scope identifiers: %s',
    (caseId) => {
      expect(
        parseRichContentDevelopmentUrl(
          `zhihu--:///dev/rich-content/prototype?caseId=${caseId}`,
        ),
      ).toBe('/dev/rich-content/prototype');
    },
  );

  it('keeps production routing and unsupported origins outside the dev entry', () => {
    expect(parseZhihuUrl('zhihu--:///dev/rich-content/prototype')).toBeNull();
    expect(
      parseRichContentDevelopmentUrl(
        'https://example.com/dev/rich-content/prototype?caseId=attachments',
      ),
    ).toBeNull();
    expect(
      parseRichContentDevelopmentUrl('/settings?caseId=attachments'),
    ).toBeNull();
    expect(
      parseRichContentDevelopmentUrl(
        '/dev/rich-content/example?caseId=attachments',
      ),
    ).toBe('/dev/rich-content/example');
  });
});
