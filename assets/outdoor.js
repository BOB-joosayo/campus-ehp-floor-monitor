/* 실외기 종합 탭 */
(function () {
  "use strict";
  const V = window.EhpViz;
  const MAP = V.MAP;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const OD_SVG = `<svg class="odg" viewBox="-16 -13 32 27">${V.odGlyph()}</svg>`;
  const short = (o) => `EHP-${Number(o.hoki)}`;
  let runRankPeriod = "day"; // day | month | year

  const app = document.getElementById("app");
  app.innerHTML = `
    <svg width="0" height="0" style="position:absolute"><defs><pattern id="ev-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="#18181c"/><rect width="1.6" height="4" fill="#4a4a52"/></pattern></defs></svg>
    <div class="od-wrap">
      <div class="kpis" id="kpis"></div>
      <div class="panels" id="panels"></div>
      <div class="ranks">
        <div class="rank"><div class="ev-h rank-h">오늘 누적 전력 사용량 상위 10<span class="t-base" data-tday>-</span></div><div id="rk-day"></div></div>
        <div class="rank"><div class="ev-h rank-h">실시간 전력 상위 10<span class="t-base" data-tkw>-</span></div><div id="rk-kw"></div></div>
        <div class="rank"><div class="ev-h rank-h">부하율 상위 10<span class="t-base" data-tload>-</span></div><div id="rk-load"></div></div>
      </div>
      <div class="ranks-run">
        <div class="ranks-run-h">
          <b>운전시간 상위 10</b>
          <span class="ins-pat-seg rank-seg" id="rk-run-seg">
            <button type="button" data-p="day" class="on">오늘</button>
            <button type="button" data-p="month">이번 달</button>
            <button type="button" data-p="year">올해</button>
          </span>
        </div>
        <div class="ranks-run-grid">
          <div class="rank"><div class="ev-h rank-h">실외기</div><div id="rk-run-od"></div></div>
          <div class="rank"><div class="ev-h rank-h">실내기</div><div id="rk-run-iu"></div></div>
        </div>
      </div>
    </div>`;

  document.getElementById("panels").innerHTML = MAP.panels.map((p) => `
    <div class="panel" data-p="${esc(p.id)}">
      <div class="panel-h"><b>${esc(p.id)}</b><span class="ev-muted ev-num"><span data-sum>-</span><span class="t-base" data-t15></span></span></div>
      <div class="panel-cards">${p.od.map((h) => {
        const o = V.odByHoki[h];
        return `<div class="odc" data-h="${h}">
          <div class="odc-h"><div><b>${short(o)}</b><br><small>${esc(o.serve)}</small></div>${OD_SVG}</div>
          <div class="odc-kw ev-num"><span data-kw>-</span> <small>kWh</small></div><div class="odc-cap">오늘 누적 전력 사용량</div>
          <div class="odc-load"><span data-st>-</span><div class="bar"><i data-bar style="width:0"></i></div><span class="ev-num" data-load>-</span></div>
          <div class="odc-in"><span data-in>-</span></div>
          <div class="odc-run"><span data-run>-</span></div>
        </div>`;
      }).join("")}</div>
    </div>`).join("");

  function goFloor(h, kind) {
    if (kind === "iu") {
      location.href = `floor.html?iu=${encodeURIComponent(h)}`;
      return;
    }
    location.href = `floor.html?od=${encodeURIComponent(h)}`;
  }
  app.addEventListener("click", (e) => {
    const seg = e.target.closest("#rk-run-seg button");
    if (seg) {
      const order = { day: 0, month: 1, year: 2 };
      const next = seg.dataset.p;
      const dir = (order[next] ?? 0) >= (order[runRankPeriod] ?? 0) ? 1 : -1;
      runRankPeriod = next;
      document.querySelectorAll("#rk-run-seg button").forEach((b) => b.classList.toggle("on", b.dataset.p === runRankPeriod));
      const root = document.getElementById("rk-run-seg");
      if (window.EhpMotion && root) {
        const pill = window.EhpMotion.mountTabPill(root);
        const idx = [...root.querySelectorAll("button")].findIndex((b) => b.dataset.p === runRankPeriod);
        if (pill) pill.pick(idx);
      }
      update({ rollDir: dir });
      return;
    }
    const row = e.target.closest(".rank-row[data-h]");
    if (row) {
      goFloor(row.dataset.h, row.dataset.kind || "od");
      return;
    }
    const c = e.target.closest(".odc[data-h]");
    if (c) goFloor(c.dataset.h, "od");
  });

  function runMinOf(ref, period) {
    if (!(window.EHP_MOCK && window.EHP_MOCK.dayRunMin)) return 0;
    const r = window.EHP_MOCK.dayRunMin(V, ref, period);
    return r && r.onMin != null ? r.onMin : 0;
  }
  function fmtRun(min) {
    if (window.EHP_MOCK && window.EHP_MOCK.fmtRunMin) return window.EHP_MOCK.fmtRunMin(min);
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h <= 0) return `${r}분`;
    if (r === 0) return `${h}시간`;
    return `${h}시간 ${r}분`;
  }

  function update(opts) {
    const rollDir = opts && opts.rollDir;
    const st = {};
    MAP.outdoor.forEach((o) => (st[o.hoki] = V.outdoorState(o)));
    const base = (ts) => (ts ? `${V.hhmm(ts)} 기준` : "-");
    const t15 = base(V.latestOf(MAP.outdoor.map((o) => o.pts.e15)));
    const tLoad = base(V.latestOf(MAP.outdoor.map((o) => o.pts.load)));
    document.querySelectorAll("[data-t15]").forEach((el) => (el.textContent = t15));
    document.querySelector("[data-tday]").textContent = t15;
    const tKw = base(V.latestOf(MAP.outdoor.map((o) => o.pts.kw)));
    const elKw = document.querySelector("[data-tkw]");
    if (elKw) elKw.textContent = tKw;
    document.querySelector("[data-tload]").textContent = tLoad;
    const all = Object.values(st);
    const run = all.filter((s) => s.running);
    const daySum = all.reduce((a, s) => a + (s.day || 0), 0);
    const ins = MAP.indoor.map((u) => V.indoorState(u));
    const inRun = ins.filter((s) => s.running);
    const tOd = base(V.latestOf(MAP.outdoor.map((o) => o.pts.kw)));
    const tIn = base(V.latestOf(MAP.indoor.map((u) => u.pts.onoff)));
    const byMode = (keys) => ["cool", "heat", "auto", "fan", "dry"]
      .map((k) => [k, keys.filter((x) => x === k).length])
      .filter(([k, n]) => n || k === "cool" || k === "heat")
      .map(([k, n]) => `${V.MODE[{ cool: 1, heat: 2, fan: 3, dry: 4, auto: 5 }[k]].label} ${n}`).join(", ");
    const kpiRoot = document.getElementById("kpis");
    if (!kpiRoot.dataset.ready) {
      kpiRoot.dataset.ready = "1";
      kpiRoot.innerHTML = `
        <div class="kpi"><div class="kpi-h"><small>운전 중인 실외기</small><span class="t-base" data-kpi-tod></span></div>
          <b class="ev-num"><span data-n="od-run"></span><em>/ <span data-n="od-all"></span></em></b>
          <span class="ev-muted" data-kpi-od-mode></span></div>
        <div class="kpi"><div class="kpi-h"><small>실외기 오늘 누적 전력 사용량</small><span class="t-base" data-kpi-t15></span></div>
          <b class="ev-num"><span data-n="day-sum"></span><em>kWh</em></b>
          <span class="ev-muted">통신 없음 <span data-n="comm"></span>대</span></div>
        <div class="kpi"><div class="kpi-h"><small>운전 중인 실내기</small><span class="t-base" data-kpi-tin></span></div>
          <b class="ev-num"><span data-n="in-run"></span><em>/ <span data-n="in-all"></span></em></b>
          <span class="ev-muted" data-kpi-in-mode></span></div>`;
    }
    const M = window.EhpMotion;
    const setT = (sel, v) => { const el = kpiRoot.querySelector(sel); if (el) el.textContent = v; };
    setT("[data-kpi-tod]", tOd);
    setT("[data-kpi-t15]", t15);
    setT("[data-kpi-tin]", tIn);
    setT("[data-kpi-od-mode]", byMode(run.map((s) => s.modeKey)));
    setT("[data-kpi-in-mode]", byMode(inRun.map((s) => s.key)));
    if (M) {
      M.setNumber(kpiRoot.querySelector('[data-n="od-run"]'), run.length);
      M.setNumber(kpiRoot.querySelector('[data-n="od-all"]'), all.length);
      M.setNumber(kpiRoot.querySelector('[data-n="day-sum"]'), daySum, { decimals: 1 });
      M.setNumber(kpiRoot.querySelector('[data-n="comm"]'), all.filter((s) => s.key === "comm").length);
      M.setNumber(kpiRoot.querySelector('[data-n="in-run"]'), inRun.length);
      M.setNumber(kpiRoot.querySelector('[data-n="in-all"]'), ins.length);
    }

    MAP.panels.forEach((p) => {
      const el = document.querySelector(`.panel[data-p="${CSS.escape(p.id)}"]`);
      const sum = p.od.reduce((a, h) => a + (st[h].day || 0), 0);
      const sumEl = el.querySelector("[data-sum]");
      if (sumEl && !sumEl.dataset.shell) {
        sumEl.dataset.shell = "1";
        sumEl.innerHTML = `오늘 누적 전력 사용량 <span data-n="psum"></span> kWh`;
      }
      if (M) M.setNumber(el.querySelector('[data-n="psum"]'), sum, { decimals: 1 });
    });

    const marks = window.EhpInsight ? window.EhpInsight.activeByUnit(V) : { od: {} };
    document.querySelectorAll(".odc").forEach((c) => {
      const s = st[c.dataset.h];
      const k = s.key === "run" ? s.modeKey : s.key;
      c.className = `odc st-${k} ${s.running ? "on" : ""} ${marks.od[c.dataset.h] ? "has-ins" : ""}`;
      c.style.setProperty("--spin", `${s.kw ? Math.max(0.45, 1.6 - s.kw / 20) : 1.6}s`);
      const kwHost = c.querySelector("[data-kw]");
      if (M) M.setNumber(kwHost, s.day, { decimals: 1 });
      else kwHost.textContent = V.fmt(s.day, 1);
      c.querySelector("[data-st]").textContent = s.running ? (s.modeLabel || "운전") : s.label;
      c.querySelector("[data-bar]").style.width = `${Math.min(100, s.load || 0)}%`;
      const loadHost = c.querySelector("[data-load]");
      if (!loadHost.dataset.shell) {
        loadHost.dataset.shell = "1";
        loadHost.innerHTML = `<span data-n="load"></span><span data-load-u></span>`;
      }
      if (M) {
        M.setNumber(loadHost.querySelector('[data-n="load"]'), s.load, { decimals: 1 });
        const u = loadHost.querySelector("[data-load-u]");
        if (u) u.textContent = s.load === null ? "" : "%";
      } else {
        loadHost.textContent = s.load === null ? "-" : `${V.fmt(s.load)}%`;
      }
      const inEl = c.querySelector("[data-in]");
      if (!inEl.dataset.shell) {
        inEl.dataset.shell = "1";
        inEl.innerHTML = `실내기 <span data-n="inOn"></span>/<span data-n="inTotal"></span> 운전`;
      }
      if (M) {
        M.setNumber(inEl.querySelector('[data-n="inOn"]'), s.inOn);
        M.setNumber(inEl.querySelector('[data-n="inTotal"]'), s.inTotal);
      } else {
        inEl.textContent = `실내기 ${s.inOn}/${s.inTotal} 운전`;
      }
      const runEl = c.querySelector("[data-run]");
      if (runEl) {
        const r = (window.EHP_MOCK && window.EHP_MOCK.dayRunMin)
          ? window.EHP_MOCK.dayRunMin(V, { od: c.dataset.h }, "day")
          : null;
        const txt = r ? `오늘 운전 ${r.label}` : "오늘 운전 -";
        if (window.EhpMotion) window.EhpMotion.rollText(runEl, txt);
        else runEl.textContent = txt;
      }
      c.title = `${V.odByHoki[c.dataset.h].label}, 누르면 도면에서 이 실외기를 봅니다`;
    });

    const fillRankNum = (id, rows, empty, decimals, unit) => {
      const box = document.getElementById(id);
      const max = Math.max(1e-9, ...rows.map((r) => r.v));
      const list = rows.slice(0, 10);
      const sig = list.map((r) => r.hoki).join("|");
      if (box.dataset.sig !== sig) {
        box.dataset.sig = sig;
        box.innerHTML = list.map((r, i) => `
          <div class="rank-row st-${esc(r.st)}" data-h="${esc(r.hoki)}" data-kind="${esc(r.kind)}">
            <span class="ev-muted">${i + 1}</span><span>${esc(r.label)}</span>
            <div class="bar"><i style="width:0"></i></div>
            <span class="n ev-num"><span data-n="v"></span><span data-u> ${unit}</span></span>
          </div>`).join("") || `<div class="ev-muted">${empty}</div>`;
      }
      list.forEach((r, i) => {
        const row = box.querySelectorAll(".rank-row")[i];
        if (!row) return;
        row.className = `rank-row st-${r.st}`;
        const bar = row.querySelector(".bar > i");
        if (bar) bar.style.width = `${(r.v / max) * 100}%`;
        if (M) M.setNumber(row.querySelector('[data-n="v"]'), r.v, { decimals });
        else {
          const n = row.querySelector('[data-n="v"]');
          if (n) n.textContent = V.fmt(r.v, decimals);
        }
      });
      if (!list.length) {
        box.dataset.sig = "";
        box.innerHTML = `<div class="ev-muted">${empty}</div>`;
      }
    };
    const fillRankText = (id, rows, empty, animate) => {
      const box = document.getElementById(id);
      const old = [...box.querySelectorAll(".n")].map((n) => n.dataset.rollVal || n.textContent);
      const max = Math.max(1e-9, ...rows.map((r) => r.v));
      const list = rows.slice(0, 10);
      box.innerHTML = list.map((r, i) => `
        <div class="rank-row st-${esc(r.st)}" data-h="${esc(r.hoki)}" data-kind="${esc(r.kind)}">
          <span class="ev-muted">${i + 1}</span><span>${esc(r.label)}</span>
          <div class="bar"><i style="width:${(r.v / max) * 100}%"></i></div>
          <span class="n ev-num"></span>
        </div>`).join("") || `<div class="ev-muted">${empty}</div>`;
      list.forEach((r, i) => {
        const n = box.querySelectorAll(".n")[i];
        if (!n) return;
        if (animate && window.EhpMotion && old[i] != null && old[i] !== r.shown) {
          n.dataset.rollVal = old[i];
          n.textContent = old[i];
          window.EhpMotion.rollText(n, r.shown, { dir: rollDir || 1 });
        } else {
          n.textContent = r.shown;
          n.dataset.rollVal = r.shown;
        }
      });
    };

    const byDay = MAP.outdoor.filter((o) => st[o.hoki].day > 0)
      .sort((a, b) => st[b.hoki].day - st[a.hoki].day)
      .map((o) => ({
        hoki: o.hoki, kind: "od", label: o.label,
        st: st[o.hoki].key === "run" ? st[o.hoki].modeKey : st[o.hoki].key,
        v: st[o.hoki].day,
      }));
    fillRankNum("rk-day", byDay, "오늘 누적 전력 사용량 없음", 1, "kWh");

    const byKw = MAP.outdoor.filter((o) => st[o.hoki].kw > 0)
      .sort((a, b) => st[b.hoki].kw - st[a.hoki].kw)
      .map((o) => ({
        hoki: o.hoki, kind: "od", label: o.label,
        st: st[o.hoki].key === "run" ? st[o.hoki].modeKey : st[o.hoki].key,
        v: st[o.hoki].kw,
      }));
    fillRankNum("rk-kw", byKw, "순시 전력 없음", 2, "kW");

    const byLoad = MAP.outdoor.filter((o) => st[o.hoki].load > 0)
      .sort((a, b) => st[b.hoki].load - st[a.hoki].load)
      .map((o) => ({
        hoki: o.hoki, kind: "od", label: o.label,
        st: st[o.hoki].key === "run" ? st[o.hoki].modeKey : st[o.hoki].key,
        v: st[o.hoki].load,
      }));
    fillRankNum("rk-load", byLoad, "해당 없음", 1, "%");

    const byRunOd = MAP.outdoor
      .map((o) => {
        const min = runMinOf({ od: o.hoki }, runRankPeriod);
        const s = st[o.hoki];
        return {
          hoki: o.hoki, kind: "od", label: o.label, min,
          st: s.key === "run" ? s.modeKey : s.key,
          v: min, shown: fmtRun(min),
        };
      })
      .filter((x) => x.min > 0)
      .sort((a, b) => b.min - a.min);
    fillRankText("rk-run-od", byRunOd, "실외기 운전시간 없음", !!rollDir);

    const byRunIu = MAP.indoor
      .map((u) => {
        const min = runMinOf({ iu: u.hoki, od: u.od || null }, runRankPeriod);
        const s = V.indoorState(u);
        const name = V.roomText(u) || u.label;
        return {
          hoki: u.hoki, kind: "iu", label: name, min,
          st: s.key, v: min, shown: fmtRun(min),
        };
      })
      .filter((x) => x.min > 0)
      .sort((a, b) => b.min - a.min);
    fillRankText("rk-run-iu", byRunIu, "실내기 운전시간 없음", !!rollDir);
  }

  V.useMockIfNoProvider();
  V.renderTop("outdoor");
  V.on(update);
  V.start().then(() => {
    const root = document.getElementById("rk-run-seg");
    if (root && window.EhpMotion) window.EhpMotion.mountTabPill(root);
  });
})();
