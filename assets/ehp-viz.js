/* A대학 B관 EHP 모니터링 공통 엔진 */
(function () {
  "use strict";
  const MAP = window.EHP_MAP;

  const config = {
    refreshMs: 60 * 1000,
    staleMin: 30,
    odRunKw: 0,          // 실외기 전력(순시)이 이 값보다 크면 운전
    showCop: false,
  };

  const MODE = {
    1: { key: "cool", label: "냉방" },
    2: { key: "heat", label: "난방" },
    3: { key: "fan", label: "송풍" },
    4: { key: "dry", label: "제습" },
    5: { key: "auto", label: "자동" },
  };
  const FAN = { 1: "강", 2: "중", 3: "약", 4: "터보", 5: "자동" };
  const FAN_SEC = { 1: 1.0, 2: 1.6, 3: 2.4, 4: 0.6, 5: 1.4 };
  const FLOOR_LABEL = { RF: "옥상", "6F": "6층", "5F": "5층", "4F": "4층", "3F": "3층", "2F": "2층", "1F": "1층", B1: "지하1층", B2: "지하2층" };
  const STATE_LABEL = { off: "정지", stop: "정지", comm: "통신 없음", none: "정보 없음", on: "운전", run: "운전" };

  const odByHoki = {};
  MAP.outdoor.forEach((o) => (odByHoki[o.hoki] = o));
  const inByHoki = {};
  MAP.indoor.forEach((u) => (inByHoki[u.hoki] = u));

  let provider = null;
  let snap = {};
  let nowFn = () => new Date();
  let timer = null;
  const listeners = [];

  function allPointIds() {
    const ids = [];
    MAP.indoor.forEach((u) => ids.push(...Object.values(u.pts)));
    MAP.outdoor.forEach((o) => ids.push(...Object.values(o.pts)));
    return ids;
  }

  // 하루 누적 전력사용량을 받을 포인트 (실외기 전력사용량 15분, HABAZ040)
  function dayPointIds() {
    return MAP.outdoor.map((o) => o.pts.e15);
  }

  function now() { return nowFn(); }

  function val(id) {
    const p = snap[id];
    if (!p || p.v === null || p.v === undefined) return { v: null, ts: null, stale: true };
    const stale = now().getTime() - p.ts > config.staleMin * 60 * 1000;
    return { v: p.v, ts: p.ts, stale };
  }

  // 여러 포인트 중 통신이 살아 있는 값의 가장 늦은 수집 시각
  function latestOf(ids) {
    let m = 0;
    ids.forEach((id) => { const x = val(id); if (!x.stale && x.ts > m) m = x.ts; });
    return m || null;
  }

  function indoorState(u) {
    const on = val(u.pts.onoff);
    const mode = val(u.pts.mode);
    const fan = val(u.pts.fan);
    const set = val(u.pts.set);
    const room = val(u.pts.room);
    let key;
    if (on.v === null || on.stale) key = "comm";
    else if (on.v === -1) key = "none";
    else if (on.v === 0) key = "off";
    else key = (MODE[mode.v] && MODE[mode.v].key) || "on";
    const running = !["comm", "none", "off"].includes(key);
    return {
      key, running,
      onoff: on.v, mode: mode.v, fan: fan.v,
      set: set.stale ? null : set.v, room: room.stale ? null : room.v,
      ts: on.ts,
      label: running ? (MODE[mode.v] ? MODE[mode.v].label : "운전") : STATE_LABEL[key],
    };
  }

  function outdoorState(o) {
    const kw = val(o.pts.kw);
    const mode = val(o.pts.mode);
    const load = val(o.pts.load);
    const e15 = val(o.pts.e15); // 전력사용량 (15분, kWh)
    let key;
    if (kw.v === null || kw.stale) key = "comm";
    else if (kw.v > config.odRunKw) key = "run";
    else key = "stop";
    const running = key === "run";
    let loadPct = load.stale ? null : load.v;
    if (running && !loadPct) loadPct = null; // ON/OFF=0이면 EMS 부하율이 0으로 계산됨
    if (key === "stop") loadPct = 0;
    const indoor = o.indoor.map((h) => indoorState(inByHoki[h]));
    if (key === "comm") loadPct = null;
    return {
      key, running, kw: key === "comm" ? null : kw.v, mode: mode.v, load: loadPct, ts: kw.ts,
      e15: key === "comm" || e15.stale ? null : e15.v,
      day: snap[o.pts.e15] && snap[o.pts.e15].day != null ? snap[o.pts.e15].day : null,
      modeLabel: MODE[mode.v] ? MODE[mode.v].label : "",
      modeKey: MODE[mode.v] ? MODE[mode.v].key : "on",
      inOn: indoor.filter((s) => s.running).length, inTotal: indoor.length,
      label: running ? "운전" : STATE_LABEL[key],
    };
  }

  // 실외기 아이콘: 받침 달린 함체 + 왼쪽 원형 팬(운전 중 회전) + 오른쪽 그릴 + 작은 버튼 (화면 px 기준, 가운데 0,0)
  function odGlyph() {
    const blades = [0, 120, 240].map((a) => `<ellipse cx="0" cy="-3" rx="1.9" ry="3" transform="rotate(${a})"/>`).join("");
    return `<rect class="od-hit" x="-17" y="-14" width="34" height="30" fill="transparent"/>` +
      `<rect class="od-ring" x="-18.5" y="-15" width="37" height="32" rx="6"/>` +
      `<rect class="od-foot" x="-11" y="10" width="5" height="2.6" rx="1"/><rect class="od-foot" x="6" y="10" width="5" height="2.6" rx="1"/>` +
      `<rect class="od-box" x="-14" y="-11" width="28" height="21.5" rx="3"/>` +
      `<circle class="od-fanring" cx="-5" cy="-0.5" r="7"/>` +
      `<g transform="translate(-5 -0.5)"><g class="od-prop"><circle r="6.4" fill="transparent"/>${blades}<circle class="od-hub" r="1.1"/></g></g>` +
      `<path class="od-grille" d="M4.5 -6.6 H11 M4.5 -3.9 H11 M4.5 -1.2 H11"/>` +
      `<rect class="od-btn" x="7.6" y="3" width="3" height="3" rx=".6"/>`;
  }

  // 실내기 아이콘: 벽걸이형 본체 + 모드별 움직임 (화면 px 기준, 가운데 0,0)
  // 난방 빨간 물결, 냉방 파란 눈꽃과 찬바람, 송풍 바람, 제습 물방울, 자동 깜박이는 AUTO 표시와 보라 바람
  function iuGlyph() {
    const wave = (x) => `<path d="M${x} 6.5 q1.6 1.4 0 2.8 q-1.6 1.4 0 2.8"/>`;
    const down = (x) => `<path d="M${x} 6.5 v4.6 M${x - 1.3} 9.8 l1.3 1.4 l1.3 -1.4"/>`;
    const curve = `<path d="M-4.5 6.5 q-1.2 2.6 -3.4 4.8"/><path d="M0 6.5 v5"/><path d="M4.5 6.5 q1.2 2.6 3.4 4.8"/>`;
    const badge = (inner) => `<g class="iu-badge"><circle cx="12" cy="-8" r="4.8"/>${inner}</g>`;
    return `<rect class="iu-hit" x="-17" y="-14" width="34" height="28" fill="transparent"/>` +
      `<rect class="iu-ring" x="-17.5" y="-14" width="35" height="29" rx="6"/>` +
      `<rect class="iu-body" x="-13" y="-7" width="26" height="11" rx="2.6"/>` +
      `<circle class="iu-dot" cx="-9.6" cy="-3.6" r=".8"/><circle class="iu-dot" cx="-7.4" cy="-3.6" r=".8"/><circle class="iu-dot" cx="-5.2" cy="-3.6" r=".8"/>` +
      `<path class="iu-slot" d="M-9 1.3 H9"/>` +
      `<g class="fx fx-heat">${wave(-5)}${wave(0)}${wave(5)}</g>` +
      `<g class="fx fx-cool">${down(-5)}${down(0)}${down(5)}</g>` +
      `<g class="fx fx-fan">${curve}</g>` +
      `<g class="fx fx-dry"><path d="M-4 6.5 v3"/><path d="M0 6.5 v3"/><path d="M4 6.5 v3"/></g>` +
      `<g class="fx fx-auto">${curve}</g>` +
      `<g class="bx bx-cool">${badge(`<g class="snow"><path d="M12 -11 V-5 M9.4 -9.5 L14.6 -6.5 M9.4 -6.5 L14.6 -9.5"/></g>`)}</g>` +
      `<g class="bx bx-dry">${badge(`<path class="drop" d="M12 -11.2 q2.5 3 0 4.9 q-2.5 -1.9 0 -4.9z"/>`)}</g>` +
      `<g class="bx bx-auto"><g class="auto-tag"><rect x="0.8" y="-13.8" width="21" height="8.8" rx="4.4"/><text x="11.3" y="-9.4" text-anchor="middle" dominant-baseline="central">AUTO</text></g></g>`;
  }

  function roomText(u) {
    return [u.roomNo, u.roomName].filter(Boolean).join(" ");
  }

  function fmt(v, d = 1) {
    if (v === null || v === undefined || Number.isNaN(v)) return "-";
    return Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function hhmm(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function latestTs() {
    let m = 0;
    for (const k in snap) if (snap[k] && snap[k].ts > m) m = snap[k].ts;
    return m || null;
  }

  async function tick() {
    clearTimeout(timer);
    try {
      if (provider) snap = (await provider()) || {};
      listeners.forEach((fn) => fn(snap));
    } catch (e) {
      console.error("EhpViz 데이터 조회 실패", e);
    }
    timer = setTimeout(tick, config.refreshMs);
  }

  function renderTop(active) {
    const el = document.getElementById("ev-top");
    el.innerHTML = `
      <div class="ev-title">A대학 B관 냉난방 운전 현황</div>
      <nav class="ev-tabs" aria-label="화면 전환">
        <a class="ev-tab ${active === "floor" ? "on" : ""}" href="floor.html">층별 도면</a>
        <a class="ev-tab ${active === "outdoor" ? "on" : ""}" href="outdoor.html">실외기 종합</a>
        <a class="ev-tab ${active === "insight" ? "on" : ""}" href="insight.html">AI 인사이트 <em class="ev-badge" id="ev-ins-badge">0</em></a>
      </nav>
      <div class="ev-time" id="ev-time">-</div>`;
    listeners.push(() => {
      const t = latestTs();
      document.getElementById("ev-time").textContent = t ? `${new Date(t).toLocaleDateString("ko-KR")} ${hhmm(t)} 기준` : "-";
      if (window.EhpInsight) {
        const n = window.EhpInsight.activeByUnit(window.EhpViz).count;
        const b = document.getElementById("ev-ins-badge");
        if (b) b.textContent = String(n);
      }
    });
  }

  function setText(el, text) {
    if (!el) return;
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.remove("ev-flash");
      void el.offsetWidth;
      el.classList.add("ev-flash");
    }
  }

  window.EhpViz = {
    config, MODE, FAN, FAN_SEC, FLOOR_LABEL, MAP, odByHoki, inByHoki,
    setProvider: (fn) => (provider = fn),
    hasProvider: () => !!provider,
    useMockIfNoProvider() {
      if (!provider && window.EHP_MOCK) { provider = window.EHP_MOCK.provider; config.refreshMs = 60 * 1000; }
    },
    setNow: (fn) => (nowFn = fn),
    now, val, latestOf, indoorState, outdoorState, odGlyph, iuGlyph, roomText,
    allPointIds, dayPointIds, fmt, hhmm, latestTs, setText,
    on: (fn) => listeners.push(fn),
    start: () => tick(),
    refresh: () => tick(),
    renderTop,
  };
})();
