/* AI 인사이트 탭: 기간=알람 이력, 목록=기기 카드, 상세=패턴+이력 */
(function () {
  "use strict";
  const V = window.EhpViz;
  const I = window.EhpInsight;
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const period = "day";
  let filterType = "all";
  let filterFloor = "all";
  let cursor = new Date();
  let selectedKey = null;
  let pinKey = null; // 도면에서 「목록에서 보기」로 넘어온 기기. 목록 맨 앞 + 상세 열림
  const FLOOR_OPTS = ["RF", "6F", "5F", "4F", "3F", "2F", "1F", "B1", "B2"];
  const SEV_RANK = { "중요": 3, "주의": 2, "확인 권장": 1 };
  const bootParams = new URLSearchParams(location.search);

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ins-wrap">
      <div class="ins-bar">
        <div class="ins-date" id="ins-date"></div>
        <div class="ins-filters">
          <select id="ins-type">
            <option value="all">유형 전체</option>
            <option value="night">심야 연속 운전</option>
            <option value="vacation">방학, 휴일형 운전</option>
            <option value="season">계절과 모드 불일치</option>
            <option value="setpoint">설정온도 이상</option>
            <option value="setgap">실내, 설정 온도 차이</option>
            <option value="power">전력 패턴 이상</option>
            <option value="comm">통신 끊김 장기화</option>
          </select>
          <select id="ins-floor" aria-label="층 필터">
            <option value="all">층 전체</option>
            ${FLOOR_OPTS.map((f) => `<option value="${f}">${esc(V.FLOOR_LABEL[f] || f)}</option>`).join("")}
          </select>
        </div>
        <button type="button" class="ins-gear" id="ins-gear" title="인사이트 설정" aria-label="인사이트 설정">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.8 l1.1 2.2 2.4-.3 1.2 2.1 2.1 1.2-.3 2.4 2.2 1.1-1.1 2.1.3 2.4-2.1 1.2.3 2.4-2.4-.3L12 21.2l-1.1-2.2-2.4.3-1.2-2.1-2.1-1.2.3-2.4L3.3 13.1l1.1-2.1-.3-2.4 2.1-1.2-.3-2.4 2.4.3L12 2.8z"/></svg>
        </button>
      </div>
      <div class="kpis" id="ins-kpis"></div>
      <div class="ins-body">
        <div class="ins-list" id="ins-list"></div>
        <div class="ins-side">
          <div class="ev-card ins-chart-card"><div class="ev-h rank-h">유형별 건수<span class="t-base" id="ins-range">-</span></div><div id="ins-chart"></div></div>
        </div>
      </div>
    </div>
    <div class="ins-scrim" id="ins-scrim" hidden></div>
    <aside class="ins-drawer" id="ins-drawer" hidden aria-label="알람 상세">
      <div class="ins-drawer-h">
        <div style="flex:1;min-width:0">
          <h3 class="ins-where" id="dr-where">-</h3>
          <p class="ins-meta" id="dr-meta" style="margin:0"></p>
        </div>
        <button type="button" class="ins-drawer-x" id="dr-close" aria-label="닫기">×</button>
      </div>
      <div class="ins-drawer-b">
        <div class="ins-type" id="dr-type"></div>
        <p id="dr-msg" class="ev-muted" style="margin:0 0 10px;font-size:12.5px;line-height:1.45"></p>
        <div class="ins-facts" id="dr-facts"></div>
        <div class="ins-pat-bar">
          <div class="ev-h">운전 패턴</div>
        </div>
        <div id="dr-pattern"></div>
        <div class="ins-hist" id="dr-hist">
          <div class="ins-hist-h">시간대별 알람 이력</div>
          <div id="dr-overlap" class="ins-overlap"></div>
          <ul class="ins-hist-list" id="dr-hist-list"></ul>
        </div>
        <div class="ins-drawer-actions">
          <a class="ehp-chip ehp-chip-lg" id="dr-floor" href="floor.html">도면에서 보기</a>
        </div>
      </div>
    </aside>
    <div class="ins-modal" id="ins-modal" hidden>
      <div class="ins-dialog ev-card ins-dialog-wide">
        <div class="tc-h"><b>인사이트 설정</b><button type="button" class="tc-x" id="ins-close">×</button></div>
        <p class="tc-sub">방학과 심야 구간을 여기서 바꿉니다. 아래는 각 알람이 언제 나오는지 정리한 내용입니다.</p>
        <div class="ins-form" id="ins-form"></div>
        <div class="ins-rules">
          <h4 class="ins-rules-h">알람 기준</h4>
          <p class="ins-rules-lead">설비가 운전 중일 때만 알람이 나옵니다. 한 번 나면 그날(선택 기간) 이력에 남고, 목록에는 해당 기기 카드가 유지됩니다.</p>
          <div class="ins-rule">
            <div class="ins-rule-t">심야 연속 운전</div>
            <p class="ins-rule-d">위에서 설정한 심야 시작~심야 종료 구간에 실내기가 켜져 있고, 심야 누적 기준(분) 이상 이어질 때. 낮이 되어도 당일 이력에 남음</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">방학, 휴일형 운전</div>
            <p class="ins-rule-d">위에서 설정한 하계방학 시작~종료, 또는 동계방학 시작~종료 기간에 실외기가 운전 중일 때</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">계절과 모드 불일치</div>
            <p class="ins-rule-d">6~8월에 난방, 또는 12~2월에 냉방일 때<br>3~5월, 9~11월은 해당 없음</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">설정온도 이상</div>
            <p class="ins-rule-d">설정온도가 16℃ 미만이거나 30℃를 넘을 때<br>냉방인데 설정 27℃ 이상, 난방인데 설정 19℃ 이하일 때</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">실내, 설정 온도 차이</div>
            <p class="ins-rule-d">실내온도와 설정온도 차이가 5℃ 이상일 때 (송풍 모드 제외). 원인 단정 없이 확인만 권장</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">전력 패턴 이상</div>
            <p class="ins-rule-d">실외기 운전 중 부하율 95% 이상일 때</p>
          </div>
          <div class="ins-rule">
            <div class="ins-rule-t">통신 끊김 장기화</div>
            <p class="ins-rule-d">값이 없거나, 마지막 수집이 30분을 넘긴 경우<br>실내기는 ON/OFF, 실외기는 전력으로 판단</p>
          </div>
        </div>
        <div class="ins-form-actions">
          <button type="button" class="ins-btn ghost" id="ins-reset">기본값</button>
          <button type="button" class="ins-btn" id="ins-save">저장</button>
        </div>
      </div>
    </div>`;

  function periodKey(ts, p) {
    const d = new Date(ts);
    if (p === "year") return String(d.getFullYear());
    if (p === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return I.ymd(d);
  }
  function cursorKey(p) { return periodKey(cursor.getTime(), p); }
  function labelKey(k, p) {
    if (p === "year") return `${k}년`;
    if (p === "month") {
      const [y, m] = k.split("-");
      return `${y}년 ${Number(m)}월`;
    }
    const [y, m, d] = k.split("-");
    return `${y}.${Number(m)}.${Number(d)}`;
  }
  function shiftCursor(dir) {
    const d = new Date(cursor.getTime());
    d.setDate(d.getDate() + dir);
    cursor = d;
  }
  function setCursorFromInput(v) {
    const [y, m, d] = v.split("-").map(Number);
    cursor = new Date(y, m - 1, d);
  }
  function inputValue() {
    return I.ymd(cursor);
  }
  function renderDateNav() {
    document.getElementById("ins-date").innerHTML = `
      <button type="button" data-shift="-1" aria-label="이전">‹</button>
      <input id="ins-cursor" type="date" value="${esc(inputValue())}">
      <button type="button" data-shift="1" aria-label="다음">›</button>`;
  }
  function statusText(x) {
    let msg = String(x.msg || "");
    const sub = I.subjectOf(V, x);
    if (sub.where) {
      msg = msg.replace(sub.where, "").replace(/\s{2,}/g, " ").trim();
    }
    return msg || (I.TYPE[x.type] ? I.TYPE[x.type].label : x.title || "");
  }
  function unitKey(x) {
    if (x.iu) return `iu:${x.iu}`;
    if (x.od) return `od:${x.od}`;
    return `id:${x.id}`;
  }
  function periodEvents() {
    const key = cursorKey(period);
    return I.allInsights(V).filter((x) => {
      if (periodKey(x.ts, period) !== key) return false;
      if (filterFloor !== "all") {
        const floors = I.floorsOfInsight(V, x);
        if (!floors.includes(filterFloor)) return false;
      }
      return true;
    });
  }
  function unitCards() {
    const events = periodEvents();
    const map = new Map();
    events.forEach((x) => {
      const k = unitKey(x);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    });
    let cards = [...map.entries()].map(([key, list]) => {
      const sorted = list.slice().sort((a, b) => epEnd(b) - epEnd(a) || epStart(b) - epStart(a));
      const types = [...new Set(sorted.map((e) => e.type))];
      let sev = "확인 권장";
      sorted.forEach((e) => {
        if ((SEV_RANK[e.sev] || 0) > (SEV_RANK[sev] || 0)) sev = e.sev;
      });
      return { key, events: sorted, latest: sorted[0], types, sev };
    });
    if (filterType !== "all") {
      cards = cards.filter((c) => c.types.includes(filterType));
    }
    return cards.sort((a, b) => {
      if (pinKey) {
        if (a.key === pinKey) return -1;
        if (b.key === pinKey) return 1;
      }
      return b.latest.ts - a.latest.ts;
    });
  }
  function findCard(key) {
    return unitCards().find((c) => c.key === key) || null;
  }
  function eventsForUnit(key) {
    return periodEvents()
      .filter((x) => unitKey(x) === key)
      .sort((a, b) => epEnd(b) - epEnd(a) || epStart(b) - epStart(a));
  }
  function floorHref(x) {
    if (x.iu && V.inByHoki[x.iu] && V.inByHoki[x.iu].floor) {
      const u = V.inByHoki[x.iu];
      return `floor.html?iu=${encodeURIComponent(x.iu)}&floor=${encodeURIComponent(u.floor)}`;
    }
    if (x.od && V.odByHoki[x.od]) return `floor.html?od=${encodeURIComponent(x.od)}`;
    return "";
  }
  function fmtDur(min) {
    if (min == null) return "-";
    const m0 = Math.max(0, Math.round(min));
    const h = Math.floor(m0 / 60);
    const m = m0 % 60;
    if (h <= 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }
  function parseHmHours(hm) {
    const [h, m] = String(hm || "0:0").split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function renderPattern(x) {
    const pat = (window.EHP_MOCK && window.EHP_MOCK.runPattern)
      ? window.EHP_MOCK.runPattern(V, { iu: x.iu || null, od: x.od || null, type: "setpoint" }, "day")
      : null;
    const box = document.getElementById("dr-pattern");
    if (!pat) {
      box.innerHTML = `<p class="ev-muted" style="margin:0">운전 이력 공급이 연결되면 여기에 표시됩니다.</p>`;
      return;
    }
    const s = I.loadSettings();
    let n0 = parseHmHours(s.nightStart);
    let n1 = parseHmHours(s.nightEnd);
    if (!(n1 > n0)) { n0 = 0; n1 = 6; }
    const nightLeft = (n0 / 24) * 100;
    const nightWidth = ((n1 - n0) / 24) * 100;
    const nightLabel = `${s.nightStart}~${s.nightEnd}`;
    const moon = `<svg class="ins-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 3.1a9.2 9.2 0 1 0 5.7 15.6A8.2 8.2 0 0 1 15.2 3.1z"/></svg>`;
    const ticks = [];
    for (let h = 0; h <= 24; h += 1) {
      const maj = h % 3 === 0;
      const edge = h === 0 ? " start" : (h === 24 ? " end" : "");
      ticks.push(`<span class="ins-pat-tick${maj ? " maj" : ""}${edge}" style="left:${(h / 24) * 100}%"><i></i>${maj ? `<b>${pad2(h)}</b>` : ""}</span>`);
    }
    const titleBar = document.querySelector(".ins-pat-bar");
    if (titleBar) {
      titleBar.innerHTML = `<div class="ev-h">운전 패턴</div>`;
    }
    box.innerHTML = `
      <div class="ins-pat-chart">
        <div class="ins-pat-scale" aria-hidden="true">
          <span class="ins-pat-scale-unit">분</span>
          <div class="ins-pat-scale-nums"><span>60</span><span>45</span><span>30</span><span>15</span></div>
        </div>
        <div class="ins-pat-main">
          <div class="ins-pat-plot">
            <div class="ins-pat-plot-inner" style="--night-left:${nightLeft}%;--night-width:${nightWidth}%">
              <div class="ins-pat-nightband" aria-hidden="true"></div>
              <i class="ins-pat-guide start" aria-hidden="true"></i>
              <i class="ins-pat-guide end" aria-hidden="true"></i>
              <div class="ins-timeline">${pat.hours.map((q, i) => {
                const n = Math.max(0, Math.min(4, Number(q) || 0));
                const tip = `${i}시 운전 ${n * 15}분 / 60분`;
                const night = i >= n0 && i < n1 ? " night" : "";
                const slots = [0, 1, 2, 3].map((si) =>
                  `<i class="ins-q${si < n ? " on" : ""}"></i>`
                ).join("");
                return `<span class="ins-hour${night}" title="${esc(tip)}">${slots}</span>`;
              }).join("")}</div>
            </div>
          </div>
          <div class="ins-pat-foot">
            <div class="ins-pat-foot-inner" style="--night-left:${nightLeft}%;--night-width:${nightWidth}%">
              <div class="ins-pat-ticks" aria-hidden="true">${ticks.join("")}</div>
              <div class="ins-pat-nightrail" title="심야 ${esc(nightLabel)}">
                <span class="ins-pat-cap start">${esc(s.nightStart)}</span>
                <span class="ins-pat-railmid">${moon}</span>
                <span class="ins-pat-cap end">${esc(s.nightEnd)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }
  function snap15(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m <= 0) return 15;
    return Math.max(15, Math.round(m / 15) * 15);
  }
  function epDurMin(x) {
    // EMS 수집 단위는 15분. 1분 같은 값은 내지 않는다.
    if (x.type === "night" && x.nightRunMin != null) return snap15(x.nightRunMin);
    const a = epStart(x);
    const b = epEnd(x);
    if (!(b > a)) return 15;
    return snap15((b - a) / 60000);
  }
  function epStart(x) {
    return x.from != null ? x.from : x.ts;
  }
  function epEnd(x) {
    if (x.to != null) return x.to;
    // to가 없으면 진행 중으로 본다
    return V.now().getTime();
  }
  function epRangeText(x) {
    const a = epStart(x);
    const b = epEnd(x);
    const sameDay = I.ymd(new Date(a)) === I.ymd(new Date(b));
    const left = sameDay ? V.hhmm(a) : `${V.hhmm(a)} (${new Date(a).toLocaleDateString("ko-KR")})`;
    if (x.to == null || x.open) return `${left} ~ 진행 중`;
    const right = sameDay ? V.hhmm(b) : `${V.hhmm(b)} (${new Date(b).toLocaleDateString("ko-KR")})`;
    return `${left} ~ ${right}`;
  }
  function dayMin(ts) {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  }
  function renderOverlap(events) {
    const box = document.getElementById("dr-overlap");
    if (!box) return;
    if (!events.length) {
      box.innerHTML = "";
      return;
    }
    const byType = {};
    events.forEach((x) => {
      if (!byType[x.type]) byType[x.type] = [];
      byType[x.type].push(x);
    });
    const order = Object.keys(I.TYPE).filter((t) => byType[t]);
    const lanes = order.map((t) => {
      const label = I.TYPE[t].label;
      const totalMin = byType[t].reduce((a, x) => a + epDurMin(x), 0);
      const bars = byType[t].map((x) => {
        let a = dayMin(epStart(x));
        let b = dayMin(epEnd(x));
        if (b <= a) b = Math.min(24 * 60, a + 15);
        const left = (a / (24 * 60)) * 100;
        const width = Math.max(0.8, ((b - a) / (24 * 60)) * 100);
        const tip = `${label} ${epRangeText(x)} (${fmtDur(epDurMin(x))})`;
        return `<i class="ins-ov-bar t-${esc(t)}" style="left:${left}%;width:${width}%" title="${esc(tip)}"></i>`;
      }).join("");
      return `<div class="ins-ov-lane">
        <span class="ins-ov-label">${esc(label)}</span>
        <div class="ins-ov-track">${bars}</div>
        <span class="ins-ov-dur" title="이 유형 합산">${esc(fmtDur(totalMin))}</span>
      </div>`;
    }).join("");
    box.innerHTML = `
      <div class="ins-ov-lanes">${lanes}</div>
      <div class="ins-ov-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <div class="ins-ov-legend">${order.map((t) =>
        `<span class="t-${esc(t)}">${esc(I.TYPE[t].label)}</span>`).join("")}</div>`;
  }
  function renderHistory(events) {
    const box = document.getElementById("dr-hist-list");
    renderOverlap(events);
    if (!events.length) {
      box.innerHTML = `<li class="ins-hist-empty">이 기간에 기록된 알람이 없습니다.</li>`;
      return;
    }
    const sorted = events.slice().sort((a, b) => epStart(b) - epStart(a));
    box.innerHTML = sorted.map((x) => {
      const label = I.TYPE[x.type] ? I.TYPE[x.type].label : (x.title || "");
      return `<li class="ins-hist-item">
        <time>${esc(epRangeText(x))}</time>
        <span class="ins-hist-type">${esc(label)}</span>
        <span class="ins-hist-msg">${esc(statusText(x))}</span>
      </li>`;
    }).join("");
  }
  function openDetail(key) {
    const card = findCard(key);
    if (!card) return;
    selectedKey = key;
    const x = card.latest;
    const hist = eventsForUnit(key);
    const sub = I.subjectOf(V, x);
    const typeBits = card.types.map((t) => (I.TYPE[t] ? I.TYPE[t].label : t)).join(", ");
    document.getElementById("dr-where").textContent = sub.where;
    document.getElementById("dr-meta").textContent = sub.meta;
    document.getElementById("dr-type").textContent = typeBits;
    const typeN = card.types.length;
    document.getElementById("dr-msg").textContent =
      `이 기간 알람 ${hist.length}건 (유형 ${typeN}종). 상세는 아래 이력을 보세요.`;
    const run = (window.EHP_MOCK && window.EHP_MOCK.dayRunMin)
      ? window.EHP_MOCK.dayRunMin(V, { iu: x.iu || null, od: x.od || null })
      : null;
    document.getElementById("dr-facts").innerHTML = `
      <div class="ins-fact"><small>오늘 운전</small><b>${esc(run ? run.label : "-")}</b></div>
      <div class="ins-fact"><small>심야 운전</small><b>${esc(run ? run.nightLabel : "-")}</b></div>
      <div class="ins-fact"><small>최근 감지</small><b>${esc(`${V.hhmm(epEnd(x))} ${new Date(epEnd(x)).toLocaleDateString("ko-KR")}`)}</b></div>`;
    const href = floorHref(x);
    const drFloor = document.getElementById("dr-floor");
    if (href) {
      drFloor.hidden = false;
      drFloor.href = href;
      drFloor.textContent = "도면에서 보기";
    } else {
      drFloor.hidden = true;
    }
    const patSrc = hist.find((e) => e.type === "night") || x;
    renderPattern(patSrc);
    renderHistory(hist);
    const scrim = document.getElementById("ins-scrim");
    const drawer = document.getElementById("ins-drawer");
    scrim.hidden = false;
    drawer.hidden = false;
    requestAnimationFrame(() => {
      scrim.classList.add("on");
      drawer.classList.add("on");
    });
    update();
  }
  function closeDetail() {
    const scrim = document.getElementById("ins-scrim");
    const drawer = document.getElementById("ins-drawer");
    scrim.classList.remove("on");
    drawer.classList.remove("on");
    selectedKey = null;
    pinKey = null;
    setTimeout(() => {
      if (!drawer.classList.contains("on")) {
        scrim.hidden = true;
        drawer.hidden = true;
      }
    }, 280);
    update();
  }

  function formSnapshot() {
    const s = { ...I.loadSettings() };
    document.querySelectorAll("#ins-form [data-k]").forEach((el) => {
      s[el.dataset.k] = el.dataset.k === "nightMinMin" ? Number(el.value) : el.value;
    });
    return s;
  }

  function renderForm(s) {
    document.getElementById("ins-form").innerHTML = `
      <div class="ins-field"><label>하계방학 시작</label><input type="date" data-k="summerStart" value="${esc(s.summerStart)}"></div>
      <div class="ins-field"><label>하계방학 종료</label><input type="date" data-k="summerEnd" value="${esc(s.summerEnd)}"></div>
      <div class="ins-field"><label>동계방학 시작</label><input type="date" data-k="winterStart" value="${esc(s.winterStart)}"></div>
      <div class="ins-field"><label>동계방학 종료</label><input type="date" data-k="winterEnd" value="${esc(s.winterEnd)}"></div>
      <div class="ins-field"><label>심야 시작</label><input type="time" data-k="nightStart" value="${esc(s.nightStart)}"></div>
      <div class="ins-field"><label>심야 종료</label><input type="time" data-k="nightEnd" value="${esc(s.nightEnd)}"></div>
      <div class="ins-field"><label>심야 누적 기준(분)</label><input type="number" min="15" step="15" data-k="nightMinMin" value="${esc(s.nightMinMin)}"></div>`;
  }

  function update() {
    const key = cursorKey(period);
    const inPeriod = periodEvents();
    const live = I.activeByUnit(V);
    const cards = unitCards();
    document.getElementById("ins-range").textContent = labelKey(key, period);
    const badge = document.getElementById("ev-ins-badge");
    if (badge) {
      if (window.EhpMotion) window.EhpMotion.setNumber(badge, live.count);
      else badge.textContent = String(live.count);
    }

    const hi = inPeriod.filter((x) => x.sev === "중요").length;
    const night = inPeriod.filter((x) => x.type === "night").length;
    const byType = {};
    inPeriod.forEach((x) => { byType[x.type] = (byType[x.type] || 0) + 1; });
    const topType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0];
    const topLabel = topType ? I.TYPE[topType].label : "해당 없음";
    const topN = topType ? byType[topType] : 0;
    const rangeLabel = labelKey(key, period);
    const kpiRoot = document.getElementById("ins-kpis");
    if (!kpiRoot.dataset.ready) {
      kpiRoot.dataset.ready = "1";
      kpiRoot.innerHTML = `
        <div class="kpi"><div class="kpi-h"><small>이 기간 알람</small><span class="t-base" data-r1></span></div>
          <b class="ev-num"><span data-n="all"></span><em>건</em></b>
          <span class="ev-muted" data-sub1></span></div>
        <div class="kpi"><div class="kpi-h"><small>중요</small><span class="t-base" data-r2></span></div>
          <b class="ev-num"><span data-n="hi"></span><em>건</em></b>
          <span class="ev-muted">통신 끊김 등 우선 확인</span></div>
        <div class="kpi"><div class="kpi-h"><small>심야 연속 운전</small><span class="t-base" data-r3></span></div>
          <b class="ev-num"><span data-n="night"></span><em>건</em></b>
          <span class="ev-muted">당일 심야 구간 이력 기준</span></div>`;
    }
    kpiRoot.querySelectorAll("[data-r1], [data-r2], [data-r3]").forEach((el) => { el.textContent = rangeLabel; });
    const sub1 = kpiRoot.querySelector("[data-sub1]");
    if (sub1) {
      sub1.textContent = cards.length
        ? `기기 ${cards.length}대, 최다 ${topLabel} ${topN}건`
        : "해당 기간 알람 없음";
    }
    const M = window.EhpMotion;
    if (M) {
      M.setNumber(kpiRoot.querySelector('[data-n="all"]'), inPeriod.length);
      M.setNumber(kpiRoot.querySelector('[data-n="hi"]'), hi);
      M.setNumber(kpiRoot.querySelector('[data-n="night"]'), night);
    } else {
      kpiRoot.querySelector('[data-n="all"]').textContent = String(inPeriod.length);
      kpiRoot.querySelector('[data-n="hi"]').textContent = String(hi);
      kpiRoot.querySelector('[data-n="night"]').textContent = String(night);
    }

    const max = Math.max(1, ...Object.values(byType));
    const chart = document.getElementById("ins-chart");
    const types = Object.keys(I.TYPE);
    if (!chart.dataset.ready) {
      chart.dataset.ready = "1";
      chart.innerHTML = types.map((t) => `
        <div class="ins-barrow" data-t="${esc(t)}"><span>${esc(I.TYPE[t].label)}</span>
          <div class="bar"><i style="width:0"></i></div><span class="n ev-num" data-n="c"></span></div>`).join("");
    }
    types.forEach((t) => {
      const n = byType[t] || 0;
      const row = chart.querySelector(`[data-t="${CSS.escape(t)}"]`);
      if (!row) return;
      const bar = row.querySelector(".bar > i");
      if (bar) bar.style.width = `${(n / max) * 100}%`;
      if (M) M.setNumber(row.querySelector('[data-n="c"]'), n);
      else row.querySelector('[data-n="c"]').textContent = String(n);
    });

    document.getElementById("ins-list").innerHTML = cards.length ? cards.map((c) => {
      const x = c.latest;
      const sub = I.subjectOf(V, x);
      const typeLabels = c.types.map((t) => (I.TYPE[t] ? I.TYPE[t].label : t));
      const href = floorHref(x);
      const floors = I.floorsOfInsight(V, x).map((f) => V.FLOOR_LABEL[f] || f).join(", ");
      return `
      <article class="ins-item sev-${c.sev === "중요" ? "hi" : c.sev === "주의" ? "mid" : "lo"} ${selectedKey === c.key ? "on" : ""}" data-key="${esc(c.key)}">
        <div class="ins-item-top">
          <span class="ins-tags">
            <span class="ins-sev">${esc(c.sev)}</span>
            ${sub.kindLabel ? `<span class="ins-kind">${esc(sub.kindLabel)}</span>` : ""}
            ${floors ? `<span class="ins-floor-tag">${esc(floors)}</span>` : ""}
          </span>
          <time>최근 ${esc(V.hhmm(x.ts))}</time>
        </div>
        <h3 class="ins-where">${esc(sub.where)}</h3>
        <p class="ins-meta">${esc(sub.meta)}, 이 기간 ${c.events.length}건</p>
        <div class="ins-type">${esc(typeLabels.join(", "))}</div>
        <p>${esc(statusText(x))}</p>
        <div class="ins-item-f">
          <span class="ev-muted">클릭하면 패턴, 알람 이력</span>
          <span class="ins-links">
            ${href ? `<a class="ehp-chip" href="${esc(href)}" data-stop="1">도면에서 보기</a>` : `<span class="ev-muted">도면 미매핑</span>`}
          </span>
        </div>
      </article>`;
    }).join("") : `<div class="ins-empty ev-muted">이 조건에 해당하는 기기가 없습니다. 층, 유형, 날짜를 바꿔 보세요.</div>`;
  }

  renderDateNav();

  document.getElementById("ins-date").addEventListener("click", (e) => {
    const b = e.target.closest("[data-shift]");
    if (!b) return;
    shiftCursor(Number(b.dataset.shift));
    renderDateNav();
    update();
  });
  document.getElementById("ins-date").addEventListener("change", (e) => {
    if (e.target.id !== "ins-cursor") return;
    setCursorFromInput(e.target.value);
    renderDateNav();
    update();
  });
  document.getElementById("ins-type").addEventListener("change", (e) => { filterType = e.target.value; update(); });
  document.getElementById("ins-floor").addEventListener("change", (e) => { filterFloor = e.target.value; update(); });
  app.addEventListener("click", (e) => {
    if (e.target.closest("[data-stop]")) return;
    const card = e.target.closest(".ins-item[data-key]");
    if (card) openDetail(card.dataset.key);
  });
  document.getElementById("ins-scrim").addEventListener("click", closeDetail);
  document.getElementById("dr-close").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("ins-drawer").classList.contains("on")) closeDetail();
  });

  const modal = document.getElementById("ins-modal");
  document.getElementById("ins-gear").addEventListener("click", () => {
    renderForm(I.loadSettings());
    modal.hidden = false;
  });
  document.getElementById("ins-close").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById("ins-reset").addEventListener("click", () => renderForm(I.DEFAULTS));
  document.getElementById("ins-save").addEventListener("click", () => {
    const s = formSnapshot();
    I.saveSettings(s);
    modal.hidden = true;
    update();
  });

  V.useMockIfNoProvider();
  cursor = new Date(V.now().getTime());
  renderDateNav();
  V.renderTop("insight");
  V.on(update);
  V.start().then(() => {
    const iu = bootParams.get("iu");
    const od = bootParams.get("od");
    const focus = iu ? `iu:${iu}` : (od ? `od:${od}` : null);
    if (!focus) return;
    pinKey = focus;
    filterType = "all";
    filterFloor = "all";
    const typeEl = document.getElementById("ins-type");
    const floorEl = document.getElementById("ins-floor");
    if (typeEl) typeEl.value = "all";
    if (floorEl) floorEl.value = "all";
    update();
    if (findCard(focus)) openDetail(focus);
    else {
      // 오늘 이력에 없으면 핀만 두고 목록 갱신 (기기 없으면 그냥 둠)
      pinKey = focus;
      update();
    }
  });
})();
