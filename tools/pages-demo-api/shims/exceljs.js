'use strict';
// The browser ExcelJS build (~950 KB) is a separate file, pages-demo-exceljs.js,
// loaded only when an Excel file is requested (see ensureExcel in browser.js).
// Server code calls require('exceljs') inside its export functions, after that
// load, so properties resolve to the loaded library at call time.
function library() {
  const lib = globalThis.ExcelJS;
  if (!lib) throw Object.assign(new Error('Excel support is not loaded.'), { code: 'EXCEL_UNAVAILABLE' });
  return lib;
}
module.exports = new Proxy({}, { get: (_, key) => library()[key], has: (_, key) => key in library() });
