/* 탭 필 + 숫자 드럼 + 문구 롤.
   DesignBookmark Tab Pill / Plan Switch digit drums / Storage Meter line roll 참고 */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
  const tune = (s, k, c) => { s.k = k; s.c = reduce ? 2 * Math.sqrt(k) : c; };
  const step = (s, dt) => {
    const a = -s.k * (s.x - s.t) - s.c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DIGITS = "0123456789";

  const comps = [];
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    for (let i = comps.length - 1; i >= 0; i--) {
      const c = comps[i];
      if (c.host && !c.host.isConnected) {
        if (c.host._ehpNum === c) c.host._ehpNum = null;
        if (c.host._ehpPill === c) c.host._ehpPill = null;
        comps.splice(i, 1);
      }
    }
    const sub = 4;
    for (let k = 0; k < sub; k++) comps.forEach((c) => c.frame && c.frame(dt / sub));
    comps.forEach((c) => c.render && c.render());
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function mountTabPill(root) {
    if (!root) return null;
    if (root._ehpPill) {
      requestAnimationFrame(() => root._ehpPill.sync(true));
      return root._ehpPill;
    }
    root.classList.add("ehp-tabs");
    let pill = root.querySelector(".ehp-pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "ehp-pill";
      pill.setAttribute("aria-hidden", "true");
      root.insertBefore(pill, root.firstChild);
    }
    const buttons = () => [...root.querySelectorAll("button")];
    const A = S(0);
    const B = S(0);
    let cur = -1;
    let ready = false;

    function pick(i, snap) {
      const btns = buttons();
      if (!btns.length) return;
      i = Math.max(0, Math.min(btns.length - 1, i));
      const dir = i > cur ? 1 : -1;
      cur = i;
      btns.forEach((t, k) => {
        t.classList.toggle("on", k === i);
        t.setAttribute("aria-selected", k === i ? "true" : "false");
      });
      const el = btns[i];
      A.t = el.offsetLeft;
      B.t = el.offsetLeft + el.offsetWidth;
      if (dir > 0) { tune(B, 620, 40); tune(A, 170, 19); }
      else { tune(A, 620, 40); tune(B, 170, 19); }
      if (snap || reduce) { A.x = A.t; B.x = B.t; }
    }
    function syncFromDom(snap) {
      const btns = buttons();
      let i = btns.findIndex((b) => b.classList.contains("on"));
      if (i < 0) i = 0;
      pick(i, snap !== false);
    }
    const api = {
      sync: syncFromDom,
      pick,
      frame(dt) { if (!ready) return; step(A, dt); step(B, dt); },
      render() {
        if (!ready) return;
        pill.style.transform = `translateX(${A.x.toFixed(2)}px)`;
        pill.style.width = `${Math.max(0, B.x - A.x).toFixed(2)}px`;
      },
    };
    api.host = root;
    comps.push(api);
    root._ehpPill = api;
    requestAnimationFrame(() => { ready = true; syncFromDom(true); });
    return api;
  }

  function rollText(el, next, opts) {
    if (!el) return;
    const text = next == null ? "" : String(next);
    if (el.dataset.rollVal === text) return;
    const prev = el.dataset.rollVal;
    el.dataset.rollVal = text;
    if (prev == null || reduce) {
      el.textContent = text;
      return;
    }
    const h = Math.max(el.offsetHeight || 24, 20);
    el.classList.add("ehp-roll");
    el.innerHTML = "";
    const a = document.createElement("span");
    const b = document.createElement("span");
    a.className = "ehp-roll-item out";
    b.className = "ehp-roll-item in";
    a.textContent = prev;
    b.textContent = text;
    el.appendChild(a);
    el.appendChild(b);
    const Ya = S(0);
    const Oa = S(1);
    const Yb = S(h);
    const Ob = S(0);
    tune(Ya, 420, 32); tune(Oa, 420, 32);
    tune(Yb, 420, 32); tune(Ob, 420, 32);
    Ya.t = -h; Oa.t = 0; Yb.t = 0; Ob.t = 1;
    const dir = (opts && opts.dir) || 1;
    if (dir < 0) { Ya.t = h; Yb.x = -h; }
    let done = false;
    const comp = {
      frame(dt) {
        step(Ya, dt); step(Oa, dt); step(Yb, dt); step(Ob, dt);
        if (!done && Math.abs(Yb.x - Yb.t) < 0.4 && Math.abs(Yb.v) < 2) {
          done = true;
          el.classList.remove("ehp-roll");
          el.textContent = text;
          const i = comps.indexOf(comp);
          if (i >= 0) comps.splice(i, 1);
        }
      },
      render() {
        if (done) return;
        a.style.transform = `translateY(${Ya.x.toFixed(2)}px)`;
        a.style.opacity = clamp(Oa.x, 0, 1).toFixed(3);
        a.style.filter = Oa.x < 0.98 ? `blur(${((1 - clamp(Oa.x, 0, 1)) * 2).toFixed(2)}px)` : "";
        b.style.transform = `translateY(${Yb.x.toFixed(2)}px)`;
        b.style.opacity = clamp(Ob.x, 0, 1).toFixed(3);
        b.style.filter = Ob.x < 0.98 ? `blur(${((1 - clamp(Ob.x, 0, 1)) * 2).toFixed(2)}px)` : "";
      },
    };
    comps.push(comp);
  }

  function ensureNumShell(el) {
    if (!el) return null;
    if (el._ehpNum) return el._ehpNum;
    el.classList.add("ehp-num-host");
    el.innerHTML = "";
    const wrap = document.createElement("span");
    wrap.className = "ehp-num";
    wrap.setAttribute("aria-hidden", "true");
    el.appendChild(wrap);
    const live = document.createElement("span");
    live.className = "ehp-num-sr";
    live.setAttribute("aria-live", "polite");
    el.appendChild(live);

    const state = {
      wrap,
      live,
      cols: [],
      px: 0,
      decimals: 0,
      blank: true,
      dash: null,
    };

    function measurePx() {
      // 칸 높이 = host font-size. line-height나 자손 span 축소 규칙과 어긋나면 숫자가 겹친다.
      const size = parseFloat(getComputedStyle(el).fontSize) || 16;
      state.px = Math.max(12, Math.round(size));
      wrap.style.fontSize = `${state.px}px`;
      wrap.style.height = `${state.px}px`;
      wrap.style.lineHeight = `${state.px}px`;
      return state.px;
    }

    function makeCol(delay) {
      const c = document.createElement("span");
      const s = document.createElement("span");
      c.className = "ehp-rc";
      s.className = "ehp-rs";
      s.innerHTML = [...DIGITS].map((d) => `<i>${d}</i>`).join("");
      c.appendChild(s);
      const y = S(0);
      tune(y, 260, 24 + delay * 2);
      return { c, s, y, delay };
    }

    function sizeSep(el, px) {
      if (!el) return;
      el.style.height = `${px}px`;
      el.style.lineHeight = `${px}px`;
      el.style.paddingBottom = "0";
      el.style.alignSelf = "stretch";
      el.style.display = "inline-flex";
      el.style.alignItems = "flex-end";
    }

    function sizeCols(px) {
      state.cols.forEach((col) => {
        col.c.style.height = `${px}px`;
        col.c.style.width = "0.62em";
        col.s.querySelectorAll("i").forEach((i) => {
          i.style.height = `${px}px`;
          i.style.lineHeight = `${px}px`;
        });
      });
      wrap.querySelectorAll(".ehp-num-dot, .ehp-num-comma").forEach((el) => sizeSep(el, px));
    }

    function build(intLen, decimals) {
      const px = measurePx();
      wrap.innerHTML = "";
      state.cols = [];
      state.decimals = decimals;
      state.dash = null;
      for (let i = 0; i < intLen; i++) {
        // 정수부: 오른쪽부터 3자리마다 콤마 (1,234 / 12,345)
        if (i > 0 && (intLen - i) % 3 === 0) {
          const comma = document.createElement("span");
          comma.className = "ehp-num-comma";
          comma.textContent = ",";
          wrap.appendChild(comma);
        }
        const col = makeCol(i);
        wrap.appendChild(col.c);
        state.cols.push(col);
      }
      if (decimals > 0) {
        const dot = document.createElement("span");
        dot.className = "ehp-num-dot";
        dot.textContent = ".";
        wrap.appendChild(dot);
        for (let i = 0; i < decimals; i++) {
          const col = makeCol(intLen + i);
          wrap.appendChild(col.c);
          state.cols.push(col);
        }
      }
      sizeCols(px);
    }

    function showDash(snap) {
      state.blank = true;
      wrap.innerHTML = "";
      state.cols = [];
      const d = document.createElement("span");
      d.className = "ehp-num-dash";
      d.textContent = "-";
      wrap.appendChild(d);
      state.dash = d;
      state.live.textContent = "-";
      if (!snap && !reduce) {
        d.style.opacity = "0";
        d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      }
    }

    function set(value, opts) {
      const o = opts || {};
      const decimals = o.decimals != null ? o.decimals : 0;
      const snap = !!(o.snap || reduce);
      if (value == null || value === "" || Number.isNaN(Number(value))) {
        showDash(snap);
        return;
      }
      const n = Number(value);
      const abs = Math.abs(n);
      let intStr = Math.floor(abs + (decimals > 0 ? 0 : 0)).toFixed(0);
      if (decimals > 0) {
        const fixed = abs.toFixed(decimals);
        const parts = fixed.split(".");
        intStr = parts[0];
      } else {
        intStr = String(Math.round(abs));
      }
      const minInt = o.minDigits != null ? o.minDigits : 1;
      if (intStr.length < minInt) intStr = intStr.padStart(minInt, "0");
      // 자릿수가 늘어날 때만 패딩을 늘린다. 줄어들면 자리 유지하지 않음
      const needInt = Math.max(minInt, intStr.length);
      const shown = n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      const needRebuild = state.blank || state.decimals !== decimals || state.cols.length !== needInt + decimals;
      if (!needRebuild && state.live.dataset.v === shown) return;
      if (needRebuild) build(needInt, decimals);
      else sizeCols(measurePx());
      state.blank = false;

      const fixed = abs.toFixed(decimals);
      const [ip, fp = ""] = fixed.split(".");
      const intDigits = ip.padStart(needInt, "0");
      const fracDigits = decimals > 0 ? fp.padEnd(decimals, "0").slice(0, decimals) : "";
      const all = intDigits + fracDigits;
      const isFirst = state.live.dataset.v == null || needRebuild;
      state.cols.forEach((col, i) => {
        const dig = Number(all[i] || 0);
        const go = () => { col.y.t = dig; };
        if (snap || (isFirst && o.entrance === false)) {
          col.y.t = dig;
          col.y.x = dig;
          col.y.v = 0;
        } else if (isFirst) {
          col.y.x = 0;
          col.y.v = 0;
          setTimeout(go, (state.cols.length - 1 - i) * 40);
        } else {
          setTimeout(go, (state.cols.length - 1 - i) * 40);
        }
      });
      state.live.textContent = shown;
      state.live.dataset.v = shown;
    }

    const api = {
      host: el,
      set,
      frame(dt) { state.cols.forEach((c) => step(c.y, dt)); },
      render() {
        const px = state.px || measurePx();
        state.cols.forEach((c) => {
          // 목표에 거의 붙으면 스냅해서 칸 사이에 멈추지 않게
          if (Math.abs(c.y.x - c.y.t) < 0.002 && Math.abs(c.y.v) < 0.05) {
            c.y.x = c.y.t;
            c.y.v = 0;
          }
          c.s.style.transform = `translateY(${(-c.y.x * px).toFixed(2)}px)`;
        });
      },
    };
    comps.push(api);
    el._ehpNum = api;
    measurePx();
    return api;
  }

  function setNumber(el, value, opts) {
    if (!el) return;
    const api = ensureNumShell(el);
    api.set(value, opts || {});
  }

  window.EhpMotion = { mountTabPill, rollText, setNumber };
})();
