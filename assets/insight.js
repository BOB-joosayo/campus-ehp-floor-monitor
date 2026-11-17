/* AI 인사이트 탭 */
(function () {
  "use strict";
  const V = window.EhpViz;
  const I = window.EhpInsight;
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let period = "day";
  let filterType = "all";
  let filterFloor = "all";
  let cursor = new Date();
  let selectedId = null;
  let patternPeriod = "day";
  const FLOOR_OPTS = ["RF", "6F", "5F", "4F", "3F", "2F", "1F", "B1", "B2"];
  const TIP = "알람을 누르면 해당 실내기 또는 실외기만 도면에서 선택됩니다. 층 필터로 해당 층만 볼 수 있습니다. 방학·심야 기준은 오른쪽 위 설정에서 바꿉니다.";

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="ins-wrap">
      <div class="ins-bar">
        <div class="ins-periods">
          <button type="button" data-p="day" class="on">일별</button>
          <button type="button" data-p="month">월별</button>
          <button type="button" data-p="year">연별</button>
        </div>
        <div class="ins-date" id="ins-date"></div>
        <div class="ins-filters">
          <select id="ins-type">
            <option value="all">유형 전체</option>
            <option value="night">심야 연속 운전</option>
            <option value="vacation">방학·휴일형 운전</option>
            <option value="season">계절과 모드 불일치</option>
            <option value="setpoint">설정온도 이상</option>
            <option value="power">전력 패턴 이상</option>
            <option value="comm">통신 끊김 장기화</option>
          </select>
          <select id="ins-floor" aria-label="층 필터">
            <option value="all">층 전체</option>
            ${FLOOR_OPTS.map((f) => `<option value="${f}">${esc(V.FLOOR_LABEL[f] || f)}</option>`).join("")}
          </select>
        </div>
        <button type="button" class="ins-tip" id="ins-tip" aria-label="안내" title="">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v6M12 7.5h.01"/></svg>
          <span class="ins-tip-bubble">${esc(TIP)}</span>
        </button>
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
        <p id="dr-msg" class="ev-muted" style="margin:0 0 14px;font-size:12.5px;line-height:1.45"></p>
        <div class="ins-facts" id="dr-facts"></div>
        <div class="ins-pat-bar">
          <div class="ev-h">운전 패턴</div>
          <div class="ins-pat-seg" id="dr-pat-seg">
            <button type="button" data-pp="day" class="on">일</button>
            <button type="button" data-pp="month">월</button>
            <button type="button" data-pp="year">연</button>
          </div>
        </div>
        <div id="dr-pattern"></div>
        <div class="ins-drawer-actions">
          <a class="ins-btn ghost" id="dr-floor" href="floor.html">도면에서 보기</a>
        </div>
      </div>
    </aside>
    <div class="ins-modal" id="ins-modal" hidden>
      <div class="ins-dialog ev-card">
        <div class="tc-h"><b>인사이트 설정</b><button type="button" class="tc-x" id="ins-close">×</button></div>
        <p class="tc-sub">방학 기간과 심야 구간. 고객·운영자가 직접 입력합니다. 기본값은 2026학년도 학사 일정입니다.</p>
        <div class="ins-form" id="ins-form"></div>
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
    if (period === "year") d.setFullYear(d.getFullYear() + dir);
    else if (period === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir);
    cursor = d;
  }
  function setCursorFromInput(val) {
    if (!val) return;
    if (period === "year") {
      const y = Number(val);
      if (!y) return;
      cursor = new Date(y, 0, 1);
    } else if (period === "month") {
      const [y, m] = val.split("-").map(Number);
      if (!y || !m) return;
      cursor = new Date(y, m - 1, 1);
    } else {
      const [y, m, d] = val.split("-").map(Number);
      if (!y || !m || !d) return;
      cursor = new Date(y, m - 1, d);
    }
  }
  function inputValue() {
    if (period === "year") return String(cursor.getFullYear());
    if (period === "month") return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    return I.ymd(cursor);
  }
  function renderDateNav() {
    const type = period === "year" ? "number" : period === "month" ? "month" : "date";
    const attrs = period === "year" ? `min="2020" max="2035" step="1"` : "";
    document.getElementById("ins-date").innerHTML = `
      <button type="button" data-shift="-1" aria-label="이전">‹</button>
      <input id="ins-cursor" type="${type}" value="${esc(inputValue())}" ${attrs}>
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
  function filtered() {
    const key = cursorKey(period);
    return I.allInsights(V).filter((x) => {
      if (periodKey(x.ts, period) !== key) return false;
      if (filterType !== "all" && x.type !== filterType) return false;
      if (filterFloor !== "all") {
        const floors = I.floorsOfInsight(V, x);
        if (!floors.includes(filterFloor)) return false;
      }
      return true;
    });
  }
  function floorHref(x) {
    if (x.iu && V.inByHoki[x.iu] && V.inByHoki[x.iu].floor) {
      const u = V.inByHoki[x.iu];
      return `floor.html?iu=${encodeURIComponent(x.iu)}&floor=${encodeURIComponent(u.floor)}`;
    }
    if (x.od && V.odByHoki[x.od]) return `floor.html?od=${encodeURIComponent(x.od)}`;
    return "";
  }
  function findInsight(id) {
    return I.allInsights(V).find((x) => x.id === id) || null;
  }
  function fmtDur(min) {
    if (min == null) return "-";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h <= 0) return `${m}분`;
    return `${h}시간 ${m}분`;
  }
  function renderPattern(x) {
    const pat = (window.EHP_MOCK && window.EHP_MOCK.runPattern)
      ? window.EHP_MOCK.runPattern(V, x, patternPeriod)
      : null;
    const box = document.getElementById("dr-pattern");
    if (!pat) {
      box.innerHTML = `<p class="ev-muted" style="margin:0">운전 이력 공급이 연결되면 여기에 표시됩니다.</p>`;
      return;
    }
    if (patternPeriod === "day") {
      const nightFrom = 0, nightTo = 6;
      // hours[i] = 그 시각 15분 슬롯 운전 개수(0~4). 칸은 높이로 부분 채움
      box.innerHTML = `
        <div class="ins-timeline">${pat.hours.map((q, i) => {
          const n = Math.max(0, Math.min(4, Number(q) || 0));
          const fill = n / 4;
          const tip = `${i}시 · 운전 ${n * 15}분 / 60분`;
          return `<i class="${n ? "on" : ""} ${i >= nightFrom && i < nightTo ? "night" : ""}" style="--fill:${fill}" title="${esc(tip)}"></i>`;
        }).join("")}</div>
        <div class="ins-axis"><span>00</span><span>06 심야</span><span>12</span><span>18</span><span>24</span></div>
        <p class="ev-muted" style="margin:0;font-size:12px;line-height:1.45">${esc(pat.caption)}</p>`;
      return;
    }
    const max = Math.max(1, ...pat.rows.map((r) => r.min));
    box.innerHTML = `
      <div class="ins-hours">${pat.rows.map((r) => `
        <div class="ins-hour-row"><span>${esc(r.label)}</span>
          <div class="bar"><i style="width:${(r.min / max) * 100}%"></i></div>
          <span class="ev-num">${fmtDur(r.min)}</span></div>`).join("")}</div>
      <p class="ev-muted" style="margin:12px 0 0;font-size:12px;line-height:1.45">${esc(pat.caption)}</p>`;
  }
  function openDetail(id) {
    const x = findInsight(id);
    if (!x) return;
    selectedId = id;
    patternPeriod = "day";
    const sub = I.subjectOf(V, x);
    const typeLabel = I.TYPE[x.type] ? I.TYPE[x.type].label : (x.title || "");
    document.getElementById("dr-where").textContent = sub.where;
    document.getElementById("dr-meta").textContent = sub.meta;
    document.getElementById("dr-type").textContent = typeLabel;
    document.getElementById("dr-msg").textContent = statusText(x);
    const since = x.since ? V.hhmm(x.since) : (x.sinceLabel || "-");
    const facts = [
      { k: "감지 시각", v: `${V.hhmm(x.ts)} · ${new Date(x.ts).toLocaleDateString("ko-KR")}` },
      { k: "이번 구간 시작", v: since },
      { k: "심야 누적 운전", v: x.nightRunMin != null ? fmtDur(x.nightRunMin) : (x.runMin != null ? fmtDur(x.runMin) : "-") },
      { k: "짧은 끊김", v: x.gapMin != null ? `${x.gapMin}분 이내 ${x.gapCount || 0}회` : "이력 기준" },
    ];
    document.getElementById("dr-facts").innerHTML = facts.map((f) =>
      `<div class="ins-fact"><small>${esc(f.k)}</small><b>${esc(f.v)}</b></div>`).join("");
    document.querySelectorAll("#dr-pat-seg button").forEach((b) => b.classList.toggle("on", b.dataset.pp === patternPeriod));
    const href = floorHref(x);
    const drFloor = document.getElementById("dr-floor");
    if (href) {
      drFloor.hidden = false;
      drFloor.href = href;
      drFloor.textContent = "도면에서 보기";
    } else {
      drFloor.hidden = true;
    }
    renderPattern(x);
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
    selectedId = null;
    setTimeout(() => {
      if (!drawer.classList.contains("on")) {
        scrim.hidden = true;
        drawer.hidden = true;
      }
    }, 280);
    update();
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
    const all = I.allInsights(V);
    const key = cursorKey(period);
    const inPeriod = all.filter((x) => periodKey(x.ts, period) === key);
    const live = I.activeByUnit(V);
    const list = filtered();
    document.getElementById("ins-range").textContent = labelKey(key, period);
    const badge = document.getElementById("ev-ins-badge");
    if (badge) badge.textContent = String(live.count);

    // 기간 필터와 같이 움직이는 KPI. "지금 감지 중"은 일·월·연과 무관해 제거
    const hi = inPeriod.filter((x) => x.sev === "중요").length;
    const night = inPeriod.filter((x) => x.type === "night").length;
    const byType = {};
    inPeriod.forEach((x) => { byType[x.type] = (byType[x.type] || 0) + 1; });
    const topType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0];
    const topLabel = topType ? I.TYPE[topType].label : "해당 없음";
    const topN = topType ? byType[topType] : 0;
    const rangeLabel = labelKey(key, period);
    document.getElementById("ins-kpis").innerHTML = `
      <div class="kpi"><div class="kpi-h"><small>이 기간 알람</small><span class="t-base">${esc(rangeLabel)}</span></div>
        <b class="ev-num">${inPeriod.length}<em>건</em></b>
        <span class="ev-muted">${topN ? `최다 ${esc(topLabel)} ${topN}건` : "해당 기간 알람 없음"}</span></div>
      <div class="kpi"><div class="kpi-h"><small>중요</small><span class="t-base">${esc(rangeLabel)}</span></div>
        <b class="ev-num">${hi}<em>건</em></b>
        <span class="ev-muted">통신 끊김 등 우선 확인</span></div>
      <div class="kpi"><div class="kpi-h"><small>심야 연속 운전</small><span class="t-base">${esc(rangeLabel)}</span></div>
        <b class="ev-num">${night}<em>건</em></b>
        <span class="ev-muted">설정한 심야 구간 기준</span></div>`;

    const max = Math.max(1, ...Object.values(byType));
    document.getElementById("ins-chart").innerHTML = Object.keys(I.TYPE).map((t) => {
      const n = byType[t] || 0;
      return `<div class="ins-barrow"><span>${esc(I.TYPE[t].label)}</span>
        <div class="bar"><i style="width:${(n / max) * 100}%"></i></div><span class="n ev-num">${n}</span></div>`;
    }).join("");

    document.getElementById("ins-list").innerHTML = list.length ? list.map((x) => {
      const sub = I.subjectOf(V, x);
      const typeLabel = I.TYPE[x.type] ? I.TYPE[x.type].label : (x.title || "");
      const sinceBit = x.sinceLabel || (x.since ? `${V.hhmm(x.since)}부터` : "");
      const href = floorHref(x);
      const floors = I.floorsOfInsight(V, x).map((f) => V.FLOOR_LABEL[f] || f).join(", ");
      return `
      <article class="ins-item sev-${x.sev === "중요" ? "hi" : x.sev === "주의" ? "mid" : "lo"} ${selectedId === x.id ? "on" : ""}" data-id="${esc(x.id)}">
        <div class="ins-item-top">
          <span class="ins-tags">
            <span class="ins-sev">${esc(x.sev)}</span>
            ${sub.kindLabel ? `<span class="ins-kind">${esc(sub.kindLabel)}</span>` : ""}
            ${floors ? `<span class="ins-floor-tag">${esc(floors)}</span>` : ""}
          </span>
          <time>${esc(V.hhmm(x.ts))} · ${esc(new Date(x.ts).toLocaleDateString("ko-KR"))}</time>
        </div>
        <h3 class="ins-where">${esc(sub.where)}</h3>
        <p class="ins-meta">${esc(sub.meta)}${sinceBit ? ` · ${esc(sinceBit)}` : ""}</p>
        <div class="ins-type">${esc(typeLabel)}</div>
        <p>${esc(statusText(x))}</p>
        <div class="ins-item-f">
          <span class="ev-muted">클릭하면 운전 패턴</span>
          <span class="ins-links">
            ${href ? `<a href="${esc(href)}" data-stop="1">도면에서 보기</a>` : `<span class="ev-muted">도면 미매핑</span>`}
          </span>
        </div>
      </article>`;
    }).join("") : `<div class="ins-empty ev-muted">이 조건에 해당하는 인사이트가 없습니다. 층·유형·날짜를 바꿔 보세요.</div>`;
  }

  renderDateNav();

  app.querySelector(".ins-periods").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    period = b.dataset.p;
    app.querySelectorAll(".ins-periods button").forEach((x) => x.classList.toggle("on", x === b));
    renderDateNav();
    update();
  });
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
    const card = e.target.closest(".ins-item[data-id]");
    if (card) openDetail(card.dataset.id);
  });
  document.getElementById("ins-scrim").addEventListener("click", closeDetail);
  document.getElementById("dr-close").addEventListener("click", closeDetail);
  document.getElementById("dr-pat-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pp]");
    if (!b || !selectedId) return;
    patternPeriod = b.dataset.pp;
    document.querySelectorAll("#dr-pat-seg button").forEach((x) => x.classList.toggle("on", x === b));
    const x = findInsight(selectedId);
    if (x) renderPattern(x);
  });
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
    const s = I.loadSettings();
    document.querySelectorAll("#ins-form [data-k]").forEach((el) => {
      s[el.dataset.k] = el.dataset.k === "nightMinMin" ? Number(el.value) : el.value;
    });
    I.saveSettings(s);
    modal.hidden = true;
    update();
  });

  V.useMockIfNoProvider();
  cursor = new Date(V.now().getTime());
  renderDateNav();
  V.renderTop("insight");
  V.on(update);
  V.start();
})();
