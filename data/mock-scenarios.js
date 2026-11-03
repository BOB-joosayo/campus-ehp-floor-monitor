/* 시연용 가짜 데이터. 실데이터 공급 함수(EhpViz.setProvider)를 넣으면 이 파일은 빼도 된다. */
(function () {
  "use strict";
  const MAP = window.EHP_MAP;
  const KEY = "ehpviz.scenario";

  const scenarios = {
    normal: { name: "평상 난방" },
    conflict: { name: "냉난방 혼재" },
    comm: { name: "통신 끊김" },
  };

  function rnd(seed) { // 재현 가능한 0~1 값
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  const capKw = (model) => { const m = /AM(\d{3})/.exec(model || ""); return m ? Number(m[1]) / 10 : 7; };

  function current() {
    const k = localStorage.getItem(KEY);
    return scenarios[k] ? k : "normal";
  }

  function base(sc) {
    const st = {}; // hoki → {on, mode, fan, set, room}
    MAP.indoor.forEach((u) => {
      const r = rnd(u.hoki + "a"), r2 = rnd(u.hoki + "b"), r3 = rnd(u.hoki + "c");
      let on = r < 0.27;
      let mode = r2 < 0.85 ? 2 : r2 < 0.94 ? 5 : 3;          // 11월: 대부분 난방
      if (u.od && Number(u.od) >= 22) mode = r2 < 0.8 ? 1 : 5; // 실데이터처럼 22~27호기는 냉방
      if (!u.od && r2 > 0.9) mode = 1;                           // 기존분은 실외기 소속이 없어 혼재 대상 아님
      if (sc === "night") on = r < 0.025;
      let set = mode === 1 ? 24 + Math.floor(r3 * 3) : 20 + Math.floor(r3 * 5);
      if (on && mode === 2 && r3 > 0.93) set = 28;
      const fan = r3 < 0.7 ? 5 : r3 < 0.8 ? 3 : r3 < 0.9 ? 2 : 1;
      const room = on ? set + (mode === 1 ? 1.2 : -1.4) + r * 2 : 17.5 + r3 * 3.5;
      st[u.hoki] = { on: on ? 1 : 0, mode, fan, set, room };
    });
    if (sc === "conflict") {
      const units = MAP.outdoor.find((o) => o.hoki === "11").indoor;
      units.forEach((h, i) => {
        if (i < 2) Object.assign(st[h], { on: 1, mode: 1, set: 23, room: 24.6 });
        else if (i < 7) Object.assign(st[h], { on: 1, mode: 2, set: 23, room: 21.2 });
        else st[h].on = 0;
      });
    }
    return st;
  }

  function nowFor(sc) {
    const d = new Date();
    if (sc === "night") {
      d.setHours(22, 40, 0, 0);
      if (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - (d.getDay() === 0 ? 2 : 1));
    }
    return d;
  }

  let tickN = 0;
  async function provider() {
    const sc = current();
    const t = nowFor(sc);
    window.EhpViz.setNow(() => nowFor(current()));
    const ts = Math.floor(t.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
    const old = ts - 2 * 3600 * 1000;
    const st = base(sc);
    const out = {};
    const put = (id, v, ddc) => { out[id] = { v, ts: sc === "comm" && ddc === "DDC0000002" ? old : ts }; };
    tickN++;
    MAP.indoor.forEach((u) => {
      const s = st[u.hoki];
      const j = (rnd(u.hoki + tickN) - 0.5) * 0.2;
      put(u.pts.onoff, s.on, u.ddc);
      put(u.pts.mode, s.mode, u.ddc);
      put(u.pts.fan, s.fan, u.ddc);
      put(u.pts.set, s.set, u.ddc);
      put(u.pts.room, Math.round((s.room + j) * 10) / 10, u.ddc);
    });
    MAP.outdoor.forEach((o) => {
      const ons = o.indoor.map((h) => ({ u: window.EhpViz.inByHoki[h], s: st[h] })).filter((x) => x.s.on);
      const cool = ons.filter((x) => x.s.mode === 1).length, heat = ons.filter((x) => x.s.mode === 2).length;
      const mode = ons.length ? (cool > heat ? 1 : 2) : (Number(o.hoki) >= 22 ? 1 : 2);
      const rated = capKw(o.model) * 0.9;
      let kw = ons.reduce((a, x) => a + capKw(x.u.model) * 0.18, 0);
      kw = Math.min(rated, kw * (1 + (rnd(o.hoki + tickN) - 0.5) * 0.08));
      kw = Math.round(kw * 1000) / 1000;
      const onoff = kw > 0 ? (rnd(o.hoki + "z") < 0.2 ? 0 : 1) : 0; // 현장처럼 운전 중 0이 오는 실외기
      const load = onoff === 0 ? 0 : Math.round((kw / rated) * 1000) / 10;
      put(o.pts.onoff, onoff, o.ddc);
      put(o.pts.mode, mode, o.ddc);
      put(o.pts.oat, 0, o.ddc);
      put(o.pts.qc, 0, o.ddc);
      put(o.pts.qh, kw > 0 ? 100 : 0, o.ddc);
      put(o.pts.kw, kw, o.ddc);
      put(o.pts.kwh, 3000 + rnd(o.hoki) * 30000, o.ddc);
      put(o.pts.load, load, o.ddc);
      put(o.pts.cop, 0, o.ddc);
      put(o.pts.e15, Math.round((kw / 4) * 1000) / 1000, o.ddc);
      put(o.pts.run, kw > 0 ? 0.25 : 0, o.ddc);
    });
    return out;
  }

  window.EHP_MOCK = {
    active: true,
    scenarios,
    current,
    set: (k) => localStorage.setItem(KEY, k),
    provider,
  };
})();
