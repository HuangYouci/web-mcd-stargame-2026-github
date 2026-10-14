/**
 * 解析 GitHub Issue Form 送出後的 Markdown 內文。
 * 格式為「### 標籤」接空行再接值，未填欄位的值為「_No response_」。
 */

export const FIELD_LABELS = { 網址: 'url' };

/**
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseIssueForm(body) {
  const result = {};
  const sections = String(body ?? '').replace(/\r\n/g, '\n').split(/^###[ \t]+/m).slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const label = (newline === -1 ? section : section.slice(0, newline)).trim();
    const key = FIELD_LABELS[label];
    if (!key) continue;
    const value = newline === -1 ? '' : section.slice(newline + 1).trim();
    result[key] = value === '_No response_' ? '' : value;
  }
  return result;
}
