/**
 * QR Code 編碼器：位元組模式、錯誤更正等級 M、版本 1–20。
 * 依 ISO/IEC 18004 實作，結構參考 Nayuki 的 QR Code generator（MIT）。
 * 不引入第三方套件，瀏覽器與 Node 共用。
 */

// 索引為版本號，0 不使用
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
export const MAX_VERSION = 20;
// 等級 M 的格式資訊位元為 00
const ECL_M_FORMAT_BITS = 0;

const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
const FINDER_LIKE_REVERSED = [...FINDER_LIKE].reverse();

/**
 * 將文字編碼成 QR Code 模組矩陣。
 * @param {string} text
 * @returns {{ version: number, size: number, mask: number, modules: boolean[][] }}
 */
export function encodeQr(text) {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const codewords = addEccAndInterleave(buildDataCodewords(bytes, version), version);
  const size = version * 4 + 17;
  const modules = makeGrid(size);
  const isFunction = makeGrid(size);

  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  drawFunctionPatterns(version, size, setFunction);
  drawCodewords(codewords, size, modules, isFunction);

  let bestMask = 0;
  let minPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask, size, modules, isFunction);
    drawFormatBits(mask, size, setFunction);
    const penalty = computePenalty(size, modules);
    if (penalty < minPenalty) {
      bestMask = mask;
      minPenalty = penalty;
    }
    // XOR 兩次即還原
    applyMask(mask, size, modules, isFunction);
  }
  applyMask(bestMask, size, modules, isFunction);
  drawFormatBits(bestMask, size, setFunction);

  return { version, size, mask: bestMask, modules };
}

/**
 * 產生 SVG path 的 d 屬性，座標已含 quiet zone。同列相鄰的深色模組合併成一段，縮短字串。
 * @param {{ size: number, modules: boolean[][] }} qr
 * @param {number} border
 */
export function qrToPath(qr, border = 4) {
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    const row = qr.modules[y];
    for (let x = 0; x < qr.size; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < qr.size && row[end + 1]) end++;
      const run = end - x + 1;
      parts.push(`M${x + border} ${y + border}h${run}v1h-${run}z`);
      x = end;
    }
  }
  return parts.join('');
}

export function numRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function numDataCodewords(version) {
  return Math.floor(numRawDataModules(version) / 8) - ECC_PER_BLOCK[version] * NUM_BLOCKS[version];
}

function charCountBits(version) {
  return version <= 9 ? 8 : 16;
}

function pickVersion(byteLength) {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const needed = 4 + charCountBits(version) + byteLength * 8;
    if (needed <= numDataCodewords(version) * 8) return version;
  }
  throw new RangeError(`qr.pickVersion | 資料過長：${byteLength} bytes`);
}

function buildDataCodewords(bytes, version) {
  const bits = [];
  const append = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, charCountBits(version));
  for (const b of bytes) append(b, 8);

  const capacity = numDataCodewords(version) * 8;
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);

  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    result.push(byte);
  }
  return result;
}

function addEccAndInterleave(data, version) {
  const numBlocks = NUM_BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonDivisor(eccLen);

  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(k, k + len);
    k += len;
    const ecc = reedSolomonRemainder(block, divisor);
    // 短區塊補一個佔位，讓交錯時欄位對齊
    if (i < numShortBlocks) block.push(0);
    blocks.push(block.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - eccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

function makeGrid(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false));
}

function getBit(value, i) {
  return ((value >>> i) & 1) !== 0;
}

export function alignmentPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

function drawFunctionPatterns(version, size, setFunction) {
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((py, i) => {
    positions.forEach((px, j) => {
      const overlapsFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (overlapsFinder) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  // 先以遮罩 0 佔位，選定遮罩後覆寫
  drawFormatBits(0, size, setFunction);

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }
}

function drawFormatBits(mask, size, setFunction) {
  const data = (ECL_M_FORMAT_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(bits, i));
  setFunction(8, 7, getBit(bits, 6));
  setFunction(8, 8, getBit(bits, 7));
  setFunction(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, getBit(bits, i));
  setFunction(8, size - 8, true);
}

function drawCodewords(codewords, size, modules, isFunction) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(mask, size, modules, isFunction) {
  const shouldFlip = MASKS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunction[y][x] && shouldFlip(x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

function matchesAt(line, start, pattern) {
  return pattern.every((v, k) => line[start + k] === (v === 1));
}

function computePenalty(size, modules) {
  let result = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(modules[y]);
  for (let x = 0; x < size; x++) lines.push(modules.map((row) => row[x]));

  for (const line of lines) {
    let runLength = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) {
        runLength++;
        continue;
      }
      if (runLength >= 5) result += 3 + (runLength - 5);
      runLength = 1;
    }
    for (let i = 0; i + FINDER_LIKE.length <= size; i++) {
      if (matchesAt(line, i, FINDER_LIKE) || matchesAt(line, i, FINDER_LIKE_REVERSED)) result += 40;
    }
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
    }
  }

  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;
  return result;
}
