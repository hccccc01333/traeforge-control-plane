const { TextDecoder } = require('util');

function decodePowerShellOutput(value) {
  if (typeof value === 'string') return value;
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (!bytes.length) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return swapped.toString('utf16le');
  }
  if (bytes.includes(0)) {
    try { return bytes.toString('utf16le').replace(/^\ufeff/, ''); } catch { /* use UTF-8 below */ }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/, '');
  } catch {
    try { return new TextDecoder('gb18030').decode(bytes).replace(/^\ufeff/, ''); } catch { return bytes.toString('utf8'); }
  }
}

module.exports = { decodePowerShellOutput };
