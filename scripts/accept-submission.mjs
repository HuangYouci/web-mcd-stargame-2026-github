// GitHub Action 用：讀取投稿 Issue 並驗證。
// MODE=check：只檢查不寫入，result=ready|duplicate|invalid
// MODE=apply：管理者加上「收錄」標籤後寫入 data/codes.json，result=added|duplicate|invalid
// 回覆內容寫到 comment.md。
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { mergeCode, validateSubmission } from '../assets/submission.js';
import { parseIssueForm } from './lib/issue-form.mjs';

const CODES_PATH = new URL('../data/codes.json', import.meta.url);
const COMMENT_PATH = 'comment.md';
const mode = process.env.MODE === 'apply' ? 'apply' : 'check';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
if (!issue) throw new Error('accept-submission | 事件裡沒有 issue');

const fields = parseIssueForm(issue.body);
const validation = validateSubmission(fields);

let result;
let comment;
if (!validation.ok) {
  result = 'invalid';
  comment = ['格式有誤：', ...validation.errors.map((e) => `- ${e}`), '', '修改這則 Issue 內容後會重新檢查。'].join('\n');
} else {
  const codes = JSON.parse(readFileSync(CODES_PATH, 'utf8'));
  const { id, url } = validation.value;
  const merged = mergeCode(codes, { id, url }, {
    addedAt: new Date().toISOString().slice(0, 10),
    source: `#${issue.number}`,
  });

  if (merged.status === 'duplicate') {
    result = 'duplicate';
    comment = `這個 QR Code 已經收錄（${merged.existing.source}）。`;
  } else if (mode === 'check') {
    result = 'ready';
    comment = `格式正確，等管理者確認。\n\n- 網址：${url}`;
  } else {
    result = 'added';
    writeFileSync(CODES_PATH, JSON.stringify(merged.codes, null, 2) + '\n');
    comment = `已收錄，網站幾分鐘內更新。\n\n- 網址：${url}`;
  }
}

writeFileSync(COMMENT_PATH, comment + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
console.log(`accept-submission | ${mode} #${issue.number} ${result}`);
