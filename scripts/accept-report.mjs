// GitHub Action 用：處理「無法使用」回報 Issue，把回報者記到該筆 QR Code 的 reports。
// 同一帳號對同一筆只算一次；回報只加註記，不會刪除資料。
// 結果寫到 GITHUB_OUTPUT（result=reported|already|unknown|invalid），回覆內容寫到 comment.md。
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { addReport, parseStarUrl } from '../assets/submission.js';
import { parseIssueForm } from './lib/issue-form.mjs';

const CODES_PATH = new URL('../data/codes.json', import.meta.url);
const COMMENT_PATH = 'comment.md';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
if (!issue) throw new Error('accept-report | 事件裡沒有 issue');

const id = parseStarUrl(parseIssueForm(issue.body).url);
let result;
let comment;
if (!id) {
  result = 'invalid';
  comment = '網址不是星級遊戲的 QR Code，修改這則 Issue 內容後會重新檢查。';
} else {
  const codes = JSON.parse(readFileSync(CODES_PATH, 'utf8'));
  const merged = addReport(codes, id, issue.user.login);
  result = merged.status;
  if (merged.status === 'reported') {
    writeFileSync(CODES_PATH, JSON.stringify(merged.codes, null, 2) + '\n');
    comment = `已記錄，這個 QR Code 目前有 ${merged.count} 人回報無法使用。`;
  } else if (merged.status === 'already') {
    comment = `你已經回報過這個 QR Code，目前有 ${merged.count} 人回報。`;
  } else {
    comment = '這個 QR Code 不在清單裡。';
  }
}

writeFileSync(COMMENT_PATH, comment + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
console.log(`accept-report | #${issue.number} ${result}`);
