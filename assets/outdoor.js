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
        <div class="rank ev-card"><div class="ev-h">전력사용량 상위 10 (15분)</div><div id="rk-kw"></div></div>
        <div class="rank ev-card"><div class="ev-h">부하율 상위 10</div><div id="rk-load"></div></div>
      </div>
    </div>`;

  // 분전반 묶음은 화면이 바뀌지 않으므로 한 번만 만든다
  document.getElementById("panels").innerHTML = MAP.panels.map((p) => `
    <div class="panel ev-card" data-p="${esc(p.id)}">
      <div class="panel-h"><b>${esc(p.id)}</b><span class="ev-muted ev-num" data-sum>-</span></div>
      <div class="panel-cards">${p.od.map((h) => {
        const o = V.odByHoki[h];
        return `<div class="odc" data-h="${h}">
          <div class="odc-h"><div><b>${short(o)}</b><br><small>${esc(o.serve)}</small></div>${OD_SVG}</div>
          <div class="odc-kw ev-num"><span data-kw>-</span> <small>kWh</small></div><div class="odc-cap">전력사용량 (15분)</div>
          <div class="odc-load"><span data-st>-</span><div class="bar"><i data-bar style="width:0"></i></div><span class="ev-num" data-load>-</span></div>
          <div class="odc-in"><span data-in>-</span><span class="cf" data-cf></span></div>
        </div>`;
      }).join("")}</div>
    </div>`).join("");

  function goFloor(h) {
    location.href = `floor.html?od=${h}`;
  }
  app.addEventListener("click", (e) => {
    const c = e.target.closest("[data-h]");
    if (c) goFloor(c.dataset.h);
  });

  function update() {
    const st = {};
    MAP.outdoor.forEach((o) => (st[o.hoki] = V.outdoorState(o)));
    const conflicts = V.conflictOds();
    const all = Object.values(st);
    const run = all.filter((s) => s.running);
    const e15 = all.reduce((a, s) => a + (s.e15 || 0), 0); // 전력사용량 합 (15분)
    const ins = MAP.indoor.map((u) => V.indoorState(u));
    const inRun = ins.filter((s) => s.running);

    document.getElementById("kpis").innerHTML = `
      <div class="kpi ev-card"><small>운전 중인 실외기</small><b class="ev-num">${run.length}<em>/ ${all.length}</em></b>
        <span class="ev-muted">냉방 ${run.filter((s) => s.mode === 1).length}, 난방 ${run.filter((s) => s.mode === 2).length}</span></div>
      <div class="kpi ev-card"><small>실외기 전력사용량 (15분)</small><b class="ev-num">${V.fmt(e15, 2)}<em>kWh</em></b>
        <span class="ev-muted">통신 없음 ${all.filter((s) => s.key === "comm").length}대</span></div>
      <div class="kpi ev-card"><small>운전 중인 실내기</small><b class="ev-num">${inRun.length}<em>/ ${ins.length}</em></b>
        <span class="ev-muted">냉방 ${inRun.filter((s) => s.key === "cool").length}, 난방 ${inRun.filter((s) => s.key === "heat").length}</span></div>`;

    MAP.panels.forEach((p) => {
      const el = document.querySelector(`.panel[data-p="${CSS.escape(p.id)}"]`);
      const sum = p.od.reduce((a, h) => a + (st[h].e15 || 0), 0);
      V.setText(el.querySelector("[data-sum]"), `전력사용량 ${V.fmt(sum, 2)} kWh`);
    });

    document.querySelectorAll(".odc").forEach((c) => {
      const s = st[c.dataset.h];
      const k = s.key === "run" ? s.modeKey : s.key;
      c.className = `odc st-${k} ${s.running ? "on" : ""}`;
      c.style.setProperty("--spin", `${s.kw ? Math.max(0.45, 1.6 - s.kw / 20) : 1.6}s`);
      V.setText(c.querySelector("[data-kw]"), V.fmt(s.e15, 2));
      c.querySelector("[data-st]").textContent = s.running ? `운전 ${s.modeLabel}` : s.label;
      c.querySelector("[data-bar]").style.width = `${Math.min(100, s.load || 0)}%`;
      c.querySelector("[data-load]").textContent = s.load === null ? "-" : `${V.fmt(s.load)}%`;
      c.querySelector("[data-in]").textContent = `실내기 ${s.inOn}/${s.inTotal} 운전`;
      c.querySelector("[data-cf]").textContent = conflicts.has(c.dataset.h) ? "냉난방 혼재" : "";
      c.title = `${V.odByHoki[c.dataset.h].label}, 누르면 도면에서 연결 실내기를 봅니다`;
    });

    const rank = (id, list, valOf, unit, d) => {
      const max = Math.max(1e-9, ...list.map(valOf));
      document.getElementById(id).innerHTML = list.slice(0, 10).map((o, i) => {
        const s = st[o.hoki];
        return `<div class="rank-row st-${s.key === "run" ? s.modeKey : s.key}" data-h="${o.hoki}">
          <span class="ev-muted">${i + 1}</span><span>${esc(o.label)}</span>
          <div class="bar"><i style="width:${(valOf(o) / max) * 100}%"></i></div><span class="n ev-num">${V.fmt(valOf(o), d)} ${unit}</span></div>`;
      }).join("") || '<div class="ev-muted">운전 중인 실외기 없음</div>';
    };
    const byUse = MAP.outdoor.filter((o) => st[o.hoki].e15 > 0).sort((a, b) => st[b.hoki].e15 - st[a.hoki].e15);
    rank("rk-kw", byUse, (o) => st[o.hoki].e15, "kWh", 2);
    const byLoad = MAP.outdoor.filter((o) => st[o.hoki].load > 0).sort((a, b) => st[b.hoki].load - st[a.hoki].load);
    rank("rk-load", byLoad, (o) => st[o.hoki].load, "%", 1);
  }

  V.useMockIfNoProvider();
  V.renderTop("outdoor");
  V.on(update);
  V.start();
})();
