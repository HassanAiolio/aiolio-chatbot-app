/**
 * Tiny BM25 search over document chunks, run entirely in the browser.
 * No embeddings service needed, and documents never leave the device except
 * for the few passages sent along with a question.
 */

const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have how i if in into is it its me my of on or our so ' +
    'that the their them then there these they this to was we were what when where which who why will with ' +
    'you your can do does did about than too very just not no yes also any all more most some such ' +
    'le la les un une des du de et en est que qui dans pour pas sur au aux ce ces il elle ils elles je tu ' +
    'nous vous mon ma mes ton ta tes son sa ses leur leurs par plus ou mais donc avec sans'
  ).split(' '),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

export interface Chunk {
  docId: string;
  docName: string;
  text: string;
}

export interface SearchHit extends Chunk {
  score: number;
}

export class SearchIndex {
  private chunks: Chunk[] = [];
  private termFreqs: Map<string, number>[] = [];
  private lengths: number[] = [];
  private docFreq = new Map<string, number>();
  private avgLength = 0;

  constructor(chunks: Chunk[] = []) {
    for (const chunk of chunks) this.add(chunk);
  }

  get size() {
    return this.chunks.length;
  }

  add(chunk: Chunk) {
    const tokens = tokenize(chunk.text);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    for (const term of tf.keys()) this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
    this.chunks.push(chunk);
    this.termFreqs.push(tf);
    this.lengths.push(tokens.length);
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / this.lengths.length;
  }

  search(query: string, limit = 4, k1 = 1.4, b = 0.75): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.chunks.length) return [];
    const n = this.chunks.length;

    const scored: SearchHit[] = [];
    this.chunks.forEach((chunk, i) => {
      const tf = this.termFreqs[i];
      let score = 0;
      for (const term of terms) {
        const freq = tf.get(term);
        if (!freq) continue;
        const df = this.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * this.lengths[i]) / (this.avgLength || 1)));
      }
      if (score > 0) scored.push({ ...chunk, score });
    });

    scored.sort((x, y) => y.score - x.score);
    const best = scored[0]?.score ?? 0;
    // Drop weak matches relative to the best one so unrelated questions get no context at all.
    return scored.filter((hit) => hit.score >= Math.max(0.2, best * 0.35)).slice(0, limit);
  }
}
