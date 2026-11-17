/* 층별 도면 탭. 도면을 화면 전체에 넣고, 호실명과 설비 정보는 꼬리표로 보여준다 */
(function () {
  "use strict";
  const V = window.EhpViz;
  const MAP = V.MAP;
  const FL = window.EHP_FLOORS;
  const ORDER = ["RF", "6F", "5F", "4F", "3F", "2F", "1F", "B1", "B2"];
  const SHORT = { RF: "옥상", "6F": "6층", "5F": "5층", "4F": "4층", "3F": "3층", "2F": "2층", "1F": "1층", B1: "B1", B2: "B2" };
  const PAD = { l: 112, t: 52, r: 16, b: 36 }; // 도면 위에 띄운 층 선택, 요약, 범례 자리 (px)
  const SEL_SCALE = 1.9;                       // 선택한 아이콘 확대 배율
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ctx = document.createElement("canvas").getContext("2d");
  const textW = (t, font) => { ctx.font = font; return ctx.measureText(t).width; };
  const F_NAME = '600 11.5px "Malgun Gothic", sans-serif';
  const F_NO = '600 9.5px "Malgun Gothic", sans-serif';

  const params = new URLSearchParams(location.search);
  let floor = FL[params.get("floor")] ? params.get("floor") : "3F";
  let selected = null; // { kind: "iu" | "od", hoki } 꼬리표 카드. 빈 곳을 눌러도 유지, × 로 닫음
  let hl = null;       // { od, units: Set } 실외기 소속 강조
  let k = 0.1;         // 도면 1단위(10 mm)당 화면 px
  let vb = { x: 0, y: 0 };

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="fl-wrap">
      <div class="fl-main" id="plan">
        <svg id="svg" preserveAspectRatio="xMinYMin meet">
          <defs><pattern id="ev-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#18181c"/><rect width="1.6" height="4" fill="#4a4a52"/></pattern></defs>
          <g id="g-fp"></g><g id="g-lead"></g><g id="g-od"></g><g id="g-iu"></g><g id="g-tags"></g><g id="g-sel"></g>
        </svg>
        <div class="fl-floors" id="floors"></div>
        <div class="fl-sum" id="sum"></div>
        <div class="fl-legend ev-legend">
          <span class="st-heat"><i></i>난방</span><span class="st-cool"><i></i>냉방</span><span class="st-fan"><i></i>송풍</span>
          <span class="st-dry"><i></i>제습</span><span class="st-auto"><i></i>자동</span><span class="st-off"><i></i>정지</span>
          <span><i class="hatch"></i>통신 없음</span>
        </div>
        <div class="tagcard" id="card"></div>
        <div class="hovertag" id="hovertag"></div>
      </div>
    </div>`;

  const svg = document.getElementById("svg");
  const plan = document.getElementById("plan");
  const card = document.getElementById("card");
  const g = (id) => document.getElementById(id);

  const toSvg = (F, x, y) => [(x - F.ox) / F.scale, (F.oy - y) / F.scale];
  const toPx = (X, Y) => [(X - vb.x) * k, (Y - vb.y) * k];
  // 해당 층 실내기는 전부 그린다. 실외기 미연결은 카드에서만 "연결된 실외기 없음"으로 표시
  const floorUnits = (f) => MAP.indoor.filter((u) => u.floor === f);
  const floorOfOd = (h) => {
    for (const f of ORDER) if (FL[f] && FL[f].od && FL[f].od[h]) return f;
    return null;
  };
  function selectUnit(kind, hoki) {
    hl = null;
    selected = { kind, hoki: String(hoki) };
    const target = kind === "iu"
      ? (V.inByHoki[selected.hoki] && V.inByHoki[selected.hoki].floor)
      : floorOfOd(selected.hoki);
    if (target && target !== floor) goFloor(target);
    else update();
  }
  const iuPos = (u) => toSvg(FL[u.floor], u.x, u.y);
  const odPos = (h) => FL[floor].od[h] ? [FL[floor].od[h].x, FL[floor].od[h].y] : null;

  // ---------- 층 그리기 ----------
  function fit() {
    const F = FL[floor];
    const cw = plan.clientWidth, ch = plan.clientHeight;
    let box = { x0: 0, y0: 0, x1: F.w, y1: F.h };
    if (floor === "RF") {
      const ps = Object.values(F.od);
      box = { x0: Math.min(...ps.map((p) => p.x)) - 500, x1: Math.max(...ps.map((p) => p.x)) + 500,
              y0: Math.min(...ps.map((p) => p.y)) - 600, y1: Math.max(...ps.map((p) => p.y)) + 500 };
    }
    const aw = cw - PAD.l - PAD.r, ah = ch - PAD.t - PAD.b;
    k = Math.min(aw / (box.x1 - box.x0), ah / (box.y1 - box.y0));
    const ex = (aw - (box.x1 - box.x0) * k) / 2, ey = (ah - (box.y1 - box.y0) * k) / 2;
    vb = { x: box.x0 - (PAD.l + ex) / k, y: box.y0 - (PAD.t + ey) / k };
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${cw / k} ${ch / k}`);
  }

  function drawFloor() {
    const F = FL[floor];
    fit();
    g("g-fp").innerHTML = F.svg;
    const s = (1 / k).toFixed(4);
    g("g-iu").innerHTML = floorUnits(floor).map((u) => {
      const [x, y] = iuPos(u);
      return `<g class="iu" data-h="${u.hoki}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})"><g class="gl">${V.iuGlyph()}<circle class="ins-dot" cx="14.5" cy="-11.5" r="2.1" display="none"/></g><title></title></g>`;
    }).join("");
    const so = (floor === "RF" ? 1.3 : 0.9) / k;
    g("g-od").innerHTML = Object.entries(F.od).map(([h, p]) =>
      `<g class="od-mk" data-h="${h}" transform="translate(${p.x} ${p.y}) scale(${so.toFixed(4)})"><g class="gl">${V.odGlyph()}<circle class="ins-dot" cx="13.5" cy="-12" r="2.1" display="none"/></g>` +
      `<g class="od-tag"><rect x="-15" y="15.5" width="30" height="11" rx="5.5"/><text y="23.6">EHP-${Number(h)}</text></g><title></title></g>`).join("");
    drawTags();
    update();
  }

  // ---------- 호실명 꼬리표 ----------
  // 호실마다 둥근 꼬리표 하나. 아이콘, 다른 꼬리표와 겹치면 위아래로 비켜 놓고 가는 선으로 호실에 잇는다.
  function drawTags() {
    const F = FL[floor];
    const cw = plan.clientWidth, ch = plan.clientHeight;
    const items = F.labels.map((l) => ({ no: l.no, name: l.lines[0] || "", sub: l.lines.slice(1).join(" "), X: l.x, Y: l.y }));
    const groups = {};
    floorUnits(floor).forEach((u) => (groups[u.roomKey] = groups[u.roomKey] || []).push(u));
    Object.values(groups).forEach((us) => {
      const u0 = us[0];
      if (u0.roomNo && F.roomNos.includes(u0.roomNo)) return;
      if (!u0.roomNo && F.roomNames.includes(u0.roomName)) return;
      const pts = us.map(iuPos);
      items.push({ no: u0.roomNo, name: u0.roomName, sub: "", X: pts.reduce((a, p) => a + p[0], 0) / pts.length,
                   Y: pts.reduce((a, p) => a + p[1], 0) / pts.length, app: true });
    });
    const tags = items.filter((t) => t.name || t.no);

    // 화면 px에서 자리 잡기
    const boxes = [];
    floorUnits(floor).forEach((u) => { const [x, y] = toPx(...iuPos(u)); boxes.push([x - 15, y - 12, x + 15, y + 14]); });
    Object.values(F.od).forEach((p) => { const [x, y] = toPx(p.x, p.y); const r = floor === "RF" ? 1.3 : 0.9; boxes.push([x - 17 * r, y - 14 * r, x + 17 * r, y + 27 * r]); });
    const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const offs = [];
    [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].forEach((i) => [0, 26, -26, 52, -52, 80, -80].forEach((dx) => offs.push([dx, i * 19])));
    tags.sort((a, b) => a.Y - b.Y || a.X - b.X);

    let tagSvg = "", leadSvg = "";
    tags.forEach((t) => {
      const wNo = t.no ? textW(t.no, F_NO) + 5 : 0;
      const wName = t.name ? textW(t.name, F_NAME) : 0;
      const w = Math.ceil(wNo + wName + 14), h = 18;
      const [ax, ay] = toPx(t.X, t.Y);
      let pos = null;
      for (const [dx, dy] of offs) {
        const cx = ax + dx, cy = ay + dy;
        const b = [cx - w / 2 - 2, cy - h / 2 - 2, cx + w / 2 + 2, cy + h / 2 + 2];
        if (b[0] < PAD.l - 4 || b[2] > cw - 6 || b[1] < PAD.t - 6 || b[3] > ch - 6) continue;
        if (!hit(b)) { pos = [cx, cy]; boxes.push(b); break; }
      }
      if (!pos) { pos = [ax, ay]; boxes.push([ax - w / 2, ay - h / 2, ax + w / 2, ay + h / 2]); }
      const X = vb.x + pos[0] / k, Y = vb.y + pos[1] / k, s = (1 / k).toFixed(4);
      const moved = Math.hypot(pos[0] - ax, pos[1] - ay) > 12;
      if (moved) {
        const ey = pos[1] > ay ? pos[1] - h / 2 : pos[1] + h / 2;
        leadSvg += `<line x1="${t.X.toFixed(1)}" y1="${t.Y.toFixed(1)}" x2="${X.toFixed(1)}" y2="${(vb.y + ey / k).toFixed(1)}"/>` +
          `<circle cx="${t.X.toFixed(1)}" cy="${t.Y.toFixed(1)}" r="${(1.8 / k).toFixed(1)}"/>`;
      }
      tagSvg += `<g class="tag${t.app ? " app" : ""}" transform="translate(${X.toFixed(1)} ${Y.toFixed(1)}) scale(${s})">` +
        `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5"/>` +
        (t.no ? `<text class="tag-no" x="${-w / 2 + 7}" y="3.4">${esc(t.no)}</text>` : "") +
        (t.name ? `<text class="tag-name" x="${-w / 2 + 7 + wNo}" y="4">${esc(t.name)}</text>` : "") +
        (t.sub ? `<title>${esc([t.no, t.name, t.sub].filter(Boolean).join(" "))}</title>` : "") + `</g>`;
    });
    g("g-tags").innerHTML = tagSvg;
    g("g-lead").innerHTML = leadSvg;
  }

  // ---------- 선택, 강조 ----------
  function goFloor(f) {
    if (f && f !== floor) {
      floor = f;
      if (selected && !onFloor(selected)) selected = null;
      drawFloor();
    }
  }
  function onFloor(sel) {
    return sel.kind === "iu" ? V.inByHoki[sel.hoki].floor === floor : !!FL[floor].od[sel.hoki];
  }
  function highlightOd(h) {
    if (hl && hl.od === h) { hl = null; update(); return; }
    const o = V.odByHoki[h];
    hl = { od: h, units: new Set(o.indoor) };
    const floors = [...new Set(o.indoor.map((x) => V.inByHoki[x].floor))];
    if (!floors.includes(floor) && !FL[floor].od[h] && floors.length) goFloor(floors[0]);
    update();
  }
  svg.addEventListener("click", (e) => {
    const iu = e.target.closest(".iu");
    const od = e.target.closest(".od-mk");
    if (iu) { hl = null; selected = { kind: "iu", hoki: iu.dataset.h }; }
    else if (od) { hl = null; selected = { kind: "od", hoki: od.dataset.h }; }
    else return; // 빈 곳을 눌러도 선택은 그대로 둔다
    update();
  });
  // 마우스를 올리면 아이콘을 키우고 이름 꼬리표를 크게 띄운다 (누르기 전에 무엇인지 알 수 있게)
  const hovertag = g("hovertag");
  let hoverEl = null;
  function showHover(el) {
    if (hoverEl === el) return;
    hideHover();
    hoverEl = el;
    el.classList.add("hover");
    if (el.parentNode.lastElementChild !== el) el.parentNode.appendChild(el);
    const isIu = el.classList.contains("iu");
    let name, sub, pos, k2;
    if (isIu) {
      const u = V.inByHoki[el.dataset.h], s = V.indoorState(u);
      const room = V.roomText(u);
      const roomPart = room && !u.label.replace(/\s/g, "").includes(room.replace(/\s/g, "")) ? `${room}  ` : (u.roomNo && !u.label.includes(u.roomNo) ? `${u.roomNo}  ` : "");
      name = u.label; sub = `${V.FLOOR_LABEL[u.floor]}  ${roomPart}${s.label}${s.room !== null ? `  실내 ${V.fmt(s.room)}℃` : ""}`;
      pos = iuPos(u); k2 = s.key;
    } else {
      const o = V.odByHoki[el.dataset.h], s = V.outdoorState(o);
      name = o.label; sub = `${s.running ? `운전 ${s.modeLabel}` : s.label}  전력사용량 ${V.fmt(s.e15, 2)} kWh`;
      pos = odPos(o.hoki); k2 = s.key === "run" ? s.modeKey : s.key;
    }
    hovertag.className = `hovertag show st-${k2}`;
    hovertag.innerHTML = `<b>${esc(name)}</b><span>${esc(sub)}</span>`;
    const [px, py] = toPx(pos[0], pos[1]);
    const w = hovertag.offsetWidth, h = hovertag.offsetHeight;
    const lift = (isIu ? 14 : 20) * 2.1 + 8;
    let top = py - lift - h, below = false;
    if (top < 8) { top = py + lift - 4; below = true; }
    hovertag.style.left = `${Math.max(8, Math.min(plan.clientWidth - w - 8, px - w / 2))}px`;
    hovertag.style.top = `${top}px`;
    hovertag.classList.toggle("below", below);
    hovertag.style.setProperty("--ax", `${px - Math.max(8, Math.min(plan.clientWidth - w - 8, px - w / 2))}px`);
  }
  function hideHover() {
    if (hoverEl) hoverEl.classList.remove("hover");
    hoverEl = null;
    hovertag.className = "hovertag";
  }
  svg.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".iu, .od-mk");
    if (el) showHover(el); else hideHover();
  });
  svg.addEventListener("mouseleave", hideHover);

  card.addEventListener("click", (e) => {
    if (e.target.closest(".tc-x")) { selected = null; hl = null; update(); return; }
    const l = e.target.closest("[data-od]");
    if (l) highlightOd(l.dataset.od);
  });
  g("floors").addEventListener("click", (e) => {
    const b = e.target.closest(".fl-btn");
    if (!b) return;
    if (!(hl && (b.classList.contains("served") || b.classList.contains("src")))) hl = null;
    if (b.dataset.f === floor) update(); else goFloor(b.dataset.f);
  });
  let rt = null;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawFloor, 120); });

  // ---------- 갱신 ----------
  // 실외기 소속 강조 중이면 층 선택 옆에 실외기 층에서 실내기 층까지 흐르는 관을 그린다
  const floorsBox = g("floors");
  floorsBox.innerHTML = `<div class="fl-pipe" id="pipe"></div><div id="flbtns"></div>`;
  function renderFloors(marks) {
    let served = {}, src = null, pipeCls = "";
    if (hl) {
      const o = V.odByHoki[hl.od], s = V.outdoorState(o);
      src = FL.RF.od[hl.od] ? "RF" : "1F";
      o.indoor.forEach((h) => { const f = V.inByHoki[h].floor; served[f] = (served[f] || 0) + 1; });
      const k2 = s.key === "run" ? s.modeKey : s.key;
      pipeCls = `st-${k2}${s.running ? " run" : ""}`;
      floorsBox.style.setProperty("--pc", ["heat", "cool", "fan", "dry", "auto"].includes(k2) ? `var(--${k2})` : k2 === "on" ? "var(--fan)" : "var(--off)");
    }
    g("flbtns").innerHTML = ORDER.map((f) => {
      let on, total;
      if (f === "RF") {
        const ods = Object.keys(FL.RF.od);
        on = ods.filter((h) => V.outdoorState(V.odByHoki[h]).running).length; total = ods.length;
      } else {
        const us = floorUnits(f);
        on = us.filter((u) => V.indoorState(u).running).length; total = us.length;
      }
      const cls = ["fl-btn"];
      if (f === floor) cls.push("on");
      if (served[f]) cls.push("served");
      if (f === src) cls.push("src");
      if (marks && marks.floor[f]) cls.push("has-ins");
      return `<button class="${cls.join(" ")}" data-f="${f}" title="${V.FLOOR_LABEL[f]}">
        <b>${SHORT[f]}</b><small>${on}/${total}</small><i style="width:${total ? (on / total) * 100 : 0}%"></i>
        ${served[f] ? `<em class="cnt">${served[f]}대</em>` : ""}${f === src ? `<em class="cnt src">EHP-${Number(hl.od)}</em>` : ""}</button>`;
    }).join("");
    const pipe = g("pipe");
    if (!hl) { pipe.className = "fl-pipe"; return; }
    const mid = (f) => { const b = floorsBox.querySelector(`.fl-btn[data-f="${f}"]`); return b.offsetTop + b.offsetHeight / 2; };
    const ys = [src, ...Object.keys(served)].map(mid);
    const srcY = mid(src), top = Math.min(...ys), bottom = Math.max(...ys);
    pipe.className = `fl-pipe show ${pipeCls} ${srcY <= top ? "down" : srcY >= bottom ? "up" : "both"}`;
    pipe.style.top = `${top}px`;
    pipe.style.height = `${Math.max(4, bottom - top)}px`;
  }

  function update() {
    const marks = window.EhpInsight ? window.EhpInsight.activeByUnit(V) : { iu: {}, od: {}, floor: {}, list: [] };
    renderFloors(marks);

    const sum = g("sum");
    if (floor === "RF") {
      const ods = Object.keys(FL.RF.od).map((h) => V.outdoorState(V.odByHoki[h]));
      sum.innerHTML = `<b class="fl-name">옥상</b>
        <span><em>실외기 운전</em><b class="ev-num">${ods.filter((s) => s.running).length}</b><span class="ev-muted">/${ods.length}</span></span>
        <span><em>전력사용량(15분)</em><b class="ev-num">${V.fmt(ods.reduce((a, s) => a + (s.e15 || 0), 0), 2)}</b><span class="ev-muted"> kWh</span></span>`;
    } else {
      const ss = floorUnits(floor).map((u) => V.indoorState(u));
      const temps = ss.map((s) => s.room).filter((v) => v !== null);
      const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      const comm = ss.filter((s) => s.key === "comm").length;
      sum.innerHTML = `<b class="fl-name">${V.FLOOR_LABEL[floor]}</b>
        <span><em>운전</em><b class="ev-num">${ss.filter((s) => s.running).length}</b><span class="ev-muted">/${ss.length}</span></span>
        <span><em>난방</em><b class="ev-num" style="color:var(--heat)">${ss.filter((s) => s.key === "heat").length}</b></span>
        <span><em>냉방</em><b class="ev-num" style="color:var(--cool)">${ss.filter((s) => s.key === "cool").length}</b></span>
        <span><em>평균 실내</em><b class="ev-num">${V.fmt(avg)}</b><span class="ev-muted">℃</span></span>
        ${comm ? `<span><em>통신 없음</em><b class="ev-num">${comm}</b></span>` : ""}`;
    }

    // 실내기
    g("g-iu").querySelectorAll(".iu").forEach((el) => {
      const u = V.inByHoki[el.dataset.h];
      const s = V.indoorState(u);
      const cls = ["iu", `st-${s.key}`];
      if (s.running) cls.push("on");
      const isSel = selected && selected.kind === "iu" && selected.hoki === u.hoki;
      if (isSel) cls.push("sel");
      if (hl && hl.units.has(u.hoki)) cls.push("hl");
      if (el === hoverEl) cls.push("hover");
      if (marks.iu[u.hoki]) cls.push("has-ins");
      el.setAttribute("class", cls.join(" "));
      el.style.setProperty("--flow", `${(V.FAN_SEC[s.fan] || 1.6) * 0.9}s`);
      el.querySelector("title").textContent = `${u.label}  ${s.label}`;
      const dot = el.querySelector(".ins-dot");
      if (dot) dot.setAttribute("display", marks.iu[u.hoki] ? "inline" : "none");
      if (isSel && el.parentNode.lastElementChild !== el) el.parentNode.appendChild(el); // 맨 위로
    });
    // 실외기
    g("g-od").querySelectorAll(".od-mk").forEach((el) => {
      const o = V.odByHoki[el.dataset.h];
      const s = V.outdoorState(o);
      const cls = ["od-mk", `st-${s.key === "run" ? s.modeKey : s.key}`];
      if (s.running) cls.push("on");
      const isSel = selected && selected.kind === "od" && selected.hoki === o.hoki;
      if (isSel) cls.push("sel");
      if (hl && hl.od === o.hoki) cls.push("hl");
      if (el === hoverEl) cls.push("hover");
      if (marks.od[o.hoki]) cls.push("has-ins");
      el.setAttribute("class", cls.join(" "));
      el.style.setProperty("--spin", `${s.kw ? Math.max(0.45, 1.6 - s.kw / 20) : 1.6}s`);
      el.querySelector("title").textContent = `${o.label}  ${s.label}`;
      const dot = el.querySelector(".ins-dot");
      if (dot) dot.setAttribute("display", marks.od[o.hoki] ? "inline" : "none");
    });
    svg.classList.toggle("dim", !!hl);
    renderCard(marks);
  }

  // ---------- 정보 꼬리표 카드 ----------
  function renderCard(marks) {
    if (!selected || !onFloor(selected)) { card.classList.remove("show"); g("g-sel").innerHTML = ""; return; }
    let html, pos, k2;
    const tip = (kind, h) => {
      if (!marks) return "";
      const n = kind === "iu" ? marks.iu[h] : marks.od[h];
      if (!n) return "";
      return `<div class="tc-ins"><span>인사이트 ${n}건</span><a href="insight.html">목록에서 보기</a></div>`;
    };
    if (selected.kind === "iu") {
      const u = V.inByHoki[selected.hoki];
      const s = V.indoorState(u);
      const o = u.od ? V.odByHoki[u.od] : null;
      k2 = s.key;
      pos = iuPos(u);
      const diff = s.room !== null && s.set !== null ? s.room - s.set : null;
      html = `<div class="tc-h"><b>${esc(V.roomText(u) || u.label)}</b><button class="tc-x" title="닫기">×</button></div>
        <div class="tc-sub">${V.FLOOR_LABEL[u.floor]} · ${esc(u.label)}${o ? ` · ${esc(o.label)}` : ""}</div>
        <div class="tc-state"><span class="chip st-${s.key}">${s.label}</span></div>
        <div class="tc-big">
          <div><small>실내온도</small><b class="ev-num">${V.fmt(s.room)}</b><span>℃</span></div>
          <div><small>설정온도</small><b class="ev-num">${V.fmt(s.set)}</b><span>℃</span></div>
        </div>
        <div class="tc-row"><span>운전</span><span>${s.onoff === 1 ? "운전" : s.onoff === 0 ? "정지" : "-"}</span></div>
        <div class="tc-row"><span>운전모드</span><span>${V.MODE[s.mode] ? V.MODE[s.mode].label : "-"}</span></div>
        <div class="tc-row"><span>풍량</span><span>${V.FAN[s.fan] || "-"}</span></div>
        <div class="tc-row"><span>실내와 설정 차이</span><span class="ev-num">${diff === null ? "-" : (diff > 0 ? "+" : "") + V.fmt(diff) + " ℃"}</span></div>
        <div class="tc-row"><span>연결 실외기</span>${o
          ? `<a class="tc-link ${hl && hl.od === o.hoki ? "on" : ""}" data-od="${o.hoki}">${esc(o.label)}</a>`
          : "<span class=\"ev-muted\">연결된 실외기 없음</span>"}</div>
        ${tip("iu", u.hoki)}
        <div class="tc-foot">${V.hhmm(s.ts)} 기준</div>`;
    } else {
      const o = V.odByHoki[selected.hoki];
      const s = V.outdoorState(o);
      k2 = s.key === "run" ? s.modeKey : s.key;
      pos = odPos(o.hoki);
      html = `<div class="tc-h"><b>${esc(o.label)}</b><button class="tc-x" title="닫기">×</button></div>
        <div class="tc-sub">실외기, ${esc(o.panel || "")}</div>
        <div class="tc-state"><span class="chip st-${k2}">${s.label}${s.running && s.modeLabel ? " " + s.modeLabel : ""}</span></div>
        <div class="tc-big">
          <div class="wide"><small>전력사용량</small><b class="ev-num">${V.fmt(s.e15, 2)}</b><span>kWh</span></div>
          <div><small>현재 전력</small><b class="ev-num">${V.fmt(s.kw, 2)}</b><span>kW</span></div>
          <div><small>부하율</small><b class="ev-num">${s.load === null ? "-" : V.fmt(s.load)}</b><span>%</span></div>
        </div>
        <div class="tc-row"><span>운전모드</span><span>${s.modeLabel || "-"}</span></div>
        <div class="tc-row"><span>연결 실내기</span><span class="ev-num">운전 ${s.inOn} / ${s.inTotal}</span></div>
        <a class="tc-btn ${hl && hl.od === o.hoki ? "on" : ""}" data-od="${o.hoki}">${hl && hl.od === o.hoki ? "강조 해제" : "연결 실내기 보기"}</a>
        ${tip("od", o.hoki)}
        <div class="tc-foot">${V.hhmm(s.ts)} 기준</div>`;
    }
    card.className = `tagcard show st-${k2}`;
    card.innerHTML = html;
    // 아이콘 오른쪽에 붙이고, 자리가 없으면 왼쪽. 팝오버는 트리거 쪽에서 스케일 인
    const [px, py] = toPx(pos[0], pos[1]);
    const cw = plan.clientWidth, ch = plan.clientHeight, w = card.offsetWidth || 304, h = card.offsetHeight || 280;
    const gap = 44;
    const right = px + gap + w < cw - 8;
    const left = right ? px + gap : px - gap - w;
    const top = Math.max(8, Math.min(ch - h - 8, py - 34));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.classList.toggle("to-left", !right);
    card.style.setProperty("--arrow", `${Math.max(14, Math.min(h - 14, py - top))}px`);
    card.style.setProperty("--origin-x", right ? "0%" : "100%");
    card.style.setProperty("--origin-y", `${Math.max(8, Math.min(92, ((py - top) / Math.max(h, 1)) * 100))}%`);
    // 아이콘과 카드를 잇는 선
    const ax = vb.x + (right ? px + 15 * SEL_SCALE * 0.6 : px - 15 * SEL_SCALE * 0.6) / k;
    const bx = vb.x + (right ? left : left + w) / k;
    g("g-sel").innerHTML = `<line class="tc-lead st-${k2}" x1="${ax}" y1="${pos[1]}" x2="${bx}" y2="${pos[1]}"/>`;
  }

  // ---------- 시작 ----------
  V.useMockIfNoProvider();
  V.renderTop("floor");
  V.on(() => update());
  requestAnimationFrame(() => {
    drawFloor();
    V.start().then(() => {
      const iu = params.get("iu");
      const od = params.get("od");
      // 인사이트/실외기에서 넘어오면 해당 기기만 선택 (소속 전체 흐름 강조는 하지 않음)
      if (iu && V.inByHoki[iu]) selectUnit("iu", iu);
      else if (od && V.odByHoki[od]) selectUnit("od", od);
    });
  });
})();
