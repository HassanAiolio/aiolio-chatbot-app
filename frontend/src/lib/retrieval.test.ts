import { describe, expect, it } from 'vitest';
import { SearchIndex, tokenize } from './retrieval';

const doc = (text: string, docName = 'notes.md') => ({ docId: docName, docName, text });

describe('tokenize', () => {
  it('lowercases, strips accents and drops stopwords', () => {
    expect(tokenize("The Café's opening HOURS are 9–17")).toEqual(['cafe', 'opening', 'hours', '17']);
  });
});

describe('SearchIndex', () => {
  const index = new SearchIndex([
    doc('Our refund policy: customers can return items within 30 days for a full refund.'),
    doc('Shipping takes 3 to 5 business days within France and 7 days internationally.'),
    doc('The office is open Monday to Friday from 9am to 6pm.'),
    doc('Refunds are processed to the original payment method within 5 days.', 'faq.pdf'),
  ]);

  it('ranks the most relevant chunks first', () => {
    const hits = index.search('how do refunds work?');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => /refund/i.test(h.text))).toBe(true);
  });

  it('returns nothing for unrelated questions', () => {
    expect(index.search('what is the capital of Japan?')).toEqual([]);
  });

  it('respects the limit and keeps document names', () => {
    const hits = index.search('days', 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toHaveProperty('docName');
  });

  it('handles an empty index', () => {
    expect(new SearchIndex().search('anything')).toEqual([]);
  });
});
