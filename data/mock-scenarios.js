/* 시연용 가짜 데이터. 실데이터 공급 함수(EhpViz.setProvider)를 넣으면 이 파일은 빼도 된다.
   EHP 한 대에 묶인 실내기는 냉방과 난방을 섞어 돌릴 수 없으므로, EHP마다 모드를 하나 정하고 소속 실내기는 그 모드로만 돈다.
   건물 전체로는 냉방, 난방, 자동, 송풍, 제습, 정지, 통신 끊김이 섞여 보이게 한다. */
(function () {
  "use strict";
  const MAP = window.EHP_MAP;

  // EHP별 운전: 모드 번호(1 냉방, 2 난방, 3 송풍, 4 제습, 5 자동), off 정지, comm 통신 끊김
  const OD_PLAN = {
    "01": 2, "02": 2, "03": 1, "04": 5, "05": 2, "06": 1, "07": 2, "08": "off", "09": 2, "10": 5, "11": 2, "12": "comm", "13": 1, "14": 3,
    "16": 2, "17": 1, "18": 4, "19": 2, "20": "off", "21": 2, "22": 1, "23": 2, "24": 1, "25": 5, "26": 1, "27": "comm",
  };
  // 실외기 소속을 모르는 기존분은 층마다 한 모드로
  const OLD_PLAN = { B2: 2, B1: 2, "2F": 5, "4F": 1, "6F": 2 };

  function rnd(seed) { // 재현 가능한 0~1 값
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  const capKw = (model) => { const m = /AM(\d{3})/.exec(model || ""); return m ? Number(m[1]) / 10 : 7; };
  const planOf = (u) => (u.od ? (OD_PLAN[u.od] ?? 2) : (OLD_PLAN[u.floor] ?? 2));

  function indoorBase() {
    const st = {}; // hoki → {on, mode, fan, set, room, comm}
    MAP.indoor.forEach((u) => {
      const r = rnd(u.hoki + "a"), r3 = rnd(u.hoki + "c");
      const plan = planOf(u);
      const comm = plan === "comm";
      const mode = typeof plan === "number" ? plan : (u.od && Number(u.od) >= 22 ? 1 : 2);
      const on = typeof plan === "number" && r < 0.85;
      const set = mode === 1 ? 23 + Math.floor(r3 * 3) : mode === 2 ? 21 + Math.floor(r3 * 4) : 23 + Math.floor(r3 * 3);
      const fan = r3 < 0.45 ? 5 : r3 < 0.65 ? 3 : r3 < 0.85 ? 2 : r3 < 0.95 ? 1 : 4;
      const drift = mode === 1 ? 0.4 + r * 1.6 : mode === 2 ? -1.8 + r * 1.6 : -0.6 + r * 1.2;
      const room = on ? set + drift : 18 + r3 * 3;
      st[u.hoki] = { on: on ? 1 : 0, mode, fan, set, room, comm };
    });
    return st;
  }

  // EMS 15분 슬롯. 같은 슬롯에서는 값이 흔들리지 않게 슬롯 키로 시연한다.
  async function provider() {
    const t = new Date();
    const slotMs = 15 * 60 * 1000;
    const ts = Math.floor(t.getTime() / slotMs) * slotMs;
    const slotKey = String(Math.floor(ts / slotMs));
    const old = ts - 2 * 3600 * 1000;
    const st = indoorBase();
    const out = {};
    const put = (id, v, comm) => { out[id] = { v, ts: comm ? old : ts }; };
    MAP.indoor.forEach((u) => {
      const s = st[u.hoki];
      const j = (rnd(u.hoki + "r" + slotKey) - 0.5) * 0.3;
      put(u.pts.onoff, s.on, s.comm);
      put(u.pts.mode, s.mode, s.comm);
      put(u.pts.fan, s.fan, s.comm);
      put(u.pts.set, s.set, s.comm);
      put(u.pts.room, Math.round((s.room + j) * 10) / 10, s.comm);
    });
    MAP.outdoor.forEach((o) => {
      const plan = OD_PLAN[o.hoki] ?? 2;
      const comm = plan === "comm";
      const off = plan === "off";
      const ons = o.indoor.map((h) => ({ u: window.EhpViz.inByHoki[h], s: st[h] })).filter((x) => x.s && x.s.on);
      const mode = typeof plan === "number" ? plan : (Number(o.hoki) >= 22 ? 1 : 2);
      const per = mode === 3 ? 0.04 : mode === 4 ? 0.1 : 0.2;   // 송풍, 제습은 전력이 작다
      const rated = Math.max(3, capKw(o.model) * 0.9);
      let kw = 0;
      if (!comm && !off) {
        if (ons.length) {
          kw = ons.reduce((a, x) => a + capKw(x.u && x.u.model) * per, 0);
          kw = Math.min(rated, kw * (1 + (rnd(o.hoki + "kw" + slotKey) - 0.5) * 0.08));
        } else {
          // 시연: 실내기가 꺼져 있어도 운전 계획이면 순시전력을 보이게
          kw = rated * (0.12 + rnd(o.hoki + "kw0" + slotKey) * 0.35);
        }
        kw = Math.round(Math.max(0.3, kw) * 1000) / 1000;
      }
      const load = kw > 0 ? Math.min(99, Math.round((kw / rated) * 1000) / 10) : 0;
      const e15 = Math.round((kw * 0.25) * 1000) / 1000; // 15분 전력사용량 kWh
      put(o.pts.onoff, kw > 0 ? 1 : 0, comm);
      put(o.pts.mode, mode, comm);
      put(o.pts.oat, Math.round((12 + rnd(o.hoki + "t" + slotKey) * 3) * 10) / 10, comm);
      put(o.pts.qc, 0, comm);
      put(o.pts.qh, 0, comm);
      put(o.pts.kw, kw, comm);
      put(o.pts.kwh, Math.round(3000 + rnd(o.hoki) * 30000), comm);
      put(o.pts.load, load, comm);
      put(o.pts.cop, 0, comm);
      put(o.pts.e15, e15, comm);
      put(o.pts.run, kw > 0 ? 0.25 : 0, comm);
      const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      const slotsToday = Math.max(1, Math.floor((ts - dayStart) / slotMs) + 1);
      const avg15 = e15 > 0 ? e15 : (rated * 0.15 * 0.25);
      const day = Math.round(avg15 * slotsToday * (0.55 + rnd(o.hoki + "d") * 0.4) * 10) / 10;
      out[o.pts.e15].day = comm ? 0 : Math.max(day, kw > 0 ? Math.round(e15 * 4 * 10) / 10 : 0);
    });
    return out;
  }

  function at(y, m, d, hh, mm) {
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // 시연: 에피소드(from~to). 한 기기에 여러 유형이 시간상 겹치게 넣어 중복 알람 UI를 본다.
  function todayAt(hh, mm) {
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  }
  function demoLiveInsights(V) {
    const uMain = V.MAP.indoor.find((u) => u.od === "07" && V.indoorState(u).running) || V.MAP.indoor.find((u) => u.od === "07");
    const uVac = V.MAP.indoor.find((u) => u.od === "03" && V.indoorState(u).running) || V.MAP.indoor.find((u) => u.od === "03");
    const oSea = V.odByHoki["22"];
    const now = V.now().getTime();
    const day = ymd(new Date(now));
    const rows = [];
    if (uMain) {
      const base = { floor: uMain.floor, od: uMain.od, iu: uMain.hoki };
      // 심야 00:12~05:45
      rows.push({
        id: `demo-night-${uMain.hoki}-${day}`,
        type: "night",
        sev: "주의",
        title: "심야 연속 운전",
        msg: "심야(00:00~06:00)에 실내기가 운전했습니다.",
        ts: todayAt(0, 12),
        from: todayAt(0, 12),
        to: todayAt(5, 45),
        nightRunMin: 333,
        evidence: "시연: 심야 에피소드",
        ...base,
      });
      // 실내·설정 차이: 심야와 겹침 01:00~04:30, 낮 09:00~12:15, 오후~진행 중
      rows.push({
        id: `demo-setgap-a-${uMain.hoki}-${day}`,
        type: "setgap",
        sev: "확인 권장",
        title: "실내, 설정 온도 차이",
        msg: "설정 24℃, 실내 30.1℃로 차이가 6.1℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.",
        ts: todayAt(1, 0),
        from: todayAt(1, 0),
        to: todayAt(4, 30),
        set: 24,
        room: 30.1,
        evidence: "시연: 심야와 겹친 차이",
        ...base,
      });
      rows.push({
        id: `demo-setgap-b-${uMain.hoki}-${day}`,
        type: "setgap",
        sev: "확인 권장",
        title: "실내, 설정 온도 차이",
        msg: "설정 24℃, 실내 29.0℃로 차이가 5.0℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.",
        ts: todayAt(9, 0),
        from: todayAt(9, 0),
        to: todayAt(12, 15),
        set: 24,
        room: 29,
        evidence: "시연: 오전 차이",
        ...base,
      });
      rows.push({
        id: `demo-setgap-c-${uMain.hoki}-${day}`,
        type: "setgap",
        sev: "확인 권장",
        title: "실내, 설정 온도 차이",
        msg: "설정 24℃, 실내 29.5℃로 차이가 5.5℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.",
        ts: Math.min(todayAt(14, 0), now - 50 * 60000),
        from: Math.min(todayAt(14, 0), now - 50 * 60000),
        to: null,
        open: true,
        set: 24,
        room: 29.5,
        evidence: "시연: 진행 중",
        ...base,
      });
      // 설정온도 이상: 08:30~11:00 (오전 차이와 겹침) + 이상하게 심야에도 설정 28
      rows.push({
        id: `demo-set-a-${uMain.hoki}-${day}`,
        type: "setpoint",
        sev: "주의",
        title: "설정온도 이상",
        msg: `${V.roomText(uMain) || uMain.label} 냉방인데 설정 28℃로 너무 높습니다.`,
        ts: todayAt(2, 0),
        from: todayAt(2, 0),
        to: todayAt(3, 30),
        set: 28,
        room: 27,
        evidence: "시연: 심야에 설정 이상까지 겹침",
        ...base,
      });
      rows.push({
        id: `demo-set-b-${uMain.hoki}-${day}`,
        type: "setpoint",
        sev: "주의",
        title: "설정온도 이상",
        msg: `${V.roomText(uMain) || uMain.label} 냉방인데 설정 27℃로 너무 높습니다.`,
        ts: todayAt(8, 30),
        from: todayAt(8, 30),
        to: todayAt(11, 0),
        set: 27,
        room: 26,
        evidence: "시연: 오전 설정 이상, 차이와 겹침",
        ...base,
      });
      // 계절 불일치도 같은 기기에 (시연용으로 한겨울 냉방처럼)
      rows.push({
        id: `demo-season-iu-${uMain.hoki}-${day}`,
        type: "season",
        sev: "주의",
        title: "계절과 모드 불일치",
        msg: "한겨울 기준으로 보면 냉방으로 운전 중입니다. (시연: 같은 기기에 중복)",
        ts: todayAt(10, 0),
        from: todayAt(10, 0),
        to: todayAt(16, 0),
        evidence: "시연: 낮 구간 계절+차이+설정 일부 겹침",
        ...base,
      });
    }
    if (uVac) {
      rows.push({
        id: `demo-vac-${uVac.hoki}`,
        type: "vacation",
        sev: "확인 권장",
        title: "방학·휴일형 운전",
        msg: "방학·휴일 기간 설정 기준으로 보면 실내기가 운전 중입니다. 실제 이용인지 확인해 주세요.",
        ts: Math.min(todayAt(9, 30), now - 40 * 60000),
        from: Math.min(todayAt(9, 30), now - 40 * 60000),
        to: null,
        open: true,
        floor: uVac.floor,
        od: uVac.od,
        iu: uVac.hoki,
        evidence: "시연 데이터, 방학 중 운전 예시",
      });
    }
    if (oSea && V.outdoorState(oSea).running) {
      rows.push({
        id: `demo-season-${oSea.hoki}`,
        type: "season",
        sev: "주의",
        title: "계절과 모드 불일치",
        msg: "한겨울 기준으로 보면 냉방으로 운전 중입니다. (시연: 계절 불일치 예시)",
        ts: Math.min(todayAt(8, 0), now - 90 * 60000),
        from: Math.min(todayAt(8, 0), now - 90 * 60000),
        to: null,
        open: true,
        floor: null,
        od: oSea.hoki,
        iu: null,
        evidence: "시연 데이터, 겨울-냉방 예시",
      });
    }
    const oPow = V.odByHoki["04"] || V.MAP.outdoor.find((o) => V.outdoorState(o).running);
    if (oPow && V.outdoorState(oPow).running) {
      rows.push({
        id: `demo-power-${oPow.hoki}`,
        type: "power",
        sev: "주의",
        title: "전력 패턴 이상",
        msg: `${oPow.label} 부하율이 매우 높습니다. 이상 운전인지 확인해 주세요.`,
        ts: now,
        floor: null,
        od: oPow.hoki,
        iu: null,
        since: now - 25 * 60000,
        sinceLabel: "약 25분 전부터",
        evidence: "시연 데이터, 부하율 고부하 예시",
      });
    }
    return rows;
  }

  // 알람 상세용 운전 패턴. EMS 15분 이력 → 시간당 슬롯 수(0~4). 칸은 높이로 부분 채움.
  function fmtRunMin(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h <= 0) return `${r}분`;
    if (r === 0) return `${h}시간`;
    return `${h}시간 ${r}분`;
  }
  function runPattern(V, insight, period) {
    const seed = String(insight.iu || insight.od || "x");
    const r = (k) => rnd(seed + k);
    if (period === "day") {
      // hours[h] = 해당 시 15분 슬롯 중 운전한 개수 (0~4). 전부 채우면 60분
      const hours = Array.from({ length: 24 }, (_, h) => {
        if (insight.type === "comm") return 0;
        if (insight.type === "night") {
          if (h < 6) return 4;
          if (h >= 8 && h <= 18) return Math.floor(r("d" + h) * 5); // 0~4
          return r("d" + h) > 0.7 ? 1 : 0;
        }
        const q = Math.floor(r("d" + h) * 5); // 0~4
        return r("d" + h + "on") > 0.4 ? Math.max(1, q) : q;
      });
      // 시연: 실내기는 심야에도 일부 돌린 것처럼 보이게 (알람 이력과 맞춤)
      if (insight.iu && insight.type !== "comm") {
        for (let h = 0; h < 6; h++) hours[h] = Math.max(hours[h], h === 0 ? 3 : h === 5 ? 2 : 4);
      }
      if (insight.type === "night") {
        hours[0] = 3;
        hours[5] = 2;
      }
      const onMin = hours.reduce((a, q) => a + q * 15, 0);
      const nightMin = hours.slice(0, 6).reduce((a, q) => a + q * 15, 0);
      return {
        hours,
        onMin,
        nightMin,
        caption: `오늘 기준 운전 ${fmtRunMin(onMin)}, 심야(00~06) ${fmtRunMin(nightMin)}.`,
      };
    }
    if (period === "month") {
      const days = new Date(V.now().getFullYear(), V.now().getMonth() + 1, 0).getDate();
      const rows = Array.from({ length: Math.min(days, 14) }, (_, i) => {
        const day = days - 13 + i;
        if (day < 1) return null;
        const min = insight.type === "night"
          ? Math.round(180 + r("m" + day) * 240)
          : Math.round(60 + r("m" + day) * 420);
        return { label: `${day}일`, min };
      }).filter(Boolean);
      return {
        rows,
        caption: "최근 일자별 운전 시간(시연). 실데이터는 일 누적 운전분으로 채웁니다.",
      };
    }
    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const min = Math.round((insight.type === "vacation" && (m === 7 || m === 8 || m === 1 || m === 2)
        ? 8000 + r("y" + m) * 4000
        : 2000 + r("y" + m) * 5000));
      return { label: `${m}월`, min };
    });
    return {
      rows,
      caption: "올해 월별 운전 시간(시연). 방학·심야 이상 구간과 대조해 보세요.",
    };
  }

  // 과거 일별 조회용. 어제·그제 등도 날짜를 넘기면 보이도록 상대 일자로 넣는다.
  function daysAgoAt(V, daysBack, hh, mm) {
    const d = new Date(V.now().getTime());
    d.setDate(d.getDate() - daysBack);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  }
  function insightHistory(V) {
    const pick = (od) => V.MAP.indoor.find((u) => u.od === od) || V.MAP.indoor[0];
    const a = pick("01"), b = pick("06"), c = pick("13"), d = pick("16");
    const main = pick("07");
    const mb = { floor: main.floor, od: main.od, iu: main.hoki };
    const y1 = ymd(new Date(daysAgoAt(V, 1, 12, 0)));
    const y2 = ymd(new Date(daysAgoAt(V, 2, 12, 0)));
    const y3 = ymd(new Date(daysAgoAt(V, 3, 12, 0)));
    return [
      // 어제: 같은 기기(EHP-7 계통)에 여러 유형
      {
        id: `hist-night-${main.hoki}-${y1}`, type: "night", sev: "주의", title: "심야 연속 운전",
        msg: "심야(00:00~06:00)에 실내기가 운전했습니다.",
        ts: daysAgoAt(V, 1, 0, 20), from: daysAgoAt(V, 1, 0, 20), to: daysAgoAt(V, 1, 5, 40),
        nightRunMin: 320, evidence: "시연: 어제 심야", ...mb,
      },
      {
        id: `hist-gap-${main.hoki}-${y1}`, type: "setgap", sev: "확인 권장", title: "실내, 설정 온도 차이",
        msg: "설정 24℃, 실내 29.8℃로 차이가 5.8℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.",
        ts: daysAgoAt(V, 1, 9, 0), from: daysAgoAt(V, 1, 9, 0), to: daysAgoAt(V, 1, 15, 30),
        set: 24, room: 29.8, evidence: "시연: 어제 차이", ...mb,
      },
      {
        id: `hist-set-${main.hoki}-${y1}`, type: "setpoint", sev: "주의", title: "설정온도 이상",
        msg: `${V.roomText(main) || main.label} 냉방인데 설정 28℃로 너무 높습니다.`,
        ts: daysAgoAt(V, 1, 10, 0), from: daysAgoAt(V, 1, 10, 0), to: daysAgoAt(V, 1, 12, 0),
        set: 28, room: 26, evidence: "시연: 어제 설정 이상", ...mb,
      },
      // 그제
      {
        id: `hist-night-${main.hoki}-${y2}`, type: "night", sev: "주의", title: "심야 연속 운전",
        msg: "심야(00:00~06:00)에 실내기가 운전했습니다.",
        ts: daysAgoAt(V, 2, 0, 5), from: daysAgoAt(V, 2, 0, 5), to: daysAgoAt(V, 2, 6, 0),
        nightRunMin: 355, evidence: "시연: 그제 심야", ...mb,
      },
      {
        id: `hist-gap-${main.hoki}-${y2}`, type: "setgap", sev: "확인 권장", title: "실내, 설정 온도 차이",
        msg: "설정 23℃, 실내 28.5℃로 차이가 5.5℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.",
        ts: daysAgoAt(V, 2, 13, 0), from: daysAgoAt(V, 2, 13, 0), to: daysAgoAt(V, 2, 18, 0),
        set: 23, room: 28.5, evidence: "시연: 그제 차이", ...mb,
      },
      {
        id: `hist-comm-od12-${y2}`, type: "comm", sev: "중요", title: "통신 끊김 장기화",
        msg: `${V.odByHoki["12"].label} 통신이 오래 끊겼습니다.`,
        ts: daysAgoAt(V, 2, 8, 0), from: daysAgoAt(V, 2, 8, 0), to: daysAgoAt(V, 2, 11, 30),
        floor: null, od: "12", iu: null, evidence: "시연: 그제 통신",
      },
      // 3일 전
      {
        id: `hist-season-${main.hoki}-${y3}`, type: "season", sev: "주의", title: "계절과 모드 불일치",
        msg: "한겨울 기준으로 보면 냉방으로 운전 중입니다.",
        ts: daysAgoAt(V, 3, 11, 0), from: daysAgoAt(V, 3, 11, 0), to: daysAgoAt(V, 3, 17, 0),
        evidence: "시연: 3일 전 계절", ...mb,
      },
      {
        id: `hist-power-04-${y3}`, type: "power", sev: "주의", title: "전력 패턴 이상",
        msg: `${V.odByHoki["04"].label} 부하율이 비정상적으로 높았습니다.`,
        ts: daysAgoAt(V, 3, 14, 0), from: daysAgoAt(V, 3, 14, 0), to: daysAgoAt(V, 3, 16, 0),
        floor: null, od: "04", iu: null, evidence: "시연: 3일 전 전력",
      },
      // 더 먼 과거 (고정 샘플)
      { id: "h-n1", type: "night", sev: "주의", title: "심야 연속 운전", msg: `실내기가 심야에도 운전했습니다.`, ts: at(2026, 11, 16, 2, 15), from: at(2026, 11, 16, 0, 20), to: at(2026, 11, 16, 5, 50), floor: a.floor, od: a.od, iu: a.hoki, nightRunMin: 115, evidence: "심야 누적 115분" },
      { id: "h-n2", type: "night", sev: "주의", title: "심야 연속 운전", msg: `실내기가 심야에도 운전했습니다.`, ts: at(2026, 11, 15, 3, 0), from: at(2026, 11, 15, 1, 10), to: at(2026, 11, 15, 5, 0), floor: b.floor, od: b.od, iu: b.hoki, nightRunMin: 110, evidence: "심야 누적 110분" },
      { id: "h-v1", type: "vacation", sev: "확인 권장", title: "방학·휴일형 운전", msg: `하계방학 중 ${V.odByHoki["17"].label}이(가) 운전했습니다.`, ts: at(2026, 7, 14, 14, 30), from: at(2026, 7, 14, 9, 0), to: at(2026, 7, 14, 17, 0), floor: null, od: "17", iu: null, evidence: "하계방학" },
      { id: "h-t1", type: "setpoint", sev: "주의", title: "설정온도 이상", msg: `${V.roomText(c) || c.label} 설정온도 30℃로 운전했습니다.`, ts: at(2026, 11, 10, 15, 20), from: at(2026, 11, 10, 13, 0), to: at(2026, 11, 10, 16, 0), floor: c.floor, od: c.od, iu: c.hoki, set: 30, room: 25, evidence: "설정 30℃" },
      { id: "h-c1", type: "comm", sev: "중요", title: "통신 끊김 장기화", msg: `${V.odByHoki["12"].label} 통신이 오래 끊겼습니다.`, ts: at(2026, 10, 3, 9, 45), from: at(2026, 10, 3, 8, 0), to: at(2026, 10, 3, 12, 0), floor: null, od: "12", iu: null, evidence: "30분 이상 미수신" },
      { id: "h-c2", type: "comm", sev: "중요", title: "통신 끊김 장기화", msg: `${V.roomText(d) || d.label} 실내기 통신이 오래 끊겼습니다.`, ts: at(2026, 9, 12, 16, 15), from: at(2026, 9, 12, 14, 0), to: at(2026, 9, 12, 18, 0), floor: d.floor, od: d.od, iu: d.hoki, evidence: "30분 이상 미수신" },
    ];
  }

  // 설비 운전분. 실서비스는 ON/OFF(또는 실외기 전력) 15분 이력을 일/월/연으로 합산 저장·조회.
  function dayRunMin(V, ref, period) {
    const p = period || "day";
    const pat = runPattern(V, {
      iu: ref && ref.iu ? ref.iu : null,
      od: ref && ref.od ? ref.od : null,
      type: "setpoint",
    }, p);
    if (p === "day") {
      return {
        onMin: pat.onMin || 0,
        nightMin: pat.nightMin || 0,
        label: fmtRunMin(pat.onMin || 0),
        nightLabel: fmtRunMin(pat.nightMin || 0),
      };
    }
    const onMin = (pat.rows || []).reduce((a, row) => a + (row.min || 0), 0);
    return {
      onMin,
      nightMin: 0,
      label: fmtRunMin(onMin),
      nightLabel: "-",
    };
  }

  window.EHP_MOCK = { provider, demoLiveInsights, insightHistory, runPattern, dayRunMin, fmtRunMin };
})();
