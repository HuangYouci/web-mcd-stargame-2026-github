import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { addReport, buildIssueUrl, buildReportUrl, canonicalUrl, mergeCode, parseStarUrl, validateSubmission } from '../assets/submission.js';

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

test('validateSubmission 只看網址', () => {
  assert.deepEqual(validateSubmission({ url: 'https://liff.line.me/2010522144-5nZYW3pn?q=4F1D82F3F089', code: '亂填' }), {
    ok: true,
    value: { id: '4f1d82f3f089', url: URL_A },
  });
  assert.equal(validateSubmission({ url: 'https://example.com' }).ok, false);
});

test('mergeCode 只以 q 判斷重複，新資料 code 留空', () => {
  const meta = { addedAt: '2026-10-14', source: '#1' };
  const added = mergeCode([], { id: '4f1d82f3f089', url: URL_A }, meta);
  assert.equal(added.status, 'added');
  assert.deepEqual(added.codes, [{ id: '4f1d82f3f089', code: '', url: URL_A, addedAt: '2026-10-14', source: '#1' }]);

  const dup = mergeCode(added.codes, { id: '4f1d82f3f089', url: URL_A }, meta);
  assert.equal(dup.status, 'duplicate');
  assert.equal(dup.codes, added.codes);
});

test('addReport 同帳號只算一次、不存在的回 unknown', () => {
  const codes = [{ id: 'aaaaaaaaaaaa' }];
  const first = addReport(codes, 'aaaaaaaaaaaa', 'alice');
  assert.equal(first.status, 'reported');
  assert.deepEqual(first.codes[0].reports, ['alice']);
  assert.equal(codes[0].reports, undefined, '原陣列不應被修改');

  assert.equal(addReport(first.codes, 'aaaaaaaaaaaa', 'alice').status, 'already');
  const second = addReport(first.codes, 'aaaaaaaaaaaa', 'bob');
  assert.equal(second.count, 2);
  assert.equal(addReport(codes, 'bbbbbbbbbbbb', 'alice').status, 'unknown');
});

test('buildIssueUrl 與 buildReportUrl 帶入網址與範本', () => {
  const submit = new URL(buildIssueUrl(URL_A));
  assert.equal(submit.hostname, 'github.com');
  assert.equal(submit.searchParams.get('template'), 'submit-code.yml');
  assert.equal(submit.searchParams.get('url'), URL_A);
  assert.equal(submit.searchParams.get('title'), '投稿：3f089');

  const report = new URL(buildReportUrl(URL_A));
  assert.equal(report.searchParams.get('template'), 'report-broken.yml');
  assert.equal(report.searchParams.get('url'), URL_A);
});

test('資料全部通過驗證且 q 不重複', async () => {
  const codes = JSON.parse(await readFile(new URL('../data/codes.json', import.meta.url), 'utf8'));
  assert.ok(codes.length > 0);
  const ids = new Set();
  for (const c of codes) {
    const result = validateSubmission(c);
    assert.equal(result.ok, true, c.url);
    assert.equal(result.value.id, c.id);
    assert.equal(c.url, canonicalUrl(c.id));
    assert.equal(typeof c.code, 'string', '保留 code 欄位');
    assert.ok(!ids.has(c.id), `重複 ${c.id}`);
    ids.add(c.id);
  }
});
