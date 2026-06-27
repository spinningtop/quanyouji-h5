const { springs, routes, springGroups, atlasThemes } = window.QUANYOUJI_DATA;

const TIME_OPTIONS = [
  ["1h", "1 小时"],
  ["3h", "3 小时"],
  ["halfday", "半天"],
  ["day", "一天"]
];

const SCENE_OPTIONS = [
  ["classic", "经典"],
  ["family", "亲子"],
  ["photo", "拍照"],
  ["culture", "文化"],
  ["night", "夜游"],
  ["hidden", "小众"]
];

const LEVEL_LABELS = {
  S: "S 强烈推荐",
  A: "A 值得停留",
  B: "B 顺路可看",
  C: "C 资料收录"
};

const MASCOT_NAME = "游泉哇";
const MASCOT_IMAGE = "./assets/mascot/youquwa-mascot-d-20260624.png";
const MASCOT_AVATAR_IMAGE = "./assets/mascot/youquwa-avatar-d-20260625.png";
const APP_VERSION = "p2v-visual-system-refresh-20260628";

const app = document.querySelector("#app");

const state = {
  tab: "routes",
  routeId: null,
  springId: null,
  fromRouteId: "",
  fromMapClusterId: "",
  query: "",
  timeBucket: "3h",
  scene: "classic",
  smartRouteDraft: null,
  smartRoutePrefs: {
    duration: "180",
    start: "baotu",
    companion: "solo",
    interest: "classic"
  },
  areaFilter: "all",
  levelFilter: "all",
  sceneFilter: "all",
  stateFilter: "all",
  mapFilter: "all",
  mapCoreExpanded: false,
  mapEyesExpanded: false,
  selectedMapClusterId: "",
  selectedMapSpringId: "baotu",
  springMode: "",
  photoGuideId: "",
  cameraStatus: "idle",
  capturedPhoto: null,
  captureDiagnostics: [],
  mascotOpen: false,
  mascotPromptId: "",
  mascotText: "",
  mascotAskedText: "",
  mascotChat: [],
  mascotPaceMode: "normal",
  trip: loadTripState()
};

let activeCameraStream = null;

state.mascotPaceMode = state.trip.mascotPaceMode || "normal";
state.smartRouteDraft = state.trip.smartRouteDraft || null;
state.smartRoutePrefs = { ...state.smartRoutePrefs, ...(state.trip.smartRoutePrefs || {}) };

window.addEventListener("hashchange", syncRoute);
ensureLatestPreviewVersion();
syncRoute();

function ensureLatestPreviewVersion() {
  const params = new URLSearchParams(location.search || "");
  const previewVersion = params.get("v");
  if (!previewVersion || previewVersion === APP_VERSION) return;
  params.set("v", APP_VERSION);
  const nextUrl = `${location.pathname || "/"}?${params.toString()}${location.hash || ""}`;
  window.history?.replaceState?.(null, "", nextUrl);
}

function syncRoute() {
  if (state.tab === "spring" && state.springMode === "photo") stopCamera();
  const hash = location.hash.replace(/^#\/?/, "");
  const [rawTab = "routes", rawId = null, rawMode = ""] = hash.split("/");
  const tab = rawTab.split("?")[0];
  const id = rawId ? decodeHashId(rawId.split("?")[0]) : null;
  const mode = rawMode ? decodeHashId(rawMode.split("?")[0]) : "";
  const querySource = [rawTab, rawId, rawMode].find((part) => part && part.includes("?")) || "";
  const query = parseHashQuery(querySource);
  state.tab = ["routes", "map", "springs", "my", "favorites", "route", "spring"].includes(tab) ? tab : "routes";
  if (state.tab === "favorites") state.tab = "my";
  state.routeId = state.tab === "route" ? id : null;
  state.springId = state.tab === "spring" ? id : null;
  state.fromRouteId = state.tab === "spring" ? query.fromRoute || "" : "";
  state.fromMapClusterId = state.tab === "spring" ? query.fromMapCluster || "" : "";
  state.springMode = state.tab === "spring" ? mode : "";
  if (state.tab === "map") applyMapQuery(query);
  if (state.tab === "spring" && state.springMode === "photo" && !state.photoGuideId) state.photoGuideId = "cover";
  render();
}

function parseHashQuery(value) {
  const queryPart = value.includes("?") ? value.split("?").slice(1).join("?") : "";
  if (!queryPart) return {};
  return queryPart.split("&").reduce((params, pair) => {
    const [rawKey, rawValue = ""] = pair.split("=");
    if (!rawKey) return params;
    params[decodeHashId(rawKey)] = decodeHashId(rawValue);
    return params;
  }, {});
}

function decodeHashId(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function springHref(springId, routeId = "") {
  return `#/spring/${encodeURIComponent(springId)}${routeId ? `?fromRoute=${encodeURIComponent(routeId)}` : ""}`;
}

function mapSpringHref(springId, clusterId = "", section = "") {
  const params = [];
  if (section) params.push(`section=${encodeURIComponent(section)}`);
  if (clusterId) params.push(`fromMapCluster=${encodeURIComponent(clusterId)}`);
  return `#/spring/${encodeURIComponent(springId)}${params.length ? `?${params.join("&")}` : ""}`;
}

function mapReturnHref(clusterId, springId) {
  const params = [];
  if (clusterId) params.push(`cluster=${encodeURIComponent(clusterId)}`);
  if (springId) params.push(`spring=${encodeURIComponent(springId)}`);
  return `#/map${params.length ? `?${params.join("&")}` : ""}`;
}

function applyMapQuery(query) {
  const clusterId = query.cluster || "";
  const springId = query.spring || "";
  if (clusterId) {
    state.mapFilter = "all";
    state.selectedMapClusterId = clusterId;
    const cluster = getMapClusters(getMapSprings()).find((item) => item.id === clusterId);
    if (cluster && cluster.scope !== "regional") state.mapCoreExpanded = true;
  }
  if (springId) state.selectedMapSpringId = springId;
  if (clusterId || springId) ensureSelectedSpringForCurrentMap();
}

function render() {
  app.innerHTML = `
    <main class="screen">${renderView()}</main>
    ${renderNav()}
    ${renderMascot()}
  `;
  bindEvents();
  if (location.hash.includes("section=panorama")) {
    setTimeout(() => document.querySelector("#panorama")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  } else {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}

function renderView() {
  if (state.tab === "route") return renderRouteDetail();
  if (state.tab === "spring") return state.springMode === "photo" ? renderSpringPhotoGuide() : renderSpringDetail();
  if (state.tab === "map") return renderMap();
  if (state.tab === "springs") return renderSprings();
  if (state.tab === "my") return renderMyTrip();
  return renderHome();
}

function renderHome() {
  const recommended = getRecommendedRoutes();
  const primaryRoute = recommended[0] || routes[0];
  const activeRoute = getActiveRoute();
  return `
    <section class="hero product-hero route-first-hero">
      <p class="eyebrow">今日泉城游记</p>
      <h1>泉游记</h1>
      <p>先选一条靠谱路线直接走，看懂济南的水声、街巷和故事。</p>
      <div class="hero-actions">
        <a class="primary-action" href="#/route/${primaryRoute.id}" data-start-route="${primaryRoute.id}">跟着走</a>
        ${activeRoute ? `<a class="secondary-action" href="#/route/${activeRoute.id}">继续上次行程</a>` : `<a class="secondary-action" href="#/route/${primaryRoute.id}">看路线亮点</a>`}
      </div>
    </section>
    <section class="section route-recommend-section">
      <div class="section-head inline-head">
        <div>
          <p class="eyebrow">推荐路线</p>
          <h2>先选一条直接走</h2>
        </div>
        <span>滑动选择</span>
      </div>
      <div class="route-carousel" aria-label="推荐路线">
        ${recommended.map((route, index) => renderRouteSlide(route, index)).join("")}
      </div>
    </section>
    ${renderSmartRouteBuilder({ compact: true })}
    <section class="section">
      <div class="today-tip-card">
        <p class="eyebrow">今日看泉建议</p>
        <h2>第一次来，先走趵突泉、五龙潭、黑虎泉</h2>
        <p>这条线辨识度最高，步行关系清楚，适合先建立对济南泉水的第一印象。</p>
      </div>
    </section>
  `;
}

function renderRouteSlide(route, index) {
  const firstSpring = getRouteStops(route)[0];
  return `
    <article class="route-slide ${index === 0 ? "featured" : ""}">
      ${renderImage(route.coverImage, "route-slide-image", route.name)}
      <div class="route-slide-copy">
        <p class="card-kicker">${index === 0 ? "今日首推" : route.audienceTags.slice(0, 2).join(" / ")}</p>
        <h3>${route.name}</h3>
        <strong>${route.storyMood || route.promise}</strong>
        <p>${route.walkInstruction || route.summary}</p>
        <div class="metric-row">
          <span>${route.durationMinutes} 分钟</span>
          <span>${route.distanceKm} 公里</span>
          <span>${route.stopIds.length} 站</span>
        </div>
        <p class="first-stop">第一站：${firstSpring?.name || "趵突泉"}</p>
        <div class="action-row">
          <a class="primary-action dark" href="#/route/${route.id}" data-start-route="${route.id}">跟着走</a>
          <a class="ghost-action" href="#/route/${route.id}">看路线亮点</a>
        </div>
      </div>
    </article>
  `;
}

function renderSmartRouteBuilder(options = {}) {
  const compact = Boolean(options.compact);
  const prefs = state.smartRoutePrefs;
  const smartRoute = state.smartRouteDraft || buildSmartRoute(prefs);
  return `
    <section class="section smart-route-builder ${compact ? "compact" : ""}">
      <div class="section-head">
        <p class="eyebrow">${compact ? "路线不合适？" : "今日智能组线"}</p>
        <h2>${compact ? "按你的时间重新安排" : "你今天怎么游"}</h2>
        <p>${compact ? "带老人孩子、想拍照或想避开人多时，在推荐路线基础上微调。" : "按时间、出发地、同行和兴趣，生成一条今天可走的泉水路线。"}</p>
      </div>
      <div class="smart-route-controls" aria-label="智能组线条件">
        ${renderSmartSelect("duration", "时间", prefs.duration, [
          ["90", "90 分钟"],
          ["120", "2 小时"],
          ["180", "3 小时"],
          ["240", "半日"]
        ])}
        ${renderSmartSelect("start", "出发地", prefs.start, [
          ["baotu", "趵突泉"],
          ["wulongtan", "五龙潭"],
          ["heihu", "黑虎泉"],
          ["zhenzhu", "珍珠泉"]
        ])}
        ${renderSmartSelect("companion", "同行", prefs.companion, [
          ["solo", "自己或朋友"],
          ["family", "亲子"],
          ["elder", "带老人"],
          ["quiet", "想避人流"]
        ])}
        ${renderSmartSelect("interest", "兴趣", prefs.interest, [
          ["classic", "经典"],
          ["photo", "拍照"],
          ["culture", "文化"],
          ["quiet", "避人流"]
        ])}
      </div>
      <div class="action-row smart-route-actions">
        <button type="button" class="primary-action dark" data-action="generate-smart-route">生成今日路线</button>
        <button type="button" class="ghost-action" data-action="start-route" data-route-id="smart-today">设为当前行程</button>
      </div>
      ${renderSmartRouteResult(smartRoute)}
    </section>
  `;
}

function renderSmartSelect(key, label, value, options) {
  return `
    <label>
      <span>${label}</span>
      <select data-smart-key="${key}" aria-label="${label}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSmartRouteResult(route) {
  const stops = getRouteStops(route);
  return `
    <article class="smart-route-result">
      <p class="card-kicker">今日智能路线</p>
      <h3>${route.name}</h3>
      <p>${route.summary}</p>
      <div class="metric-row">
        <span>${route.durationMinutes} 分钟</span>
        <span>${route.distanceKm} 公里</span>
        <span>${stops.length} 站</span>
      </div>
      <div class="tag-row">
        ${route.audienceTags.map((tag) => `<span>${tag}</span>`).join("")}
      </div>
      <div class="smart-stop-strip">
        ${stops.map((spring, index) => `<a href="${springHref(spring.id, route.id)}"><b>${index + 1}</b><span>${spring.name}</span></a>`).join("")}
      </div>
      <div class="action-row">
        <a class="primary-action dark" href="#/route/${route.id}" data-start-route="${route.id}">跟着走</a>
        <a class="ghost-action" href="#/map">看地图</a>
      </div>
    </article>
  `;
}

function renderRouteCard(route) {
  return `
    <a class="route-card" href="#/route/${route.id}">
      ${renderImage(route.coverImage, "route-cover", route.name)}
      <div class="card-body">
        <p class="card-kicker">${route.audienceTags.join(" / ")}</p>
        <h3>${route.name}</h3>
        <p>${route.summary}</p>
        <div class="metric-row">
          <span>${route.durationMinutes} 分钟</span>
          <span>${route.distanceKm} 公里</span>
          <span>${route.stopIds.length} 站</span>
        </div>
      </div>
    </a>
  `;
}

function renderRouteStoryImages(route) {
  return route.storyImageSpringIds
    .map((id) => springs.find((spring) => spring.id === id))
    .filter(Boolean)
    .map((spring) => `
      <a class="story-thumb" href="${springHref(spring.id, route.id)}">
        ${renderImage(spring.coverImage, "story-thumb-image", spring.name)}
        <span>${spring.name}</span>
      </a>
    `)
    .join("");
}

function renderRouteStoryHeader(route) {
  return `
    <section class="route-story-header">
      <p class="card-kicker">路线图文开场</p>
      <h2>${route.storyTitle}</h2>
      <p>${route.storyLead}</p>
      <div class="story-strip">
        ${renderRouteStoryImages(route)}
      </div>
      <div class="journal-note">
        <strong>这条线会看到什么</strong>
        <span>${route.storyMood}</span>
      </div>
    </section>
  `;
}

function renderRouteDetail() {
  const route = getRouteById(state.routeId);
  if (!route) return renderEmpty("路线未找到", "回到首页", "#/routes");
  const stops = getRouteStops(route);
  const routeState = getRouteProgress(route);
  const current = routeState.currentSpring || stops[0];
  const next = routeState.nextSpring;
  const currentGuide = route.guideStops.find((item) => item.springId === current.id) || {};
  const visibleStops = getCompactRouteStops(stops, current);
  const lastCompleted = getLastCompletedRouteStop(route);

  return `
    <section class="page stack">
      <a class="back-link" href="#/routes">返回首页</a>
      <div>
        <p class="eyebrow">${route.audienceTags.join(" / ")}</p>
        <h1>${route.name}</h1>
        <p class="lead">${route.summary}</p>
      </div>
      <div class="route-toolbar">
        <button class="favorite-button ${isFavoriteRoute(route.id) ? "active" : ""}" data-action="favorite-route" data-route-id="${route.id}">
          ${isFavoriteRoute(route.id) ? "已收藏" : "收藏路线"}
        </button>
        <button class="favorite-button" data-action="start-route" data-route-id="${route.id}">
          ${route.id === "smart-today" ? "跟着走" : (state.trip.activeRouteId === route.id ? "当前行程" : "设为当前行程")}
        </button>
      </div>
      <div class="metric-row large">
        <span>${route.durationMinutes} 分钟</span>
        <span>${route.distanceKm} 公里</span>
        <span>${routeState.completed}/${stops.length} 已看</span>
      </div>
      ${route.premiumGuide ? `
        <div class="premium-mode-row">
          <span>${route.premiumGuide.modeLabel}</span>
          <span>${route.premiumGuide.readLabel}</span>
        </div>
      ` : ""}
      <section class="guide-card current-stop route-field-hero">
        <p class="card-kicker">${routeState.done ? "路线完成" : "当前建议"}</p>
        <div class="route-field-head">
          <div>
            <h2>${routeState.done ? "这条路线已经走完" : current.name}</h2>
            <p>${routeState.done ? "今天这条路线已经收束，可以整理游记或继续探索。" : `当前站 · 建议停留 ${current.estimatedStayMinutes} 分钟`}</p>
          </div>
          <span>${routeState.percent}%</span>
        </div>
        <div class="progress-track" aria-label="路线完成度">
          <span style="width:${routeState.percent}%"></span>
        </div>
        <p>${routeState.percent}% 完成 · ${routeState.completed}/${stops.length} 已看</p>
        <p class="field-hero-main">${routeState.done ? "可以到我的行程生成分享卡，或继续探索图鉴里的其他泉点。" : currentGuide.body || current.observationTip}</p>
        ${routeState.done ? "" : `
          <div class="field-action-grid">
            <span><b>先看</b>${current.observationTip}</span>
            <span><b>拍什么</b>${current.photoTip}</span>
            <span><b>下一步</b>${next ? `看完接到${next.name}` : "整理我的行程"}</span>
          </div>
        `}
        <div class="action-row">
          ${routeState.done ? `<a class="primary-action dark" href="#/my">查看我的行程</a>` : `<a class="primary-action dark" href="${springHref(current.id, route.id)}">看这一泉</a>`}
          <a class="ghost-action" href="${mapUrl(routeState.done ? getRouteMapSpring(route, "last") : current)}" target="_blank" rel="noopener">${getMapDecision(routeState.done ? getRouteMapSpring(route, "last") : current).actionLabel}</a>
          ${routeState.done ? "" : `<button class="primary-action" data-action="toggle-visited" data-spring-id="${current.id}">我已到这站</button>`}
          ${!routeState.done && current.vrPanorama?.url ? `<a class="ghost-action" href="#/spring/${current.id}?section=panorama&fromRoute=${route.id}">看现场</a>` : ""}
        </div>
        ${routeState.done ? "" : renderMapTrustBadge(current)}
      </section>
      ${renderRouteAdvanceFeedback(route, routeState, lastCompleted)}
      ${routeState.done ? "" : renderLiveGuideCard({ spring: current, route, nextSpring: next, source: "route" })}
      ${renderLiveFieldStatus(route, routeState)}
      ${renderRouteStoryHeader(route)}
      <section class="route-brief">
        <div>
          <p class="card-kicker">为什么推荐</p>
          <strong>${route.whyRecommended}</strong>
        </div>
        <div class="brief-columns">
          <div>
            <p class="card-kicker">适合</p>
            ${route.bestFor.map((item) => `<span>${item}</span>`).join("")}
          </div>
          <div>
            <p class="card-kicker">不适合</p>
            ${route.notFor.map((item) => `<span>${item}</span>`).join("")}
          </div>
        </div>
      </section>
      <section class="guide-card">
        <p class="card-kicker">下一站方向</p>
        <h2>${next ? next.name : "路线终点"}</h2>
        <p>${next ? next.summary : "如果还有时间，可以从图鉴按附近片区继续探索。"}</p>
      </section>
      ${renderRouteKitCard(route)}
      <section class="guide-card">
        <p class="card-kicker">站点顺序</p>
        <div class="route-stop-list">
          ${visibleStops.map((spring) => renderRouteStop(route, spring, stops.indexOf(spring))).join("")}
        </div>
        ${visibleStops.length < stops.length ? `<a class="text-link block route-full-list-link" href="#/route/${route.id}?showAllStops=1">查看完整 ${stops.length} 站</a>` : ""}
      </section>
    </section>
  `;
}

function getLastCompletedRouteStop(route) {
  const stops = getRouteStops(route);
  return [...stops].reverse().find((spring) => isVisited(spring.id)) || null;
}

function renderOnSiteModePanel(route, routeState, current, next) {
  const photoTarget = current?.photoGuides?.length ? current : null;
  return `
    <section class="onsite-mode-panel" aria-label="到场模式">
      <div>
        <p class="card-kicker">到场模式</p>
        <h2>当前只做这几件事</h2>
        <p>${routeState.done ? "路线已经完成，可以整理游记或继续探索附近泉点。" : `先完成${current.name}，再接到${next ? next.name : "路线收尾"}。`}</p>
      </div>
      <div class="onsite-mode-actions">
        ${routeState.done ? `<a class="primary-action dark" href="#/my">查看我的行程</a>` : `<a class="primary-action dark" href="${springHref(current.id, route.id)}">看这一泉</a>`}
        ${photoTarget ? `<a class="ghost-action" href="#/spring/${photoTarget.id}/photo">拍同款</a>` : ""}
        ${next ? `<a class="ghost-action" href="${mapUrl(next)}" target="_blank" rel="noopener">去下一站</a>` : ""}
        ${routeState.done ? "" : `<button class="primary-action" data-action="toggle-visited" data-spring-id="${current.id}">完成当前站</button>`}
      </div>
    </section>
  `;
}

function renderRouteAdvanceFeedback(route, routeState, lastCompleted) {
  if (!lastCompleted || !routeState.currentSpring) return "";
  return `
    <section class="route-advance-feedback" aria-label="站点推进反馈">
      <p class="card-kicker">${lastCompleted.name}已记录</p>
      <h2>下一站已准备好</h2>
      <p>现在切到${routeState.currentSpring.name}，继续按看、拍、听、走四步走就行。</p>
      <div class="finish-status-grid">
        <span>${routeState.completed}/${routeState.total} 已看</span>
        <span>${routeState.percent}% 完成</span>
        <span>${route.name}</span>
      </div>
    </section>
  `;
}

function getCompactRouteStops(stops, current) {
  const currentIndex = Math.max(0, stops.findIndex((spring) => spring.id === current?.id));
  return stops.slice(currentIndex, currentIndex + 3);
}

function renderRouteKitCard(route) {
  const guide = route.walkingCompanion || {};
  const script = route.onSiteScript || {};
  const tips = uniqueItems([...route.beforeStart, ...route.shortcutOptions, ...route.practicalTips]);
  return `
    <section class="guide-card route-kit-card">
      <p class="card-kicker">路线锦囊</p>
      <h2>现场只看这一组提示</h2>
      <div class="route-kit-grid">
        ${route.walkingCompanion ? `
          <div>
            <h3>边走边提示</h3>
            <p><strong>到达先看</strong>${guide.arrivalFocus}</p>
            <p><strong>去下一站路上</strong>${guide.onTheWay}</p>
            <p><strong>时间不够</strong>${guide.timePlan}</p>
            <p><strong>人多调整</strong>${guide.crowdPlan}</p>
          </div>
        ` : ""}
        ${route.onSiteScript ? `
          <div>
            <h3>现场剧本</h3>
            <p><strong>到达后</strong>${script.arrival}</p>
            <p><strong>下一站为什么接这里</strong>${script.transition}</p>
            <p><strong>人多时</strong>${script.crowdPlan}</p>
          </div>
        ` : ""}
        <div>
          <h3>路线提示</h3>
          ${tips.slice(0, 4).map((tip) => `<p>${tip}</p>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderWalkingCompanionCard(route) {
  const guide = route.walkingCompanion;
  if (!guide) return "";
  return `
    <section class="guide-card walking-companion-card">
      <p class="card-kicker">边走边提示</p>
      <h2>${guide.title}</h2>
      <div class="field-trust-grid">
        <p><strong>到达先看</strong>${guide.arrivalFocus}</p>
        <p><strong>去下一站路上</strong>${guide.onTheWay}</p>
        <p><strong>时间不够</strong>${guide.timePlan}</p>
        <p><strong>人多调整</strong>${guide.crowdPlan}</p>
      </div>
    </section>
  `;
}

function renderRouteScriptCard(route) {
  const script = route.onSiteScript;
  if (!script) return "";
  return `
    <section class="guide-card route-script-card">
      <p class="card-kicker">现场剧本</p>
      <h2>${script.title}</h2>
      <div class="field-trust-grid">
        <p><strong>到达后</strong>${script.arrival}</p>
        <p><strong>下一站为什么接这里</strong>${script.transition}</p>
        <p><strong>人多时</strong>${script.crowdPlan}</p>
      </div>
    </section>
  `;
}

function renderRouteStop(route, spring, index) {
  const guide = route.guideStops.find((item) => item.springId === spring.id) || {};
  const visited = isVisited(spring.id);
  const skipped = isSkipped(spring.id);
  return `
    <div class="stop-row ${visited ? "done" : ""} ${skipped ? "skipped" : ""}">
      <span>${visited ? "✓" : index + 1}</span>
      <div>
        <strong>${spring.name}</strong>
        <small>${guide.time || `${spring.estimatedStayMinutes} 分钟`} · ${spring.group}</small>
        <small class="why-stop">为什么这一站值得停</small>
        <p>${guide.body || spring.observationTip}</p>
        ${guide.firstLook ? `
          <div class="premium-stop-grid">
            <p><strong>第一眼</strong>${guide.firstLook}</p>
            <p><strong>拍照点</strong>${guide.photoSpot}</p>
            <p><strong>时间紧时</strong>${guide.compressAdvice}</p>
            <p><strong>下一站理解</strong>${guide.nextStepTip}</p>
          </div>
        ` : ""}
        <div class="mini-actions">
          <button class="mini-primary" data-action="toggle-visited" data-spring-id="${spring.id}">${visited ? "取消已看" : "标记已看"}</button>
          <a href="${springHref(spring.id, route.id)}">详情</a>
          <button data-action="toggle-skipped" data-spring-id="${spring.id}">${skipped ? "取消跳过" : "跳过"}</button>
        </div>
      </div>
    </div>
  `;
}

function renderSpringMemoryCard(spring) {
  return `
    <section class="guide-card memory-card">
      <p class="card-kicker">一句话记住它</p>
      <h2>${spring.memoryLine}</h2>
      <p>${spring.sceneIntro}</p>
      <div class="onsite-checklist journal-checklist">
        ${spring.onSiteChecklist.map((item) => `<span>${item}</span>`).join("")}
      </div>
    </section>
  `;
}

function getSpringWorthDecision(spring) {
  const dedicated = {
    S: "值得专程去",
    A: "值得绕一点路",
    B: "顺路可看",
    C: "资料收录",
  }[spring.level] || "值得了解";
  const goodFor = spring.scenes?.length
    ? spring.scenes.slice(0, 2).map((scene) => sceneLabel(scene)).join(" / ")
    : "想系统认识济南泉群的人";
  const skip = spring.skipAdvice || (spring.level === "S"
    ? "如果时间很紧，也建议至少停留几分钟看第一眼。"
    : "如果不在附近，可以先放进图鉴收藏。");
  const firstLook = spring.firstLook || spring.observationTip || spring.fieldGuide?.firstLook || spring.summary;
  return { dedicated, goodFor, skip, firstLook };
}

function renderSpringWorthDecisionCard(spring) {
  const decision = getSpringWorthDecision(spring);
  return `
    <section class="guide-card worth-decision-card">
      <p class="card-kicker">为什么值得去</p>
      <div class="worth-decision-head">
        <h2>${decision.dedicated}</h2>
        <span>建议停留 ${spring.estimatedStayMinutes} 分钟</span>
      </div>
      <div class="worth-decision-grid">
        <p><strong>适合你</strong>${decision.goodFor}</p>
        <p><strong>可以略过</strong>${decision.skip}</p>
        <p><strong>到了先看</strong>${decision.firstLook}</p>
      </div>
    </section>
  `;
}

function getRouteNextSpring(route, spring) {
  if (!route || !spring) return null;
  const stops = getRouteStops(route);
  const currentIndex = stops.findIndex((item) => item.id === spring.id);
  if (currentIndex < 0) return null;
  return stops.slice(currentIndex + 1).find((item) => !isVisited(item.id) && !isSkipped(item.id)) || stops[currentIndex + 1] || null;
}

function getLiveGuide(route, spring, nextSpring) {
  const routeGuide = route?.guideStops?.find((item) => item.springId === spring.id) || {};
  const companion = spring.fieldCompanion || {};
  return {
    look: routeGuide.firstLook || spring.firstLook || spring.observationTip,
    photo: routeGuide.photoSpot || companion.photoTask || spring.photoSpot || spring.photoTip,
    listen: spring.memoryLine || companion.story30 || spring.storyShort,
    walk: nextSpring
      ? `下一站：${nextSpring.name}。${routeGuide.nextStepTip || spring.nextStepTip || nextSpring.summary}`
      : spring.nextStepTip || "这站看完后，可以到我的行程整理游记，或继续探索附近泉点。"
  };
}

function renderLiveGuideCard({ spring, route = null, nextSpring = null, source = "", compact = false }) {
  if (!spring) return "";
  const guide = getLiveGuide(route, spring, nextSpring);
  const routeHref = route ? `#/route/${route.id}` : "#/routes";
  const detailHref = springHref(spring.id, route?.id || "");
  const tag = compact ? "div" : "section";
  const className = compact ? "live-guide-card compact" : "guide-card live-guide-card";
  const primaryAction = source === "spring"
    ? `<button class="primary-action dark" data-action="toggle-visited" data-spring-id="${spring.id}">${isVisited(spring.id) ? "取消已看" : "标记已看"}</button>`
    : `<a class="primary-action dark" href="${detailHref}">看这一泉</a>`;
  const walkAction = nextSpring
    ? `<a class="ghost-action" href="${mapUrl(nextSpring)}" target="_blank" rel="noopener">去下一站</a>`
    : `<a class="ghost-action" href="#/my">整理游记</a>`;
  return `
    <${tag} class="${className}">
      <p class="card-kicker">现场随身导游</p>
      <div class="live-guide-head">
        <h2>${spring.name}现场四步</h2>
        <span>${route ? route.name : `${spring.estimatedStayMinutes} 分钟`}</span>
      </div>
      <div class="live-guide-steps">
        <p><strong><b>看</b>到了先看</strong>${guide.look}</p>
        <p><strong><b>拍</b>拍一张</strong>${guide.photo}</p>
        <p><strong><b>听</b>听一句</strong>${guide.listen}</p>
        <p><strong><b>走</b>${nextSpring ? "去下一站" : "收尾"}</strong>${guide.walk}</p>
      </div>
      <div class="action-row live-guide-actions">
        ${primaryAction}
        ${spring.photoGuides?.length ? `<a class="ghost-action" href="#/spring/${spring.id}/photo">拍同款</a>` : ""}
        ${walkAction}
        ${source === "spring" && route ? `<a class="ghost-action" href="${routeHref}">返回路线</a>` : ""}
        ${source === "trip" && route ? `<a class="ghost-action" href="${routeHref}">继续跟着走</a>` : ""}
      </div>
    </${tag}>
  `;
}

function renderStructuredFieldGuideCard(spring) {
  const guide = spring.fieldGuide;
  if (!guide) return "";
  return `
    <section class="guide-card structured-field-card">
      <p class="card-kicker">现场怎么看</p>
      <h2>到现场按这 5 步看</h2>
      <div class="structured-field-grid">
        <p><strong>站在哪里</strong>${guide.whereToStand}</p>
        <p><strong>第一眼</strong>${guide.firstLook}</p>
        <p><strong>容易错过</strong>${guide.missedDetail}</p>
        <p><strong>拍照提示</strong>${guide.photoCue}</p>
        <p><strong>附近关系</strong>${guide.nearbyRelation}</p>
      </div>
    </section>
  `;
}

function renderFieldCompanionCard(spring) {
  const guide = spring.fieldCompanion;
  if (!guide) return "";
  return `
    <section class="guide-card field-companion-card">
      <p class="card-kicker">现场导览教练</p>
      <h2>这一泉到现场这样看</h2>
      <div class="structured-field-grid">
        <p><strong>最佳站位</strong>${guide.standpoint}</p>
        <p><strong>30 秒讲解</strong>${guide.story30}</p>
        <p><strong>拍照任务</strong>${guide.photoTask}</p>
        <p><strong>人多时</strong>${guide.crowdPlan}</p>
        <p><strong>下一泉怎么接</strong>${guide.nextConnection}</p>
      </div>
    </section>
  `;
}

function renderFieldTrustCard(spring) {
  return `
    <section class="guide-card field-trust-card">
      <p class="card-kicker">现场可信导览</p>
      <div class="field-trust-grid">
        <p><strong>怎么找</strong>${spring.entranceTip}</p>
        <p><strong>第一眼看哪里</strong>${spring.firstLook}</p>
        <p><strong>推荐拍照位</strong>${spring.photoSpot}</p>
        <p><strong>容易错过</strong>${spring.missedDetail}</p>
        <p><strong>时间紧时</strong>${spring.skipAdvice}</p>
        <p><strong>下一步</strong>${spring.nextStepTip}</p>
      </div>
    </section>
  `;
}

function renderUnifiedFieldGuideCard(spring) {
  const guide = spring.fieldGuide || {};
  const companion = spring.fieldCompanion || {};
  const groups = [
    {
      step: "01",
      title: "抵达",
      items: [
        ["最佳站位", companion.standpoint || spring.entranceTip],
        ["站在哪里", guide.whereToStand || spring.entranceTip],
      ],
    },
    {
      step: "02",
      title: "看懂",
      items: [
        ["第一眼", guide.firstLook || spring.firstLook],
        ["30 秒讲解", companion.story30 || spring.storyCard],
        ["容易错过", guide.missedDetail || spring.missedDetail],
      ],
    },
    {
      step: "03",
      title: "拍照",
      items: [
        ["拍照任务", companion.photoTask || guide.photoCue || spring.photoSpot],
        ["人多时", companion.crowdPlan || spring.skipAdvice],
      ],
    },
    {
      step: "04",
      title: "接续",
      items: [
        ["附近关系", guide.nearbyRelation || spring.nextStepTip],
        ["时间紧时", spring.skipAdvice],
        ["下一泉怎么接", companion.nextConnection || spring.nextStepTip],
      ],
    },
  ];
  return `
    <section class="guide-card unified-field-guide-card">
      <p class="card-kicker">现场导览</p>
      <h2>到现场先抓住这几件事</h2>
      <div class="unified-guide-flow">
        ${groups.map((group) => `
          <div class="unified-guide-group">
            <div class="unified-guide-group-head">
              <span>${group.step}</span>
              <h3>${group.title}</h3>
            </div>
            <div class="unified-guide-items">
              ${group.items.map(([label, value]) => `<p><strong>${label}</strong>${value}</p>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSpringJournalExtras(spring) {
  return `
    <section class="guide-card spring-journal-extras">
      <p class="card-kicker">游记补充</p>
      <div class="journal-extra-grid">
        <p><strong>最佳时刻</strong>${spring.bestMoment}</p>
        <p><strong>游记文案</strong>${spring.socialShareText}</p>
      </div>
    </section>
  `;
}

function renderPanoramaCard(spring) {
  if (!spring.vrPanorama?.url) return "";
  const panorama = spring.vrPanorama;
  const trust = getPanoramaTrust(panorama);
  return `
    <section class="guide-card panorama-card" id="panorama">
      <p class="card-kicker">360 实景看现场</p>
      <h2>${panorama.title}</h2>
      <div class="panorama-trust">
        <span class="${trust.level}">${trust.label}</span>
        <strong>实景可信度</strong>
        <em>${trust.note}</em>
      </div>
      <p>${panorama.note || "先看一眼现场空间，再决定到现场从哪里看、怎么拍。"}</p>
      <div class="panorama-frame">
        <div class="panorama-loading">
          <strong>实景加载中</strong>
          <span>如果加载较慢，可以直接打开 720 云实景。</span>
        </div>
        <iframe src="${panorama.embedUrl}" title="${panorama.title}" loading="lazy" allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking" referrerpolicy="no-referrer" onload="this.parentElement.classList.add('loaded')"></iframe>
      </div>
      <div class="action-row">
        <a class="primary-action dark" href="${panorama.url}" target="_blank" rel="noopener">打开 720 云实景</a>
        <span class="panorama-source">${panorama.sourceLabel} · ${panorama.sceneName} · ${trust.label}</span>
      </div>
    </section>
  `;
}

function getPanoramaTrust(panorama) {
  return {
    level: panorama.trustLevel || (panorama.quality === "featured" ? "exact" : "area"),
    label: panorama.trustLabel || (panorama.quality === "featured" ? "单泉实景" : "片区实景"),
    note: panorama.trustNote || (panorama.quality === "featured" ? "可直接看现场" : "到现场需按提示找泉眼")
  };
}

function renderPhotoGuideCard(spring) {
  if (!spring.photoGuides?.length) return "";
  const firstGuide = spring.photoGuides[0];
  return `
    <section class="guide-card photo-guide-card">
      <p class="card-kicker">现场拍照引导</p>
      <h2>${firstGuide.title}</h2>
      <p>${firstGuide.prompt}</p>
      <div class="action-row">
        <a class="primary-action dark" href="#/spring/${spring.id}/photo">拍同款</a>
        <span class="panorama-source">${spring.photoGuides.length} 个取景任务</span>
      </div>
    </section>
  `;
}

function renderCaptionedGallery(spring) {
  const images = spring.galleryImages.length ? spring.galleryImages : [spring.coverImage].filter(Boolean);
  return `
    <section class="guide-card">
      <p class="card-kicker">图文图集</p>
      <div class="captioned-gallery">
        ${images.slice(0, 5).map((image) => `
          <figure>
            ${renderImage(image, "captioned-image", spring.name)}
            <figcaption>${image.caption}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSprings() {
  const areas = getAreas();
  const filtered = filterSprings();
  const hasActiveFilter = hasAtlasFilter();
  const resultLabel = hasActiveFilter ? `${filtered.length} 个结果` : `72 名泉 · ${filtered.length} 个结果`;
  return `
    <section class="page stack">
      <div>
        <p class="eyebrow">查泉名和标签</p>
        <h1>72 名泉图鉴</h1>
        <p class="lead">完整收录 72 名泉，推荐等级帮助你判断是否值得专程去。</p>
      </div>
      <label class="search-box">
        <span>搜索</span>
        <input id="spring-search" type="search" value="${escapeAttr(state.query)}" placeholder="输入泉名、片区或标签" />
      </label>
      ${renderAtlasQuickEntries()}
      <div class="filter-grid">
        ${renderSelect("area-filter", "片区", state.areaFilter, [["all", "全部片区"], ...areas.map((area) => [area, area])])}
        ${renderSelect("level-filter", "等级", state.levelFilter, [["all", "全部等级"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]])}
        ${renderSelect("scene-filter", "场景", state.sceneFilter, [["all", "全部场景"], ...SCENE_OPTIONS])}
        ${renderSelect("state-filter", "状态", state.stateFilter, [["all", "全部状态"], ["visited", "已看过"], ["favorite", "已收藏"], ["route", "路线内"], ["panorama", "有实景"]])}
      </div>
      ${renderAtlasLenses()}
      ${renderAtlasThemes()}
      <p class="result-count">${resultLabel}</p>
      <div class="card-list atlas-list" id="spring-results">
        ${filtered.map(renderSpringCard).join("")}
      </div>
    </section>
  `;
}

function renderAtlasQuickEntries() {
  const entries = [
    ["#/springs?level=S", "S 级必看"],
    ["#/springs?state=panorama", "有实景"],
    ["#/springs?state=route", "路线内"],
    ["#/springs?state=favorite", "已收藏"]
  ];
  return `
    <div class="atlas-quick-row" aria-label="快速入口">
      <span>快速入口</span>
      ${entries.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}
    </div>
  `;
}

function renderAtlasLenses() {
  const lenses = [
    { title: "故事线", action: "先听故事", body: "从趵突泉、漱玉泉、黑虎泉这些有记忆点的泉开始，先建立泉城印象。", href: "#/spring/baotu" },
    { title: "地理线", action: "看它在哪里", body: "先用片区地图理解老城、章丘、长清和平阴的距离关系，再决定是否专程去。", href: "#/map" },
    { title: "水系线", action: "看水怎么流", body: "沿护城河、五龙潭、大明湖周边看泉，能理解济南泉水和城市空间的关系。", href: "#/map?cluster=moat-park&spring=heihu" },
    { title: "拍照线", action: "找好拍的泉", body: "优先看有实景和拍照引导的泉点，适合现场快速决定拍什么。", href: "#/spring/baotu/photo" },
    { title: "路线线", action: "放进今天路线", body: "把泉点放回 3 小时经典线，看它是第几站、前后怎么接。", href: "#/route/classic-3h" }
  ];
  return `
    <section class="atlas-lens-panel" aria-label="读懂 72 名泉">
      <div class="section-head compact">
        <p class="card-kicker">读懂 72 名泉</p>
        <h2>不是只查名字，而是换几种方式看懂泉城</h2>
      </div>
      <div class="atlas-lens-grid">
        ${lenses.map((lens) => `
          <a class="atlas-lens-card" href="${lens.href}">
            <small>${lens.title}</small>
            <strong>${lens.action}</strong>
            <span>${lens.body}</span>
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAtlasThemes() {
  if (!atlasThemes?.length) return "";
  return `
    <section class="atlas-theme-panel" aria-label="72 名泉专题读法">
      <div class="section-head compact">
        <p class="card-kicker">专题读法</p>
        <h2>不知道先看哪一泉，就按主题进</h2>
      </div>
      <div class="atlas-theme-grid">
        ${atlasThemes.map((theme) => {
          const themeSprings = theme.springIds.map((id) => springs.find((spring) => spring.id === id)).filter(Boolean);
          return `
            <div class="atlas-theme-card">
              <strong>${theme.title}</strong>
              <span>${theme.summary}</span>
              <div class="atlas-theme-links">
                ${themeSprings.slice(0, 3).map((spring) => `<a href="#/spring/${spring.id}">${spring.name}</a>`).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSpringCard(spring) {
  const panoramaTrust = spring.vrPanorama?.url ? getPanoramaTrust(spring.vrPanorama) : null;
  return `
    <a class="spring-card" href="#/spring/${spring.id}">
      ${renderImage(spring.coverImage, "spring-thumb", spring.name)}
      <div class="card-body">
        <p class="card-kicker">${spring.group}</p>
        <h3>${spring.name}</h3>
        <p>${spring.summary}</p>
        <div class="tag-row">
          <span>${spring.level}</span>
          ${panoramaTrust ? `<span>${panoramaTrust.label}</span>` : ""}
          ${spring.scenes.slice(0, 2).map((scene) => `<span>${sceneLabel(scene)}</span>`).join("")}
          ${isVisited(spring.id) ? "<span>已看</span>" : ""}
          ${isFavoriteSpring(spring.id) ? "<span>已收藏</span>" : ""}
        </div>
      </div>
    </a>
  `;
}

function renderSpringDetail() {
  const spring = springs.find((item) => item.id === state.springId);
  if (!spring) return renderEmpty("泉点未找到", "回到图鉴", "#/springs");
  const relatedRoutes = routes.filter((route) => spring.routeIds.includes(route.id));
  const nearby = spring.nearbySpringIds.map((id) => springs.find((item) => item.id === id)).filter(Boolean);
  const sourceRoute = getRouteById(state.fromRouteId);
  const liveGuideRoute = sourceRoute || null;
  const liveGuideNextSpring = getRouteNextSpring(liveGuideRoute, spring);
  const sourceMapCluster = getMapClusters(springs).find((cluster) => cluster.id === state.fromMapClusterId);

  return `
    <section class="spring-hero">
      ${renderImage(spring.coverImage, "spring-hero-image", spring.name)}
      <div class="spring-hero-copy">
        <div class="spring-back-row">
          ${sourceRoute ? `<a class="back-link light" href="#/route/${sourceRoute.id}">返回路线</a>` : ""}
          ${sourceMapCluster ? `<a class="back-link light" href="${mapReturnHref(sourceMapCluster.id, spring.id)}">返回地图</a>` : ""}
          <a class="back-link light" href="#/springs">返回图鉴</a>
        </div>
        <p class="eyebrow">${spring.group} · ${LEVEL_LABELS[spring.level]}</p>
        <h1>${spring.name}</h1>
        <p>${spring.summary}</p>
      </div>
    </section>
    <section class="page stack map-page">
      <div class="route-toolbar">
        <button class="favorite-button ${isVisited(spring.id) ? "active" : ""}" data-action="toggle-visited" data-spring-id="${spring.id}">
          ${isVisited(spring.id) ? "已看过" : "标记已看"}
        </button>
        <button class="favorite-button ${isFavoriteSpring(spring.id) ? "active" : ""}" data-action="favorite-spring" data-spring-id="${spring.id}">
          ${isFavoriteSpring(spring.id) ? "已收藏" : "收藏泉点"}
        </button>
      </div>
      <div class="metric-row">
        <span>${LEVEL_LABELS[spring.level]}</span>
        <span>${spring.estimatedStayMinutes} 分钟</span>
        ${spring.scenes.map((scene) => `<span>${sceneLabel(scene)}</span>`).join("")}
      </div>
      ${renderSpringFieldHero(spring, liveGuideRoute, liveGuideNextSpring)}
      ${renderLiveGuideCard({ spring, route: liveGuideRoute, nextSpring: liveGuideNextSpring, source: "spring" })}
      ${renderSpringWorthDecisionCard(spring)}
      ${renderSpringMemoryCard(spring)}
      ${renderUnifiedFieldGuideCard(spring)}
      ${renderPhotoGuideCard(spring)}
      ${renderPanoramaCard(spring)}
      ${renderSpringJournalExtras(spring)}
      <section class="guide-card">
        <p class="card-kicker">附近下一站</p>
        ${nearby.length ? nearby.map((item) => `<a class="text-link block" href="#/spring/${item.id}">${item.name} · ${item.summary}</a>`).join("") : `<p>${renderNextStopHint(spring)}</p>`}
      </section>
      <section class="guide-card">
        <p class="card-kicker">地图</p>
        ${renderMapDecisionCard(spring)}
        ${renderMapTrustBadge(spring)}
      </section>
      ${renderCaptionedGallery(spring)}
      <section class="guide-card">
        <p class="card-kicker">关联路线</p>
        ${relatedRoutes.length ? relatedRoutes.map((route) => `<a class="text-link block" href="#/route/${route.id}">${route.name}</a>`).join("") : "<p>可以从图鉴或片区地图继续探索附近泉点。</p>"}
      </section>
    </section>
  `;
}

function renderSpringFieldHero(spring, route = null, nextSpring = null) {
  const decision = getSpringWorthDecision(spring);
  const guide = getLiveGuide(route, spring, nextSpring);
  return `
    <section class="guide-card spring-field-hero">
      <p class="card-kicker">现场看泉卡</p>
      <div class="spring-field-head">
        <div>
          <h2>${decision.dedicated}</h2>
          <p>${spring.name}建议停留 ${spring.estimatedStayMinutes} 分钟，先抓住现场最有辨识度的一眼。</p>
        </div>
        <span>${LEVEL_LABELS[spring.level]}</span>
      </div>
      <div class="spring-field-grid">
        <p><strong>先看什么</strong>${guide.look}</p>
        <p><strong>拍什么</strong>${guide.photo}</p>
        <p><strong>记住什么</strong>${guide.listen}</p>
        <p><strong>下一步</strong>${guide.walk}</p>
      </div>
      <div class="action-row">
        <button class="primary-action dark" data-action="toggle-visited" data-spring-id="${spring.id}">${isVisited(spring.id) ? "取消已看" : "标记已看"}</button>
        ${spring.photoGuides?.length ? `<a class="ghost-action" href="#/spring/${spring.id}/photo">拍同款</a>` : ""}
        ${spring.vrPanorama?.url ? `<a class="ghost-action" href="#/spring/${spring.id}?section=panorama${route ? `&fromRoute=${route.id}` : ""}">看实景</a>` : ""}
        ${route ? `<a class="ghost-action" href="#/route/${route.id}">返回路线</a>` : ""}
      </div>
    </section>
  `;
}

function renderMap() {
  const mapSprings = getMapSprings();
  const selectedSpring = getSelectedMapSpring(mapSprings);
  const clusters = getMapClusters(mapSprings);
  const coreClusters = clusters.filter((cluster) => cluster.scope !== "regional");
  const regionalClusters = clusters.filter((cluster) => cluster.scope === "regional");
  const selectedCluster = getSelectedMapCluster(clusters);
  const showClusterView = state.mapFilter === "all" && !selectedCluster;
  const coreExpanded = showClusterView && state.mapCoreExpanded;
  const showEyeLayer = !showClusterView || state.mapEyesExpanded;
  const compactSpringCard = Boolean(selectedCluster) || state.mapFilter === "route";
  const visibleEyeSprings = showEyeLayer ? (showClusterView ? getMapOverviewSprings(mapSprings, coreClusters) : mapSprings) : [];
  const areaGroups = groupByArea(springs.filter((spring) => spring.detailLevel === "featured" || spring.level !== "C"));
  return `
    <section class="page stack">
      <div>
        <p class="eyebrow">泉城鸟瞰</p>
        <h1>72 名泉分布 · 手绘导览</h1>
        <p class="lead">先看片区格局，再展开密集泉群。默认保留片区章印、核心顶牌和市域方位牌，需要时再查看全部泉眼。</p>
      </div>
      <section class="handdrawn-map-shell">
        <div class="map-control-bar">
          <div class="map-filter-row" aria-label="地图筛选">
            ${renderMapFilter("all", "全部")}
            ${renderMapFilter("route", "经典路线")}
            ${renderMapFilter("panorama", "有实景")}
            ${renderMapFilter("favorite", "已收藏")}
          </div>
          ${renderMapRouteStatusBar()}
          ${showClusterView ? renderMapEyeToggle() : ""}
        </div>
        <div class="handdrawn-map-stage" aria-label="泉城手绘鸟瞰地图">
          ${renderHanddrawnMapBase()}
          <div class="map-eye-layer" aria-label="72 名泉泉眼点">
            ${visibleEyeSprings.map((spring) => renderMapEye(spring, selectedSpring)).join("")}
          </div>
          ${showClusterView ? renderMapCoreTray(coreClusters, coreExpanded) : ""}
          <div class="map-cluster-layer">
            ${coreExpanded ? coreClusters.map(renderMapClusterBadge).join("") : ""}
          </div>
          ${showClusterView && !coreExpanded ? renderRegionalDirectionRing(regionalClusters) : ""}
          <div class="map-pin-layer ${selectedCluster ? "expanded" : ""}">
            ${renderMapPinLayer(mapSprings, selectedSpring, selectedCluster)}
          </div>
          ${selectedCluster ? renderMapClusterPanel(selectedCluster) : ""}
          ${coreExpanded ? "" : (!showClusterView || selectedCluster) ? renderMapSpringCard(selectedSpring, compactSpringCard) : ""}
        </div>
      </section>
      <div>
        <p class="eyebrow">泉点分布</p>
        <h2 class="section-title">按片区继续找泉</h2>
      </div>
      <div class="area-map">
        ${Object.entries(areaGroups).map(([area, items]) => renderAreaBand(area, items)).join("")}
      </div>
      <section class="guide-card">
        <p class="card-kicker">说明</p>
        <p>这是片区导览，不替代实时导航。实际步行时间会受人流、天气和停留节奏影响。</p>
      </section>
    </section>
  `;
}

function renderMapFilter(value, label) {
  const active = state.mapFilter === value;
  return `<button type="button" class="map-filter ${active ? "active" : ""}" data-action="map-filter" data-filter="${value}" aria-pressed="${active}">${label}</button>`;
}

function renderMapEyeToggle() {
  const expanded = state.mapEyesExpanded;
  return `<button type="button" class="map-eye-toggle ${expanded ? "active" : ""}" data-action="toggle-map-eyes" aria-pressed="${expanded}">${expanded ? "收起全部泉眼" : "展开全部泉眼"}</button>`;
}

function renderMapRouteStatusBar() {
  if (state.mapFilter !== "route") return "";
  const route = getActiveRoute() || routes.find((item) => item.id === "classic-3h");
  if (!route) return "";
  const progress = getRouteProgress(route);
  const nextName = progress.currentSpring ? progress.currentSpring.name : "路线完成";
  return `
    <div class="map-route-status-bar" aria-label="路线状态">
      <strong>路线状态</strong>
      <span>${route.shortName} · ${progress.completed}/${progress.total} 已看</span>
      <em>${nextName}</em>
    </div>
  `;
}

function renderMapCoreTray(coreClusters, expanded) {
  const springCount = coreClusters.reduce((total, cluster) => total + cluster.springs.length, 0);
  const cardClusters = getPrioritizedMapCoreClusters(coreClusters);
  return `
    <div class="map-core-tray ${expanded ? "expanded" : ""}" aria-label="老城泉群">
      <button type="button" class="map-core-toggle ${expanded ? "expanded" : ""}" data-action="toggle-map-core" aria-expanded="${expanded}">
        <strong>${expanded ? "收起老城精细图" : "老城泉群"}</strong>
        <span>${springCount} 个老城泉点</span>
      </button>
      <div class="map-core-card-row">
        ${cardClusters.map(renderMapCoreCard).join("")}
      </div>
    </div>
  `;
}

function getPrioritizedMapCoreClusters(coreClusters) {
  const priority = ["wulongtan-park", "old-city-streets", "baotu-park", "moat-park", "zhenzhu-courtyard"];
  return [...coreClusters].sort((a, b) => {
    const aIndex = priority.indexOf(a.id);
    const bIndex = priority.indexOf(b.id);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

function renderMapCoreCard(cluster) {
  const featured = cluster.springs.find((spring) => spring.level === "S" || spring.level === "A") || cluster.springs[0];
  return `
    <button type="button" class="map-core-card cluster-${cluster.tone}" data-action="select-map-cluster" data-cluster-id="${cluster.id}" aria-label="展开${cluster.name}">
      <strong>${cluster.shortName || cluster.name}</strong>
      <span>${cluster.springs.length} 泉 · ${featured.name}</span>
    </button>
  `;
}

function renderHanddrawnMapBase() {
  return `
    <svg class="handdrawn-map-base" viewBox="0 0 1000 680" role="img" aria-label="手绘风泉城水系底图">
      <rect width="1000" height="680" rx="28" fill="#f7ead0"></rect>
      <path d="M78 380 C210 332, 294 430, 430 372 C558 318, 640 314, 780 370 C858 402, 924 362, 964 330" fill="none" stroke="#72aeb0" stroke-width="34" stroke-linecap="round" opacity="0.38"></path>
      <path d="M94 376 C222 338, 312 414, 442 368 C560 324, 652 326, 770 374 C850 406, 912 366, 950 334" fill="none" stroke="#2a8580" stroke-width="3" stroke-dasharray="9 13" opacity="0.58"></path>
      <ellipse cx="380" cy="292" rx="122" ry="76" fill="#9bc9bf" opacity="0.34"></ellipse>
      <ellipse cx="275" cy="366" rx="86" ry="60" fill="#88bbb0" opacity="0.28"></ellipse>
      <ellipse cx="674" cy="348" rx="98" ry="62" fill="#8fbfb5" opacity="0.26"></ellipse>
      <path d="M180 520 C300 470, 440 492, 560 452 C680 414, 778 446, 900 396" fill="none" stroke="#c9bea3" stroke-width="10" stroke-linecap="round" opacity="0.58"></path>
      <g class="map-landmark">
        <text x="292" y="284">五龙潭</text>
        <text x="216" y="438">趵突泉公园</text>
        <text x="620" y="420">护城河</text>
        <text x="612" y="300">珍珠泉片区</text>
        <text x="430" y="222">大明湖 / 老城</text>
      </g>
    </svg>
  `;
}

function renderMapEye(spring, selectedSpring) {
  const point = projectSpringToMap(spring);
  const selected = selectedSpring && selectedSpring.id === spring.id;
  return `<span class="map-eye level-${spring.level.toLowerCase()} ${selected ? "selected" : ""}" style="left:${point.x}%; top:${point.y}%;" title="${spring.name}"></span>`;
}

function renderMapClusterBadge(cluster) {
  const featured = cluster.springs.find((spring) => spring.level === "S" || spring.level === "A") || cluster.springs[0];
  return `
    <button type="button" class="map-cluster-badge cluster-${cluster.tone}" style="left:${cluster.x}%; top:${cluster.y}%;" data-action="select-map-cluster" data-cluster-id="${cluster.id}" aria-label="展开${cluster.name}">
      <strong>${cluster.shortName || cluster.name}</strong>
      <span>${cluster.springs.length} 泉 · ${featured.name}</span>
    </button>
  `;
}

function renderRegionalDirectionRing(clusters) {
  if (!clusters.length) return "";
  return `
    <div class="map-region-ring" aria-label="市域方位牌">
      <p>市域方位牌</p>
      ${clusters.map(renderRegionalDirectionCard).join("")}
    </div>
  `;
}

function renderRegionalDirectionCard(cluster) {
  const featured = cluster.springs.find((spring) => spring.level === "S" || spring.level === "A") || cluster.springs[0];
  return `
    <button type="button" class="map-region-card region-${cluster.direction} cluster-${cluster.tone}" data-scope="regional" data-action="select-map-cluster" data-cluster-id="${cluster.id}" aria-label="展开${cluster.name}">
      <small>${cluster.directionLabel}</small>
      <strong>${cluster.name}</strong>
      <span>${cluster.springs.length} 泉 · ${featured.name}</span>
    </button>
  `;
}

function renderMapPinLayer(mapSprings, selectedSpring, selectedCluster) {
  if (selectedCluster) {
    return selectedCluster.springs.map((spring, index) => renderExpandedMapPin(spring, selectedSpring, selectedCluster, index)).join("");
  }
  if (state.mapFilter === "all") {
    return "";
  }
  return mapSprings.map((spring) => renderMapPin(spring, selectedSpring)).join("");
}

function renderMapPin(spring, selectedSpring) {
  const point = projectSpringToMap(spring);
  const selected = selectedSpring && selectedSpring.id === spring.id;
  const featured = spring.level === "S" || spring.level === "A" || spring.routeIds.length > 0;
  const label = featured ? `<span>${spring.name}</span>` : "";
  const routeStatus = getMapRouteStatus(spring);
  const statusMarkup = routeStatus ? `<em>${routeStatus.label}</em>` : "";
  return `
    <button type="button" class="map-pin level-${spring.level.toLowerCase()} ${selected ? "selected" : ""} ${spring.vrPanorama?.url ? "has-panorama" : ""} ${routeStatus ? `route-${routeStatus.key}` : ""}" style="left:${point.x}%; top:${point.y}%;" data-action="select-map-spring" data-spring-id="${spring.id}" ${routeStatus ? `data-route-status="${routeStatus.key}"` : ""} title="${spring.name}" aria-label="泉点顶牌：${spring.name}${routeStatus ? `，${routeStatus.label}` : ""}" aria-pressed="${selected}">
      <i></i>
      ${statusMarkup}
      ${label}
    </button>
  `;
}

function renderExpandedMapPin(spring, selectedSpring, cluster, index) {
  const position = projectSpringInCluster(spring, cluster, index);
  const selected = selectedSpring && selectedSpring.id === spring.id;
  const label = `<span>${index + 1}. ${spring.name}</span>`;
  const anchor = projectSpringToMap(spring);
  const routeStatus = getMapRouteStatus(spring);
  const statusMarkup = routeStatus ? `<em>${routeStatus.label}</em>` : "";
  return `
    <button type="button" class="map-pin expanded-pin level-${spring.level.toLowerCase()} ${selected ? "selected" : ""} ${spring.vrPanorama?.url ? "has-panorama" : ""} ${routeStatus ? `route-${routeStatus.key}` : ""}" style="left:${position.x}%; top:${position.y}%; --anchor-x:${anchor.x}%; --anchor-y:${anchor.y}%;" data-action="select-map-spring" data-spring-id="${spring.id}" ${routeStatus ? `data-route-status="${routeStatus.key}"` : ""} title="${spring.name}" aria-label="泉点顶牌：${spring.name}${routeStatus ? `，${routeStatus.label}` : ""}" aria-pressed="${selected}">
      <i></i>
      <b>${index + 1}</b>
      ${statusMarkup}
      ${label}
    </button>
  `;
}

function getMapRouteStatus(spring) {
  if (!spring) return null;
  const route = getActiveRoute() || routes.find((item) => item.id === "classic-3h");
  if (!route || !route.stopIds.includes(spring.id)) return null;
  const progress = getRouteProgress(route);
  if (isVisited(spring.id)) return { key: "visited", label: "已看" };
  if (progress.currentSpring?.id === spring.id) return { key: "current", label: "当前站" };
  if (progress.nextSpring?.id === spring.id) return { key: "next", label: "下一站" };
  return { key: "unseen", label: "未看" };
}

function renderMapOverviewCard(clusters, mapSprings) {
  return `
    <article class="map-spring-card map-overview-card">
      <p class="card-kicker">老城精细图</p>
      <h2>老城看泉，远郊看方位</h2>
      <p>老城核心泉点落在水系图上；章丘、长清、平阴和南部山区放在市域方位牌中，避免误导实际位置。</p>
      <div class="map-cluster-summary">
        ${clusters.map((cluster) => `<button type="button" data-action="select-map-cluster" data-cluster-id="${cluster.id}">${cluster.name}<span>${cluster.springs.length}</span></button>`).join("")}
      </div>
    </article>
  `;
}

function renderMapClusterPanel(cluster) {
  const groupGuide = getSpringGroupGuide(cluster.id);
  return `
    <div class="map-cluster-panel">
      <button type="button" class="map-back-button" data-action="clear-map-cluster">返回全城鸟瞰</button>
      <strong>${cluster.name}</strong>
      <span>${groupGuide ? `${groupGuide.durationLabel} · ${groupGuide.promise}` : `${cluster.springs.length} 个泉点已展开`}</span>
    </div>
    ${renderMapClusterGuide(groupGuide)}
  `;
}

function renderMapClusterGuide(groupGuide) {
  if (!groupGuide) return "";
  return `
    <aside class="map-cluster-guide">
      <p class="card-kicker">泉群顺序</p>
      <strong>${groupGuide.title}</strong>
      <span>${groupGuide.durationLabel} · ${groupGuide.promise}</span>
      <ol>
        ${groupGuide.steps.map((step) => `<li><b>${step.name}</b><em>${step.action}</em><small>${step.reason}</small></li>`).join("")}
      </ol>
    </aside>
  `;
}

function getSpringGroupGuide(clusterId) {
  return springGroups.find((group) => group.id === clusterId) || null;
}

function renderMapSpringCard(spring, compact = false) {
  if (!spring) {
    return `
      <article class="map-spring-card empty">
        <p class="card-kicker">泉点顶牌</p>
        <h2>先收藏一个泉点</h2>
        <p>收藏后可以在这里查看专属分布，也可以切回“全部”继续浏览 72 名泉。</p>
        <div class="action-row">
          <button type="button" class="ghost-action" data-action="map-filter" data-filter="all">查看全部泉点</button>
        </div>
      </article>
    `;
  }
  const route = routes.find((item) => item.stopIds.includes(spring.id));
  const routeIndex = route ? route.stopIds.indexOf(spring.id) + 1 : 0;
  const routeStatus = getMapRouteStatus(spring);
  return `
    <article class="map-spring-card ${compact ? "compact" : ""}">
      <p class="card-kicker">泉点顶牌</p>
      <h2>${spring.name}</h2>
      <strong>${spring.group} · ${LEVEL_LABELS[spring.level] || spring.level}</strong>
      ${compact ? "" : `<p>${spring.summary}</p>`}
      ${renderMapFieldDecision(spring, route, routeIndex, routeStatus)}
      <div class="action-row">
        <a class="primary-action dark" href="${mapSpringHref(spring.id, state.selectedMapClusterId)}">看详情</a>
        ${spring.vrPanorama?.url ? `<a class="secondary-action" href="${mapSpringHref(spring.id, state.selectedMapClusterId, "panorama")}">看实景</a>` : ""}
        <a class="ghost-action" href="${mapUrl(spring)}" target="_blank" rel="noopener">${getMapDecision(spring).actionLabel}</a>
      </div>
    </article>
  `;
}

function renderMapFieldDecision(spring, route, routeIndex, routeStatus) {
  const decision = getMapDecision(spring);
  const routeText = route ? `路线关系：${route.shortName}第 ${routeIndex} 站` : "适合从图鉴继续探索";
  const statusText = routeStatus ? ` · ${routeStatus.label}` : "";
  const trustLabel = spring.mapTrustLabel || "片区中心";
  return `
    <div class="map-field-decision">
      <div>
        <span>现场决策</span>
        <strong>适合现在去吗</strong>
        <p>地图点位：${trustLabel}。${decision.title}。${routeText}${statusText}</p>
      </div>
      <em>${decision.actionLabel}</em>
    </div>
  `;
}

function getMapDecision(spring) {
  const level = spring?.mapTrustLevel || "area";
  const decisions = {
    exact: {
      actionLabel: "导航到泉眼",
      title: "可以直接按泉眼走",
      body: "外部地图会落到泉眼附近，到了现场优先看水面、亭廊和题刻的对应关系。",
      steps: ["跟随地图到点位", "抬头找泉名或水面", "再打开拍照引导"]
    },
    entrance: {
      actionLabel: "先到景区入口",
      title: "先到入口，再找泉眼",
      body: "这类泉多在公园或景区内部，外部地图更适合把你带到入口，进园后按现场导览和泉游记提示继续找。",
      steps: ["先导航到入口", "入园后找泉", "到泉边再看实景"]
    },
    area: {
      actionLabel: "先到附近片区",
      title: "先到片区，再现场确认",
      body: "这类点位适合先到附近街区或村落，现场结合名称、环境和泉群关系确认，不建议只盯一个地图点。",
      steps: ["先到附近片区", "到场后核对泉名", "顺路看同片区泉点"]
    }
  };
  return decisions[level] || decisions.area;
}

function renderMapDecisionCard(spring) {
  const decision = getMapDecision(spring);
  return `
    <div class="map-decision">
      <div>
        <strong>${decision.title}</strong>
        <p>${decision.body}</p>
      </div>
      <a class="primary-action dark block-action" href="${mapUrl(spring)}" target="_blank" rel="noopener">${decision.actionLabel}</a>
      <div class="map-decision-steps">
        ${decision.steps.map((step, index) => `<span>${index + 1}. ${step}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderMapTrustBadge(spring) {
  if (!spring) return "";
  const level = spring.mapTrustLevel || "area";
  const label = spring.mapTrustLabel || "片区中心";
  const note = spring.mapTrustNote || "到附近后再确认";
  return `
    <div class="map-trust">
      <span class="${level}">${label}</span>
      <strong>地图点位</strong>
      <em>${note}</em>
    </div>
  `;
}

function getMapSprings() {
  if (state.mapFilter === "route") {
    const routeIds = new Set(routes.find((route) => route.id === "classic-3h")?.stopIds || []);
    return springs.filter((spring) => routeIds.has(spring.id));
  }
  if (state.mapFilter === "panorama") return springs.filter((spring) => spring.vrPanorama?.url);
  if (state.mapFilter === "favorite") return springs.filter((spring) => isFavoriteSpring(spring.id));
  return springs;
}

function getMapClusters(mapSprings = getMapSprings()) {
  const clusterMap = new Map();
  mapSprings.forEach((spring) => {
    const meta = getMapClusterMeta(spring);
    if (!clusterMap.has(meta.id)) {
      clusterMap.set(meta.id, { ...meta, springs: [] });
    }
    clusterMap.get(meta.id).springs.push(spring);
  });
  return Array.from(clusterMap.values())
    .map((cluster) => {
      const centroid = getClusterCentroid(cluster.springs);
      return {
        ...cluster,
        x: cluster.x ?? centroid.x,
        y: cluster.y ?? centroid.y
      };
    })
    .sort((a, b) => a.order - b.order);
}

function getMapClusterMeta(spring) {
  if (spring.group === "趵突泉公园内") return { id: "baotu-park", name: "趵突泉片区", shortName: "趵突泉", order: 1, tone: "gold", scope: "core", x: 23, y: 54 };
  if (spring.group === "五龙潭公园内") return { id: "wulongtan-park", name: "五龙潭片区", shortName: "五龙潭", order: 2, tone: "water", scope: "core", x: 30, y: 30 };
  if (spring.group === "环城公园内") return { id: "moat-park", name: "护城河片区", shortName: "护城河", order: 3, tone: "water", scope: "core", x: 62, y: 59 };
  if (spring.group === "省人大院内") return { id: "zhenzhu-courtyard", name: "珍珠泉片区", shortName: "珍珠泉", order: 4, tone: "jade", scope: "core", x: 58, y: 34 };
  if (spring.group === "章丘区百脉泉公园内") return { id: "baimai-park", name: "百脉泉片区", shortName: "百脉泉", order: 5, tone: "stone", scope: "regional", direction: "east", directionLabel: "东 · 章丘", x: 74, y: 50 };
  if (spring.district === "南部山区") return { id: "southern-mountains", name: "南部山泉", shortName: "南部山泉", order: 7, tone: "mountain", scope: "regional", direction: "south", directionLabel: "南 · 山泉", x: 50, y: 60 };
  if (spring.district === "章丘区") return { id: "zhangqiu-area", name: "章丘周边", shortName: "章丘", order: 8, tone: "stone", scope: "regional", direction: "east", directionLabel: "东 · 章丘", x: 76, y: 42 };
  if (spring.district === "长清区") return { id: "changqing-area", name: "长清灵岩", shortName: "长清", order: 9, tone: "mountain", scope: "regional", direction: "southwest", directionLabel: "西南 · 长清", x: 28, y: 58 };
  if (spring.district === "平阴县") return { id: "pingyin-area", name: "平阴泉群", shortName: "平阴", order: 10, tone: "stone", scope: "regional", direction: "southwest", directionLabel: "西南 · 平阴", x: 22, y: 62 };
  return { id: "old-city-streets", name: "大明湖老城", shortName: "大明湖老城", order: 6, tone: "jade", scope: "core", x: 42, y: 45 };
}

function getMapOverviewSprings(mapSprings, coreClusters) {
  const coreIds = new Set(coreClusters.flatMap((cluster) => cluster.springs.map((spring) => spring.id)));
  return mapSprings.filter((spring) => coreIds.has(spring.id));
}

function getSelectedMapCluster(clusters = getMapClusters()) {
  if (!state.selectedMapClusterId) return null;
  return clusters.find((cluster) => cluster.id === state.selectedMapClusterId) || null;
}

function getClusterCentroid(items) {
  const points = items.map(projectSpringToMap);
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return {
    x: total.x / (points.length || 1),
    y: total.y / (points.length || 1)
  };
}

function projectSpringInCluster(spring, cluster, index) {
  const count = cluster.springs.length;
  const center = { x: cluster.x, y: cluster.y };
  const ringIndex = Math.floor(index / 8);
  const indexInRing = index % 8;
  const itemsInRing = Math.min(8, count - ringIndex * 8);
  const angle = (-110 + (220 / Math.max(itemsInRing - 1, 1)) * indexInRing + ringIndex * 18) * Math.PI / 180;
  const radius = 9 + ringIndex * 6 + Math.min(count, 14) * 0.22;
  const projected = {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius * 0.72
  };
  return {
    x: Math.max(7, Math.min(93, projected.x)),
    y: Math.max(9, Math.min(74, projected.y))
  };
}

function getSelectedMapSpring(mapSprings = getMapSprings()) {
  const selectedCluster = getSelectedMapCluster(getMapClusters(mapSprings));
  const candidates = selectedCluster ? selectedCluster.springs : mapSprings;
  return candidates.find((spring) => spring.id === state.selectedMapSpringId) || candidates[0] || null;
}

function ensureSelectedSpringForCurrentMap() {
  const filteredSprings = getMapSprings();
  const selectedCluster = getSelectedMapCluster(getMapClusters(filteredSprings));
  const candidates = selectedCluster ? selectedCluster.springs : filteredSprings;
  if (!candidates.some((spring) => spring.id === state.selectedMapSpringId)) {
    state.selectedMapSpringId = candidates[0]?.id || "baotu";
  }
}

function getMapBounds() {
  const located = springs.filter((spring) => Number.isFinite(spring.latitude) && Number.isFinite(spring.longitude));
  const latitudes = located.map((spring) => spring.latitude);
  const longitudes = located.map((spring) => spring.longitude);
  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes)
  };
}

function projectSpringToMap(spring) {
  const bounds = getMapBounds();
  const x = ((spring.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 84 + 8;
  const y = (1 - (spring.latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 74 + 11;
  return {
    x: Math.max(4, Math.min(96, x)),
    y: Math.max(6, Math.min(92, y))
  };
}

function renderAreaBand(area, items) {
  const routeNames = routes
    .filter((route) => route.stopIds.some((id) => items.some((spring) => spring.id === id)))
    .map((route) => route.shortName)
    .slice(0, 3);
  return `
    <section class="area-band">
      <div>
        <p class="card-kicker">${items.length} 个重点泉点</p>
        <h2>${area}</h2>
        ${routeNames.length ? `<p>经过路线：${routeNames.join("、")}</p>` : "<p>适合作为图鉴探索片区。</p>"}
      </div>
      <div class="area-links">
        ${items.slice(0, 8).map((spring) => `<a href="#/spring/${spring.id}">${spring.name}</a>`).join("")}
      </div>
    </section>
  `;
}

function buildTripJournalSummary(activeRoute, visitedSprings) {
  if (!activeRoute && !visitedSprings.length) return "从一条路线开始，泉游记会把你的看泉记录整理成一张游记卡。";
  if (activeRoute && visitedSprings.length) {
    const names = visitedSprings.slice(0, 3).map((spring) => spring.name).join("、");
    return `${activeRoute.journalPrompt} 我已经看过 ${names}${visitedSprings.length > 3 ? "等" : ""} ${visitedSprings.length} 眼泉。`;
  }
  if (activeRoute) return activeRoute.journalPrompt;
  const names = visitedSprings.slice(0, 3).map((spring) => spring.name).join("、");
  return `我在济南看见了 ${names}${visitedSprings.length > 3 ? "等" : ""} ${visitedSprings.length} 眼泉。`;
}

function renderTripJournalCard(activeRoute, visitedSprings, progress, cover) {
  const summary = buildTripJournalSummary(activeRoute, visitedSprings);
  const badge = activeRoute ? activeRoute.storyMood : "自由寻泉";
  return `
    <section class="trip-journal-card">
      ${cover ? renderImage(cover, "share-image", activeRoute ? activeRoute.name : "泉游记") : ""}
      <div>
        <p>我的泉城游记</p>
        <h2>我在济南看见的水</h2>
        <strong>${badge}</strong>
        <span class="journal-summary">游记摘要：${summary}</span>
        <span>我已看过 ${visitedSprings.length} 眼济南名泉${activeRoute && progress ? ` · 路线完成 ${progress.percent}%` : ""}</span>
        <em>适合截图分享</em>
      </div>
    </section>
  `;
}

function renderClassicCompletionCard(activeRoute, visitedSprings, progress) {
  if (!activeRoute || activeRoute.id !== "classic-3h" || !progress?.done) return "";
  const focusSprings = activeRoute.stopIds
    .map((id) => springs.find((spring) => spring.id === id))
    .filter(Boolean);
  return `
    <section class="classic-completion-card">
      <p>经典线完成</p>
      <h2>${activeRoute.premiumGuide.completionTitle}</h2>
      <strong>5 站全部看完</strong>
      <span>${activeRoute.premiumGuide.completionSummary}</span>
      <strong class="completion-album-title">经典线小相册</strong>
      <div class="completion-album" aria-label="经典线小相册">
        ${focusSprings.map((spring) => `
          <a href="#/spring/${spring.id}">
            ${renderImage(spring.coverImage, "completion-thumb", spring.name)}
            <span>${spring.name}</span>
          </a>
        `).join("")}
      </div>
      <div class="completion-next">
        <strong>下一步可以继续</strong>
        ${activeRoute.premiumGuide.nextIdeas.map((item) => `<span>${item}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderSpringPhotoGuide() {
  const spring = springs.find((item) => item.id === state.springId);
  if (!spring) return renderEmpty("泉点未找到", "回到图鉴", "#/springs");
  if (!spring.photoGuides?.length) return renderEmpty("这个泉点还没有拍照引导", "回到泉点", `#/spring/${spring.id}`);
  const activeGuide = spring.photoGuides.find((guide) => guide.id === state.photoGuideId) || spring.photoGuides[0];
  const cameraStatus = getCameraStatusCopy(state.cameraStatus);
  const cameraButtonText = getCameraButtonText(state.cameraStatus);
  const activeIndex = spring.photoGuides.findIndex((guide) => guide.id === activeGuide.id);
  const coachTip = getActiveCoachTip(activeGuide);
  return `
    <section class="photo-guide-page">
      <div class="photo-guide-topbar">
        <a class="back-link light" href="#/spring/${spring.id}">返回泉点</a>
        <span>${spring.name}</span>
      </div>
      <div class="photo-stage coach-stage fallback">
        <img src="${activeGuide.sampleImage}" alt="${spring.name}样张参考" />
        <video class="photo-video" autoplay muted playsinline></video>
        <canvas class="photo-canvas" width="1080" height="1440"></canvas>
        <div class="coach-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="ar-overlay coach-anchors ${activeGuide.overlay}">
          <span></span><span></span><span></span>
        </div>
        <div class="coach-task-header">
          <small>现场拍摄教练 · ${activeIndex + 1}/${spring.photoGuides.length}</small>
          <strong>${spring.name} · ${activeGuide.sceneLabel}</strong>
          <span>${activeGuide.title}</span>
        </div>
        <button class="sample-thumb" type="button" aria-label="样张小窗">
          <img src="${activeGuide.sampleImage}" alt="${spring.name}${activeGuide.sceneLabel}样张小窗" />
          <span>样张小窗</span>
        </button>
        <div class="coach-prompt">
          <small>教练提示</small>
          <strong>${coachTip}</strong>
        </div>
      </div>
      <section class="photo-guide-panel">
        <p class="card-kicker">现场拍摄教练</p>
        <h1>${activeGuide.title}</h1>
        <strong>${activeGuide.sceneLabel}</strong>
        <p>${activeGuide.goal || activeGuide.prompt}</p>
        <p>${activeGuide.composition}</p>
        <p class="camera-fallback-note">九宫格常驻；拍后会检查亮度和方向。相机不可用时，可以照着样张小窗和提示用系统相机完成这张照片。</p>
        ${renderCameraEnvironmentCheck()}
        <p class="camera-status ${cameraStatus.tone}" role="status">${cameraStatus.text}</p>
        ${renderCaptureReview(spring, activeGuide)}
        <div class="photo-task-row">
          ${spring.photoGuides.map((guide) => `<button class="photo-task ${guide.id === activeGuide.id ? "active" : ""}" data-action="select-photo-guide" data-guide-id="${guide.id}">${guide.sceneLabel}</button>`).join("")}
        </div>
        <div class="action-row">
          <button class="primary-action dark" data-action="start-camera" ${state.cameraStatus === "opening" ? "disabled" : ""}>${cameraButtonText}</button>
          <button class="secondary-action" data-action="use-sample-camera">使用样张练习</button>
          <button class="secondary-action" data-action="capture-photo">拍一张</button>
          <button class="ghost-action" data-action="save-photo-guide">保存到我的游记</button>
          <span class="panorama-source">样张参考</span>
        </div>
      </section>
    </section>
  `;
}

function getActiveCoachTip(guide) {
  if (Array.isArray(guide.coachTips) && guide.coachTips.length) return guide.coachTips[0];
  return guide.prompt || guide.composition || "先打开相机，跟着九宫格完成这张照片。";
}

function renderCaptureReview(spring, guide) {
  if (!state.capturedPhoto) return "";
  const checks = state.captureDiagnostics.length ? state.captureDiagnostics : getCaptureChecks(guide);
  const nextGuide = getNextPhotoGuide(spring, guide.id);
  return `
    <section class="capture-review">
      <img src="${state.capturedPhoto}" alt="${spring.name}${guide.sceneLabel}预览" />
      <div>
        <p class="card-kicker">成片检查</p>
        <h2>${guide.sceneLabel}已拍好</h2>
        <ul>
          ${checks.map((item) => `<li><strong>${item.label}</strong><span>${item.text}</span></li>`).join("")}
        </ul>
        <div class="action-row">
          <button class="primary-action dark" data-action="save-photo-guide">保存到我的游记</button>
          <button class="secondary-action" data-action="retake-photo">重拍</button>
          <button class="ghost-action" data-action="next-photo-guide" data-guide-id="${nextGuide.id}">下一张任务</button>
        </div>
      </div>
    </section>
  `;
}

function getCaptureChecks(guide) {
  return [
    { label: "亮度", text: "照片已生成；如果画面偏暗，可以换到光线更好的角度再拍一张。" },
    { label: "方向", text: getOrientationFeedback(guide.orientation, 0, 0) },
    { label: "稳定", text: "按下快门后停半秒，水花和边石会更清晰。" }
  ];
}

function getNextPhotoGuide(spring, guideId) {
  const guides = spring.photoGuides || [];
  const index = guides.findIndex((guide) => guide.id === guideId);
  return guides[(index + 1 + guides.length) % guides.length] || guides[0] || { id: "cover" };
}

function renderCameraEnvironmentCheck() {
  const items = getCameraEnvironmentItems();
  return `
    <div class="camera-check" aria-label="相机环境检查">
      <strong>相机环境检查</strong>
      <div>
        ${items.map((item) => `<span class="${item.tone}">${item.label}</span>`).join("")}
      </div>
    </div>
  `;
}

function getCameraEnvironmentItems() {
  const browserNavigator = getBrowserNavigator();
  const protocol = location.protocol || "";
  const host = location.hostname || "";
  const hasCameraApi = Boolean(browserNavigator.mediaDevices?.getUserMedia);
  const isSecure = protocol === "https:" || host === "localhost" || host === "127.0.0.1" || protocol === "file:";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(browserNavigator.userAgent || "");
  return [
    { label: hasCameraApi ? "浏览器支持相机" : "浏览器不支持相机", tone: hasCameraApi ? "ok" : "warn" },
    { label: isSecure ? "当前环境可打开相机" : "需要 HTTPS 或 localhost", tone: isSecure ? "ok" : "warn" },
    { label: isMobile ? "移动端优先用后置镜头" : "桌面端使用电脑摄像头", tone: "neutral" }
  ];
}

function getBrowserNavigator() {
  if (typeof navigator !== "undefined") return navigator;
  return window.navigator || {};
}

function getCameraStatusCopy(status) {
  const copy = {
    idle: ["打开相机后，现场画面会覆盖样张，构图线保留在最上层。", "neutral"],
    opening: ["正在请求相机权限，请在浏览器提示中允许使用摄像头。", "neutral"],
    ready: ["相机已打开：当前看到的是现场画面，样张已退到底层，仅保留构图线。", "success"],
    darkFrame: ["相机已打开。如果画面偏黑，请检查镜头遮挡、光线或设备占用。", "warning"],
    permissionDenied: ["相机权限没有打开。请在浏览器或微信设置里允许相机权限，然后点重新尝试。", "warning"],
    busy: ["相机可能正被系统相机、会议软件或其他应用占用。关闭占用相机的应用后，再点重新尝试。", "warning"],
    noDevice: ["没有检测到可用摄像头。可以切到样张练习，按构图提示用系统相机完成拍摄。", "warning"],
    insecure: ["当前环境不能直接打开网页相机。请使用 HTTPS、localhost 预览，或切到样张练习。", "warning"],
    unavailable: ["当前浏览器不支持网页内打开相机。可以照着样张参考和构图线，用系统相机完成这张照片。", "warning"],
    sampleMode: ["已切到样张练习：按样张小窗和九宫格完成构图，再用系统相机拍摄。", "neutral"],
    blocked: ["相机暂时没有打开。请检查权限、设备占用或切到样张练习。", "warning"]
  };
  const [text, tone] = copy[status] || copy.idle;
  return { text, tone };
}

function getCameraButtonText(status) {
  if (status === "ready") return "相机已打开";
  if (status === "opening") return "正在打开";
  if (["permissionDenied", "busy", "noDevice", "insecure", "blocked"].includes(status)) return "重新尝试";
  return "打开相机";
}

function renderMyTrip() {
  const activeRoute = getActiveRoute();
  const favoriteRoutes = routes.filter((route) => isFavoriteRoute(route.id));
  const favoriteSprings = springs.filter((spring) => isFavoriteSpring(spring.id));
  const visitedSprings = springs.filter((spring) => isVisited(spring.id));
  const progress = activeRoute ? getRouteProgress(activeRoute) : null;
  const cover = activeRoute ? activeRoute.coverImage : (visitedSprings[0] && visitedSprings[0].coverImage);
  return `
    <section class="page stack">
      <div>
        <p class="eyebrow">本地保存，不需要登录</p>
        <h1>我的行程</h1>
        <p class="lead">记录当前路线、已看过的泉点和收藏，保存在这个浏览器里。</p>
      </div>
      ${renderTripCockpit(activeRoute, visitedSprings, progress)}
      ${renderTripRecapDashboard(activeRoute, progress)}
      ${renderRouteFinishPanel(activeRoute, visitedSprings, progress)}
      ${renderClassicCompletionCard(activeRoute, visitedSprings, progress)}
      ${renderTripJournalCard(activeRoute, visitedSprings, progress, cover)}
      ${renderPhotoGuideDrafts()}
      <details class="guide-card trip-more-panel">
        <summary>已看与收藏</summary>
        <div class="trip-more-grid">
          <section>
            <p class="card-kicker">已看过</p>
            ${visitedSprings.length ? visitedSprings.map((spring) => `<a class="text-link block" href="#/spring/${spring.id}">${spring.name}</a>`).join("") : "<p>还没有标记已看过的泉点。</p>"}
          </section>
          <section>
            <p class="card-kicker">收藏路线</p>
            ${favoriteRoutes.length ? favoriteRoutes.map((route) => `<a class="text-link block" href="#/route/${route.id}">${route.name}</a>`).join("") : "<p>还没有收藏路线。</p>"}
          </section>
          <section>
            <p class="card-kicker">收藏泉点</p>
            ${favoriteSprings.length ? favoriteSprings.map((spring) => `<a class="text-link block" href="#/spring/${spring.id}">${spring.name}</a>`).join("") : "<p>还没有收藏泉点。</p>"}
          </section>
        </div>
      </details>
      <button class="danger-button" data-action="clear-trip">清空本地记录</button>
    </section>
  `;
}

function getTripRecap(activeRoute, progress) {
  if (!activeRoute || !progress) {
    return {
      status: "未开始",
      nextTitle: "先选一条路线",
      nextBody: "从经典 3 小时线开始最稳，选好后这里会自动变成现场复盘和下一步建议。",
      action: ["去选路线", "#/routes"],
      mascot: "游泉哇建议：先不要收藏太多点，先选一条今天真正会走的路线。",
      visited: [],
      skipped: [],
      pending: []
    };
  }
  const stops = getRouteStops(activeRoute);
  const visited = stops.filter((spring) => isVisited(spring.id));
  const skipped = stops.filter((spring) => isSkipped(spring.id));
  const pending = stops.filter((spring) => !isVisited(spring.id) && !isSkipped(spring.id));
  if (progress.done) {
    return {
      status: "已完成",
      nextTitle: "整理游记",
      nextBody: `这趟泉城游记已成行：${activeRoute.name}已经完成，可以整理照片、生成游记卡，或换一条路线继续探索。`,
      action: ["整理游记", "#/my"],
      mascot: "游泉哇复盘建议：现在不要继续堆站点，先把今天最有记忆点的 2-3 眼泉整理出来。",
      visited,
      skipped,
      pending
    };
  }
  const current = progress.currentSpring || pending[0];
  return {
    status: "进行中",
    nextTitle: "继续跟着走",
    nextBody: current ? `先完成当前站${current.name}，再决定是继续、压缩，还是轻松收尾。` : "继续按路线推进，完成当前片区后再整理游记。",
    action: ["继续跟着走", `#/route/${activeRoute.id}`],
    mascot: current ? `游泉哇复盘建议：先完成当前站${current.name}，别急着横跳片区。` : "游泉哇复盘建议：保持当前路线节奏，少做临时加点。",
    visited,
    skipped,
    pending
  };
}

function renderTripRecapDashboard(activeRoute, progress) {
  const recap = getTripRecap(activeRoute, progress);
  const routeName = activeRoute ? activeRoute.name : "尚未选择路线";
  return `
    <section class="trip-recap-dashboard" aria-label="今日泉游复盘">
      <div class="trip-recap-head">
        <div>
          <p class="card-kicker">今日泉游复盘</p>
          <h2>${routeName}</h2>
        </div>
        <span>${recap.status}</span>
      </div>
      <div class="trip-recap-status">
        <div>
          <strong>今日状态</strong>
          <span>${recap.status}</span>
        </div>
        <div>
          <strong>下一步建议</strong>
          <span>${recap.nextTitle}</span>
        </div>
      </div>
      <p>${recap.nextBody}</p>
      <div class="trip-recap-metrics">
        <span>已看 ${recap.visited.length}</span>
        <span>跳过 ${recap.skipped.length}</span>
        <span>未看 ${recap.pending.length}</span>
      </div>
      <div class="trip-recap-track">
        <strong>今日泉眼轨迹</strong>
        <div>
          ${renderTripTrackGroup("已看", recap.visited)}
          ${renderTripTrackGroup("跳过", recap.skipped)}
          ${renderTripTrackGroup("未看", recap.pending)}
        </div>
      </div>
      <div class="trip-recap-mascot">
        <strong>游泉哇复盘建议</strong>
        <p>${recap.mascot.replace(/^游泉哇复盘建议：/, "")}</p>
      </div>
      <div class="action-row">
        <a class="primary-action dark" href="${recap.action[1]}">${recap.action[0]}</a>
        <a class="ghost-action" href="#/springs">继续探索 72 名泉</a>
      </div>
    </section>
  `;
}

function renderTripTrackGroup(label, items) {
  return `
    <section>
      <span>${label}</span>
      ${items.length ? items.map((spring) => `<a href="#/spring/${spring.id}">${spring.name}</a>`).join("") : "<em>还没有</em>"}
    </section>
  `;
}

function renderRouteFinishPanel(activeRoute, visitedSprings, progress) {
  if (!activeRoute || !progress?.done) return "";
  const routeDrafts = (state.trip.photoGuideDrafts || []).filter((draft) => activeRoute.stopIds.includes(draft.springId));
  const firstPhotoSpring = activeRoute.stopIds
    .map((id) => springs.find((spring) => spring.id === id))
    .find((spring) => spring?.photoGuides?.length);
  return `
    <section class="route-finish-panel">
      <p class="card-kicker">路线收尾</p>
      <div class="finish-head">
        <div>
          <h2>这趟泉城游记已成行</h2>
          <p>${activeRoute.name} · ${visitedSprings.length}/${progress.total} 站已记录</p>
        </div>
        <strong>游记卡已生成</strong>
      </div>
      <div class="finish-status-grid">
        <span>已看 ${visitedSprings.length} 眼泉</span>
        <span>拍照素材 ${routeDrafts.length} 张</span>
        <span>${progress.percent}% 完成</span>
      </div>
      <div class="action-row finish-actions">
        <a class="primary-action dark" href="#/springs">继续探索 72 名泉</a>
        <a class="secondary-action" href="#/routes">换一条路线</a>
        ${firstPhotoSpring ? `<a class="ghost-action" href="#/spring/${firstPhotoSpring.id}/photo">补拍经典机位</a>` : ""}
      </div>
    </section>
  `;
}

function renderTripCockpit(activeRoute, visitedSprings, progress) {
  if (!activeRoute || !progress) {
    return `
      <section class="trip-cockpit empty-cockpit">
        <p class="card-kicker">现场驾驶舱</p>
        <h2>先选一条今天要走的路线</h2>
        <p>选好路线后，这里会自动显示下一站、地图和现场导览入口。</p>
        <a class="primary-action dark block-action" href="#/routes">去选路线</a>
      </section>
    `;
  }
  const nextSpring = progress.currentSpring;
  const lastVisited = visitedSprings[visitedSprings.length - 1];
  const photoGuide = nextSpring?.photoGuides?.[0];
  const journalSummary = visitedSprings.length
    ? `已看过 ${visitedSprings.map((spring) => spring.name).slice(0, 3).join("、")}，下一步把节奏接到${nextSpring ? nextSpring.name : "游记整理"}。`
    : `从${nextSpring ? nextSpring.name : activeRoute.name}开始，先完成第一站的现场观察。`;

  return `
    <section class="trip-cockpit">
      <p class="card-kicker">现场驾驶舱</p>
      <div class="cockpit-head">
        <div>
          <h2>${activeRoute.name}</h2>
          <p>${progress.completed}/${progress.total} 已看 · ${progress.percent}% 完成</p>
        </div>
        <span>${progress.done ? "已完成" : "进行中"}</span>
      </div>
      <div class="progress-track"><span style="width:${progress.percent}%"></span></div>
      ${renderLiveFieldStatus(activeRoute, progress)}
      ${nextSpring ? `
        <div class="cockpit-next">
          <p class="card-kicker">下一站</p>
          <h3>${nextSpring.name}</h3>
          <p>${nextSpring.observationTip}</p>
          <div class="action-row cockpit-actions">
            <a class="primary-action dark" href="${mapUrl(nextSpring)}" target="_blank" rel="noopener">去下一站</a>
            <a class="ghost-action" href="${springHref(nextSpring.id, activeRoute.id)}">看这一泉</a>
            <a class="ghost-action" href="#/route/${activeRoute.id}">继续跟着走</a>
            ${nextSpring.vrPanorama?.url ? `<a class="ghost-action" href="#/spring/${nextSpring.id}?section=panorama&fromRoute=${activeRoute.id}">看现场</a>` : ""}
            ${photoGuide ? `<a class="ghost-action" href="#/spring/${nextSpring.id}/photo">拍同款</a>` : ""}
            <a class="ghost-action" href="${mapUrl(nextSpring)}" target="_blank" rel="noopener">打开地图</a>
          </div>
        </div>
        ${renderLiveGuideCard({ spring: nextSpring, route: activeRoute, nextSpring: progress.nextSpring, source: "trip", compact: true })}
      ` : `
        <div class="cockpit-next">
          <p class="card-kicker">下一站</p>
          <h3>路线已走完</h3>
          <p>可以整理今日游记，或从图鉴继续探索附近泉点。</p>
          <div class="action-row cockpit-actions">
            <a class="primary-action dark" href="#/springs">继续探索</a>
            <a class="ghost-action" href="#/routes">换一条路线</a>
          </div>
        </div>
      `}
      <div class="cockpit-summary">
        <p class="card-kicker">今日游记摘要</p>
        <p>${journalSummary}</p>
        ${lastVisited ? `<small>刚刚看过：${lastVisited.name}</small>` : ""}
      </div>
    </section>
  `;
}

function getLiveFieldStatus(route, progress = getRouteProgress(route)) {
  const stops = getRouteStops(route);
  const skipped = stops.filter((spring) => isSkipped(spring.id));
  const photoCount = (state.trip.photoGuideDrafts || []).filter((draft) => stops.some((spring) => spring.id === draft.springId)).length;
  return {
    progressText: `${progress.completed}/${progress.total} 已看`,
    skipText: skipped.length ? `跳过 ${skipped.length} 站` : "未跳过",
    nextText: progress.currentSpring ? `下一站：${progress.currentSpring.name}` : "下一站：路线完成",
    photoText: `拍照素材 ${photoCount} 张`
  };
}

function renderLiveFieldStatus(route, progress) {
  const status = getLiveFieldStatus(route, progress);
  return `
    <section class="live-status-strip" aria-label="现场状态">
      <p class="card-kicker">现场状态</p>
      <div>
        <span>${status.progressText}</span>
        <span>${status.skipText}</span>
        <span>${status.nextText}</span>
        <span>${status.photoText}</span>
      </div>
    </section>
  `;
}

function renderPhotoGuideDrafts() {
  const drafts = state.trip.photoGuideDrafts || [];
  if (!drafts.length) return "";
  return `
    <section class="guide-card">
      <p class="card-kicker">我的拍照素材</p>
      <div class="photo-draft-list">
        ${drafts.map((draft) => `
          <article class="photo-draft-card">
            <img src="${draft.imageDataUrl}" alt="${draft.springName}${draft.guideTitle}" />
            <div>
              <strong>${draft.springName}</strong>
              <span>${draft.guideTitle}</span>
              <p>${draft.shareText}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getMascotContext() {
  if (state.tab === "route") {
    const route = routes.find((item) => item.id === state.routeId);
    const progress = route ? getRouteProgress(route) : null;
    return {
      type: "route",
      route,
      progress,
      spring: progress?.currentSpring || null,
      nextSpring: progress?.nextSpring || null,
      lastCompleted: route ? getLastCompletedRouteStop(route) : null
    };
  }
  if (state.tab === "spring") {
    const spring = springs.find((item) => item.id === state.springId);
    const route = routes.find((item) => item.id === state.fromRouteId) || null;
    return {
      type: "spring",
      spring,
      route,
      nextSpring: getRouteNextSpring(route, spring)
    };
  }
  if (state.tab === "map") {
    const mapSprings = getMapSprings();
    const spring = getSelectedMapSpring(mapSprings);
    return { type: "map", spring, cluster: getSelectedMapCluster(getMapClusters(mapSprings)) };
  }
  if (state.tab === "springs") {
    return { type: "springs", spring: springs.find((spring) => spring.id === "baotu") };
  }
  if (state.tab === "my") {
    const route = getActiveRoute();
    return { type: "my", route, progress: route ? getRouteProgress(route) : null };
  }
  return { type: "home", route: getRecommendedRoutes()[0] || routes[0] };
}

function getMascotPrompts(context) {
  if (context.type === "route") {
    return [
      ["now", "我现在该做什么"],
      ["next", "下一站怎么走"],
      ["short", "时间不够怎么走"],
      ["best", "这条线最值得看哪几站"]
    ];
  }
  if (context.type === "spring") {
    return [
      ["look", "这眼泉怎么看"],
      ["story", "给我讲一句故事"],
      ["photo", "怎么拍好看"],
      ["nearby", "附近顺路看什么"]
    ];
  }
  if (context.type === "map") {
    return [
      ["nearby", "附近先看哪几个"],
      ["route", "帮我选一条轻松路线"],
      ["cluster", "这个片区怎么走"],
      ["skip", "哪些点可以跳过"]
    ];
  }
  if (context.type === "springs") {
    return [
      ["first", "第一次来先看哪几个"],
      ["photo", "想拍照看哪几个"],
      ["quiet", "想安静看哪几个"],
      ["family", "带孩子看哪几个"]
    ];
  }
  if (context.type === "my") {
    return [
      ["next", "我下一步做什么"],
      ["journal", "帮我整理游记"],
      ["photos", "我拍了哪些素材"],
      ["continue", "继续走哪条线"]
    ];
  }
  return [
    ["start", "第一次来怎么开始"],
    ["classic", "推荐一条经典线"],
    ["atlas", "我想查 72 名泉"],
    ["map", "先看地图分布"]
  ];
}

function getMascotLead(context) {
  if (context.type === "route" && context.lastCompleted && context.progress?.currentSpring) {
    const focus = (context.progress.currentSpring.firstLook || context.progress.currentSpring.observationTip)
      .replace(/^第一眼看/, "")
      .replace(/^先看/, "")
      .replace("泉池、院落和李清照相关空间的关系", "泉池和院落的关系");
    return `${context.lastCompleted.name}已记录。下一站是${context.progress.currentSpring.name}，我建议你先看${focus}`;
  }
  if (context.type === "route" && context.spring) return `我在这里陪你走${context.route.name}，当前先看${context.spring.name}。`;
  if (context.type === "spring" && context.spring) return `这页是${context.spring.name}，我可以帮你看懂、拍好、接到下一站。`;
  if (context.type === "map") return "我可以帮你把地图上的泉点变成一条顺路走法。";
  if (context.type === "springs") return "不知道先看哪一眼泉，我可以按场景帮你挑。";
  if (context.type === "my") return "我可以帮你整理今天的路线、已看泉点和拍照素材。";
  return "第一次来济南，可以先让我帮你选一条泉城路线。";
}

function getMascotAnswer(promptId, context) {
  if (state.mascotAskedText) return getMascotTextAnswer(state.mascotAskedText, context);
  const id = promptId || getMascotPrompts(context)[0]?.[0] || "start";
  if (context.type === "route") return getRouteMascotAnswer(id, context);
  if (context.type === "spring") return getSpringMascotAnswer(id, context);
  if (context.type === "map") return getMapMascotAnswer(id, context);
  if (context.type === "springs") return getAtlasMascotAnswer(id, context);
  if (context.type === "my") return getTripMascotAnswer(id, context);
  return {
    title: "先从经典路线开始",
    body: "第一次来济南，建议从初见泉城 3 小时经典线开始，先建立对泉城水声、园林和老城的第一印象。",
    actions: [["开始推荐路线", "#/route/classic-3h"], ["查 72 名泉", "#/springs"]]
  };
}

function rememberMascotChat(question, answer) {
  const text = String(question || "").trim();
  if (!text || !answer) return;
  state.mascotChat = [...state.mascotChat, {
    question: text,
    title: answer.title,
    body: answer.body
  }].slice(-3);
}

function getMascotTextAnswer(text, context) {
  const query = String(text || "").trim();
  const displayQuery = escapeHtml(query);
  const normalized = query.toLowerCase();
  const spring = context.spring || context.progress?.currentSpring || springs.find((item) => item.id === "baotu");
  const route = context.route || getActiveRoute() || routes.find((item) => item.id === "classic-3h") || routes[0];
  const nextSpring = context.nextSpring || context.progress?.nextSpring || (route && spring ? getRouteNextSpring(route, spring) : null);
  const asksPhoto = /拍|照片|机位|取景|构图|打卡/.test(query);
  const asksShort = /时间|来不及|赶|快|短|压缩|一小时|1小时/.test(query);
  const asksQuiet = /安静|人少|清净|避开|不挤|小众/.test(query);
  const asksCrowd = /人多|人.*多|太多|太挤|排队|挤|拥堵|看不见/.test(query);
  const asksTired = /累|走不动|休息|歇|脚疼|太远/.test(query);
  const asksFinish = /收尾|结束|回去|不走了|整理/.test(query);
  const asksNearby = /附近|顺路|下一|周边|接着|然后/.test(query);
  const asksVr = /实景|vr|全景|现场|看看/.test(normalized);
  const asksMap = /地图|导航|怎么走|路线|去/.test(query);
  const mapTarget = (asksNearby || /下一站|接着|然后/.test(query)) && nextSpring ? nextSpring : spring;
  const mapDecision = getMapDecision(mapTarget);
  const panoramaTrust = spring?.vrPanorama?.url ? getPanoramaTrust(spring.vrPanorama) : null;

  if (asksCrowd) {
    return {
      title: `你问：${displayQuery}`,
      body: `人太多时，先退到边缘找水面和石岸关系，不要硬挤到正面。${spring.name}如果暂时看不清，就先拍一张环境照，再去下一站${nextSpring?.name || "顺路泉点"}，回程有空再补看。`,
      actions: [[nextSpring ? "去下一站" : "打开地图", mapUrl(nextSpring || spring)], ["看这一泉", springHref(spring.id, route?.id)]]
    };
  }

  if (asksTired) {
    state.mascotPaceMode = "finish";
    return {
      title: `你问：${displayQuery}`,
      body: `可以切到收尾走法：当前只保留${spring.name}${nextSpring ? `和${nextSpring.name}` : ""}，少换片区，先把今天已经看的泉点整理到我的行程里。`,
      actions: [["查看我的行程", "#/my"], route ? ["继续路线", `#/route/${route.id}`] : ["看路线", "#/routes"]]
    };
  }

  if (asksFinish) {
    state.mascotPaceMode = "finish";
    return {
      title: `你问：${displayQuery}`,
      body: `可以轻松收尾：少换片区，当前只完成${spring.name}${nextSpring ? `，最多再接${nextSpring.name}` : ""}，然后整理我的行程，把今天看过的泉点变成游记卡。`,
      actions: [["整理我的行程", "#/my"], ["看这一泉", springHref(spring.id, route?.id)]]
    };
  }

  if (asksPhoto) {
    return {
      title: `你问：${displayQuery}`,
      body: spring?.photoSpot || spring?.photoTip || `${spring.name}先找有水面、石岸和人流空隙的位置，拍一张能看出泉水现场关系的照片。`,
      actions: spring?.photoGuides?.length ? [["拍同款", `#/spring/${spring.id}/photo`], ["看这一泉", springHref(spring.id, route?.id)]] : [["打开地图", mapUrl(spring)], ["看这一泉", `#/spring/${spring.id}`]]
    };
  }

  if (asksShort || asksQuiet) {
    state.mascotPaceMode = "compact";
    const quietTail = asksQuiet ? "想安静一点，就少切换片区，优先停在一个泉群里慢看，避开只为打卡的点。" : "时间不够时，不要追求看满站点，先保留当前泉点和下一站。";
    return {
      title: "你问：时间不够，想安静点怎么走",
      body: `可以压缩成轻松走法：当前先看${spring.name}，抓住“${cleanMascotSentence(spring.firstLook || spring.observationTip)}”，再接${nextSpring?.name || "一个顺路泉点"}。${quietTail}`,
      actions: [["看这一泉", springHref(spring.id, route?.id)], ["打开地图", mapUrl(spring)]]
    };
  }

  if (asksNearby && !asksMap) {
    const nearby = nextSpring || spring.nearbySpringIds?.map((id) => springs.find((item) => item.id === id)).filter(Boolean)[0];
    return {
      title: `你问：${displayQuery}`,
      body: nearby ? `从${spring.name}接到${nearby.name}比较顺。先不要横跳片区，按同一组泉眼走，现场会轻松很多。` : `${spring.name}看完后，可以回到图鉴按片区继续挑，避免路线来回折返。`,
      actions: nearby ? [["看附近泉点", `#/spring/${nearby.id}`], ["打开地图", mapUrl(nearby)]] : [["回到图鉴", "#/springs"]]
    };
  }

  if (asksVr) {
    return {
      title: `你问：${displayQuery}`,
      body: spring?.vrPanorama?.url ? `${spring.name}有${panoramaTrust.label}入口，${panoramaTrust.note}。出发前先看现场空间，再结合“${mapDecision.actionLabel}”到场。` : `${spring.name}可以先看图集和现场导览，再用地图确认位置。`,
      actions: spring?.vrPanorama?.url ? [["看实景", spring.vrPanorama.url], ["看这一泉", `#/spring/${spring.id}`]] : [["看这一泉", `#/spring/${spring.id}`], [mapDecision.actionLabel, mapUrl(spring)]]
    };
  }

  if (asksMap) {
    return {
      title: `你问：${displayQuery}`,
      body: `先把路线变成下一步动作：当前看${spring.name}${nextSpring ? `，再接到${nextSpring.name}` : ""}。${mapTarget.name}建议“${mapDecision.actionLabel}”：${mapDecision.title}，到场后按“${mapDecision.steps.join("、")}”处理。现场不要同时看太多点，跟着当前站走更稳。`,
      actions: [[nextSpring ? "去下一站" : mapDecision.actionLabel, mapUrl(mapTarget)], route ? ["继续路线", `#/route/${route.id}`] : ["看路线", "#/routes"]]
    };
  }

  return {
    title: `你问：${displayQuery}`,
    body: `${spring.name}可以先按“看、拍、听、走”处理：看现场第一眼，拍一张代表图，再决定是否接下一站。你也可以问我“怎么拍照”“时间不够怎么办”“附近看什么”。`,
    actions: [["看这一泉", springHref(spring.id, route?.id)], ["查 72 名泉", "#/springs"]]
  };
}

function getRouteMascotAnswer(promptId, context) {
  const spring = context.spring;
  const route = context.route;
  if (!spring || !route) return { title: "先选一条路线", body: "选好路线后，我会按当前站告诉你看什么、拍什么、下一站去哪。", actions: [["去选路线", "#/routes"]] };
  const firstLook = cleanMascotSentence(spring.firstLook || spring.observationTip);
  if (promptId === "next") {
    return {
      title: context.nextSpring ? `下一站去${context.nextSpring.name}` : "这条路线快收尾了",
      body: context.nextSpring ? `${spring.name}看完后，直接接到${context.nextSpring.name}。${spring.nextStepTip || context.nextSpring.summary}` : "当前路线已经接近收尾，可以到我的行程整理游记。",
      actions: context.nextSpring ? [["去下一站", mapUrl(context.nextSpring)], ["看这一泉", springHref(spring.id, route.id)]] : [["查看我的行程", "#/my"]]
    };
  }
  if (promptId === "short") {
    return {
      title: "时间不够就压缩停留",
      body: `${spring.name}先抓住第一眼：${firstLook}。如果赶时间，拍一张代表照片后继续下一站。`,
      actions: [["看这一泉", springHref(spring.id, route.id)], ["打开地图", mapUrl(spring)]]
    };
  }
  if (promptId === "best") {
    const names = getRouteStops(route).slice(0, 3).map((item) => item.name).join("、");
    return {
      title: "这条线先抓住前三个记忆点",
      body: `${names}最能建立这条线的第一印象。先看水势，再看文化小景，最后把节奏接到开阔水面。`,
      actions: [["查看站点顺序", `#/route/${route.id}?showAllStops=1`], ["看地图", "#/map?filter=route"]]
    };
  }
  return {
    title: `先完成${spring.name}`,
    body: `现在先看：${firstLook}。拍照可以按“拍同款”，看完后点完成当前站，我会把你接到下一站。`,
    actions: [["看这一泉", springHref(spring.id, route.id)], ...(spring.photoGuides?.length ? [["拍同款", `#/spring/${spring.id}/photo`]] : []), ...(context.nextSpring ? [["去下一站", mapUrl(context.nextSpring)]] : [])]
  };
}

function cleanMascotSentence(value) {
  return String(value || "")
    .replace(/^第一眼看/, "")
    .replace(/^先看/, "")
    .replace(/[。；;，,]+$/g, "");
}

function getSpringMascotAnswer(promptId, context) {
  const spring = context.spring;
  if (!spring) return { title: "泉点没找到", body: "可以回到图鉴重新选择一眼泉。", actions: [["回到图鉴", "#/springs"]] };
  if (promptId === "story") {
    return { title: `${spring.name}一句话记住`, body: spring.memoryLine || spring.storyShort, actions: [["看图集", `#/spring/${spring.id}`]] };
  }
  if (promptId === "photo") {
    return { title: `${spring.name}这样拍`, body: spring.photoSpot || spring.photoTip, actions: spring.photoGuides?.length ? [["拍同款", `#/spring/${spring.id}/photo`], ["打开地图", mapUrl(spring)]] : [["打开地图", mapUrl(spring)]] };
  }
  if (promptId === "nearby") {
    const nearby = spring.nearbySpringIds.map((id) => springs.find((item) => item.id === id)).filter(Boolean)[0];
    return { title: nearby ? `顺路接${nearby.name}` : "顺路回到图鉴继续看", body: nearby ? `${nearby.name}离这里近，适合接在${spring.name}之后。${nearby.summary}` : renderNextStopHint(spring), actions: nearby ? [["看附近泉点", `#/spring/${nearby.id}`], ["打开地图", mapUrl(nearby)]] : [["回到图鉴", "#/springs"]] };
  }
  return { title: `${spring.name}现场怎么看`, body: spring.firstLook || spring.observationTip, actions: [["看这一泉", `#/spring/${spring.id}`], ...(context.route ? [["返回路线", `#/route/${context.route.id}`]] : [])] };
}

function getMapMascotAnswer(promptId, context) {
  const spring = context.spring || springs.find((item) => item.id === "baotu");
  return {
    title: promptId === "route" ? "轻松走就选经典线" : `附近先看${spring.name}`,
    body: `${spring.name}适合作为当前视角的判断点。先看它，再按片区顺路接附近泉点，会比逐个点名更轻松。`,
    actions: [["看这个泉", `#/spring/${spring.id}`], ["走经典线", "#/route/classic-3h"]]
  };
}

function getAtlasMascotAnswer(promptId) {
  const picks = promptId === "photo" ? ["baotu", "heihu", "wulongtan"] : promptId === "quiet" ? ["shuyu", "zhenzhu", "tianjing"] : ["baotu", "shuyu", "wulongtan"];
  const names = picks.map((id) => springs.find((spring) => spring.id === id)?.name).filter(Boolean).join("、");
  return { title: "先从这几眼泉开始", body: `${names}适合作为第一组选择。先少选几眼，现场体验会比一次看完整个列表更清楚。`, actions: [["看趵突泉", "#/spring/baotu"], ["走经典线", "#/route/classic-3h"]] };
}

function getTripMascotAnswer(promptId, context) {
  const route = context.route;
  if (!route) return { title: "先选今天路线", body: "选好路线后，我会帮你记录已看泉点、拍照素材和下一站。", actions: [["去选路线", "#/routes"]] };
  const progress = context.progress || getRouteProgress(route);
  if (promptId === "journal") return { title: "今日游记可以这样整理", body: `你正在走${route.name}，已看${progress.completed}/${progress.total}站。完成后可以生成泉城游记卡。`, actions: [["查看我的行程", "#/my"], ["继续跟着走", `#/route/${route.id}`]] };
  return { title: progress.currentSpring ? `下一步看${progress.currentSpring.name}` : "路线已经完成", body: progress.currentSpring ? `先按现场四步完成${progress.currentSpring.name}，我会继续帮你接下一站。` : "可以整理游记卡，或换一条路线继续探索。", actions: progress.currentSpring ? [["继续跟着走", `#/route/${route.id}`], ["看这一泉", springHref(progress.currentSpring.id, route.id)]] : [["继续探索", "#/springs"]] };
}

function getMascotDecision(context) {
  if (context.type !== "route" || !context.route || !context.spring) return null;
  const route = context.route;
  const spring = context.spring;
  const progress = context.progress || getRouteProgress(route);
  const stops = getRouteStops(route);
  const signatureStops = stops.filter((item) => ["baotu", "wulongtan", "heihu"].includes(item.id));
  const compactNames = (signatureStops.length ? signatureStops : stops.slice(0, 3)).map((item) => item.name).join("、");
  const completedRatio = progress.total ? progress.completed / progress.total : 0;
  const mode = state.mascotPaceMode || "normal";

  if (mode === "compact") {
    return {
      mode,
      label: "压缩走",
      title: "只保留最值得看的 3 站",
      body: `如果时间变紧，就把今天压缩到${compactNames}。当前先完成${spring.name}，后面少绕路、少横跳片区。`,
      primaryAction: ["继续压缩路线", `#/route/${route.id}`],
      secondaryAction: ["整理我的行程", "#/my"]
    };
  }
  if (mode === "finish" || completedRatio >= 0.8) {
    return {
      mode: "finish",
      label: "轻松收尾",
      title: "少换片区，准备整理我的行程",
      body: `现在适合轻松收尾：当前把${spring.name}看完整，后面少换片区，直接去我的行程整理今天的泉城游记。`,
      primaryAction: ["整理我的行程", "#/my"],
      secondaryAction: ["看这一泉", springHref(spring.id, route.id)]
    };
  }
  return {
    mode: "normal",
    label: "正常走",
    title: "按正常节奏走",
    body: `先完整看完当前站${spring.name}，再接${context.nextSpring?.name || "下一站"}。这条线现在不需要压缩，跟着现场四步走就行。`,
    primaryAction: ["看这一泉", springHref(spring.id, route.id)],
    secondaryAction: context.nextSpring ? ["去下一站", mapUrl(context.nextSpring)] : ["整理我的行程", "#/my"]
  };
}

function getMascotBubbleHint(context) {
  if (context.type === "route" && context.spring) {
    const decision = getMascotDecision(context);
    const nextText = context.nextSpring ? `下一站：${context.nextSpring.name}` : "准备收尾";
    return `${nextText} · 当前站：${context.spring.name} · ${decision?.label || "正常走"}`;
  }
  if (context.type === "spring" && context.spring) return `看懂${context.spring.name}`;
  if (context.type === "map") return "帮你顺路看泉";
  if (context.type === "springs") return "帮你挑泉点";
  if (context.type === "my") return "整理今日游记";
  return "帮你选路线";
}

function renderMascotDecision(context) {
  const decision = getMascotDecision(context);
  if (!decision) return "";
  const modes = [
    ["normal", "正常走"],
    ["compact", "压缩走"],
    ["finish", "轻松收尾"]
  ];
  return `
    <section class="mascot-decision-card" aria-label="当前判断">
      <div class="mascot-decision-head">
        <span>当前判断</span>
        <strong>${decision.title}</strong>
      </div>
      <p>${decision.body}</p>
      <div class="mascot-mode-switch" role="group" aria-label="现场模式">
        ${modes.map(([mode, label]) => `
          <button type="button" class="${decision.mode === mode ? "active" : ""}" data-action="set-mascot-pace" data-pace-mode="${mode}">${label}</button>
        `).join("")}
      </div>
      <div class="action-row mascot-actions">
        <a class="ghost-action" href="${decision.primaryAction[1]}">${decision.primaryAction[0]}</a>
        <a class="ghost-action" href="${decision.secondaryAction[1]}">${decision.secondaryAction[0]}</a>
      </div>
    </section>
  `;
}

function getMascotLiveCompanion(context) {
  if (context.type !== "route" || !context.route || !context.spring) return "";
  const route = context.route;
  const spring = context.spring;
  const progress = context.progress;
  const firstLook = cleanMascotSentence(spring.firstLook || spring.observationTip);
  const photoTask = spring.photoGuides?.length ? "拍一张同款构图" : "拍一张现场关系";
  return `
    <section class="mascot-live-card ${context.lastCompleted ? "mascot-celebrate" : ""}" aria-label="现场陪走">
      <div class="mascot-live-head">
        <span>现场陪走</span>
        <strong>${progress?.completed || 0}/${progress?.total || route.stopIds.length} 已看</strong>
      </div>
      <div class="mascot-live-route">
        <span>当前路线</span>
        <strong>${route.name}</strong>
      </div>
      <div class="mascot-live-stop">
        <span>当前站</span>
        <strong>${spring.name}</strong>
      </div>
      ${context.lastCompleted ? `<p class="mascot-live-notice">${context.lastCompleted.name}已记录，下一站是${spring.name}。</p>` : ""}
      <div class="mascot-live-task">
        <strong>现在只做这几件事</strong>
        <ol>
          <li>先看${firstLook}</li>
          <li>${photoTask}</li>
          <li>${context.nextSpring ? `看完接到${context.nextSpring.name}` : "到我的行程整理游记"}</li>
        </ol>
      </div>
      <div class="mascot-live-actions">
        <button type="button" data-action="toggle-visited" data-spring-id="${spring.id}">我到了</button>
        <a href="${springHref(spring.id, route.id)}">看这一泉</a>
        ${spring.photoGuides?.length ? `<a href="#/spring/${spring.id}/photo">想拍照</a>` : ""}
        <button type="button" data-action="ask-mascot-text" data-question="人太多怎么办">人太多</button>
        <button type="button" data-action="ask-mascot-text" data-question="时间不够怎么办">时间不够</button>
        <button type="button" data-action="ask-mascot-text" data-question="我走累了">我走累了</button>
      </div>
    </section>
  `;
}

function renderMascot() {
  const context = getMascotContext();
  const prompts = getMascotPrompts(context);
  const activePromptId = state.mascotPromptId || prompts[0]?.[0] || "";
  const answer = getMascotAnswer(activePromptId, context);
  return `
    <aside class="ai-travel-buddy ${state.mascotOpen ? "open" : ""}" aria-label="${MASCOT_NAME} AI 旅游搭子">
      ${state.mascotOpen ? `
        <section class="mascot-panel">
          <div class="mascot-panel-head">
            <div class="mascot-avatar" aria-hidden="true">${renderMascotImage("avatar")}</div>
            <div>
              <p class="card-kicker">${MASCOT_NAME}</p>
              <h2>泉城 AI 旅游搭子</h2>
            </div>
            <button class="mascot-close" data-action="toggle-mascot" aria-label="收起${MASCOT_NAME}">×</button>
          </div>
          <div class="mascot-portrait" aria-hidden="true">
            ${renderMascotImage("portrait")}
            <div>
              <strong>我陪你把泉点变成一段好走、好看、好记的游记。</strong>
              <span>路线陪走 · 泉点讲解 · 拍照引导</span>
            </div>
          </div>
          <p class="mascot-lead">${getMascotLead(context)}</p>
          ${renderMascotDecision(context)}
          ${getMascotLiveCompanion(context)}
          <div class="mascot-ask-box">
            <label for="mascot-question">问一句</label>
            <div>
              <input id="mascot-question" type="search" value="${escapeAttr(state.mascotText)}" placeholder="例如：时间不够怎么办、怎么拍照、附近看什么" />
              <button type="button" data-action="submit-mascot-text">发送</button>
            </div>
          </div>
          <div class="mascot-prompts">
            ${prompts.map(([id, label]) => `<button class="${id === activePromptId ? "active" : ""}" data-action="ask-mascot" data-prompt-id="${id}">${label}</button>`).join("")}
          </div>
          ${renderMascotChat()}
          <div class="mascot-answer">
            <strong>${answer.title}</strong>
            <p>${answer.body}</p>
            <div class="action-row mascot-actions">
              ${answer.actions.map(([label, href]) => `<a class="ghost-action" href="${href}" ${href.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${label}</a>`).join("")}
            </div>
          </div>
        </section>
      ` : `
        <button class="mascot-bubble" data-action="toggle-mascot" aria-label="打开${MASCOT_NAME} AI 旅游搭子">
          <span class="mascot-avatar" aria-hidden="true">${renderMascotImage("avatar")}</span>
          <span class="mascot-bubble-copy">
            <strong>${MASCOT_NAME}</strong>
            <em class="mascot-bubble-hint">${getMascotBubbleHint(context)}</em>
          </span>
        </button>
      `}
    </aside>
  `;
}

function renderMascotChat() {
  if (!state.mascotChat.length) return "";
  return `
    <div class="mascot-chat" aria-label="最近对话">
      <div class="mascot-chat-head">
        <strong>最近对话</strong>
        <button type="button" data-action="clear-mascot-chat">清空</button>
      </div>
      ${state.mascotChat.map((item) => `
        <article class="mascot-chat-item">
          <p class="user-line">你问：${escapeHtml(item.question)}</p>
          <p class="buddy-line"><strong>游泉哇建议</strong>${item.body}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderMascotImage(variant) {
  const src = variant === "avatar" ? MASCOT_AVATAR_IMAGE : MASCOT_IMAGE;
  return `<img class="mascot-image ${variant}" src="${src}" alt="" loading="lazy" />`;
}

function renderNav() {
  const items = [
    ["routes", "路线", "⌂"],
    ["map", "地图", "⌖"],
    ["springs", "图鉴", "□"],
    ["my", "我的", "♡"]
  ];
  return `
    <nav class="bottom-nav" aria-label="主导航">
      ${items.map(([tab, label, icon]) => `
        <a class="${isActiveTab(tab) ? "active" : ""}" href="#/${tab}">
          <span aria-hidden="true">${icon}</span>
          <strong>${label}</strong>
        </a>
      `).join("")}
    </nav>
  `;
}

function renderChoice(type, value, label, active) {
  return `<button class="choice-pill ${active ? "active" : ""}" data-choice="${type}" data-value="${value}">${label}</button>`;
}

function renderSelect(id, label, value, options) {
  return `
    <label>
      <span>${label}</span>
      <select id="${id}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderImage(image, className, alt) {
  if (!image || !image.src) {
    return `<div class="image-placeholder ${className}" role="img" aria-label="${alt}泉水图景"><span>泉水图景</span></div>`;
  }
  return `<img class="${className}" src="${image.src}" alt="${alt}：${image.caption}" loading="lazy" referrerpolicy="no-referrer" />`;
}

function renderEmpty(title, action, href) {
  return `
    <section class="page empty-state">
      <h1>${title}</h1>
      <a class="primary-action" href="${href}">${action}</a>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.choice === "time") state.timeBucket = button.dataset.value;
      if (button.dataset.choice === "scene") state.scene = button.dataset.value;
      render();
    });
  });

  document.querySelectorAll("[data-start-route]").forEach((link) => {
    link.addEventListener("click", () => {
      setActiveRoute(link.dataset.startRoute);
    });
  });

  document.querySelectorAll("[data-smart-key]").forEach((select) => {
    select.addEventListener("change", () => {
      state.smartRoutePrefs[select.dataset.smartKey] = select.value;
      state.smartRouteDraft = buildSmartRoute(state.smartRoutePrefs);
      saveTripState();
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const action = element.dataset.action;
      if (action === "favorite-route") toggleFavoriteRoute(element.dataset.routeId);
      if (action === "favorite-spring") toggleFavoriteSpring(element.dataset.springId);
      if (action === "toggle-visited") toggleVisited(element.dataset.springId);
      if (action === "toggle-skipped") toggleSkipped(element.dataset.springId);
      if (action === "start-route") setActiveRoute(element.dataset.routeId);
      if (action === "generate-smart-route") {
        state.smartRouteDraft = buildSmartRoute(state.smartRoutePrefs);
        saveTripState();
      }
      if (action === "toggle-mascot") {
        state.mascotOpen = !state.mascotOpen;
        if (state.mascotOpen && !state.mascotPromptId) state.mascotPromptId = getMascotPrompts(getMascotContext())[0]?.[0] || "";
      }
      if (action === "ask-mascot") {
        state.mascotOpen = true;
        state.mascotPromptId = element.dataset.promptId || "";
        state.mascotAskedText = "";
      }
      if (action === "set-mascot-pace") {
        state.mascotOpen = true;
        state.mascotPaceMode = element.dataset.paceMode || "normal";
        state.mascotAskedText = "";
      }
      if (action === "ask-mascot-text") {
        const value = element.dataset.question || "";
        if (value) {
          state.mascotOpen = true;
          state.mascotText = "";
          state.mascotAskedText = value;
          rememberMascotChat(value, getMascotTextAnswer(value, getMascotContext()));
        }
      }
      if (action === "submit-mascot-text") {
        const input = document.querySelector("#mascot-question");
        const value = input?.value?.trim() || "";
        if (value) {
          state.mascotOpen = true;
          state.mascotText = "";
          state.mascotAskedText = value;
          rememberMascotChat(value, getMascotTextAnswer(value, getMascotContext()));
        }
      }
      if (action === "clear-mascot-chat") {
        state.mascotChat = [];
        state.mascotAskedText = "";
      }
      if (action === "select-map-spring") {
        state.selectedMapSpringId = element.dataset.springId || state.selectedMapSpringId;
      }
      if (action === "toggle-map-core") {
        state.mapCoreExpanded = !state.mapCoreExpanded;
      }
      if (action === "toggle-map-eyes") {
        state.mapEyesExpanded = !state.mapEyesExpanded;
      }
      if (action === "select-map-cluster") {
        state.selectedMapClusterId = element.dataset.clusterId || "";
        const cluster = getMapClusters(getMapSprings()).find((item) => item.id === state.selectedMapClusterId);
        if (cluster && cluster.scope !== "regional") state.mapCoreExpanded = true;
        ensureSelectedSpringForCurrentMap();
      }
      if (action === "clear-map-cluster") {
        state.selectedMapClusterId = "";
      }
      if (action === "map-filter") {
        state.mapFilter = element.dataset.filter || "all";
        state.selectedMapClusterId = "";
        state.mapCoreExpanded = false;
        state.mapEyesExpanded = false;
        ensureSelectedSpringForCurrentMap();
      }
      if (action === "select-photo-guide") {
        state.photoGuideId = element.dataset.guideId || "cover";
      }
      if (action === "start-camera") {
        startCamera();
        return;
      }
      if (action === "use-sample-camera") {
        updateCameraStatus("sampleMode");
        return;
      }
      if (action === "capture-photo") {
        capturePhoto();
        return;
      }
      if (action === "save-photo-guide") savePhotoGuideDraft();
      if (action === "retake-photo") {
        state.capturedPhoto = null;
        state.captureDiagnostics = [];
      }
      if (action === "next-photo-guide") {
        state.photoGuideId = element.dataset.guideId || "cover";
        state.capturedPhoto = null;
        state.captureDiagnostics = [];
      }
      if (action === "clear-trip") {
        event.preventDefault();
        if (!window.confirm("确认清空当前浏览器里的行程记录？")) return;
        clearTrip();
      }
      render();
    });
  });

  const search = document.querySelector("#spring-search");
  if (search) {
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      updateSpringResults();
    });
  }

  bindSelect("#area-filter", "areaFilter");
  bindSelect("#level-filter", "levelFilter");
  bindSelect("#scene-filter", "sceneFilter");
  bindSelect("#state-filter", "stateFilter");
}

function bindSelect(selector, key) {
  const select = document.querySelector(selector);
  if (!select) return;
  select.addEventListener("change", (event) => {
    state[key] = event.target.value;
    render();
  });
}

async function startCamera() {
  const video = document.querySelector(".photo-video");
  const browserNavigator = getBrowserNavigator();
  if (!isCameraSecureContext()) {
    state.cameraStatus = "insecure";
    render();
    return;
  }
  if (!video || !browserNavigator.mediaDevices?.getUserMedia) {
    state.cameraStatus = "unavailable";
    render();
    return;
  }
  try {
    updateCameraStatus("opening");
    activeCameraStream = await browserNavigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = activeCameraStream;
    await video.play().catch(() => {});
    await waitForCameraMetadata(video);
    video.parentElement?.classList.add("camera-on");
    updateCameraStatus("ready");
    checkCameraBrightness(video);
  } catch (error) {
    state.cameraStatus = getCameraFailureStatus(error);
    render();
  }
}

function isCameraSecureContext() {
  const protocol = location.protocol || "";
  const host = location.hostname || "";
  return protocol === "https:" || host === "localhost" || host === "127.0.0.1" || protocol === "file:";
}

function getCameraFailureStatus(error) {
  const name = error?.name || "";
  const message = error?.message || "";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return "permissionDenied";
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(name) || /busy|occupied|in use|占用/i.test(message)) return "busy";
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) return "noDevice";
  return "blocked";
}

function waitForCameraMetadata(video, timeout = 1800) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const checkMetadata = () => {
      if (video.videoWidth && video.videoHeight && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      if (performance.now() - startedAt >= timeout) {
        resolve();
        return;
      }
      setTimeout(checkMetadata, 80);
    };
    checkMetadata();
  });
}

function checkCameraBrightness(video) {
  setTimeout(() => {
    if (!video.parentElement?.classList.contains("camera-on")) return;
    if (!hasBrightCameraFrame(video)) updateCameraStatus("darkFrame");
  }, 900);
}

function hasBrightCameraFrame(video) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let max = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2];
      total += brightness;
      if (brightness > max) max = brightness;
    }
    return total / (pixels.length / 4) > 18 || max > 42;
  } catch (error) {
    return true;
  }
}

function updateCameraStatus(status) {
  state.cameraStatus = status;
  const statusElement = document.querySelector(".camera-status");
  if (!statusElement) return;
  const cameraStatus = getCameraStatusCopy(status);
  statusElement.className = `camera-status ${cameraStatus.tone}`;
  statusElement.textContent = cameraStatus.text;
  const cameraButton = document.querySelector('[data-action="start-camera"]');
  if (!cameraButton) return;
  cameraButton.textContent = getCameraButtonText(status);
  cameraButton.disabled = status === "opening";
}

function stopCamera() {
  if (!activeCameraStream) return;
  activeCameraStream.getTracks().forEach((track) => track.stop());
  activeCameraStream = null;
}

function capturePhoto() {
  const video = document.querySelector(".photo-video");
  const canvas = document.querySelector(".photo-canvas");
  if (!video || !canvas || !video.videoWidth) {
    state.cameraStatus = "unavailable";
    render();
    return;
  }
  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.capturedPhoto = canvas.toDataURL("image/jpeg", 0.86);
  const spring = springs.find((item) => item.id === state.springId);
  const guide = spring?.photoGuides?.find((item) => item.id === state.photoGuideId) || spring?.photoGuides?.[0];
  state.captureDiagnostics = buildCaptureDiagnostics(canvas, guide);
  render();
}

function buildCaptureDiagnostics(canvas, guide = {}) {
  return [
    { label: "亮度", text: getBrightnessFeedback(getImageBrightness(canvas)) },
    { label: "方向", text: getOrientationFeedback(guide.orientation, canvas.width, canvas.height) },
    { label: "稳定", text: "按下快门后停半秒，水花和边石会更清晰。" }
  ];
}

function getImageBrightness(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return 128;
  const width = Math.min(32, canvas.width);
  const height = Math.min(32, canvas.height);
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return 128;
  sampleContext.drawImage(canvas, 0, 0, width, height);
  const pixels = sampleContext.getImageData(0, 0, width, height).data;
  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    total += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
  }
  return total / (pixels.length / 4);
}

function getBrightnessFeedback(brightness) {
  if (brightness < 55) return "画面偏暗，可以换到光线更好的角度再拍一张。";
  if (brightness > 215) return "画面偏亮，稍微避开天空或反光水面。";
  return "画面亮度正常，可以作为这张任务的素材。";
}

function getOrientationFeedback(orientation, width, height) {
  const isLandscape = width >= height;
  if (orientation === "landscape") return isLandscape || !width ? "这张任务更适合横屏，能保留更多现场关系。" : "当前是竖屏；这张任务建议横屏，能保留更多泉池关系。";
  if (orientation === "portrait") return !isLandscape || !width ? "这张任务更适合竖屏，水花主体会更集中。" : "当前是横屏；这张任务建议竖屏，水花主体会更集中。";
  return "横竖屏都可以，重点是主体清楚。";
}

function savePhotoGuideDraft() {
  const spring = springs.find((item) => item.id === state.springId);
  if (!spring?.photoGuides?.length) return;
  const guide = spring.photoGuides.find((item) => item.id === state.photoGuideId) || spring.photoGuides[0];
  const imageDataUrl = state.capturedPhoto || guide.sampleImage;
  const draft = {
    id: `${spring.id}-${guide.id}-${Date.now()}`,
    springId: spring.id,
    springName: spring.name,
    guideId: guide.id,
    guideTitle: guide.title,
    shareText: guide.shareText,
    imageDataUrl,
    createdAt: new Date().toISOString()
  };
  state.trip.photoGuideDrafts = [draft, ...(state.trip.photoGuideDrafts || [])].slice(0, 12);
  state.capturedPhoto = null;
  state.captureDiagnostics = [];
  saveTripState();
}

function updateSpringResults() {
  const filtered = filterSprings();
  const count = document.querySelector(".result-count");
  const results = document.querySelector("#spring-results");
  if (count) count.textContent = `${filtered.length} 个结果`;
  if (results) results.innerHTML = filtered.map(renderSpringCard).join("");
}

function getRecommendedRoutes() {
  return [...routes].sort((left, right) => scoreRoute(right) - scoreRoute(left));
}

function getRouteById(routeId) {
  if (routeId === "smart-today") return state.smartRouteDraft || buildSmartRoute(state.smartRoutePrefs);
  return routes.find((route) => route.id === routeId);
}

function scoreRoute(route) {
  let score = 0;
  if (route.timeBucket === state.timeBucket) score += 8;
  if (route.scenes.includes(state.scene)) score += 10;
  if (state.timeBucket === "day" && route.durationMinutes >= 180) score += 5;
  if (state.scene === "classic" && route.id === "classic-3h") score += 4;
  return score;
}

function getRouteStops(route) {
  return route.stopIds.map((id) => springs.find((spring) => spring.id === id)).filter(Boolean);
}

function buildSmartRoute(prefs = state.smartRoutePrefs) {
  const duration = Number(prefs.duration || 180);
  const targetStops = duration <= 90 ? 3 : duration <= 150 ? 4 : 5;
  const start = springs.find((spring) => spring.id === prefs.start) || springs.find((spring) => spring.id === "baotu") || springs[0];
  const candidates = springs
    .filter((spring) => spring.detailLevel === "featured" || spring.level !== "C")
    .map((spring) => ({ spring, score: scoreSmartSpring(spring, start, prefs) }))
    .sort((left, right) => right.score - left.score);
  const selected = [start];
  candidates.forEach(({ spring }) => {
    if (selected.length >= targetStops) return;
    if (!selected.some((item) => item.id === spring.id)) selected.push(spring);
  });
  const ordered = orderSmartStops(selected, start);
  const tags = getSmartRouteTags(prefs);
  const minutes = Math.max(60, Math.min(duration, ordered.reduce((total, spring) => total + (spring.visitMinutes || 10), 0) + (ordered.length - 1) * 14));
  const distanceKm = Math.max(1.2, (ordered.length * 0.75 + getSmartSpread(ordered) * 26)).toFixed(1);
  const coverSpring = ordered[0] || start;
  return {
    id: "smart-today",
    name: "今日智能路线",
    shortName: "智能路线",
    summary: `从${start.name}出发，按${tags.join("、")}生成 ${ordered.length} 站，看重点、不绕远。`,
    durationMinutes: minutes,
    distanceKm,
    audienceTags: tags,
    startLabel: start.name,
    endLabel: ordered[ordered.length - 1]?.name || start.name,
    stopIds: ordered.map((spring) => spring.id),
    practicalTips: getSmartRouteTips(prefs),
    steps: [],
    whyRecommended: `这条线按你的时间和偏好组合泉点，优先保留同片区和高价值泉点。`,
    bestFor: tags,
    notFor: ["想完整看完 72 名泉的人"],
    beforeStart: ["先确认出发点，再按当前站逐个推进。"],
    guideStops: ordered.map((spring, index) => ({
      springId: spring.id,
      title: index === 0 ? "从这里开始" : "顺路看这一泉",
      cue: spring.observationTip || spring.summary,
      action: spring.photoSpot || spring.firstLook || "到泉边先看水面和周边环境。"
    })),
    coverImage: coverSpring.coverImage,
    routeImage: coverSpring.coverImage,
    storyTitle: "今天这样看泉",
    storyLead: `从${start.name}开始，把${tags.join("、")}放进同一条轻路线。`,
    storyMood: tags[0] || "智能组线",
    storyImages: ordered.slice(0, 3).map((spring) => spring.id),
    storyImageSpringIds: ordered.slice(0, 3).map((spring) => spring.id),
    journalPrompt: "我按泉游记智能组线走了一条今日路线。",
    shortcutOptions: ["时间紧就只看前三站。", "人多时优先保留开阔水面和公园内泉点。"],
    walkInstruction: `从${start.name}起步，按同片区优先的顺序走。`,
    premiumGuide: null,
    onSiteScript: null,
    walkingCompanion: {
      promise: "少绕路，先看最值得看的泉。",
      rhythm: "每站控制在 10-20 分钟。"
    }
  };
}

function scoreSmartSpring(spring, start, prefs) {
  let score = 0;
  if (spring.id === start.id) score += 100;
  if (spring.group === start.group) score += 24;
  if (spring.area === start.area) score += 12;
  if (spring.level === "S") score += 18;
  if (spring.level === "A") score += 12;
  if (spring.vrPanorama?.url) score += 4;
  if (prefs.interest === "photo" && spring.scenes.includes("适合拍照")) score += 18;
  if (prefs.interest === "culture" && spring.scenes.includes("文化故事")) score += 18;
  if (prefs.interest === "quiet" && spring.scenes.includes("小众安静")) score += 20;
  if (prefs.interest === "classic" && spring.scenes.includes("经典必看")) score += 16;
  if (prefs.companion === "family" && spring.scenes.includes("亲子友好")) score += 18;
  if (prefs.companion === "elder" && spring.visitMinutes <= 12) score += 8;
  if (prefs.companion === "quiet" && spring.scenes.includes("小众安静")) score += 14;
  score -= getApproxDistance(start, spring) * 120;
  return score;
}

function orderSmartStops(stops, start) {
  const rest = stops.filter((spring) => spring.id !== start.id);
  rest.sort((left, right) => getApproxDistance(start, left) - getApproxDistance(start, right));
  return [start, ...rest];
}

function getApproxDistance(left, right) {
  if (!left || !right) return 0;
  return Math.hypot((left.latitude || 0) - (right.latitude || 0), (left.longitude || 0) - (right.longitude || 0));
}

function getSmartSpread(stops) {
  if (stops.length < 2) return 0;
  let spread = 0;
  for (let index = 1; index < stops.length; index += 1) {
    spread += getApproxDistance(stops[index - 1], stops[index]);
  }
  return spread;
}

function getSmartRouteTags(prefs) {
  const companionLabels = { solo: "轻松", family: "亲子", elder: "少走路", quiet: "避人流" };
  const interestLabels = { classic: "经典", photo: "拍照", culture: "文化", quiet: "安静" };
  return uniqueItems([companionLabels[prefs.companion], interestLabels[prefs.interest], `${Math.round(Number(prefs.duration || 180) / 60 * 10) / 10} 小时`]);
}

function getSmartRouteTips(prefs) {
  const tips = ["按当前路线推进，不必一次看太多泉点。"];
  if (prefs.companion === "family") tips.push("亲子同行优先保留公园内泉点，减少过街。");
  if (prefs.companion === "elder") tips.push("带老人时每站之间留出休息时间。");
  if (prefs.interest === "photo") tips.push("拍照优先选择水面、亭廊和树影同框。");
  if (prefs.interest === "culture") tips.push("文化线每站先看泉名，再看题刻和人物故事。");
  return tips;
}

function getRouteProgress(route) {
  const stops = getRouteStops(route);
  const openStops = stops.filter((spring) => !isVisited(spring.id) && !isSkipped(spring.id));
  const currentSpring = openStops[0] || null;
  const currentIndex = currentSpring ? stops.findIndex((spring) => spring.id === currentSpring.id) : -1;
  const nextSpring = currentIndex >= 0 ? stops.slice(currentIndex + 1).find((spring) => !isVisited(spring.id) && !isSkipped(spring.id)) : null;
  const completed = stops.filter((spring) => isVisited(spring.id)).length;
  const percent = stops.length ? Math.round((completed / stops.length) * 100) : 0;
  return {
    total: stops.length,
    completed,
    percent,
    currentSpring,
    nextSpring,
    done: !currentSpring
  };
}

function filterSprings() {
  const value = String(state.query || "").trim().toLowerCase();
  return springs.filter((spring) => {
    const matchesSearch = !value || [spring.name, spring.group, spring.location, spring.district, spring.summary, spring.tags.join(" ")].join(" ").toLowerCase().includes(value);
    const matchesArea = state.areaFilter === "all" || spring.group === state.areaFilter;
    const matchesLevel = state.levelFilter === "all" || spring.level === state.levelFilter;
    const matchesScene = state.sceneFilter === "all" || spring.scenes.includes(state.sceneFilter);
    const matchesState =
      state.stateFilter === "all" ||
      (state.stateFilter === "visited" && isVisited(spring.id)) ||
      (state.stateFilter === "favorite" && isFavoriteSpring(spring.id)) ||
      (state.stateFilter === "panorama" && Boolean(spring.vrPanorama?.url)) ||
      (state.stateFilter === "route" && spring.routeIds.length > 0);
    return matchesSearch && matchesArea && matchesLevel && matchesScene && matchesState;
  }).sort((left, right) => atlasScore(right) - atlasScore(left));
}

function renderNextStopHint(spring) {
  const route = routes.find((item) => item.stopIds.includes(spring.id));
  if (!route) return "可以回到图鉴，继续查看同片区或同类型泉点。";
  const index = route.stopIds.indexOf(spring.id);
  const nextId = route.stopIds[index + 1];
  const next = springs.find((item) => item.id === nextId);
  if (!next) return `这是「${route.name}」的收尾点。可以到我的行程生成分享卡，或打开图鉴继续探索。`;
  return `在「${route.name}」里，下一站建议去 ${next.name}。${next.summary}`;
}

function hasAtlasFilter() {
  return Boolean(
    String(state.query || "").trim() ||
    state.areaFilter !== "all" ||
    state.levelFilter !== "all" ||
    state.sceneFilter !== "all" ||
    state.stateFilter !== "all"
  );
}

function atlasScore(spring) {
  const levelScore = { S: 40, A: 25, B: 10, C: 0 }[spring.level] || 0;
  const routeScore = spring.routeIds.length * 8;
  const groupScore = ["趵突泉公园内", "五龙潭公园内", "环城公园内", "省人大院内"].includes(spring.group) ? 6 : 0;
  return levelScore + routeScore + groupScore;
}

function getAreas() {
  return Array.from(new Set(springs.map((spring) => spring.group))).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function groupByArea(items) {
  return items.reduce((groups, item) => {
    groups[item.group] = groups[item.group] || [];
    groups[item.group].push(item);
    return groups;
  }, {});
}

function isActiveTab(tab) {
  if (tab === "routes") return state.tab === "routes" || state.tab === "route";
  if (tab === "springs") return state.tab === "springs" || state.tab === "spring";
  return state.tab === tab;
}

function loadTripState() {
  const fallback = {
    activeRouteId: "",
    visitedSpringIds: [],
    skippedSpringIds: [],
    favoriteSpringIds: [],
    favoriteRouteIds: [],
    photoGuideDrafts: [],
    mascotPaceMode: "normal",
    lastUpdatedAt: ""
  };
  try {
    const saved = JSON.parse(localStorage.getItem("quanyouji:tripState")) || {};
    const oldFavorites = JSON.parse(localStorage.getItem("quanyouji:favorites")) || [];
    return {
      ...fallback,
      ...saved,
      favoriteSpringIds: saved.favoriteSpringIds || oldFavorites.filter((item) => item.type === "spring").map((item) => item.id),
      favoriteRouteIds: saved.favoriteRouteIds || oldFavorites.filter((item) => item.type === "route").map((item) => item.id),
      photoGuideDrafts: saved.photoGuideDrafts || [],
      mascotPaceMode: saved.mascotPaceMode || "normal"
    };
  } catch {
    return fallback;
  }
}

function saveTripState() {
  state.trip.mascotPaceMode = state.mascotPaceMode;
  state.trip.smartRouteDraft = state.smartRouteDraft;
  state.trip.smartRoutePrefs = state.smartRoutePrefs;
  state.trip.lastUpdatedAt = new Date().toISOString();
  localStorage.setItem("quanyouji:tripState", JSON.stringify(state.trip));
}

function setActiveRoute(routeId) {
  if (routeId === "smart-today" && !state.smartRouteDraft) state.smartRouteDraft = buildSmartRoute(state.smartRoutePrefs);
  state.trip.activeRouteId = routeId;
  saveTripState();
}

function getActiveRoute() {
  return getRouteById(state.trip.activeRouteId);
}

function isVisited(id) {
  return state.trip.visitedSpringIds.includes(id);
}

function isSkipped(id) {
  return state.trip.skippedSpringIds.includes(id);
}

function isFavoriteSpring(id) {
  return state.trip.favoriteSpringIds.includes(id);
}

function isFavoriteRoute(id) {
  return state.trip.favoriteRouteIds.includes(id);
}

function toggleVisited(id) {
  state.trip.visitedSpringIds = toggleListValue(state.trip.visitedSpringIds, id);
  state.trip.skippedSpringIds = state.trip.skippedSpringIds.filter((item) => item !== id);
  saveTripState();
}

function toggleSkipped(id) {
  state.trip.skippedSpringIds = toggleListValue(state.trip.skippedSpringIds, id);
  saveTripState();
}

function toggleFavoriteSpring(id) {
  state.trip.favoriteSpringIds = toggleListValue(state.trip.favoriteSpringIds, id);
  saveTripState();
}

function toggleFavoriteRoute(id) {
  state.trip.favoriteRouteIds = toggleListValue(state.trip.favoriteRouteIds, id);
  saveTripState();
}

function clearTrip() {
  state.trip = {
    activeRouteId: "",
    visitedSpringIds: [],
    skippedSpringIds: [],
    favoriteSpringIds: [],
    favoriteRouteIds: [],
    photoGuideDrafts: [],
    mascotPaceMode: "normal",
    smartRouteDraft: null,
    smartRoutePrefs: null,
    lastUpdatedAt: ""
  };
  state.mascotPaceMode = "normal";
  state.smartRouteDraft = null;
  state.smartRoutePrefs = {
    duration: "180",
    start: "baotu",
    companion: "solo",
    interest: "classic"
  };
  saveTripState();
}

function toggleListValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function sceneLabel(scene) {
  const matched = SCENE_OPTIONS.find(([value]) => value === scene);
  return matched ? matched[1] : scene;
}

function getRouteMapSpring(route, mode = "first") {
  const stopId = mode === "last" ? route.stopIds[route.stopIds.length - 1] : route.stopIds[0];
  return springs.find((spring) => spring.id === stopId) || null;
}

function mapUrl(target) {
  if (target && typeof target === "object" && Number.isFinite(target.latitude) && Number.isFinite(target.longitude)) {
    const location = encodeURIComponent(`${target.latitude},${target.longitude}`);
    const title = encodeURIComponent(target.name || "济南名泉");
    const content = encodeURIComponent(target.mapSearchKeyword || target.location || target.summary || target.name || "济南名泉");
    return `https://api.map.baidu.com/marker?location=${location}&title=${title}&content=${content}&coord_type=wgs84&output=html&src=webapp.quanyouji.h5`;
  }
  const query = encodeURIComponent(target || "济南 名泉");
  const region = encodeURIComponent("济南");
  return `https://api.map.baidu.com/place/search?query=${query}&region=${region}&coord_type=wgs84&output=html&src=webapp.quanyouji.h5`;
}

function uniqueItems(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.QUANYOUJI_TEST_API = {
  setAtlasQuery(value) {
    state.query = value;
    updateSpringResults();
  },
  setAtlasFilter(key, value) {
    if (["areaFilter", "levelFilter", "sceneFilter", "stateFilter"].includes(key)) {
      state[key] = value;
      render();
    }
  },
  selectPhotoGuide(id) {
    state.photoGuideId = id;
    render();
  },
  setCapturedPhoto(dataUrl) {
    state.capturedPhoto = dataUrl;
    render();
  },
  setCameraStatus(status) {
    state.cameraStatus = status;
    render();
  },
  selectMapSpring(id) {
    state.selectedMapSpringId = id;
    render();
  },
  selectMapCluster(id) {
    state.selectedMapClusterId = id;
    const cluster = getMapClusters(getMapSprings()).find((item) => item.id === id);
    if (cluster && cluster.scope !== "regional") state.mapCoreExpanded = true;
    ensureSelectedSpringForCurrentMap();
    render();
  },
  setMapFilter(value) {
    state.mapFilter = value;
    state.selectedMapClusterId = "";
    state.mapCoreExpanded = false;
    ensureSelectedSpringForCurrentMap();
    render();
  },
  setMapCoreExpanded(value) {
    state.mapCoreExpanded = Boolean(value);
    render();
  },
  setMapEyesExpanded(value) {
    state.mapEyesExpanded = Boolean(value);
    render();
  },
  setSmartRouteOption(key, value) {
    state.smartRoutePrefs[key] = value;
    state.smartRouteDraft = buildSmartRoute(state.smartRoutePrefs);
    saveTripState();
    render();
  },
  generateSmartRoute() {
    state.smartRouteDraft = buildSmartRoute(state.smartRoutePrefs);
    saveTripState();
    render();
  },
  getSmartRoute() {
    return state.smartRouteDraft || buildSmartRoute(state.smartRoutePrefs);
  },
  openMascot() {
    state.mascotOpen = true;
    state.mascotPromptId = getMascotPrompts(getMascotContext())[0]?.[0] || "";
    render();
  },
  askMascot(promptId) {
    state.mascotOpen = true;
    state.mascotPromptId = promptId;
    state.mascotAskedText = "";
    render();
  },
  askMascotText(value) {
    state.mascotOpen = true;
    state.mascotText = "";
    state.mascotAskedText = value;
    rememberMascotChat(value, getMascotTextAnswer(value, getMascotContext()));
    render();
  },
  setMascotPaceMode(value) {
    state.mascotOpen = true;
    state.mascotPaceMode = value;
    state.mascotAskedText = "";
    saveTripState();
    render();
  },
  clearMascotChat() {
    state.mascotChat = [];
    state.mascotAskedText = "";
    render();
  },
  savePhotoGuideDraft() {
    savePhotoGuideDraft();
  }
};
