import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIssueForm } from '../scripts/lib/issue-form.mjs';

test('parseIssueForm 解析 GitHub 送出的內文', () => {
  const body = [
    '### 網址',
    '',
    'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089',
    '',
    '### 代號',
    '',
    '07029',
    '',
    '### 點位',
    '',
    '麥當勞 - 昆明餐廳｜aaaaaaa',
    '',
    '### 其他欄位',
    '',
    '略過',
  ].join('\r\n');
  assert.deepEqual(parseIssueForm(body), {
    url: 'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089',
    code: '07029',
  });
});

test('parseIssueForm 未填欄位為空字串', () => {
  assert.deepEqual(parseIssueForm('### 網址\n\n_No response_\n\n### 代號\n\n12345 ### 不是標題'), { url: '', code: '12345 ### 不是標題' });
});

test('parseIssueForm 忽略未知欄位與空內文', () => {
  assert.deepEqual(parseIssueForm('### 其他\n\nx'), {});
  assert.deepEqual(parseIssueForm(null), {});
});
