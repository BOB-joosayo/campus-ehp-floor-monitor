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

  let tickN = 0;
  async function provider() {
    const t = new Date();
    const ts = Math.floor(t.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
    const old = ts - 2 * 3600 * 1000;
    const st = indoorBase();
    const out = {};
    const put = (id, v, comm) => { out[id] = { v, ts: comm ? old : ts }; };
    tickN++;
    MAP.indoor.forEach((u) => {
      const s = st[u.hoki];
      const j = (rnd(u.hoki + tickN) - 0.5) * 0.2;
      put(u.pts.onoff, s.on, s.comm);
      put(u.pts.mode, s.mode, s.comm);
      put(u.pts.fan, s.fan, s.comm);
      put(u.pts.set, s.set, s.comm);
      put(u.pts.room, Math.round((s.room + j) * 10) / 10, s.comm);
    });
    MAP.outdoor.forEach((o) => {
      const plan = OD_PLAN[o.hoki] ?? 2;
      const comm = plan === "comm";
      const ons = o.indoor.map((h) => ({ u: window.EhpViz.inByHoki[h], s: st[h] })).filter((x) => x.s.on);
      const mode = typeof plan === "number" ? plan : (Number(o.hoki) >= 22 ? 1 : 2);
      const per = mode === 3 ? 0.04 : mode === 4 ? 0.1 : 0.2;   // 송풍, 제습은 전력이 작다
      const rated = capKw(o.model) * 0.9;
      let kw = ons.reduce((a, x) => a + capKw(x.u.model) * per, 0);
      kw = Math.min(rated, kw * (1 + (rnd(o.hoki + tickN) - 0.5) * 0.08));
      kw = Math.round(kw * 1000) / 1000;
      const load = kw > 0 ? Math.round((kw / rated) * 1000) / 10 : 0;
      put(o.pts.onoff, kw > 0 ? 1 : 0, comm);
      put(o.pts.mode, mode, comm);
      put(o.pts.oat, 12 + rnd(o.hoki + "t") * 3, comm);
      put(o.pts.qc, 0, comm);
      put(o.pts.qh, 0, comm);
      put(o.pts.kw, kw, comm);
      put(o.pts.kwh, 3000 + rnd(o.hoki) * 30000, comm);
      put(o.pts.load, load, comm);
      put(o.pts.cop, 0, comm);
      put(o.pts.e15, Math.round((kw / 4) * 1000) / 1000, comm);
      put(o.pts.run, kw > 0 ? 0.25 : 0, comm);
      // 하루 누적: 오늘 00:00부터 지금까지 15분 전력사용량 합. 아침 7시부터 돌았다고 보고 만든다
      const slots = Math.max(0, (t.getHours() - 7) * 4 + Math.floor(t.getMinutes() / 15));
      const avg = (kw > 0 ? kw : capKw(o.model) * 0.12) / 4;
      out[o.pts.e15].day = Math.round(avg * slots * (0.45 + rnd(o.hoki + "d") * 0.4) * 10) / 10;
    });
    return out;
  }

  function at(y, m, d, hh, mm) {
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }

  // 시연: 지금이 심야·방학이 아니어도 인사이트 목록이 비지 않도록 몇 건을 넣는다
  function demoLiveInsights(V) {
    const uNight = V.MAP.indoor.find((u) => u.od === "07" && V.indoorState(u).running) || V.MAP.indoor.find((u) => u.od === "07");
    const uVac = V.MAP.indoor.find((u) => u.od === "03" && V.indoorState(u).running) || V.MAP.indoor.find((u) => u.od === "03");
    const oSea = V.odByHoki["22"]; // 냉방 EHP (11월 시연용 계절 불일치)
    const now = V.now().getTime();
    const rows = [];
    if (uNight) {
      const since = new Date();
      since.setHours(0, 12, 0, 0);
      const nightEnd = new Date();
      nightEnd.setHours(6, 0, 0, 0);
      const nightRunMin = Math.max(60, Math.floor((Math.min(now, nightEnd.getTime()) - since.getTime()) / 60000));
      rows.push({
        id: `demo-night-${uNight.hoki}`,
        type: "night",
        sev: "주의",
        title: "심야 연속 운전",
        msg: "심야(00:00~06:00)에 실내기가 운전 중입니다. 00:12부터 이어진 구간이며, 중간 끊김은 없습니다.",
        ts: now,
        floor: uNight.floor,
        od: uNight.od,
        iu: uNight.hoki,
        since: since.getTime(),
        sinceLabel: "00:12부터",
        nightRunMin,
        gapMin: 10,
        gapCount: 0,
        evidence: "시연 데이터, 심야 누적 운전 예시",
      });
    }
    if (uVac) {
      rows.push({
        id: `demo-vac-${uVac.hoki}`,
        type: "vacation",
        sev: "확인 권장",
        title: "방학·휴일형 운전",
        msg: "방학·휴일 기간 설정 기준으로 보면 실내기가 운전 중입니다. 실제 이용인지 확인해 주세요.",
        ts: now,
        floor: uVac.floor,
        od: uVac.od,
        iu: uVac.hoki,
        since: now - 95 * 60000,
        sinceLabel: "약 1시간 35분 전부터",
        runMin: 95,
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
        ts: now,
        floor: null,
        od: oSea.hoki,
        iu: null,
        since: now - 40 * 60000,
        sinceLabel: "약 40분 전부터",
        runMin: 40,
        evidence: "시연 데이터, 겨울-냉방 예시",
      });
    }
    const uSet = V.MAP.indoor.find((u) => u.od === "05" && V.indoorState(u).running)
      || V.MAP.indoor.find((u) => V.indoorState(u).running)
      || V.MAP.indoor[0];
    if (uSet) {
      rows.push({
        id: `demo-set-${uSet.hoki}`,
        type: "setpoint",
        sev: "주의",
        title: "설정온도 이상",
        msg: `${V.roomText(uSet) || uSet.label} 설정온도 30℃로 운전 중입니다. 기기 설정 가능 범위(16~30℃) 상한이거나 모드와 안 맞는 설정입니다.`,
        ts: now,
        floor: uSet.floor,
        od: uSet.od,
        iu: uSet.hoki,
        set: 30,
        room: 24.5,
        since: now - 50 * 60000,
        sinceLabel: "약 50분 전부터",
        evidence: "시연 데이터, 설정온도 30℃",
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
      if (insight.type === "night") {
        // 심야도 일부 시는 부분 운전으로 보이게 (00시 45분, 05시 30분 등)
        hours[0] = 3;
        hours[5] = 2;
      }
      const onMin = hours.reduce((a, q) => a + q * 15, 0);
      const nightMin = hours.slice(0, 6).reduce((a, q) => a + q * 15, 0);
      return {
        hours,
        caption: `오늘 기준 운전 ${fmtRunMin(onMin)} · 심야(00~06) ${fmtRunMin(nightMin)}. 칸 높이는 15분 단위(최대 4칸=60분)입니다. 노란 테두리는 심야 구간입니다.`,
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

  function insightHistory(V) {
    const pick = (od) => V.MAP.indoor.find((u) => u.od === od) || V.MAP.indoor[0];
    const a = pick("01"), b = pick("06"), c = pick("13"), d = pick("16");
    return [
      { id: "h-n1", type: "night", sev: "주의", title: "심야 연속 운전", msg: `실내기가 심야에도 운전했습니다.`, ts: at(2026, 11, 16, 2, 15), floor: a.floor, od: a.od, iu: a.hoki, since: at(2026, 11, 16, 0, 20), sinceLabel: "00:20부터", nightRunMin: 115, gapCount: 0, gapMin: 10, evidence: "심야 누적 115분" },
      { id: "h-n2", type: "night", sev: "주의", title: "심야 연속 운전", msg: `실내기가 심야에도 운전했습니다.`, ts: at(2026, 11, 15, 3, 0), floor: b.floor, od: b.od, iu: b.hoki, since: at(2026, 11, 15, 1, 10), sinceLabel: "01:10부터", nightRunMin: 110, gapCount: 1, gapMin: 10, evidence: "심야 누적 110분, 8분 끊김 1회" },
      { id: "h-v1", type: "vacation", sev: "확인 권장", title: "방학·휴일형 운전", msg: `하계방학 중 ${V.odByHoki["17"].label}이(가) 운전했습니다.`, ts: at(2026, 7, 14, 14, 30), floor: null, od: "17", iu: null, evidence: "하계방학 2026-06-23~08-31" },
      { id: "h-v2", type: "vacation", sev: "확인 권장", title: "방학·휴일형 운전", msg: `하계방학 중 ${V.roomText(c) || c.label} 실내기가 운전했습니다.`, ts: at(2026, 8, 5, 11, 0), floor: c.floor, od: c.od, iu: c.hoki, evidence: "하계방학 중 운전" },
      { id: "h-s1", type: "season", sev: "주의", title: "계절과 모드 불일치", msg: `한여름에 ${V.odByHoki["01"].label}이(가) 난방으로 운전했습니다.`, ts: at(2026, 7, 20, 13, 0), floor: null, od: "01", iu: null, evidence: "7월, 난방" },
      { id: "h-t1", type: "setpoint", sev: "주의", title: "설정온도 이상", msg: `${V.roomText(c) || c.label} 설정온도 30℃로 운전했습니다.`, ts: at(2026, 11, 10, 15, 20), floor: c.floor, od: c.od, iu: c.hoki, set: 30, room: 25, evidence: "설정 30℃" },
      { id: "h-p1", type: "power", sev: "주의", title: "전력 패턴 이상", msg: `${V.odByHoki["04"].label} 부하율이 비정상적으로 높았습니다.`, ts: at(2026, 11, 8, 11, 0), floor: null, od: "04", iu: null, evidence: "부하율 96%" },
      { id: "h-c1", type: "comm", sev: "중요", title: "통신 끊김 장기화", msg: `${V.odByHoki["12"].label} 통신이 오래 끊겼습니다.`, ts: at(2026, 10, 3, 9, 45), floor: null, od: "12", iu: null, evidence: "30분 이상 미수신" },
      { id: "h-c2", type: "comm", sev: "중요", title: "통신 끊김 장기화", msg: `${V.roomText(d) || d.label} 실내기 통신이 오래 끊겼습니다.`, ts: at(2026, 9, 12, 16, 15), floor: d.floor, od: d.od, iu: d.hoki, evidence: "30분 이상 미수신" },
      { id: "h-n3", type: "night", sev: "주의", title: "심야 연속 운전", msg: `실내기가 심야에도 운전했습니다.`, ts: at(2026, 10, 28, 1, 30), floor: a.floor, od: a.od, iu: a.hoki, since: at(2026, 10, 28, 0, 5), sinceLabel: "00:05부터", nightRunMin: 85, gapCount: 0, gapMin: 10, evidence: "심야 누적 85분" },
    ];
  }

  window.EHP_MOCK = { provider, demoLiveInsights, insightHistory, runPattern };
})();
