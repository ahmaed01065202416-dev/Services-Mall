/*
 * csp-shim.js — lets the site run under a STRICT Content-Security-Policy (no 'unsafe-inline', no 'unsafe-eval').
 * Must be the FIRST <script> in <head> of every page (classic, synchronous).
 *
 *  1. Inline event handlers: markup uses  data-on-click="fn(this.value)"  instead of  onclick="…".
 *     A tiny interpreter (NO eval / new Function) runs those expressions with the same `this` / `event` / scope rules.
 *  2. Inline styles: markup uses  data-style="…"  (and any leftover  style="…"  that the browser blocked); applied through
 *     the CSSOM, which CSP does not restrict.
 *  3. window.__cssInject(id, css): replacement for  <style>.textContent = …  (blocked by CSP) using constructable stylesheets.
 *  4. #__boot JSON block written by the Functions (replaces their inline <script>).
 *  5. DOMPurify hook: sanitized HTML can never carry data-on-* / data-style (that would re-open XSS).
 *
 * SECURITY: the interpreter only runs attribute values that are in the page's own markup. Deny-list below blocks
 * eval/Function/constructor/prototype access, innerHTML-style sinks and javascript: URLs as defence in depth.
 */
(function () {
  'use strict';
  if (window.__cspShim) return;
  window.__cspShim = true;

  // ───────────────────────── tokenizer ─────────────────────────
  var P3 = ['===', '!==', '...'];
  var P2 = ['==', '!=', '<=', '>=', '&&', '||', '?.', '??', '=>', '+=', '-='];
  var PUNCT = '+-*/%!?:;,.()[]{}<>=';
  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '"' || c === "'") {
        var s = '', j = i + 1;
        while (j < n && src[j] !== c) {
          if (src[j] === '\\') {
            j++;
            var e = src[j];
            if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === 'r') s += '\r';
            else if (e === 'u') { s += String.fromCharCode(parseInt(src.substr(j + 1, 4), 16)); j += 4; }
            else if (e === 'x') { s += String.fromCharCode(parseInt(src.substr(j + 1, 2), 16)); j += 2; }
            else s += e;
            j++;
          } else s += src[j++];
        }
        if (j >= n) throw new Error('unterminated string');
        toks.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(0x[0-9a-f]+|\d*\.?\d+(e[+-]?\d+)?)/i.exec(src.slice(i));
        toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$\u0080-\uffff]/.test(c)) {
        var k = i + 1;
        while (k < n && /[\w$\u0080-\uffff]/.test(src[k])) k++;
        toks.push({ t: 'id', v: src.slice(i, k) }); i = k; continue;
      }
      var t3 = src.substr(i, 3), t2 = src.substr(i, 2);
      if (P3.indexOf(t3) >= 0) { toks.push({ t: 'p', v: t3 }); i += 3; continue; }
      if (P2.indexOf(t2) >= 0) { toks.push({ t: 'p', v: t2 }); i += 2; continue; }
      if (PUNCT.indexOf(c) >= 0) { toks.push({ t: 'p', v: c }); i++; continue; }
      throw new Error('unexpected character ' + c);
    }
    return toks;
  }

  // ───────────────────────── parser ─────────────────────────
  function parse(src) {
    var T = tokenize(src), p = 0;
    function isP(v) { return p < T.length && T[p].t === 'p' && T[p].v === v; }
    function isId(v) { return p < T.length && T[p].t === 'id' && T[p].v === v; }
    function expect(v) { if (!isP(v)) throw new Error('expected ' + v); p++; }

    function stmt() {
      if (isP('{')) {
        p++; var b = [];
        while (!isP('}')) { if (p >= T.length) throw new Error('unclosed block'); if (isP(';')) { p++; continue; } b.push(stmt()); }
        p++; return { k: 'block', b: b };
      }
      if (isId('if')) {
        p++; expect('('); var c = expr(); expect(')');
        var a = stmt(), e = null;
        if (isP(';') && T[p + 1] && T[p + 1].t === 'id' && T[p + 1].v === 'else') p++;
        if (isId('else')) { p++; e = stmt(); }
        return { k: 'if', c: c, a: a, e: e };
      }
      if (isId('return')) {
        p++; var r = null;
        if (p < T.length && !isP(';') && !isP('}')) r = expr();
        return { k: 'ret', a: r };
      }
      return { k: 'expr', e: expr() };
    }
    function expr() { return assign(); }
    function arrowBody() { return isP('{') ? stmt() : { k: 'ret', a: assign() }; }
    function assign() {
      if (T[p] && T[p].t === 'id' && T[p + 1] && T[p + 1].t === 'p' && T[p + 1].v === '=>') {
        var nm = T[p].v; p += 2; return { k: 'arrow', params: [nm], body: arrowBody() };
      }
      if (isP('(')) {
        var q = p + 1, params = [];
        while (T[q] && T[q].t === 'id') { params.push(T[q].v); q++; if (T[q] && T[q].t === 'p' && T[q].v === ',') q++; else break; }
        if (T[q] && T[q].t === 'p' && T[q].v === ')' && T[q + 1] && T[q + 1].t === 'p' && T[q + 1].v === '=>') {
          p = q + 2; return { k: 'arrow', params: params, body: arrowBody() };
        }
      }
      var l = cond();
      if (isP('=') || isP('+=') || isP('-=')) {
        var op = T[p++].v;
        if (l.k !== 'id' && l.k !== 'mem') throw new Error('invalid assignment target');
        return { k: 'asg', op: op, l: l, r: assign() };
      }
      return l;
    }
    function cond() {
      var c = nullish();
      if (isP('?')) { p++; var a = assign(); expect(':'); var b = assign(); return { k: 'cond', c: c, a: a, b: b }; }
      return c;
    }
    function bin(nextFn, ops) {
      return function () {
        var l = nextFn();
        while (p < T.length && T[p].t === 'p' && ops.indexOf(T[p].v) >= 0) { var op = T[p++].v; l = { k: 'bin', op: op, l: l, r: nextFn() }; }
        return l;
      };
    }
    function unary() {
      if (isP('!')) { p++; return { k: 'un', op: '!', a: unary() }; }
      if (isP('-')) { p++; return { k: 'un', op: '-', a: unary() }; }
      if (isP('+')) { p++; return { k: 'un', op: '+', a: unary() }; }
      if (isId('typeof')) { p++; return { k: 'un', op: 'typeof', a: unary() }; }
      return postfix();
    }
    var mul = bin(unary, ['*', '/', '%']);
    var add = bin(mul, ['+', '-']);
    var rel = bin(add, ['<', '>', '<=', '>=']);
    var eq = bin(rel, ['==', '!=', '===', '!==']);
    var and = bin(eq, ['&&']);
    var or = bin(and, ['||']);
    var nullish = bin(or, ['??']);

    function args() {
      var a = [];
      expect('(');
      while (!isP(')')) { a.push(assign()); if (isP(',')) p++; else break; }
      expect(')');
      return a;
    }
    function postfix() {
      var e = primary();
      for (;;) {
        if (isP('.') || isP('?.')) {
          var opt = T[p].v === '?.'; p++;
          if (opt && isP('(')) { e = { k: 'call', f: e, a: args(), opt: true }; continue; }
          if (opt && isP('[')) { p++; var ix = expr(); expect(']'); e = { k: 'mem', o: e, p: ix, opt: true }; continue; }
          if (!T[p] || T[p].t !== 'id') throw new Error('expected property name');
          e = { k: 'mem', o: e, p: { k: 'lit', v: T[p++].v }, opt: opt };
        } else if (isP('[')) {
          p++; var pr = expr(); expect(']'); e = { k: 'mem', o: e, p: pr };
        } else if (isP('(')) {
          e = { k: 'call', f: e, a: args() };
        } else break;
      }
      return e;
    }
    function primary() {
      var t = T[p];
      if (!t) throw new Error('unexpected end');
      if (t.t === 'num' || t.t === 'str') { p++; return { k: 'lit', v: t.v }; }
      if (t.t === 'id') {
        p++;
        switch (t.v) {
          case 'true': return { k: 'lit', v: true };
          case 'false': return { k: 'lit', v: false };
          case 'null': return { k: 'lit', v: null };
          case 'undefined': return { k: 'lit', v: undefined };
          case 'this': return { k: 'this' };
          case 'new': case 'function': case 'var': case 'let': case 'const': case 'typeof_': throw new Error('unsupported keyword ' + t.v);
        }
        return { k: 'id', n: t.v };
      }
      if (isP('(')) { p++; var e = expr(); expect(')'); return e; }
      if (isP('[')) {
        p++; var items = [];
        while (!isP(']')) { items.push(assign()); if (isP(',')) p++; else break; }
        expect(']'); return { k: 'arr', items: items };
      }
      if (isP('{')) {
        p++; var props = [];
        while (!isP('}')) {
          var key = T[p++];
          if (!key || (key.t !== 'id' && key.t !== 'str' && key.t !== 'num')) throw new Error('bad object key');
          var val;
          if (isP(':')) { p++; val = assign(); } else val = { k: 'id', n: key.v };
          props.push([String(key.v), val]);
          if (isP(',')) p++; else break;
        }
        expect('}'); return { k: 'obj', props: props };
      }
      throw new Error('unexpected token ' + t.v);
    }

    var body = [];
    while (p < T.length) { if (isP(';')) { p++; continue; } body.push(stmt()); }
    return { k: 'block', b: body };
  }

  // ───────────────────────── evaluator ─────────────────────────
  var DENY = { constructor: 1, __proto__: 1, prototype: 1, eval: 1, Function: 1, setTimeout: 1, setInterval: 1, execScript: 1,
    importScripts: 1, __defineGetter__: 1, __defineSetter__: 1, __lookupGetter__: 1, __lookupSetter__: 1 };
  var DENY_ASSIGN = { innerHTML: 1, outerHTML: 1, srcdoc: 1 };
  var DENY_CALL = { insertAdjacentHTML: 1, write: 1, writeln: 1, execCommand: 1, setAttribute: 0 };
  var JS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
  function chk(name) { if (DENY[name] === 1) throw new Error('blocked name: ' + name); return name; }

  function lookup(name, ctx) {
    chk(name);
    if (name === 'event') return { v: ctx.ev, self: undefined };
    for (var f = ctx.vars; f; f = f.up) if (Object.prototype.hasOwnProperty.call(f.m, name)) return { v: f.m[name], self: undefined };
    // same scope chain an inline handler gets: element → its form → document → window
    var el = ctx.self, scopes = [el, el && el.form, document];
    for (var i = 0; i < scopes.length; i++) {
      var o = scopes[i];
      if (o && name in o) { var v = o[name]; return { v: v, self: o }; }
    }
    if (name in window) return { v: window[name], self: undefined };
    throw new ReferenceError(name + ' is not defined');
  }
  function setVar(name, val, ctx) {
    chk(name);
    for (var f = ctx.vars; f; f = f.up) if (Object.prototype.hasOwnProperty.call(f.m, name)) { f.m[name] = val; return; }
    window[name] = val;
  }

  function ev(n, ctx) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'this': return ctx.self;
      case 'id': return lookup(n.n, ctx).v;
      case 'arr': return n.items.map(function (x) { return ev(x, ctx); });
      case 'obj': var o = {}; n.props.forEach(function (pp) { chk(pp[0]); o[pp[0]] = ev(pp[1], ctx); }); return o;
      case 'un':
        if (n.op === 'typeof' && n.a.k === 'id') { try { return typeof lookup(n.a.n, ctx).v; } catch (_) { return 'undefined'; } }
        var a = ev(n.a, ctx);
        return n.op === '!' ? !a : n.op === '-' ? -a : n.op === '+' ? +a : typeof a;
      case 'bin':
        if (n.op === '&&') { var l1 = ev(n.l, ctx); return l1 ? ev(n.r, ctx) : l1; }
        if (n.op === '||') { var l2 = ev(n.l, ctx); return l2 ? l2 : ev(n.r, ctx); }
        if (n.op === '??') { var l3 = ev(n.l, ctx); return l3 != null ? l3 : ev(n.r, ctx); }
        var x = ev(n.l, ctx), y = ev(n.r, ctx);
        switch (n.op) {
          case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y; case '%': return x % y;
          case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y;
          case '==': return x == y; case '!=': return x != y; case '===': return x === y; case '!==': return x !== y; // eslint-disable-line eqeqeq
        }
        throw new Error('bad operator');
      case 'cond': return ev(n.c, ctx) ? ev(n.a, ctx) : ev(n.b, ctx);
      case 'mem':
        var obj = ev(n.o, ctx);
        if (obj == null) { if (n.opt) return undefined; throw new TypeError('cannot read property of ' + obj); }
        return obj[chk(String(ev(n.p, ctx)))];
      case 'call':
        var fn, self;
        if (n.f.k === 'mem') {
          self = ev(n.f.o, ctx);
          if (self == null) { if (n.f.opt) return undefined; throw new TypeError('cannot call method of ' + self); }
          var key = chk(String(ev(n.f.p, ctx)));
          if (DENY_CALL[key] === 1) throw new Error('blocked call: ' + key);
          fn = self[key];
        } else if (n.f.k === 'id') {
          var r = lookup(n.f.n, ctx); fn = r.v; self = r.self;
        } else { fn = ev(n.f, ctx); }
        if (fn == null && n.opt) return undefined;
        if (typeof fn !== 'function') throw new TypeError('not a function');
        return fn.apply(self, n.a.map(function (x) { return ev(x, ctx); }));
      case 'arrow':
        return function () {
          var m = {}, av = arguments;
          n.params.forEach(function (nm, i) { m[nm] = av[i]; });
          var res = exec(n.body, { self: ctx.self, ev: ctx.ev, vars: { m: m, up: ctx.vars } });
          return res && res.ret ? res.val : undefined;
        };
      case 'asg':
        var val = ev(n.r, ctx);
        if (n.l.k === 'id') {
          if (n.op !== '=') { var cur = lookup(n.l.n, ctx).v; val = n.op === '+=' ? cur + val : cur - val; }
          setVar(n.l.n, val, ctx); return val;
        }
        var tgt = ev(n.l.o, ctx), pk = chk(String(ev(n.l.p, ctx)));
        if (tgt == null) throw new TypeError('cannot set property of ' + tgt);
        if (DENY_ASSIGN[pk] === 1) throw new Error('blocked assignment: ' + pk);
        if (typeof val === 'string' && JS_URL.test(val) && (pk === 'href' || pk === 'src' || pk === 'location' || pk === 'action')) throw new Error('blocked javascript: URL');
        if (n.op !== '=') val = n.op === '+=' ? tgt[pk] + val : tgt[pk] - val;
        if ((pk === 'onerror' || pk === 'onload') && val === null && tgt && tgt.nodeType === 1) { (tgt.__cspOff = tgt.__cspOff || {})[pk.slice(2)] = 1; return val; }
        tgt[pk] = val; return val;
    }
    throw new Error('unknown node ' + n.k);
  }
  function exec(n, ctx) {
    switch (n.k) {
      case 'block': for (var i = 0; i < n.b.length; i++) { var r = exec(n.b[i], ctx); if (r && r.ret) return r; } return null;
      case 'if': if (ev(n.c, ctx)) return exec(n.a, ctx); return n.e ? exec(n.e, ctx) : null;
      case 'ret': return { ret: true, val: n.a ? ev(n.a, ctx) : undefined };
      case 'expr': ev(n.e, ctx); return null;
    }
    throw new Error('unknown statement ' + n.k);
  }

  var cache = Object.create(null), cacheN = 0;
  function compile(code) {
    var a = cache[code];
    if (!a) { if (cacheN > 800) { cache = Object.create(null); cacheN = 0; } a = cache[code] = parse(code); cacheN++; }
    return a;
  }
  function runCode(code, el, event) {
    var res = exec(compile(code), { self: el, ev: event, vars: null });
    return res && res.ret ? res.val : undefined;
  }
  window.__cspRun = runCode; window.__cspParse = parse; // exposed for tests

  // ───────────────────────── delegated event dispatch ─────────────────────────
  var BUBBLING = ['click', 'dblclick', 'change', 'input', 'submit', 'keyup', 'keydown', 'keypress', 'mouseover', 'mouseout', 'drop', 'dragover', 'dragleave', 'dragenter', 'dragstart', 'contextmenu'];
  var TARGET_ONLY = ['error', 'load', 'focus', 'blur'];
  var errCount = typeof WeakMap === 'function' ? new WeakMap() : null;

  function fire(el, type, event) {
    var code = el.getAttribute('data-on-' + type);
    if (!code) return;
    if (el.__cspOff && el.__cspOff[type]) return;
    if (type === 'error' && errCount) { var c = (errCount.get(el) || 0) + 1; errCount.set(el, c); if (c > 3) return; } // same-element retry loop guard
    try {
      if (runCode(code, el, event) === false) event.preventDefault();
    } catch (e) {
      if (window.console) console.error('[csp-shim] data-on-' + type + ' failed:', String(code).slice(0, 100), e);
    }
  }
  BUBBLING.forEach(function (type) {
    // capture on window = runs before other listeners; chain is walked target→root to mimic bubbling order of inline handlers
    window.addEventListener(type, function (event) {
      var el = event.target;
      if (el && el.nodeType !== 1) el = el.parentElement;
      var chain = [];
      for (; el && el.nodeType === 1; el = el.parentElement) if (el.hasAttribute('data-on-' + type)) chain.push(el);
      if (!chain.length) return;
      var stopped = false, oStop = event.stopPropagation, oImm = event.stopImmediatePropagation;
      event.stopPropagation = function () { stopped = true; return oStop.apply(this, arguments); };
      event.stopImmediatePropagation = function () { stopped = true; return oImm.apply(this, arguments); };
      try {
        for (var i = 0; i < chain.length && !stopped; i++) fire(chain[i], type, event);
      } finally { delete event.stopPropagation; delete event.stopImmediatePropagation; }
    }, true);
  });
  TARGET_ONLY.forEach(function (type) {
    window.addEventListener(type, function (event) {
      var el = event.target;
      if (el && el.nodeType === 1 && el.hasAttribute('data-on-' + type)) fire(el, type, event);
    }, true);
  });

  // ───────────────────────── styles ─────────────────────────
  var SEL = '[data-style],[style]';
  function applyStyle(el) {
    var s = el.getAttribute('data-style');
    if (s == null) { s = el.getAttribute('style'); if (s == null || el.style.cssText) return; }
    if (el.__cs === s) return;
    el.__cs = s;
    try { el.style.cssText = s; } catch (_) { /* ignore */ }
  }
  function applyTree(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(SEL)) applyStyle(node);
    var all = node.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) applyStyle(all[i]);
  }


  // Apply data-style synchronously after HTML is assigned (otherwise code that measures layout right after innerHTML sees unstyled boxes).
  try {
    var ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (ih && ih.set) Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true, enumerable: ih.enumerable, get: ih.get,
      set: function (v) { ih.set.call(this, v); applyTree(this); }
    });
    var iah = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (pos, html) {
      iah.call(this, pos, html);
      applyTree(pos === 'beforebegin' || pos === 'afterend' ? (this.parentElement || this) : this);
    };
  } catch (_) { /* ignore */ }

  // ───────────────────────── <style> replacement ─────────────────────────
  var sheets = {};
  window.__cssInject = function (id, css) {
    try {
      if (document.adoptedStyleSheets && window.CSSStyleSheet && CSSStyleSheet.prototype.replaceSync) {
        var sh = sheets[id];
        if (!sh) { sh = sheets[id] = new CSSStyleSheet(); document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sh]); }
        sh.replaceSync(css);
        return;
      }
    } catch (_) { /* fall through */ }
    var st = document.getElementById(id);
    if (!st) { st = document.createElement('style'); st.id = id; (document.head || document.documentElement).appendChild(st); }
    st.textContent = css;
  };

  // ───────────────────────── #__boot (JSON written by Functions) ─────────────────────────
  var bootDone = false;
  function boot(node) {
    if (bootDone) return;
    var b = document.getElementById('__boot');
    if (!b) return;
    bootDone = true;
    var d; try { d = JSON.parse(b.textContent); } catch (_) { return; }
    if (!d || typeof d.v !== 'string') return;
    var call = function (fn) { window.addEventListener('load', function () { try { fn(); } catch (_) { /* ignore */ } }); };
    if (d.k === 'store') { try { if (!location.hash || location.hash === '#') history.replaceState(null, '', location.pathname + '#store-' + d.v); } catch (_) { /* ignore */ } }
    else if (d.k === 'cat') call(function () { if (window.filterByCategory) window.filterByCategory(d.v); });
    else if (d.k === 'svc') call(function () { if (window.ServicesManager) window.ServicesManager.openServiceDetail(d.v); });
  }

  // ───────────────────────── DOMPurify hook ─────────────────────────
  function hookPurify(dp) {
    if (!dp || dp.__cspHooked || typeof dp.addHook !== 'function') return;
    dp.__cspHooked = true;
    dp.addHook('uponSanitizeAttribute', function (_n, data) { if (/^data-(on-|style$)/i.test(data.attrName)) data.keepAttr = false; });
  }
  try {
    if (window.DOMPurify) hookPurify(window.DOMPurify);
    else Object.defineProperty(window, 'DOMPurify', {
      configurable: true,
      get: function () { return undefined; },
      set: function (v) { Object.defineProperty(window, 'DOMPurify', { value: v, writable: true, configurable: true }); hookPurify(v); }
    });
  } catch (_) { /* ignore */ }

  // ───────────────────────── observers ─────────────────────────
  function start() {
    if (typeof MutationObserver !== 'function') return;
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var add = recs[i].addedNodes;
        for (var j = 0; j < add.length; j++) { applyTree(add[j]); }
      }
      boot();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    applyTree(document.documentElement);
    boot();
  }
  start();
  document.addEventListener('DOMContentLoaded', function () { applyTree(document.documentElement); boot(); });
})();
