/* 실데이터 공급 함수 (개발자가 DB 연결에 맞게 채우는 곳).

   화면은 이 함수가 돌려주는 값만 쓴다. 포인트 ID는 화면 코드에 박혀 있지 않고 전부 data/point-map.js에
   설비일괄등록의 10자리 가상포인트 ID로 들어 있다 (실내기 1,480 + 실외기 286 = 1,766개).

   입력: EhpViz.allPointIds()  화면이 읽는 10자리 포인트 ID 목록
         EhpViz.dayPointIds()  하루 누적도 같이 받아야 하는 포인트 (실외기 전력사용량 15분 HABAZ040, 26개)
   출력: { "HAHIA00701": { v: 1, ts: 1793600100000 }, "HABAZ04001": { v: 0.62, ts: ..., day: 18.4 }, ... }
         v   = 그 포인트의 최신값 (일괄등록 '화면 단위' 기준: ON/OFF 0/1, 모드 1~5, ℃, kW, kWh, %)
         ts  = 그 값의 수집 시각 (epoch ms). 30분(EhpViz.config.staleMin)보다 오래되면 화면은 통신 없음으로 그린다
         day = dayPointIds 포인트에만 넣는다. 오늘 00:00부터 지금까지 그 포인트 값의 합 (kWh)
         값이 없는 포인트는 빼고 돌려주면 된다 (통신 없음으로 그린다)

   HTML에서 ehp-viz.js 다음, 화면 스크립트(floor.js, outdoor.js) 앞에 넣고 data/mock-scenarios.js 줄은 지운다.
   아래 fetch 주소는 예시다. 내부 DB의 최신값을 포인트 ID로 조회해 주는 백엔드 주소로 바꾼다. */
(function () {
  "use strict";
  const V = window.EhpViz;
  V.setProvider(async () => {
    const res = await fetch("/api/ehp/latest", {            // 예시 주소. DB 최신값 조회 백엔드로 바꾼다
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointIds: V.allPointIds(), dayPointIds: V.dayPointIds() }),
      credentials: "same-origin",
    }).then((r) => r.json());
    // 응답을 { 포인트ID: { v, ts, day } } 로 바꾼다. 아래는 [{ pointId, value, time, daySum }] 형식일 때의 예
    const out = {};
    res.forEach((p) => {
      out[p.pointId] = { v: Number(p.value), ts: new Date(p.time).getTime() };
      if (p.daySum != null) out[p.pointId].day = Number(p.daySum);
    });
    return out;
  });
  V.config.refreshMs = 60 * 1000; // 수집은 15분이지만 화면은 1분마다 확인
})();
