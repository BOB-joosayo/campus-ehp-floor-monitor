/* 실외기 종합 탭 */
(function () {
  "use strict";
  const V = window.EhpViz;
  const MAP = V.MAP;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const OD_SVG = `<svg class="odg" viewBox="-16 -13 32 27">${V.odGlyph()}</svg>`;
  const short = (o) => `EHP-${Number(o.hoki)}`;

  const app = document.getElementById("app");
  app.innerHTML = `
    <svg width="0" height="0" style="position:absolute"><defs><pattern id="ev-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="#18181c"/><rect width="1.6" height="4" fill="#4a4a52"/></pattern></defs></svg>
    <div class="od-wrap">
      <div class="kpis" id="kpis"></div>
      <div class="panels" id="panels"></div>
      <div class="ranks">
        <div class="rank"><div class="ev-h rank-h">전력사용량 상위 10<span class="t-base" data-t15>-</span></div><div id="rk-kw"></div></div>
        <div class="rank"><div class="ev-h rank-h">누적 전력사용량 상위 10 (하루)<span class="t-base" data-tday>-</span></div><div id="rk-day"></div></div>
        <div class="rank"><div class="ev-h rank-h">부하율 상위 10<span class="t-base" data-tload>-</span></div><div id="rk-load"></div></div>
      </div>
    </div>`;

  // 분전반 묶음은 화면이 바뀌지 않으므로 한 번만 만든다
  document.getElementById("panels").innerHTML = MAP.panels.map((p) => `
    <div class="panel" data-p="${esc(p.id)}">
      <div class="panel-h"><b>${esc(p.id)}</b><span class="ev-muted ev-num"><span data-sum>-</span><span class="t-base" data-t15></span></span></div>
      <div class="panel-cards">${p.od.map((h) => {
        const o = V.odByHoki[h];
        return `<div class="odc" data-h="${h}">
          <div class="odc-h"><div><b>${short(o)}</b><br><small>${esc(o.serve)}</small></div>${OD_SVG}</div>
          <div class="odc-kw ev-num"><span data-kw>-</span> <small>kWh</small></div><div class="odc-cap">전력사용량</div>
          <div class="odc-load"><span data-st>-</span><div class="bar"><i data-bar style="width:0"></i></div><span class="ev-num" data-load>-</span></div>
          <div class="odc-in"><span data-in>-</span></div>
        </div>`;
      }).join("")}</div>
    </div>`).join("");

  function goFloor(h) {
    // 실외기 카드 클릭: 해당 실외기만 선택 (연결 실내기 전체 강조 아님)
    location.href = `floor.html?od=${encodeURIComponent(h)}`;
  }
  app.addEventListener("click", (e) => {
    const c = e.target.closest("[data-h]");
    if (c) goFloor(c.dataset.h);
  });

  function update() {
    const st = {};
    MAP.outdoor.forEach((o) => (st[o.hoki] = V.outdoorState(o)));
    const base = (ts) => (ts ? `${V.hhmm(ts)} 기준` : "-");
    const t15 = base(V.latestOf(MAP.outdoor.map((o) => o.pts.e15)));
    const tLoad = base(V.latestOf(MAP.outdoor.map((o) => o.pts.load)));
    document.querySelectorAll("[data-t15]").forEach((el) => (el.textContent = t15));
    document.querySelector("[data-tday]").textContent = t15;
    document.querySelector("[data-tload]").textContent = tLoad;
    const all = Object.values(st);
    const run = all.filter((s) => s.running);
    const e15 = all.reduce((a, s) => a + (s.e15 || 0), 0); // 전력사용량 합 (15분)
    const ins = MAP.indoor.map((u) => V.indoorState(u));
    const inRun = ins.filter((s) => s.running);
    const tOd = base(V.latestOf(MAP.outdoor.map((o) => o.pts.kw)));
    const tIn = base(V.latestOf(MAP.indoor.map((u) => u.pts.onoff)));
    // 냉방, 난방은 늘 보이고 나머지 모드는 있을 때만
    const byMode = (keys) => ["cool", "heat", "auto", "fan", "dry"]
      .map((k) => [k, keys.filter((x) => x === k).length])
      .filter(([k, n]) => n || k === "cool" || k === "heat")
      .map(([k, n]) => `${V.MODE[{ cool: 1, heat: 2, fan: 3, dry: 4, auto: 5 }[k]].label} ${n}`).join(", ");
    const kpiH = (title, t) => `<div class="kpi-h"><small>${title}</small><span class="t-base">${t}</span></div>`;

    document.getElementById("kpis").innerHTML = `
      <div class="kpi">${kpiH("운전 중인 실외기", tOd)}<b class="ev-num">${run.length}<em>/ ${all.length}</em></b>
        <span class="ev-muted">${byMode(run.map((s) => s.modeKey))}</span></div>
      <div class="kpi">${kpiH("실외기 전력사용량", t15)}<b class="ev-num">${V.fmt(e15, 2)}<em>kWh</em></b>
        <span class="ev-muted">통신 없음 ${all.filter((s) => s.key === "comm").length}대</span></div>
      <div class="kpi">${kpiH("운전 중인 실내기", tIn)}<b class="ev-num">${inRun.length}<em>/ ${ins.length}</em></b>
        <span class="ev-muted">${byMode(inRun.map((s) => s.key))}</span></div>`;

    MAP.panels.forEach((p) => {
      const el = document.querySelector(`.panel[data-p="${CSS.escape(p.id)}"]`);
      const sum = p.od.reduce((a, h) => a + (st[h].e15 || 0), 0);
      V.setText(el.querySelector("[data-sum]"), `전력사용량 ${V.fmt(sum, 2)} kWh`);
    });

    const marks = window.EhpInsight ? window.EhpInsight.activeByUnit(V) : { od: {} };
    document.querySelectorAll(".odc").forEach((c) => {
      const s = st[c.dataset.h];
      const k = s.key === "run" ? s.modeKey : s.key;
      c.className = `odc st-${k} ${s.running ? "on" : ""} ${marks.od[c.dataset.h] ? "has-ins" : ""}`;
      c.style.setProperty("--spin", `${s.kw ? Math.max(0.45, 1.6 - s.kw / 20) : 1.6}s`);
      V.setText(c.querySelector("[data-kw]"), V.fmt(s.e15, 2));
      c.querySelector("[data-st]").textContent = s.running ? `운전 ${s.modeLabel}` : s.label;
      c.querySelector("[data-bar]").style.width = `${Math.min(100, s.load || 0)}%`;
      c.querySelector("[data-load]").textContent = s.load === null ? "-" : `${V.fmt(s.load)}%`;
      c.querySelector("[data-in]").textContent = `실내기 ${s.inOn}/${s.inTotal} 운전`;
      c.title = `${V.odByHoki[c.dataset.h].label}, 누르면 도면에서 연결 실내기를 봅니다`;
    });

    const rank = (id, list, valOf, unit, d, empty = "운전 중인 실외기 없음") => {
      const max = Math.max(1e-9, ...list.map(valOf));
      document.getElementById(id).innerHTML = list.slice(0, 10).map((o, i) => {
        const s = st[o.hoki];
        return `<div class="rank-row st-${s.key === "run" ? s.modeKey : s.key}" data-h="${o.hoki}">
          <span class="ev-muted">${i + 1}</span><span>${esc(o.label)}</span>
          <div class="bar"><i style="width:${(valOf(o) / max) * 100}%"></i></div><span class="n ev-num">${V.fmt(valOf(o), d)} ${unit}</span></div>`;
      }).join("") || `<div class="ev-muted">${empty}</div>`;
    };
    const byUse = MAP.outdoor.filter((o) => st[o.hoki].e15 > 0).sort((a, b) => st[b.hoki].e15 - st[a.hoki].e15);
    rank("rk-kw", byUse, (o) => st[o.hoki].e15, "kWh", 2);
    const byDay = MAP.outdoor.filter((o) => st[o.hoki].day > 0).sort((a, b) => st[b.hoki].day - st[a.hoki].day);
    rank("rk-day", byDay, (o) => st[o.hoki].day, "kWh", 1, "오늘 운전한 실외기 없음");
    const byLoad = MAP.outdoor.filter((o) => st[o.hoki].load > 0).sort((a, b) => st[b.hoki].load - st[a.hoki].load);
    rank("rk-load", byLoad, (o) => st[o.hoki].load, "%", 1);
  }

  V.useMockIfNoProvider();
  V.renderTop("outdoor");
  V.on(update);
  V.start();
})();
