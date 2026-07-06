/*!
 * qrcode.js — self-contained QR Code (Model 2) generator, byte mode.
 * No external dependencies, works fully offline.
 *
 * Supports versions 1–10 (up to ~271 bytes at EC level M — far more than a
 * warehouse label needs) and error-correction levels L / M / Q / H.
 *
 * API:
 *   DELIGHTS_QR.make(text, { ecLevel:'M', version:0 })  -> { size, modules }
 *       modules is a size×size array of booleans (true = dark).
 *   DELIGHTS_QR.toSVG(text, opts)   -> SVG string
 *   DELIGHTS_QR.toDataURL(text, opts) -> PNG data URL (via canvas)
 *   DELIGHTS_QR.selfTest()          -> throws if internal tables are inconsistent
 *
 * The RS block table below is validated at load time against the canonical
 * total-codeword counts, so a transcription error cannot pass silently.
 */
(function (root) {
  'use strict';

  // ---- Galois field GF(256), primitive polynomial 0x11d, generator 2 -------
  var EXP = new Array(256);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    EXP[255] = EXP[0];
  })();
  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a] + LOG[b]) % 255];
  }

  // ---- Total codewords (data + EC) per version, used to validate tables ----
  var TOTAL_CODEWORDS = {
    1: 26, 2: 44, 3: 70, 4: 100, 5: 134,
    6: 172, 7: 196, 8: 242, 9: 292, 10: 346
  };

  // ---- Reed-Solomon block layout (ISO/IEC 18004 Table 9), versions 1-10 ----
  // level -> ecPerBlock, groups: [[numBlocks, dataPerBlock], ...]
  // Order of keys: L, M, Q, H
  var RS = {
    1: { L: [7, [[1, 19]]], M: [10, [[1, 16]]], Q: [13, [[1, 13]]], H: [17, [[1, 9]]] },
    2: { L: [10, [[1, 34]]], M: [16, [[1, 28]]], Q: [22, [[1, 22]]], H: [28, [[1, 16]]] },
    3: { L: [15, [[1, 55]]], M: [26, [[1, 44]]], Q: [18, [[2, 17]]], H: [22, [[2, 13]]] },
    4: { L: [20, [[1, 80]]], M: [18, [[2, 32]]], Q: [26, [[2, 24]]], H: [16, [[4, 9]]] },
    5: { L: [26, [[1, 108]]], M: [24, [[2, 43]]], Q: [18, [[2, 15], [2, 16]]], H: [22, [[2, 11], [2, 12]]] },
    6: { L: [18, [[2, 68]]], M: [16, [[4, 27]]], Q: [24, [[4, 19]]], H: [28, [[4, 15]]] },
    7: { L: [20, [[2, 78]]], M: [18, [[4, 31]]], Q: [18, [[2, 14], [4, 15]]], H: [26, [[4, 13], [1, 14]]] },
    8: { L: [24, [[2, 97]]], M: [22, [[2, 38], [2, 39]]], Q: [22, [[4, 18], [2, 19]]], H: [26, [[4, 14], [2, 15]]] },
    9: { L: [30, [[2, 116]]], M: [22, [[3, 36], [2, 37]]], Q: [20, [[4, 16], [4, 17]]], H: [24, [[4, 12], [4, 13]]] },
    10: { L: [18, [[2, 68], [2, 69]]], M: [26, [[4, 43], [1, 44]]], Q: [24, [[6, 19], [2, 20]]], H: [28, [[6, 15], [2, 16]]] }
  };

  // ---- Alignment pattern centre positions per version ----------------------
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  // EC level -> 2-bit indicator used in the format string (spec values)
  var EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // ---- Validate RS table against TOTAL_CODEWORDS at load -------------------
  function selfTest() {
    for (var v = 1; v <= 10; v++) {
      ['L', 'M', 'Q', 'H'].forEach(function (lvl) {
        var spec = RS[v][lvl];
        var ecPer = spec[0];
        var blocks = 0, dataCw = 0;
        spec[1].forEach(function (g) { blocks += g[0]; dataCw += g[0] * g[1]; });
        var total = dataCw + blocks * ecPer;
        if (total !== TOTAL_CODEWORDS[v]) {
          throw new Error('QR table error v' + v + ' ' + lvl +
            ': got ' + total + ' expected ' + TOTAL_CODEWORDS[v]);
        }
      });
    }
    return true;
  }
  selfTest();

  // ---- Bit buffer ----------------------------------------------------------
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (num, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push(((num >>> i) & 1) === 1);
  };
  BitBuffer.prototype.length = function () { return this.bits.length; };

  // ---- RS generator polynomial & remainder ---------------------------------
  function rsGenerator(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }
  function rsRemainder(data, ecLen) {
    var gen = rsGenerator(ecLen);
    var res = data.slice().concat(new Array(ecLen).fill(0));
    for (var i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef !== 0) {
        for (var j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return res.slice(data.length);
  }

  // ---- Data capacity (data codewords) for version/level --------------------
  function dataCodewords(v, lvl) {
    var spec = RS[v][lvl], n = 0;
    spec[1].forEach(function (g) { n += g[0] * g[1]; });
    return n;
  }

  function charCountBits(v) { return v <= 9 ? 8 : 16; }

  // ---- Choose smallest version fitting the data ----------------------------
  function chooseVersion(byteLen, lvl, minVersion) {
    for (var v = Math.max(1, minVersion || 1); v <= 10; v++) {
      var cap = dataCodewords(v, lvl);
      var need = Math.ceil((4 + charCountBits(v) + byteLen * 8) / 8);
      if (need <= cap) return v;
    }
    throw new Error('QR: data too long for supported versions (max ~271 bytes at level M). Length=' + byteLen);
  }

  // ---- Build the full codeword sequence (data + interleaved EC) -------------
  function buildCodewords(text, v, lvl) {
    var bytes = utf8Bytes(text);
    var buf = new BitBuffer();
    buf.put(4, 4);                       // byte mode indicator
    buf.put(bytes.length, charCountBits(v));
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);

    var capBits = dataCodewords(v, lvl) * 8;
    // terminator
    for (var t = 0; t < 4 && buf.length() < capBits; t++) buf.bits.push(false);
    // pad to byte boundary
    while (buf.length() % 8 !== 0) buf.bits.push(false);
    // to bytes
    var dcw = [];
    for (var b = 0; b < buf.length(); b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | (buf.bits[b + k] ? 1 : 0);
      dcw.push(byte);
    }
    // pad bytes
    var pads = [0xEC, 0x11], pi = 0;
    while (dcw.length < dataCodewords(v, lvl)) { dcw.push(pads[pi & 1]); pi++; }

    // split into blocks
    var spec = RS[v][lvl], ecPer = spec[0];
    var blocks = [], idx = 0;
    spec[1].forEach(function (g) {
      for (var n = 0; n < g[0]; n++) {
        var d = dcw.slice(idx, idx + g[1]); idx += g[1];
        blocks.push({ data: d, ec: rsRemainder(d, ecPer) });
      }
    });
    // interleave data
    var out = [];
    var maxData = 0;
    blocks.forEach(function (bl) { if (bl.data.length > maxData) maxData = bl.data.length; });
    for (var c = 0; c < maxData; c++) {
      blocks.forEach(function (bl) { if (c < bl.data.length) out.push(bl.data[c]); });
    }
    // interleave EC
    for (var e = 0; e < ecPer; e++) {
      blocks.forEach(function (bl) { out.push(bl.ec[e]); });
    }
    return out;
  }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return out;
  }

  // ---- Matrix construction -------------------------------------------------
  function makeMatrix(v, lvl, codewords) {
    var size = v * 4 + 17;
    var m = [], reserved = [];
    for (var r = 0; r < size; r++) { m.push(new Array(size).fill(null)); reserved.push(new Array(size).fill(false)); }

    function setF(r, c, val) { m[r][c] = val; reserved[r][c] = true; }

    // finder + separators
    function finder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var dark = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                   (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                   (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        setF(rr, cc, dark);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // timing patterns
    for (var i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) setF(6, i, i % 2 === 0);
      if (!reserved[i][6]) setF(i, 6, i % 2 === 0);
    }

    // alignment patterns — skip only the three that overlap finder patterns
    // (top-left, top-right, bottom-left corners). Centres that sit on the
    // timing line but away from finders (e.g. v9 at row/col 6) ARE drawn.
    var pos = ALIGN[v];
    for (var a = 0; a < pos.length; a++) for (var b = 0; b < pos.length; b++) {
      var pr = pos[a], pc = pos[b];
      var inFinderZone = (pr <= 8 && pc <= 8) ||
                         (pr <= 8 && pc >= size - 9) ||
                         (pr >= size - 9 && pc <= 8);
      if (inFinderZone) continue;
      for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) {
        var dark2 = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        setF(pr + y, pc + x, dark2);
      }
    }

    // dark module
    setF(size - 8, 8, true);

    // reserve format info areas
    for (var f = 0; f < 9; f++) {
      if (!reserved[8][f]) { reserved[8][f] = true; if (m[8][f] === null) m[8][f] = false; }
      if (!reserved[f][8]) { reserved[f][8] = true; if (m[f][8] === null) m[f][8] = false; }
    }
    for (var g = 0; g < 8; g++) {
      reserved[8][size - 1 - g] = true; if (m[8][size - 1 - g] === null) m[8][size - 1 - g] = false;
      reserved[size - 1 - g][8] = true; if (m[size - 1 - g][8] === null) m[size - 1 - g][8] = false;
    }

    // reserve version info (v>=7)
    if (v >= 7) {
      for (var vy = 0; vy < 6; vy++) for (var vx = 0; vx < 3; vx++) {
        reserved[vy][size - 11 + vx] = true; if (m[vy][size - 11 + vx] === null) m[vy][size - 11 + vx] = false;
        reserved[size - 11 + vx][vy] = true; if (m[size - 11 + vx][vy] === null) m[size - 11 + vx][vy] = false;
      }
    }

    // place data via zigzag
    var bitIndex = 0, totalBits = codewords.length * 8;
    function bitAt(idx) { return ((codewords[idx >> 3] >> (7 - (idx & 7))) & 1) === 1; }
    var col = size - 1, upward = true;
    while (col > 0) {
      if (col === 6) col--; // skip timing column
      for (var rowStep = 0; rowStep < size; rowStep++) {
        var row = upward ? size - 1 - rowStep : rowStep;
        for (var ci = 0; ci < 2; ci++) {
          var cc2 = col - ci;
          if (reserved[row][cc2]) continue;
          var dark3 = false;
          if (bitIndex < totalBits) { dark3 = bitAt(bitIndex); bitIndex++; }
          m[row][cc2] = dark3;
        }
      }
      col -= 2;
      upward = !upward;
    }

    return { size: size, m: m, reserved: reserved };
  }

  // ---- Masking -------------------------------------------------------------
  function maskFn(id) {
    switch (id) {
      case 0: return function (r, c) { return (r + c) % 2 === 0; };
      case 1: return function (r) { return r % 2 === 0; };
      case 2: return function (r, c) { return c % 3 === 0; };
      case 3: return function (r, c) { return (r + c) % 3 === 0; };
      case 4: return function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; };
      case 5: return function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; };
      case 6: return function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; };
      case 7: return function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; };
    }
  }

  function applyMask(base, id) {
    var size = base.size;
    var fn = maskFn(id);
    var out = [];
    for (var r = 0; r < size; r++) {
      out.push(base.m[r].slice());
      for (var c = 0; c < size; c++) {
        if (!base.reserved[r][c] && fn(r, c)) out[r][c] = !out[r][c];
      }
    }
    return out;
  }

  function bchFormat(data) { // 5-bit -> 15-bit
    var d = data << 10;
    var g = 0x537;
    for (var i = 4; i >= 0; i--) if ((d >> (10 + i)) & 1) d ^= g << i;
    return ((data << 10) | d) ^ 0x5412;
  }
  function bchVersion(v) { // 6-bit -> 18-bit
    var d = v << 12;
    var g = 0x1f25;
    for (var i = 5; i >= 0; i--) if ((d >> (12 + i)) & 1) d ^= g << i;
    return (v << 12) | d;
  }

  function placeFormat(grid, size, lvl, maskId) {
    var bits = bchFormat((EC_FORMAT_BITS[lvl] << 3) | maskId);
    // bits[14] is MSB
    function bit(i) { return ((bits >> i) & 1) === 1; }
    // around top-left
    var idx = 0;
    for (var c = 0; c <= 5; c++) { grid[8][c] = bit(idx++); }
    grid[8][7] = bit(idx++);
    grid[8][8] = bit(idx++);
    grid[7][8] = bit(idx++);
    for (var r = 5; r >= 0; r--) { grid[r][8] = bit(idx++); }
    // around top-right / bottom-left
    idx = 0;
    for (var r2 = size - 1; r2 >= size - 7; r2--) { grid[r2][8] = bit(idx++); }
    for (var c2 = size - 8; c2 <= size - 1; c2++) { grid[8][c2] = bit(idx++); }
  }

  function placeVersion(grid, size, v) {
    if (v < 7) return;
    var bits = bchVersion(v);
    for (var i = 0; i < 18; i++) {
      var b = ((bits >> i) & 1) === 1;
      var r = Math.floor(i / 3), c = i % 3;
      grid[r][size - 11 + c] = b;
      grid[size - 11 + c][r] = b;
    }
  }

  // ---- Penalty scoring -----------------------------------------------------
  function penalty(grid, size) {
    var score = 0, r, c, run, i;
    // rule 1: runs
    function runScore(getter) {
      var s = 0;
      for (i = 0; i < size; i++) {
        var prev = null, len = 0;
        for (var j = 0; j < size; j++) {
          var val = getter(i, j);
          if (val === prev) { len++; if (len === 5) s += 3; else if (len > 5) s += 1; }
          else { prev = val; len = 1; }
        }
      }
      return s;
    }
    score += runScore(function (i, j) { return grid[i][j]; });
    score += runScore(function (i, j) { return grid[j][i]; });
    // rule 2: 2x2 blocks
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
    // rule 3: finder-like patterns
    var pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    var pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    function matchAt(getter, i, j) {
      var ok1 = true, ok2 = true;
      for (var k = 0; k < 11; k++) { if (getter(i, j + k) !== pat1[k]) ok1 = false; if (getter(i, j + k) !== pat2[k]) ok2 = false; }
      return ok1 || ok2;
    }
    for (r = 0; r < size; r++) for (c = 0; c <= size - 11; c++) {
      if (matchAt(function (i, j) { return grid[i][j]; }, r, c)) score += 40;
      if (matchAt(function (i, j) { return grid[j][i]; }, r, c)) score += 40;
    }
    // rule 4: dark ratio
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (grid[r][c]) dark++;
    var pct = (dark * 100) / (size * size);
    var k5 = Math.floor(Math.abs(pct - 50) / 5);
    score += k5 * 10;
    return score;
  }

  // ---- Public: make --------------------------------------------------------
  function make(text, opts) {
    opts = opts || {};
    var lvl = (opts.ecLevel || 'M').toUpperCase();
    if (!EC_FORMAT_BITS.hasOwnProperty(lvl)) lvl = 'M';
    var bytes = utf8Bytes(text);
    var v = chooseVersion(bytes.length, lvl, opts.version || 1);
    var codewords = buildCodewords(text, v, lvl);
    var base = makeMatrix(v, lvl, codewords);
    var size = base.size;

    var best = null, bestScore = Infinity, bestId = 0;
    for (var id = 0; id < 8; id++) {
      var grid = applyMask(base, id);
      placeFormat(grid, size, lvl, id);
      placeVersion(grid, size, v);
      var sc = penalty(grid, size);
      if (sc < bestScore) { bestScore = sc; best = grid; bestId = id; }
    }
    return { size: size, version: v, ecLevel: lvl, mask: bestId, modules: best };
  }

  // ---- Renderers -----------------------------------------------------------
  function toSVG(text, opts) {
    opts = opts || {};
    var q = make(text, opts);
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var scale = opts.scale || 4;
    var dim = (q.size + quiet * 2) * scale;
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
      '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges">'];
    parts.push('<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>');
    var path = '';
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) {
      if (q.modules[r][c]) {
        var x = (c + quiet) * scale, y = (r + quiet) * scale;
        path += 'M' + x + ' ' + y + 'h' + scale + 'v' + scale + 'h' + (-scale) + 'z';
      }
    }
    parts.push('<path d="' + path + '" fill="' + dark + '"/></svg>');
    return parts.join('');
  }

  function toDataURL(text, opts) {
    opts = opts || {};
    var q = make(text, opts);
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var scale = opts.scale || 4;
    var dim = (q.size + quiet * 2) * scale;
    var canvas = document.createElement('canvas');
    canvas.width = dim; canvas.height = dim;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || '#000000';
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) {
      if (q.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return canvas.toDataURL('image/png');
  }

  root.DELIGHTS_QR = { make: make, toSVG: toSVG, toDataURL: toDataURL, selfTest: selfTest };

})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : this).DELIGHTS_QR || global.DELIGHTS_QR;
