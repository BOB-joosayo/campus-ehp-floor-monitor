/* AI 인사이트: 규칙 기반 이상 징후. LLM 없음. 설정(방학, 심야)은 localStorage. */
(function () {
  "use strict";
  const KEY = "ehpviz.insightSettings";
  const ACK = "ehpviz.insightAck";
  const DEFAULTS = {
    summerStart: "2026-06-23",
    summerEnd: "2026-08-31",
    winterStart: "2026-12-22",
    winterEnd: "2027-02-28",
    nightStart: "00:00",
    nightEnd: "06:00",
    nightMinMin: 60,
  };

  function loadSettings() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function saveSettings(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }
  function loadAck() {
    try { return JSON.parse(localStorage.getItem(ACK) || "{}"); } catch (e) { return {}; }
  }
  function ack(id) {
    const a = loadAck();
    a[id] = Date.now();
    localStorage.setItem(ACK, JSON.stringify(a));
  }

  function parseHm(hm) {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  }
  function inNight(d, s) {
    const t = d.getHours() * 60 + d.getMinutes();
    const a = parseHm(s.nightStart), b = parseHm(s.nightEnd);
    return a <= b ? t >= a && t < b : t >= a || t < b;
  }
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function inRange(day, a, b) {
    if (!a) return false;
    if (!b) return day >= a;
    return day >= a && day <= b;
  }
  function inVacation(d, s) {
    const day = ymd(d);
    return inRange(day, s.summerStart, s.summerEnd) || inRange(day, s.winterStart, s.winterEnd);
  }
  // 간절기(3~5, 9~11월)는 계절-모드 불일치를 보지 않는다
  function seasonKind(d) {
    const m = d.getMonth() + 1;
    if (m >= 6 && m <= 8) return "summer";
    if (m === 12 || m <= 2) return "winter";
    return "shoulder";
  }

  const TYPE = {
    night: { label: "심야 연속 운전", sev: "주의" },
    vacation: { label: "방학, 휴일형 운전", sev: "확인 권장" },
    season: { label: "계절과 모드 불일치", sev: "주의" },
    setpoint: { label: "설정온도 이상", sev: "주의" },
    setgap: { label: "실내, 설정 온도 차이", sev: "확인 권장" },
    power: { label: "전력 패턴 이상", sev: "주의" },
    comm: { label: "통신 끊김 장기화", sev: "중요" },
  };

  function liveInsights(V) {
    const s = loadSettings();
    const now = V.now();
    const ackMap = loadAck();
    const out = [];
    const push = (row) => {
      if (ackMap[row.id]) row.acked = true;
      out.push(row);
    };

    V.MAP.outdoor.forEach((o) => {
      const st = V.outdoorState(o);
      if (st.key === "comm") {
        const floors = [...new Set((o.indoor || []).map((h) => V.inByHoki[h] && V.inByHoki[h].floor).filter(Boolean))];
        push({
          id: `comm-od-${o.hoki}-${ymd(now)}`,
          type: "comm",
          sev: "중요",
          title: TYPE.comm.label,
          msg: `${o.label} 통신이 끊긴 상태입니다. 전력 포인트 값이 없거나, 최근 수집이 30분을 넘었습니다.`,
          ts: now.getTime(),
          floor: floors[0] || null,
          floors,
          od: o.hoki,
          iu: null,
          evidence: "포인트 미수신 또는 수집시각 30분 초과",
        });
      }
      // 전력 패턴: 운전 중인데 부하율이 비정상적으로 높거나, 15분 전력이 같은 분전반 평균의 2.5배를 넘을 때
      if (st.running && st.load != null && st.load >= 95) {
        push({
          id: `power-od-${o.hoki}-${ymd(now)}`,
          type: "power",
          sev: "주의",
          title: TYPE.power.label,
          msg: `${o.label} 부하율이 ${Math.round(st.load)}%로 매우 높습니다. 이상 운전인지 확인해 주세요.`,
          ts: now.getTime(),
          floor: null,
          od: o.hoki,
          iu: null,
          evidence: `부하율 ${Math.round(st.load)}%`,
        });
      }
      if (st.running && seasonKind(now) === "summer" && st.mode === 2) {
        push({
          id: `season-od-${o.hoki}-${ymd(now)}`,
          type: "season",
          sev: "주의",
          title: TYPE.season.label,
          msg: `한여름인데 ${o.label}이(가) 난방으로 운전 중입니다.`,
          ts: now.getTime(),
          floor: null,
          od: o.hoki,
          iu: null,
          evidence: `모드 난방, ${now.getMonth() + 1}월`,
        });
      }
      if (st.running && seasonKind(now) === "winter" && st.mode === 1) {
        push({
          id: `season-od-${o.hoki}-${ymd(now)}`,
          type: "season",
          sev: "주의",
          title: TYPE.season.label,
          msg: `한겨울인데 ${o.label}이(가) 냉방으로 운전 중입니다.`,
          ts: now.getTime(),
          floor: null,
          od: o.hoki,
          iu: null,
          evidence: `모드 냉방, ${now.getMonth() + 1}월`,
        });
      }
      if (st.running && inVacation(now, s)) {
        push({
          id: `vac-od-${o.hoki}-${ymd(now)}`,
          type: "vacation",
          sev: "확인 권장",
          title: TYPE.vacation.label,
          msg: `방학, 휴일 기간인데 ${o.label}이(가) 운전 중입니다. 실제 이용인지 확인해 주세요.`,
          ts: now.getTime(),
          floor: null,
          od: o.hoki,
          iu: null,
          evidence: `방학 설정 ${s.summerStart}~ / ${s.winterStart}~`,
        });
      }
    });

    V.MAP.indoor.forEach((u) => {
      const st = V.indoorState(u);
      // 연결 실외기가 이미 통신 없음이면 실내기 건은 따로 만들지 않는다 (중복 방지)
      if (st.key === "comm") {
        const od = u.od ? V.odByHoki[u.od] : null;
        if (!(od && V.outdoorState(od).key === "comm")) {
          push({
            id: `comm-iu-${u.hoki}-${ymd(now)}`,
            type: "comm",
            sev: "중요",
            title: TYPE.comm.label,
            msg: `${V.roomText(u) || u.label} 실내기 통신이 끊긴 상태입니다. ON/OFF 포인트 값이 없거나, 최근 수집이 30분을 넘었습니다.`,
            ts: now.getTime(),
            floor: u.floor,
            od: u.od || null,
            iu: u.hoki,
            evidence: "포인트 미수신 또는 수집시각 30분 초과",
          });
        }
      }
      // 심야: 지금 심야 구간에 켜져 있으면 발생. 실서비스는 15분 이력으로도 당일 건을 남겨 낮에도 목록에 보이게 한다.
      if (st.running && inNight(now, s)) {
        push({
          id: `night-iu-${u.hoki}-${ymd(now)}`,
          type: "night",
          sev: "주의",
          title: TYPE.night.label,
          msg: `심야(${s.nightStart}~${s.nightEnd})에 실내기가 운전 중입니다. 학생이 이용 중인지, 끄지 않고 둔 상태인지 확인해 주세요.`,
          ts: now.getTime(),
          floor: u.floor,
          od: u.od || null,
          iu: u.hoki,
          evidence: `심야 구간 현재 운전, 모드 ${st.label}, 누적 기준 ${s.nightMinMin}분`,
        });
      }
      // 설정온도 이상: 허용 밖, 냉방≥27, 난방≤19 (실내와의 차이는 setgap으로 분리)
      if (st.running && st.set != null) {
        const set = st.set;
        let why = "";
        let evidence = "";
        if (set < 16 || set > 30) {
          why = `설정온도 ${V.fmt(set)}℃가 기기 설정 가능 범위(16~30℃)를 벗어났습니다.`;
          evidence = `설정 ${set}℃ (허용 밖)`;
        } else if (st.mode === 1 && set >= 27) {
          why = `냉방인데 설정 ${V.fmt(set)}℃로 너무 높습니다.`;
          evidence = `냉방, 설정 ${set}℃`;
        } else if (st.mode === 2 && set <= 19) {
          why = `난방인데 설정 ${V.fmt(set)}℃로 너무 낮습니다.`;
          evidence = `난방, 설정 ${set}℃`;
        }
        if (why) {
          push({
            id: `set-iu-${u.hoki}-${ymd(now)}`,
            type: "setpoint",
            sev: "주의",
            title: TYPE.setpoint.label,
            msg: `${V.roomText(u) || u.label} ${why}`,
            ts: now.getTime(),
            floor: u.floor,
            od: u.od || null,
            iu: u.hoki,
            set,
            room: st.room,
            evidence,
          });
        }
        // 실내, 설정 온도 차이: 원인 단정 없이 확인 권장. 송풍은 제외
        const gap = st.room != null ? Math.abs(st.room - set) : null;
        if (st.mode !== 3 && gap != null && gap >= 5) {
          push({
            id: `setgap-iu-${u.hoki}-${ymd(now)}`,
            type: "setgap",
            sev: "확인 권장",
            title: TYPE.setgap.label,
            msg: `설정 ${V.fmt(set)}℃, 실내 ${V.fmt(st.room)}℃로 차이가 ${V.fmt(gap, 1)}℃입니다. 원인(도달 여부, 센서, 외기 등)은 현장에서 확인해 주세요.`,
            ts: now.getTime(),
            floor: u.floor,
            od: u.od || null,
            iu: u.hoki,
            set,
            room: st.room,
            evidence: `설정 ${set}℃ / 실내 ${st.room}℃ / 차이 ${V.fmt(gap, 1)}℃`,
          });
        }
      }
      if (st.running && seasonKind(now) === "summer" && st.mode === 2) {
        push({
          id: `season-iu-${u.hoki}-${ymd(now)}`,
          type: "season",
          sev: "주의",
          title: TYPE.season.label,
          msg: `한여름인데 ${V.roomText(u) || u.label}이(가) 난방으로 운전 중입니다.`,
          ts: now.getTime(),
          floor: u.floor,
          od: u.od || null,
          iu: u.hoki,
          evidence: `모드 난방, ${now.getMonth() + 1}월`,
        });
      }
      if (st.running && seasonKind(now) === "winter" && st.mode === 1) {
        push({
          id: `season-iu-${u.hoki}-${ymd(now)}`,
          type: "season",
          sev: "주의",
          title: TYPE.season.label,
          msg: `한겨울인데 ${V.roomText(u) || u.label}이(가) 냉방으로 운전 중입니다.`,
          ts: now.getTime(),
          floor: u.floor,
          od: u.od || null,
          iu: u.hoki,
          evidence: `모드 냉방, ${now.getMonth() + 1}월`,
        });
      }
    });

    if (window.EHP_MOCK && window.EHP_MOCK.demoLiveInsights) {
      window.EHP_MOCK.demoLiveInsights(V).forEach(push);
    }
    return out;
  }

  // 과거 일별 조회용 이력. 실서비스는 에피소드를 DB에 저장하고, provider/API로 날짜별 조회한다.
  function demoHistory(V) {
    if (!(window.EHP_MOCK && window.EHP_MOCK.insightHistory)) return [];
    return window.EHP_MOCK.insightHistory(V);
  }

  function allInsights(V) {
    const live = liveInsights(V);
    const hist = demoHistory(V);
    const map = new Map();
    [...hist, ...live].forEach((x) => map.set(x.id, x));
    const ackMap = loadAck();
    return [...map.values()].map((x) => Object.assign({}, x, { acked: !!ackMap[x.id] }))
      .sort((a, b) => b.ts - a.ts);
  }

  function activeByUnit(V) {
    const live = liveInsights(V).filter((x) => !x.acked);
    const iu = {}, od = {}, floor = {};
    live.forEach((x) => {
      if (x.iu) iu[x.iu] = (iu[x.iu] || 0) + 1;
      if (x.od) od[x.od] = (od[x.od] || 0) + 1;
      // 실외기 통신 끊김이면 소속 실내기에도 점을 찍는다
      if (x.od && x.type === "comm") {
        const o = V.odByHoki[x.od];
        (o && o.indoor || []).forEach((h) => { iu[h] = (iu[h] || 0) + 1; });
      }
      const floors = x.floors || (x.floor ? [x.floor] : []);
      floors.forEach((f) => { floor[f] = (floor[f] || 0) + 1; });
      if (x.od && !floors.length) {
        const o = V.odByHoki[x.od];
        (o && o.indoor || []).forEach((h) => {
          const u = V.inByHoki[h];
          if (u) floor[u.floor] = (floor[u.floor] || 0) + 1;
        });
      }
    });
    return { list: live, iu, od, floor, count: live.length };
  }

  // 알람 카드용: 호실/EHP를 본문보다 먼저 크게 보여 주기 위한 표시 문구
  function subjectOf(V, x) {
    if (x.iu && V.inByHoki[x.iu]) {
      const u = V.inByHoki[x.iu];
      const room = V.roomText(u) || u.label || `실내기 ${u.hoki}`;
      const od = (u.od && V.odByHoki[u.od] && V.odByHoki[u.od].label) || "";
      const floor = u.floor && V.FLOOR_LABEL ? V.FLOOR_LABEL[u.floor] : "";
      return {
        kind: "iu",
        kindLabel: "실내기",
        floor: u.floor || null,
        onPlan: !!u.floor,
        where: room,
        meta: [floor, od || "연결 실외기 없음", `실내기 ${u.hoki}`].filter(Boolean).join(", "),
      };
    }
    if (x.od && V.odByHoki[x.od]) {
      const o = V.odByHoki[x.od];
      return {
        kind: "od",
        kindLabel: "실외기",
        floor: null,
        onPlan: true,
        where: o.label || `EHP-${o.hoki}`,
        meta: `실외기, 호기 ${o.hoki}`,
      };
    }
    return { kind: "", kindLabel: "", floor: null, onPlan: false, where: "대상 미상", meta: "" };
  }

  function floorsOfInsight(V, x) {
    if (x.iu && V.inByHoki[x.iu]) return V.inByHoki[x.iu].floor ? [V.inByHoki[x.iu].floor] : [];
    if (x.floors && x.floors.length) return x.floors;
    if (x.floor) return [x.floor];
    if (x.od && V.odByHoki[x.od]) {
      const o = V.odByHoki[x.od];
      const set = new Set();
      (o.indoor || []).forEach((h) => {
        const u = V.inByHoki[h];
        if (u && u.floor) set.add(u.floor);
      });
      // 옥상/1층 실외기 표기용
      if (["01","02","03","04","05","06","07","08","09","10","11","12","13","14","16","17","18","19","20","21","22"].includes(String(x.od))) set.add("RF");
      if (["23","24","25","26","27"].includes(String(x.od))) set.add("1F");
      return [...set];
    }
    return [];
  }

  window.EhpInsight = {
    DEFAULTS, TYPE, loadSettings, saveSettings, ack, loadAck,
    liveInsights, allInsights, activeByUnit, subjectOf, floorsOfInsight, inVacation, inNight, seasonKind, ymd,
  };
})();
