import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIssueUrl, canonicalUrl, mergeCode, parseStarUrl, validateSubmission } from '../assets/submission.js';

const URL_A = 'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089';

test('parseStarUrl 接受標準網址並轉小寫', () => {
  assert.equal(parseStarUrl(URL_A), '4f1d82f3f089');
  assert.equal(parseStarUrl('  https://liff.line.me/2010522144-5nZYW3pn/?q=4F1D82F3F089&utm=x '), '4f1d82f3f089');
});

test('parseStarUrl 拒絕其他網址', () => {
  for (const bad of [
    '',
    'not a url',
    'http://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089',
    'https://liff.line.me/9999999999-xxxxxxxx?q=4f1d82f3f089',
    'https://evil.example/2010522144-5nZYW3pn?q=4f1d82f3f089',
    'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f08',
    'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f08g',
    'https://liff.line.me/2010522144-5nZYW3pn',
  ]) {
    assert.equal(parseStarUrl(bad), null, bad);
  }
});

test('validateSubmission 整理欄位', () => {
  const result = validateSubmission({ url: 'https://liff.line.me/2010522144-5nZYW3pn?q=4F1D82F3F089', code: ' 07029 ' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: '4f1d82f3f089', url: URL_A, code: '07029' });
});

test('validateSubmission 代號可空，有填就要五位數', () => {
  assert.equal(validateSubmission({ url: URL_A, code: '' }).ok, true);
  assert.equal(validateSubmission({ url: URL_A }).value.code, '');
  for (const code of ['1234', '123456', 'abcde', '0702９']) {
    const result = validateSubmission({ url: URL_A, code });
    assert.equal(result.ok, false, code);
  }
  const both = validateSubmission({ url: 'https://example.com', code: 'abc' });
  assert.equal(both.errors.length, 2);
});

test('mergeCode 新增、補代號、重複、代號衝突', () => {
  const meta = { addedAt: '2026-10-14', source: '#1' };
  const entry = { id: '4f1d82f3f089', url: URL_A, code: '07029' };

  const added = mergeCode([], entry, meta);
  assert.equal(added.status, 'added');
  assert.deepEqual(added.codes, [{ ...entry, addedAt: '2026-10-14', source: '#1' }]);

  const dup = mergeCode(added.codes, { ...entry, code: '99999' }, meta);
  assert.equal(dup.status, 'duplicate', '已有代號不覆蓋');
  assert.equal(dup.codes, added.codes);

  const pending = mergeCode([], { ...entry, code: '' }, meta);
  assert.equal(pending.status, 'added');
  assert.equal(pending.codes[0].code, '');
  assert.equal(mergeCode(pending.codes, { ...entry, code: '' }, meta).status, 'duplicate');

  const filled = mergeCode(pending.codes, entry, meta);
  assert.equal(filled.status, 'updated');
  assert.equal(filled.codes[0].code, '07029');
  assert.equal(pending.codes[0].code, '', '原陣列不應被修改');

  const conflict = mergeCode(added.codes, { id: 'aaaaaaaaaaaa', url: canonicalUrl('aaaaaaaaaaaa'), code: '07029' }, meta);
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.codes, added.codes);
  assert.equal(mergeCode(added.codes, { id: 'aaaaaaaaaaaa', url: canonicalUrl('aaaaaaaaaaaa'), code: '' }, meta).status, 'added');
});

test('buildIssueUrl 帶入表單欄位', () => {
  const url = new URL(buildIssueUrl({ url: URL_A, code: '07029' }));
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.searchParams.get('template'), 'submit-code.yml');
  assert.equal(url.searchParams.get('title'), '投稿：07029');
  assert.equal(url.searchParams.get('url'), URL_A);
  assert.equal(url.searchParams.get('code'), '07029');
  const noCode = new URL(buildIssueUrl({ url: URL_A, code: '' }));
  assert.equal(noCode.searchParams.has('code'), false);
  assert.equal(noCode.searchParams.get('title'), '投稿：4f1d82f3f089');
});

test('初始資料全部通過驗證且不重複', async () => {
  const { readFile } = await import('node:fs/promises');
  const codes = JSON.parse(await readFile(new URL('../data/codes.json', import.meta.url), 'utf8'));
  assert.ok(codes.length > 0);
  const ids = new Set();
  const codeSet = new Set();
  for (const c of codes) {
    const result = validateSubmission(c);
    assert.equal(result.ok, true, c.url);
    assert.equal(result.value.id, c.id);
    assert.equal(c.url, canonicalUrl(c.id));
    assert.ok(!ids.has(c.id), `重複 ${c.id}`);
    assert.ok(!c.code || !codeSet.has(c.code), `代號重複 ${c.code}`);
    ids.add(c.id);
    codeSet.add(c.code);
  }
});
