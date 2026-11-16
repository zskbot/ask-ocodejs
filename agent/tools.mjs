import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

export const toolDeclarations = [
  { name: 'web_search', description: 'Tìm thông tin mới trên web. Trả về danh sách kết quả kèm trích đoạn.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Từ khóa tìm kiếm, ngắn gọn' } }, required: ['query'] } },
  { name: 'read_url', description: 'Đọc nội dung chữ của một trang web công khai.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING', description: 'URL đầy đủ, bắt đầu bằng http(s)://' } }, required: ['url'] } },
  { name: 'calculator', description: 'Tính biểu thức toán: + - * / % ^ và ngoặc.', parameters: { type: 'OBJECT', properties: { expression: { type: 'STRING', description: 'Ví dụ: (12.5 + 3) * 4 ^ 2' } }, required: ['expression'] } },
];

export function toolLabel(name, args = {}) {
  if (name === 'web_search') return `Tìm: ${String(args.query ?? '')}`;
  if (name === 'read_url') return `Đọc: ${String(args.url ?? '')}`;
  if (name === 'calculator') return `Tính: ${String(args.expression ?? '')}`;
  return name;
}

export async function runTool(name, args = {}) {
  try {
    if (name === 'web_search') return await webSearch(String(args.query ?? ''));
    if (name === 'read_url') return await readUrl(String(args.url ?? ''));
    if (name === 'calculator') return calculator(String(args.expression ?? ''));
    return { output: `Tool không tồn tại: ${name}`, summary: 'Tool không tồn tại' };
  } catch {
    return { output: 'Không thể hoàn tất công cụ được yêu cầu.', summary: 'Công cụ thất bại' };
  }
}

async function webSearch(query) {
  const key = process.env.SEARCH_API_KEY;
  if (!key) return { output: 'Chưa cấu hình SEARCH_API_KEY nên không tìm web được.', summary: 'Thiếu SEARCH_API_KEY' };
  if (!query.trim() || query.length > 500) throw new Error('Từ khóa không hợp lệ');
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Search provider error');
  const data = await response.json();
  const results = (data.results ?? []).map((item) => ({ title: String(item.title ?? ''), url: String(item.url ?? ''), content: String(item.content ?? '').slice(0, 600) }));
  return { output: results, summary: `${results.length} kết quả`, sources: results.map(({ title, url }) => ({ title, url })) };
}

function ipv6ToBigInt(address) {
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const splitAt = value.lastIndexOf(':');
    const ipv4 = value.slice(splitAt + 1);
    if (!net.isIPv4(ipv4)) return null;
    const octets = ipv4.split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, splitAt) + ':' + high + ':' + low;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt('0x' + group), 0n);
}

function ipv6InCidr(address, network, prefix) {
  const value = ipv6ToBigInt(address);
  const base = ipv6ToBigInt(network);
  if (value === null || base === null) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b, c] = octets;
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    // Reject private, loopback, link-local, shared, documentation, benchmarking,
    // multicast, reserved, and other non-globally-routable IPv4 ranges.
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (!net.isIPv6(ip)) return true;
  const value = ip.toLowerCase();
  // Only allow IPv6 global-unicast space (2000::/3), and reject special-purpose
  // ranges even when their textual representation uses expanded hextets.
  if (!/^[23]/.test(value)) return true;
  return ipv6InCidr(value, '2001::', 23) ||
    ipv6InCidr(value, '2001:db8::', 32) ||
    ipv6InCidr(value, '2001:2::', 48) ||
    ipv6InCidr(value, '2001:10::', 28) ||
    ipv6InCidr(value, '2001:20::', 28) ||
    ipv6InCidr(value, '2002::', 16) ||
    ipv6InCidr(value, '3fff::', 20);
}

export function isPublicAddress(ip) {
  return !isPrivate(ip);
}

function normalizeHostnameBrackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export function tlsServername(hostname) {
  const normalized = normalizeHostnameBrackets(hostname);
  return net.isIP(normalized) ? undefined : hostname;
}

function requestPinned(url, address) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'GET',
      headers: { 'User-Agent': 'X-BO/1.0 (+chatbot)', Accept: 'text/html,text/plain,application/xhtml+xml' },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address, family: net.isIPv6(address) ? 6 : 4 }]);
        else callback(null, address, net.isIPv6(address) ? 6 : 4);
      },
      servername: tlsServername(url.hostname),
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 500000) {
          response.destroy(new Error('Phản hồi vượt quá giới hạn'));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    request.setTimeout(10000, () => request.destroy(new Error('Hết thời gian chờ')));
    request.on('error', reject);
    request.end();
  });
}

async function readUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('URL không hợp lệ'); }
  for (let hop = 0; hop <= 3; hop += 1) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL không hợp lệ');
    if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) throw new Error('Cổng không được phép');
    const hostname = normalizeHostnameBrackets(url.hostname);
    const addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivate(address))) throw new Error('Địa chỉ không công khai bị chặn');
    const response = await requestPinned(url, addresses[0].address);
    const location = response.headers.location;
    if (response.statusCode >= 300 && response.statusCode < 400 && location) {
      if (hop === 3) throw new Error('Quá nhiều chuyển hướng');
      url = new URL(location, url);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('Trang web trả lỗi');
    const html = response.body;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? url.toString();
    const text = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 8000);
    return { output: { title, text }, summary: `${text.length} ký tự`, sources: [{ title, url: url.toString() }] };
  }
  throw new Error('Không thể đọc URL');
}

function calculator(expression) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 200 || !/^[0-9+\-*\/%().\s^]+$/.test(expression)) throw new Error('Biểu thức không hợp lệ');
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*\/%^\-]/g)?.filter((token) => token !== " ") ?? [];
  if (tokens.join('') !== expression.replace(/\s+/g, '')) throw new Error('Biểu thức không hợp lệ');
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  function primary() {
    if (peek() === '+') { take(); return primary(); }
    if (peek() === '-') { take(); return -primary(); }
    if (peek() === '(') {
      take();
      const value = addSub();
      if (take() !== ')') throw new Error('Thiếu dấu ngoặc đóng');
      return value;
    }
    const token = take();
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) throw new Error('Thiếu số');
    return Number(token);
  }
  function power() { const left = primary(); return peek() === '^' ? (take(), left ** power()) : left; }
  function mulDiv() {
    let value = power();
    while (['*', '/', '%'].includes(peek())) {
      const op = take(), right = power();
      if ((op === '/' || op === '%') && right === 0) throw new Error('Không thể chia cho 0');
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  }
  function addSub() {
    let value = mulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = take(), right = mulDiv();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = addSub();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error('Kết quả không hợp lệ');
  return { output: result, summary: `= ${result}` };
}

export { calculator, readUrl };
