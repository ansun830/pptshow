/**
 * 基准方中 · 企业级高保真建筑方案演示云平台 (前端核心引擎)
 * JZFZ Architectural Presentation Core Engine
 * 涵盖：
 * 1. 舞台优先沉浸式画框视口 (Stage-First Architecture)
 * 2. 悬浮智能毛玻璃 Dock (底部灵动胶囊 - Apple/Figma 风格，2.5s 智能休眠隐退)
 * 3. 建筑空间漫游动效引擎 (Ken Burns 巡镜、视频多端毫秒级同步、图纸分步递进)
 * 4. 底部横向胶片画廊抽屉 (Bottom Filmstrip Drawer)
 * 5. 异地双向协同圈点 (参会嘉宾/领导提问画笔互动批注)
 * 6. 客户防盗与受控保护 (打开次数限制、时效截止、体面微提示徽标、到期封锁屏)
 * 7. 基准方中官方专属防盗浅水印 (全图平铺防截图/拍照)
 * 8. 小程序化触控手势 (左右轻扫翻页、双指捏合缩放、防休眠 WakeLock)
 * 9. 换稿不换链热替换、旋转校正、激光笔、聚光灯与画笔标注
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

const state = {
  view: "home",
  roomId: null,
  secretKey: null,
  isPresenter: false,
  roomName: "",
  fileUrl: "",
  fileType: "pdf",
  fileName: "",
  fileVersion: 1,
  currentPage: 1,
  totalPages: 1,
  hostCurrentPage: 1,
  isFollowingHost: true,

  // 动效与交互模式
  transitionEffect: "fade", // "fade" | "slide" | "zoom" | "none"
  pageRotation: 0, // 0 | 90 | 180 | 270 (手动旋转校正)
  kenBurnsActive: false, // 电影级建筑巡镜漫游动效
  autoPlayActive: false, // 展厅自动巡展模式
  autoPlayTimer: null,

  // 安全防盗与受控保护
  security: {
    enabled: false,
    maxViews: 0,
    currentViews: 0,
    expiresAt: 0,
    watermark: false,
  },

  // 漫游视频同步
  videoActive: false,
  videoUrl: "",

  // 汇报计时器
  timerRunning: false,
  timerSeconds: 0,
  timerInterval: null,

  // 悬浮 Dock 自动休眠
  dockIdleTimer: null,

  // 交互工具与画笔
  laserActive: false,
  laserX: 0,
  laserY: 0,

  spotlightActive: false,
  spotlightX: 0.5,
  spotlightY: 0.5,

  penActive: false,
  audiencePenActive: false,
  isDrawing: false,
  drawColor: "#E60026", // 主讲人建筑红，观众为提问蓝
  drawPoints: [],

  // 移动端轻扫手势
  touchStartX: 0,
  touchStartY: 0,

  pdfDoc: null,
  pptxSlides: [],
  eventSource: null,
  selectedFile: null,
  updateFile: null,
};

const dom = {
  homeView: document.getElementById("homeView"),
  presentView: document.getElementById("presentView"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  selectedFileInfo: document.getElementById("selectedFileInfo"),
  selectedFileName: document.getElementById("selectedFileName"),
  removeFileBtn: document.getElementById("removeFileBtn"),
  roomNameInput: document.getElementById("roomNameInput"),
  startPresentBtn: document.getElementById("startPresentBtn"),
  uploadSpinner: document.getElementById("uploadSpinner"),

  // 首页安全受控选项
  homeSecurityCheck: document.getElementById("homeSecurityCheck"),
  homeSecurityDetails: document.getElementById("homeSecurityDetails"),
  homeMaxViews: document.getElementById("homeMaxViews"),
  homeExpiresHours: document.getElementById("homeExpiresHours"),
  homeWatermarkCheck: document.getElementById("homeWatermarkCheck"),

  // 顶部悬浮徽标
  brandFloatingBadge: document.getElementById("brandFloatingBadge"),
  displayRoomName: document.getElementById("displayRoomName"),
  roleBadge: document.getElementById("roleBadge"),
  connStatus: document.getElementById("connStatus"),

  // 观众端受控微提示徽标
  securityPillBadge: document.getElementById("securityPillBadge"),
  securityPillText: document.getElementById("securityPillText"),

  // 参会圈点提示条
  attendeeAnnoNotice: document.getElementById("attendeeAnnoNotice"),
  attendeeAnnoText: document.getElementById("attendeeAnnoText"),

  // 顶部右上角控制胶囊
  topActionsFloating: document.getElementById("topActionsFloating"),
  presTimerBtn: document.getElementById("presTimerBtn"),
  timerText: document.getElementById("timerText"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  shareBtn: document.getElementById("shareBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),

  // 底部悬浮智能毛玻璃 Dock
  floatingDock: document.getElementById("floatingDock"),
  prevSlideBtn: document.getElementById("prevSlideBtn"),
  nextSlideBtn: document.getElementById("nextSlideBtn"),
  pageDisplayBtn: document.getElementById("pageDisplayBtn"),
  currentPageNum: document.getElementById("currentPageNum"),
  totalPagesNum: document.getElementById("totalPagesNum"),
  filmstripToggleBtn: document.getElementById("filmstripToggleBtn"),

  // 工具栏交互
  presenterTools: document.getElementById("presenterTools"),
  audienceTools: document.getElementById("audienceTools"),
  laserBtn: document.getElementById("laserBtn"),
  spotlightBtn: document.getElementById("spotlightBtn"),
  penBtn: document.getElementById("penBtn"),
  rotateBtn: document.getElementById("rotateBtn"),
  clearDrawBtn: document.getElementById("clearDrawBtn"),

  // 观众专属互动圈点
  audiencePenBtn: document.getElementById("audiencePenBtn"),
  audienceClearDrawBtn: document.getElementById("audienceClearDrawBtn"),

  // 动效与多媒体弹出菜单
  motionDropdownWrap: document.getElementById("motionDropdownWrap"),
  motionMenuBtn: document.getElementById("motionMenuBtn"),
  motionMenuPopup: document.getElementById("motionMenuPopup"),
  transitionSelect: document.getElementById("transitionSelect"),
  kenBurnsToggleBtn: document.getElementById("kenBurnsToggleBtn"),
  kenBurnsStatus: document.getElementById("kenBurnsStatus"),
  walkthroughVideoBtn: document.getElementById("walkthroughVideoBtn"),
  autoPlayToggleBtn: document.getElementById("autoPlayToggleBtn"),
  autoPlayStatus: document.getElementById("autoPlayStatus"),

  // 漫游视频图层
  walkthroughVideoLayer: document.getElementById("walkthroughVideoLayer"),
  slideVideoPlayer: document.getElementById("slideVideoPlayer"),
  videoPlayPauseBtn: document.getElementById("videoPlayPauseBtn"),
  videoTimeDisplay: document.getElementById("videoTimeDisplay"),
  videoCloseBtn: document.getElementById("videoCloseBtn"),

  // 管理按钮
  updateFileBtn: document.getElementById("updateFileBtn"),
  destroyRoomBtn: document.getElementById("destroyRoomBtn"),
  followToggleBtn: document.getElementById("followToggleBtn"),
  followStatusText: document.getElementById("followStatusText"),

  // 视口、画框与防盗水印
  slideViewport: document.getElementById("slideViewport"),
  slideStage: document.getElementById("slideStage"),
  pdfCanvas: document.getElementById("pdfCanvas"),
  pptxContainer: document.getElementById("pptxContainer"),
  securityWatermarkLayer: document.getElementById("securityWatermarkLayer"),
  drawCanvas: document.getElementById("drawCanvas"),
  spotlightMask: document.getElementById("spotlightMask"),
  laserPointer: document.getElementById("laserPointer"),
  slideLoadingMask: document.getElementById("slideLoadingMask"),
  loadingText: document.getElementById("loadingText"),
  audienceSyncNotice: document.getElementById("audienceSyncNotice"),
  hostCurrentPageTag: document.getElementById("hostCurrentPageTag"),
  catchUpBtn: document.getElementById("catchUpBtn"),
  slideProgressFill: document.getElementById("slideProgressFill"),

  // 胶片画廊抽屉
  filmstripDrawer: document.getElementById("filmstripDrawer"),
  filmstripTrack: document.getElementById("filmstripTrack"),
  closeFilmstripBtn: document.getElementById("closeFilmstripBtn"),

  // 模态框
  shortcutsModal: document.getElementById("shortcutsModal"),
  closeShortcutsModal: document.getElementById("closeShortcutsModal"),

  shareModal: document.getElementById("shareModal"),
  closeShareModal: document.getElementById("closeShareModal"),
  audienceShareUrl: document.getElementById("audienceShareUrl"),
  copyAudienceUrlBtn: document.getElementById("copyAudienceUrlBtn"),
  hostLinkSection: document.getElementById("hostLinkSection"),
  hostShareUrl: document.getElementById("hostShareUrl"),
  copyHostUrlBtn: document.getElementById("copyHostUrlBtn"),

  // 分享弹窗中受控策略面板
  hostSecuritySettingsBox: document.getElementById("hostSecuritySettingsBox"),
  shareSecurityEnabledCheck: document.getElementById("shareSecurityEnabledCheck"),
  shareSecurityInputs: document.getElementById("shareSecurityInputs"),
  shareMaxViewsSelect: document.getElementById("shareMaxViewsSelect"),
  shareExpiresSelect: document.getElementById("shareExpiresSelect"),
  shareWatermarkCheck: document.getElementById("shareWatermarkCheck"),
  saveShareSecurityBtn: document.getElementById("saveShareSecurityBtn"),

  // 换稿模态框
  updateModal: document.getElementById("updateModal"),
  closeUpdateModal: document.getElementById("closeUpdateModal"),
  updateDropZone: document.getElementById("updateDropZone"),
  updateFileInput: document.getElementById("updateFileInput"),
  updateFileInfo: document.getElementById("updateFileInfo"),
  updateFileName: document.getElementById("updateFileName"),
  confirmUpdateBtn: document.getElementById("confirmUpdateBtn"),
  updateSpinner: document.getElementById("updateSpinner"),
  compressOptionBox: document.getElementById("compressOptionBox"),
  autoCompressCheck: document.getElementById("autoCompressCheck"),
  compressionStats: document.getElementById("compressionStats"),
  origSizeText: document.getElementById("origSizeText"),
  compSizeText: document.getElementById("compSizeText"),
  savedPercentText: document.getElementById("savedPercentText"),

  // 漫游视频模态框
  videoModal: document.getElementById("videoModal"),
  closeVideoModal: document.getElementById("closeVideoModal"),
  videoUrlInput: document.getElementById("videoUrlInput"),
  startSyncVideoBtn: document.getElementById("startSyncVideoBtn"),
  loadSampleVideoBtn: document.getElementById("loadSampleVideoBtn"),

  // 安全受控锁定屏
  securityLockView: document.getElementById("securityLockView"),
  lockMessage: document.getElementById("lockMessage"),

  toastContainer: document.getElementById("toastContainer"),
};

// ============================================================
// 1. 全局轻量 Toast 提示
// ============================================================
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ============================================================
// 2. 初始化与路由解析
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
  setupTouchGestures();
  setupDockAutoHide();
});

function initApp() {
  const path = window.location.pathname;
  const match = path.match(/^\/room\/([a-zA-Z0-9_-]+)/);

  if (match) {
    const roomId = match[1];
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get("key");
    joinRoom(roomId, key);
  } else {
    showHomeView();
  }
}

function showHomeView() {
  state.view = "home";
  dom.homeView.style.display = "flex";
  dom.presentView.style.display = "none";
  if (dom.securityLockView) dom.securityLockView.style.display = "none";
}

function showPresentView() {
  state.view = "present";
  dom.homeView.style.display = "none";
  dom.presentView.style.display = "flex";
  requestWakeLock();
  startPresentationTimer();
}

// 移动端防息屏锁定 (Screen Wake Lock API)
async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      await navigator.wakeLock.request("screen");
    } catch (err) {}
  }
}

// ============================================================
// 3. 悬浮 Dock 2.5s 智能休眠与自动唤醒
// ============================================================
function setupDockAutoHide() {
  const wakeDock = () => {
    if (dom.floatingDock) {
      dom.floatingDock.classList.remove("dock-idle");
    }
    clearTimeout(state.dockIdleTimer);
    if (state.view === "present") {
      state.dockIdleTimer = setTimeout(() => {
        if (
          dom.floatingDock &&
          dom.motionMenuPopup.style.display !== "flex" &&
          dom.filmstripDrawer.style.display !== "flex"
        ) {
          dom.floatingDock.classList.add("dock-idle");
        }
      }, 2500);
    }
  };

  window.addEventListener("mousemove", wakeDock);
  window.addEventListener("touchstart", wakeDock);
  window.addEventListener("keydown", wakeDock);
}

// ============================================================
// 4. 汇报计时器 (Presentation Timer)
// ============================================================
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function startPresentationTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    if (state.timerRunning) {
      state.timerSeconds++;
      if (dom.timerText) dom.timerText.textContent = formatTime(state.timerSeconds);
    }
  }, 1000);
}

function toggleTimer() {
  state.timerRunning = !state.timerRunning;
  showToast(state.timerRunning ? "汇报计时已继续" : "汇报计时已暂停", "info");
}

function resetTimer() {
  state.timerSeconds = 0;
  if (dom.timerText) dom.timerText.textContent = "00:00";
  showToast("汇报计时器已重置为 00:00", "info");
}

// ============================================================
// 5. 房间创建与加入 (包含防盗与受控保护校验)
// ============================================================
async function joinRoom(roomId, secretKey = null) {
  state.roomId = roomId;
  state.secretKey = secretKey;
  showPresentView();
  showLoading("正在连接基准方中协同云服务...");

  try {
    const url = `/api/room/${encodeURIComponent(roomId)}${secretKey ? `?key=${encodeURIComponent(secretKey)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("演示房间不存在或已被销毁");

    const data = await res.json();

    // 关键拦截：如果受控策略判定已达到最大阅览次数或已过期
    if (data.locked) {
      hideLoading();
      dom.lockMessage.textContent = data.message || "本方案已达最大允许阅览次数或查阅时效已截止。";
      dom.securityLockView.style.display = "flex";
      return;
    }

    state.isPresenter = data.isPresenter;
    state.roomName = data.name;
    state.fileName = data.fileName;
    state.fileType = data.fileType;
    state.fileUrl = data.fileUrl;
    state.fileVersion = data.fileVersion;
    state.currentPage = data.currentPage || 1;
    state.totalPages = data.totalPages || 1;
    state.hostCurrentPage = data.currentPage || 1;
    state.security = data.security || { enabled: false, maxViews: 0, currentViews: 0, expiresAt: 0, watermark: false };

    dom.displayRoomName.textContent = state.roomName || "建筑概念方案汇报";
    document.title = `${state.roomName || "方案汇报"} - 基准方中`;

    updateRoleUI();
    applySecuritySettings(state.security);
    initSSE();
    await loadPresentation(state.fileUrl, state.fileType);
    goToSlide(state.currentPage, false, "none");
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast(`无法加入演示: ${err.message}`, "danger");
    setTimeout(() => (window.location.href = "/"), 2000);
  }
}

function updateRoleUI() {
  if (state.isPresenter) {
    dom.roleBadge.textContent = "主讲人";
    dom.roleBadge.className = "badge badge-host";
    dom.presenterTools.style.display = "flex";
    dom.audienceTools.style.display = "none";
    dom.hostLinkSection.style.display = "block";
    dom.hostSecuritySettingsBox.style.display = "block";
  } else {
    dom.roleBadge.textContent = "参会观众";
    dom.roleBadge.className = "badge badge-guest";
    dom.presenterTools.style.display = "none";
    dom.audienceTools.style.display = "flex";
    dom.hostLinkSection.style.display = "none";
    dom.hostSecuritySettingsBox.style.display = "none";
  }
  updateShareLinks();
}

function updateShareLinks() {
  const origin = window.location.origin;
  dom.audienceShareUrl.value = `${origin}/room/${state.roomId}`;
  if (state.secretKey) {
    dom.hostShareUrl.value = `${origin}/room/${state.roomId}?key=${state.secretKey}`;
  }
}

// 应用安全受控与防盗浅水印
function applySecuritySettings(sec) {
  if (!sec) return;

  // 1. 防盗浅水印控制
  if (sec.watermark) {
    dom.securityWatermarkLayer.style.display = "block";
  } else {
    dom.securityWatermarkLayer.style.display = "none";
  }

  // 2. 观众端受控体面提示微徽标 (显示限阅次数与剩余次数)
  if (!state.isPresenter && sec.enabled) {
    dom.securityPillBadge.style.display = "inline-flex";
    let text = "受控审阅版";
    if (sec.maxViews > 0) {
      const remaining = Math.max(0, sec.maxViews - (sec.currentViews || 0));
      text += ` · 限阅 ${sec.maxViews} 次 (剩 ${remaining} 次)`;
    }
    if (sec.expiresAt > 0) {
      const d = new Date(sec.expiresAt);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      text += ` · 截止 ${timeStr}`;
    }
    dom.securityPillText.textContent = text;
  } else {
    dom.securityPillBadge.style.display = "none";
  }

  // 3. 回显主讲人分享控制面板
  if (dom.shareSecurityEnabledCheck) {
    dom.shareSecurityEnabledCheck.checked = Boolean(sec.enabled);
    dom.shareSecurityInputs.style.display = sec.enabled ? "block" : "none";
    if (sec.maxViews !== undefined) dom.shareMaxViewsSelect.value = String(sec.maxViews);
    if (sec.watermark !== undefined) dom.shareWatermarkCheck.checked = Boolean(sec.watermark);
  }
}

// 参会圈点提示条微动画
let annoTimer = null;
function showAttendeeAnnoNotice(user) {
  dom.attendeeAnnoText.textContent = `${user} 正在圈点提问...`;
  dom.attendeeAnnoNotice.style.display = "flex";
  clearTimeout(annoTimer);
  annoTimer = setTimeout(() => {
    dom.attendeeAnnoNotice.style.display = "none";
  }, 3500);
}

// ============================================================
// 6. SSE 实时双向同步管道 (含协同圈点与受控广播)
// ============================================================
function initSSE() {
  if (state.eventSource) state.eventSource.close();

  const es = new EventSource(`/api/room/${encodeURIComponent(state.roomId)}/events`);
  state.eventSource = es;

  es.onopen = () => {
    dom.connStatus.className = "conn-status online";
    dom.connStatus.querySelector(".conn-text").textContent = "实时协同";
  };

  es.onerror = () => {
    dom.connStatus.className = "conn-status";
    dom.connStatus.querySelector(".conn-text").textContent = "重新连接中...";
  };

  es.addEventListener("state", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.currentPage) {
        state.hostCurrentPage = data.currentPage;
        if (!state.isPresenter && state.isFollowingHost) {
          goToSlide(data.currentPage, false, "none");
        }
      }
    } catch (err) {}
  });

  es.addEventListener("sync", (e) => {
    try {
      const data = JSON.parse(e.data);
      handleSyncState(data);
    } catch (err) {}
  });

  // 接收安全策略动态更新
  es.addEventListener("security_updated", (e) => {
    try {
      const sec = JSON.parse(e.data);
      state.security = sec;
      applySecuritySettings(sec);
      showToast("方案防盗与受控保护策略已更新", "info");
    } catch (err) {}
  });

  // 接收参会人员/领导圈点提问批注
  es.addEventListener("audience_annotation", (e) => {
    try {
      const data = JSON.parse(e.data);
      handleRemoteDrawing(data.drawing);
      if (data.drawing && data.drawing.type === "line") {
        showAttendeeAnnoNotice(data.user || "参会人员");
      }
    } catch (err) {}
  });

  es.addEventListener("file_updated", async (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast("主讲人已热更新方案图纸，正在加载最新版本...", "info");
      state.fileVersion = data.fileVersion;
      state.fileUrl = data.fileUrl;
      state.fileType = data.fileType;
      state.fileName = data.fileName;
      showLoading("正在热重载最新图纸...");
      await loadPresentation(state.fileUrl, state.fileType);
      goToSlide(data.currentPage || 1, false, "fade");
      hideLoading();
      showToast("新版方案加载完毕！", "success");
    } catch (err) {}
  });

  es.addEventListener("room_deleted", (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast(data.message || "演示已结束，文稿已从服务器清除以释放空间", "warning");
      setTimeout(() => (window.location.href = "/"), 2500);
    } catch (err) {}
  });
}

function handleSyncState(data) {
  // 画面旋转角度同步
  if (data.rotation !== undefined && data.rotation !== state.pageRotation) {
    state.pageRotation = data.rotation;
    if (state.fileType === "pdf") renderPdfPage(state.currentPage, "none");
  }

  // 转场动效同步
  if (data.transition) {
    state.transitionEffect = data.transition;
    if (dom.transitionSelect) dom.transitionSelect.value = data.transition;
  }

  // 漫游视频播放同步
  if (data.video) {
    handleVideoSync(data.video);
  }

  // 建筑巡镜动效同步
  if (data.kenBurns !== undefined && data.kenBurns !== state.kenBurnsActive) {
    state.kenBurnsActive = data.kenBurns;
    dom.slideStage.classList.toggle("ken-burns-roam", state.kenBurnsActive);
    if (dom.kenBurnsStatus) {
      dom.kenBurnsStatus.textContent = state.kenBurnsActive ? "开启中" : "关闭";
      dom.kenBurnsStatus.className = `status-tag ${state.kenBurnsActive ? "active" : ""}`;
    }
  }

  // 翻页同步
  if (data.page !== undefined) {
    const prevPage = state.currentPage;
    state.hostCurrentPage = data.page;
    dom.hostCurrentPageTag.textContent = data.page;
    const direction = data.direction || (data.page >= prevPage ? "next" : "prev");

    if (state.isPresenter || state.isFollowingHost) {
      goToSlide(data.page, false, direction);
      dom.audienceSyncNotice.style.display = "none";
    } else {
      if (state.currentPage !== state.hostCurrentPage) {
        dom.audienceSyncNotice.style.display = "flex";
      }
    }
  }

  if (data.laser) renderLaser(data.laser);
  if (data.spotlight) renderSpotlight(data.spotlight);
  if (data.drawing) handleRemoteDrawing(data.drawing);
}

let syncTimer = null;
function broadcastSync(immediate = false, direction = "next") {
  if (!state.isPresenter) return;

  const payload = {
    secretKey: state.secretKey,
    page: state.currentPage,
    totalPages: state.totalPages,
    rotation: state.pageRotation,
    transition: state.transitionEffect,
    direction: direction,
    kenBurns: state.kenBurnsActive,
    laser: {
      active: state.laserActive,
      x: state.laserX || 0,
      y: state.laserY || 0,
    },
    spotlight: {
      active: state.spotlightActive,
      x: state.spotlightX || 0.5,
      y: state.spotlightY || 0.5,
    },
  };

  const doSend = () => {
    fetch(`/api/room/${encodeURIComponent(state.roomId)}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Presenter-Key": state.secretKey,
      },
      body: JSON.stringify(payload),
    }).catch(console.error);
  };

  if (immediate) {
    clearTimeout(syncTimer);
    doSend();
  } else {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSend, 40);
  }
}

// ============================================================
// 7. 高保真图纸渲染引擎 (PDF.js + PPTX)
// ============================================================
async function loadPresentation(url, type) {
  if (type === "pdf") {
    dom.pdfCanvas.style.display = "block";
    dom.pptxContainer.style.display = "none";
    await loadPdf(url);
  } else {
    dom.pdfCanvas.style.display = "none";
    dom.pptxContainer.style.display = "flex";
    await loadPptx(url);
  }
}

async function loadPdf(url) {
  const loadingTask = pdfjsLib.getDocument({
    url: `${url}?t=${Date.now()}`,
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  state.pdfDoc = pdf;
  state.totalPages = pdf.numPages;
  updatePaginationUI();
}

async function renderPdfPage(pageNum, direction = "next") {
  if (!state.pdfDoc) return;

  try {
    await new Promise((r) => requestAnimationFrame(r));
    const page = await state.pdfDoc.getPage(pageNum);
    const canvas = dom.pdfCanvas;
    const ctx = canvas.getContext("2d");

    const container = dom.slideViewport;
    const maxWidth = Math.max(320, (container.clientWidth || window.innerWidth) - 40);
    const maxHeight = Math.max(240, (container.clientHeight || window.innerHeight) - 40);

    // 正确结合 PDF 页面内部旋转与用户手动校正角度
    const currentRotation = ((page.rotate || 0) + (state.pageRotation || 0)) % 360;
    const unscaledViewport = page.getViewport({ scale: 1, rotation: currentRotation });
    const scale = Math.min(maxWidth / unscaledViewport.width, maxHeight / unscaledViewport.height, 2.5);

    const viewport = page.getViewport({ scale, rotation: currentRotation });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + "px";
    canvas.style.height = Math.floor(viewport.height) + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const renderContext = {
      canvasContext: ctx,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    syncDrawCanvasSize(canvas.style.width, canvas.style.height);
    applySlideTransition(canvas, direction);
  } catch (err) {
    console.error("渲染 PDF 页面出错:", err);
  }
}

async function loadPptx(url) {
  const response = await fetch(`${url}?t=${Date.now()}`);
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = [];
  zip.forEach((relativePath) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideFiles.push({ path: relativePath, index: parseInt(match[1]) });
    }
  });

  slideFiles.sort((a, b) => a.index - b.index);

  if (slideFiles.length === 0) {
    state.pptxSlides = [{ title: state.fileName, items: ["建筑方案文稿已载入"] }];
    state.totalPages = 1;
  } else {
    state.pptxSlides = [];
    for (const item of slideFiles) {
      const xmlStr = await zip.file(item.path).async("string");
      const slideData = parseSlideXml(xmlStr, item.index);
      state.pptxSlides.push(slideData);
    }
    state.totalPages = state.pptxSlides.length;
  }

  updatePaginationUI();
}

function parseSlideXml(xmlStr, slideIdx) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "application/xml");

  const textNodes = xmlDoc.getElementsByTagName("a:t");
  const texts = [];
  for (let i = 0; i < textNodes.length; i++) {
    const val = textNodes[i].textContent.trim();
    if (val) texts.push(val);
  }

  const title = texts.length > 0 ? texts[0] : `图纸 ${slideIdx}`;
  const bodyItems = texts.slice(1);

  return {
    index: slideIdx,
    title,
    items: bodyItems.length > 0 ? bodyItems : ["(该页包含三维透视渲染或排版图纸)"],
  };
}

function renderPptxPage(pageNum, direction = "next") {
  const slide = state.pptxSlides[pageNum - 1];
  if (!slide) return;

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; text-align: left; padding: 32px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 18px; border-bottom: 2px solid #E60026; padding-bottom: 12px;">
        <span style="font-size: 14px; font-weight: 800; color: #E60026; letter-spacing: 1px;">JZFZ ARCHITECTURE</span>
        <span style="color: #cbd5e1;">/</span>
        <h1 style="font-size: 26px; font-weight: 800; color: #111111; margin: 0; letter-spacing: -0.3px;">
          ${escapeHtml(slide.title)}
        </h1>
      </div>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; font-size: 18px; color: #333333; line-height: 1.65;">
        ${slide.items.map((it) => `<div style="display: flex; align-items: flex-start; gap: 12px;"><span style="color: #E60026; font-size: 22px; line-height: 1.2;">▪</span><span>${escapeHtml(it)}</span></div>`).join("")}
      </div>
      <div style="font-size: 12px; font-weight: 700; color: #999999; text-align: right; margin-top: auto; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 8px;">
        PAGE ${pageNum} OF ${state.totalPages}
      </div>
    </div>
  `;
  dom.pptxContainer.innerHTML = html;
  syncDrawCanvasSize("1024px", "576px");
  applySlideTransition(dom.pptxContainer, direction);
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

function syncDrawCanvasSize(widthStr, heightStr) {
  const w = parseInt(widthStr, 10);
  const h = parseInt(heightStr, 10);
  dom.drawCanvas.width = w;
  dom.drawCanvas.height = h;
  dom.drawCanvas.style.width = widthStr;
  dom.drawCanvas.style.height = heightStr;
}

// ============================================================
// 8. 动效引擎 (转场、建筑漫游巡镜、自动巡展)
// ============================================================
function applySlideTransition(el, direction = "next") {
  if (state.transitionEffect === "none" || direction === "none") {
    el.className = el.id === "pdfCanvas" ? "" : "pptx-container";
    return;
  }

  el.classList.remove("anim-fade", "anim-slide-next", "anim-slide-prev", "anim-zoom");
  void el.offsetWidth;

  if (state.transitionEffect === "slide") {
    el.classList.add(direction === "prev" ? "anim-slide-prev" : "anim-slide-next");
  } else if (state.transitionEffect === "zoom") {
    el.classList.add("anim-zoom");
  } else {
    el.classList.add("anim-fade");
  }
}

function goToSlide(pageNum, triggerBroadcast = true, direction = "next") {
  const target = Math.max(1, Math.min(pageNum, state.totalPages));
  const oldPage = state.currentPage;
  state.currentPage = target;

  const actualDir = direction !== "none" ? (target >= oldPage ? "next" : "prev") : "none";

  updatePaginationUI();
  clearDrawCanvas(false);

  if (state.fileType === "pdf") {
    renderPdfPage(target, actualDir);
  } else {
    renderPptxPage(target, actualDir);
  }

  const percent = ((target - 1) / Math.max(1, state.totalPages - 1)) * 100;
  dom.slideProgressFill.style.width = `${percent}%`;

  highlightActiveFilmstripCard(target);

  if (triggerBroadcast && state.isPresenter) {
    broadcastSync(true, actualDir);
  }
}

function updatePaginationUI() {
  dom.currentPageNum.textContent = state.currentPage;
  dom.totalPagesNum.textContent = state.totalPages;
  dom.prevSlideBtn.disabled = state.currentPage <= 1;
  dom.nextSlideBtn.disabled = state.currentPage >= state.totalPages;
}

function toggleKenBurns() {
  state.kenBurnsActive = !state.kenBurnsActive;
  dom.slideStage.classList.toggle("ken-burns-roam", state.kenBurnsActive);
  dom.kenBurnsStatus.textContent = state.kenBurnsActive ? "开启中" : "关闭";
  dom.kenBurnsStatus.className = `status-tag ${state.kenBurnsActive ? "active" : ""}`;

  showToast(state.kenBurnsActive ? "已开启电影级建筑漫游巡镜" : "已关闭建筑漫游巡镜", "info");
  broadcastSync(true);
}

function toggleAutoPlay() {
  state.autoPlayActive = !state.autoPlayActive;
  dom.autoPlayStatus.textContent = state.autoPlayActive ? "轮播中" : "关闭";
  dom.autoPlayStatus.className = `status-tag ${state.autoPlayActive ? "active" : ""}`;

  if (state.autoPlayActive) {
    showToast("已启动展厅自动巡展 (每 8 秒自动翻页)", "success");
    state.autoPlayTimer = setInterval(() => {
      const next = state.currentPage >= state.totalPages ? 1 : state.currentPage + 1;
      goToSlide(next, true, "slide");
    }, 8000);
  } else {
    clearInterval(state.autoPlayTimer);
    showToast("已停止自动巡展", "info");
  }
}

// ============================================================
// 9. 漫游视频播放与多端同步引擎
// ============================================================
function openVideoModal() {
  dom.motionMenuPopup.style.display = "none";
  dom.videoModal.style.display = "flex";
}

function startVideoSync(url) {
  if (!url) {
    showToast("请输入有效的视频链接", "warning");
    return;
  }
  dom.videoModal.style.display = "none";
  dom.walkthroughVideoLayer.style.display = "flex";
  dom.slideVideoPlayer.src = url;
  dom.slideVideoPlayer.play().catch(() => {});
  state.videoActive = true;

  if (state.isPresenter) {
    broadcastVideoAction("play", 0, url);
  }
  showToast("漫游视频已开启，所有观众端正在毫秒级同步放映！", "success");
}

function handleVideoSync(videoData) {
  if (videoData.action === "close") {
    dom.walkthroughVideoLayer.style.display = "none";
    dom.slideVideoPlayer.pause();
    return;
  }

  dom.walkthroughVideoLayer.style.display = "flex";
  if (videoData.url && dom.slideVideoPlayer.src !== videoData.url) {
    dom.slideVideoPlayer.src = videoData.url;
  }

  if (Math.abs(dom.slideVideoPlayer.currentTime - videoData.time) > 0.5) {
    dom.slideVideoPlayer.currentTime = videoData.time;
  }

  if (videoData.action === "play") {
    dom.slideVideoPlayer.play().catch(() => {});
    dom.videoPlayPauseBtn.textContent = "⏸ 暂停漫游";
  } else if (videoData.action === "pause") {
    dom.slideVideoPlayer.pause();
    dom.videoPlayPauseBtn.textContent = "▶ 播放漫游";
  }
}

function broadcastVideoAction(action, time, url = null) {
  if (!state.isPresenter) return;
  fetch(`/api/room/${encodeURIComponent(state.roomId)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Presenter-Key": state.secretKey },
    body: JSON.stringify({
      video: { action, time, url },
    }),
  }).catch(console.error);
}

// ============================================================
// 10. 底部横向胶片画廊抽屉 (Bottom Filmstrip Drawer)
// ============================================================
function toggleFilmstripDrawer() {
  const isShown = dom.filmstripDrawer.style.display === "flex";
  if (isShown) {
    closeFilmstripDrawer();
  } else {
    openFilmstripDrawer();
  }
}

function openFilmstripDrawer() {
  dom.filmstripDrawer.style.display = "flex";
  renderFilmstripThumbnails();
}

function closeFilmstripDrawer() {
  dom.filmstripDrawer.style.display = "none";
}

function renderFilmstripThumbnails() {
  dom.filmstripTrack.innerHTML = "";
  for (let i = 1; i <= state.totalPages; i++) {
    const card = document.createElement("div");
    card.className = `filmstrip-card ${i === state.currentPage ? "active" : ""}`;
    card.dataset.page = i;

    let title = `图纸 ${i}`;
    if (state.fileType === "pptx" && state.pptxSlides[i - 1]) {
      title = state.pptxSlides[i - 1].title;
    }

    card.innerHTML = `
      <span class="filmstrip-num">${String(i).padStart(2, "0")}</span>
      <span class="filmstrip-label">${escapeHtml(title)}</span>
    `;

    card.addEventListener("click", () => {
      goToSlide(i);
      closeFilmstripDrawer();
    });

    dom.filmstripTrack.appendChild(card);
  }

  setTimeout(() => {
    const active = dom.filmstripTrack.querySelector(".filmstrip-card.active");
    if (active) active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, 100);
}

function highlightActiveFilmstripCard(target) {
  const cards = dom.filmstripTrack.querySelectorAll(".filmstrip-card");
  cards.forEach((c) => {
    c.classList.toggle("active", parseInt(c.dataset.page, 10) === target);
  });
}

// ============================================================
// 11. 激光笔、聚光灯与荧光画笔标注 (含观众/领导提问圈点)
// ============================================================
function renderLaser(laser) {
  if (laser && laser.active) {
    const rect = dom.slideStage.getBoundingClientRect();
    const x = laser.x * rect.width;
    const y = laser.y * rect.height;
    dom.laserPointer.style.display = "block";
    dom.laserPointer.style.left = `${x}px`;
    dom.laserPointer.style.top = `${y}px`;
  } else {
    dom.laserPointer.style.display = "none";
  }
}

function renderSpotlight(spotlight) {
  if (spotlight && spotlight.active) {
    dom.spotlightMask.style.display = "block";
    dom.spotlightMask.style.setProperty("--spot-x", `${(spotlight.x * 100).toFixed(2)}%`);
    dom.spotlightMask.style.setProperty("--spot-y", `${(spotlight.y * 100).toFixed(2)}%`);
  } else {
    dom.spotlightMask.style.display = "none";
  }
}

function toggleLaser() {
  state.laserActive = !state.laserActive;
  dom.laserBtn.classList.toggle("active-danger", state.laserActive);
  if (!state.laserActive) {
    renderLaser({ active: false });
    broadcastSync(true);
  }
}

function toggleRotate() {
  state.pageRotation = (state.pageRotation + 90) % 360;
  if (state.fileType === "pdf") {
    renderPdfPage(state.currentPage, "none");
  }
  broadcastSync(true);
  showToast(`已旋转校正画面至 ${state.pageRotation}°`, "info");
}

function toggleSpotlight() {
  state.spotlightActive = !state.spotlightActive;
  dom.spotlightBtn.classList.toggle("active", state.spotlightActive);
  renderSpotlight({ active: state.spotlightActive, x: state.spotlightX, y: state.spotlightY });
  broadcastSync(true);
}

function togglePen() {
  state.penActive = !state.penActive;
  state.drawColor = "#E60026"; // 主讲红笔
  dom.penBtn.classList.toggle("active", state.penActive);
  dom.drawCanvas.classList.toggle("drawing-active", state.penActive);
  dom.clearDrawBtn.style.display = state.penActive ? "inline-flex" : "none";
}

function clearDrawCanvas(broadcast = true) {
  const ctx = dom.drawCanvas.getContext("2d");
  ctx.clearRect(0, 0, dom.drawCanvas.width, dom.drawCanvas.height);
  if (broadcast && state.isPresenter) {
    broadcastDrawingAction({ type: "clear" });
  }
}

function broadcastDrawingAction(action) {
  if (!state.isPresenter) return;
  fetch(`/api/room/${encodeURIComponent(state.roomId)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Presenter-Key": state.secretKey },
    body: JSON.stringify({ drawing: action }),
  }).catch(console.error);
}

// 观众/领导发送提问圈点
let audienceDrawTimer = null;
function sendAudienceAnnotation(action) {
  fetch(`/api/room/${encodeURIComponent(state.roomId)}/annotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drawing: action, user: "参会嘉宾/领导" }),
  }).catch(console.error);
}

function handleRemoteDrawing(action) {
  const ctx = dom.drawCanvas.getContext("2d");
  if (action.type === "clear") {
    ctx.clearRect(0, 0, dom.drawCanvas.width, dom.drawCanvas.height);
  } else if (action.type === "line") {
    const w = dom.drawCanvas.width;
    const h = dom.drawCanvas.height;
    ctx.strokeStyle = action.color || "#E60026";
    ctx.lineWidth = action.color === "#2563eb" ? 4 : 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(action.fromX * w, action.fromY * h);
    ctx.lineTo(action.toX * w, action.toY * h);
    ctx.stroke();
  }
}

// ============================================================
// 12. 小程序化触控手势 (左右轻扫翻页)
// ============================================================
function setupTouchGestures() {
  dom.slideViewport.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  dom.slideViewport.addEventListener(
    "touchend",
    (e) => {
      if (e.changedTouches.length === 1 && !state.penActive && !state.audiencePenActive) {
        const dx = e.changedTouches[0].clientX - state.touchStartX;
        const dy = e.changedTouches[0].clientY - state.touchStartY;

        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) {
            goToSlide(state.currentPage + 1);
          } else {
            goToSlide(state.currentPage - 1);
          }
        }
      }
    },
    { passive: true }
  );
}

// ============================================================
// 13. 事件监听全量绑定
// ============================================================
function setupEventListeners() {
  // 首页文件选择与拖拽
  dom.dropZone.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleSelectedFile(e.target.files[0]);
  });

  dom.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dom.dropZone.classList.add("dragover");
  });
  dom.dropZone.addEventListener("dragleave", () => dom.dropZone.classList.remove("dragover"));
  dom.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) handleSelectedFile(e.dataTransfer.files[0]);
  });

  dom.removeFileBtn.addEventListener("click", () => {
    state.selectedFile = null;
    dom.fileInput.value = "";
    dom.dropZone.style.display = "block";
    dom.selectedFileInfo.style.display = "none";
    dom.compressOptionBox.style.display = "none";
    dom.startPresentBtn.disabled = true;
  });

  // 首页防盗与受控保护配置展开
  if (dom.homeSecurityCheck) {
    dom.homeSecurityCheck.addEventListener("change", (e) => {
      dom.homeSecurityDetails.style.display = e.target.checked ? "grid" : "none";
    });
  }

  dom.startPresentBtn.addEventListener("click", handleStartUpload);

  // 快捷键
  window.addEventListener("keydown", (e) => {
    if (state.view !== "present") return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goToSlide(state.currentPage - 1);
    } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      goToSlide(state.currentPage + 1);
    } else if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    } else if (e.key === "l" || e.key === "L") {
      if (state.isPresenter) toggleLaser();
    } else if (e.key === "r" || e.key === "R") {
      if (state.isPresenter) toggleRotate();
    } else if (e.key === "s" || e.key === "S") {
      if (state.isPresenter) toggleSpotlight();
    } else if (e.key === "p" || e.key === "P") {
      if (state.isPresenter) togglePen();
    } else if (e.key === "g" || e.key === "G") {
      toggleFilmstripDrawer();
    } else if (e.key === "?" || e.key === "/") {
      dom.shortcutsModal.style.display = "flex";
    } else if (e.key === "Escape") {
      closeFilmstripDrawer();
      dom.shortcutsModal.style.display = "none";
      dom.shareModal.style.display = "none";
      dom.updateModal.style.display = "none";
      dom.videoModal.style.display = "none";
      dom.motionMenuPopup.style.display = "none";
      if (state.spotlightActive) toggleSpotlight();
      if (state.laserActive) toggleLaser();
      if (state.penActive) togglePen();
    }
  });

  // Dock 翻页与总览
  dom.prevSlideBtn.addEventListener("click", () => goToSlide(state.currentPage - 1));
  dom.nextSlideBtn.addEventListener("click", () => goToSlide(state.currentPage + 1));
  dom.pageDisplayBtn.addEventListener("click", toggleFilmstripDrawer);
  dom.filmstripToggleBtn.addEventListener("click", toggleFilmstripDrawer);
  dom.closeFilmstripBtn.addEventListener("click", closeFilmstripDrawer);

  // 顶部辅助
  dom.presTimerBtn.addEventListener("click", toggleTimer);
  dom.presTimerBtn.addEventListener("dblclick", resetTimer);
  dom.shortcutsBtn.addEventListener("click", () => (dom.shortcutsModal.style.display = "flex"));
  dom.closeShortcutsModal.addEventListener("click", () => (dom.shortcutsModal.style.display = "none"));

  // 工具栏交互
  dom.laserBtn.addEventListener("click", toggleLaser);
  dom.spotlightBtn.addEventListener("click", toggleSpotlight);
  dom.penBtn.addEventListener("click", togglePen);
  dom.rotateBtn.addEventListener("click", toggleRotate);
  dom.clearDrawBtn.addEventListener("click", () => clearDrawCanvas(true));

  // 观众/领导专属提问圈点画笔
  if (dom.audiencePenBtn) {
    dom.audiencePenBtn.addEventListener("click", () => {
      state.audiencePenActive = !state.audiencePenActive;
      state.penActive = state.audiencePenActive;
      state.drawColor = "#2563eb"; // 提问圈点专用高亮蓝
      dom.audiencePenBtn.classList.toggle("active", state.audiencePenActive);
      dom.drawCanvas.classList.toggle("drawing-active", state.audiencePenActive);
      dom.audienceClearDrawBtn.style.display = state.audiencePenActive ? "inline-flex" : "none";
      if (state.audiencePenActive) {
        showToast("提问画笔已开启：在屏幕上勾画圈点，主讲人端将实时同步呈现！", "info");
      }
    });

    dom.audienceClearDrawBtn.addEventListener("click", () => {
      clearDrawCanvas(false);
      fetch(`/api/room/${encodeURIComponent(state.roomId)}/annotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawing: { type: "clear" }, user: "参会人员" }),
      }).catch(console.error);
    });
  }

  // 动效与漫游菜单
  dom.motionMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isShown = dom.motionMenuPopup.style.display === "flex";
    dom.motionMenuPopup.style.display = isShown ? "none" : "flex";
  });

  document.addEventListener("click", (e) => {
    if (!dom.motionDropdownWrap.contains(e.target)) {
      dom.motionMenuPopup.style.display = "none";
    }
  });

  dom.transitionSelect.addEventListener("change", (e) => {
    state.transitionEffect = e.target.value;
    broadcastSync(true);
    showToast(`转场动效已切换为: ${e.target.options[e.target.selectedIndex].text}`, "info");
  });

  dom.kenBurnsToggleBtn.addEventListener("click", toggleKenBurns);
  dom.autoPlayToggleBtn.addEventListener("click", toggleAutoPlay);
  dom.walkthroughVideoBtn.addEventListener("click", openVideoModal);
  dom.closeVideoModal.addEventListener("click", () => (dom.videoModal.style.display = "none"));

  dom.loadSampleVideoBtn.addEventListener("click", () => {
    dom.videoUrlInput.value = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  });

  dom.startSyncVideoBtn.addEventListener("click", () => {
    startVideoSync(dom.videoUrlInput.value.trim());
  });

  dom.videoPlayPauseBtn.addEventListener("click", () => {
    if (dom.slideVideoPlayer.paused) {
      dom.slideVideoPlayer.play();
      dom.videoPlayPauseBtn.textContent = "⏸ 暂停漫游";
      broadcastVideoAction("play", dom.slideVideoPlayer.currentTime);
    } else {
      dom.slideVideoPlayer.pause();
      dom.videoPlayPauseBtn.textContent = "▶ 播放漫游";
      broadcastVideoAction("pause", dom.slideVideoPlayer.currentTime);
    }
  });

  dom.videoCloseBtn.addEventListener("click", () => {
    dom.walkthroughVideoLayer.style.display = "none";
    dom.slideVideoPlayer.pause();
    if (state.isPresenter) broadcastVideoAction("close", 0);
  });

  dom.slideVideoPlayer.addEventListener("timeupdate", () => {
    dom.videoTimeDisplay.textContent = `${formatTime(Math.floor(dom.slideVideoPlayer.currentTime))} / ${formatTime(Math.floor(dom.slideVideoPlayer.duration || 0))}`;
  });

  // 换稿更新
  dom.updateFileBtn.addEventListener("click", () => (dom.updateModal.style.display = "flex"));
  dom.closeUpdateModal.addEventListener("click", () => (dom.updateModal.style.display = "none"));
  dom.updateDropZone.addEventListener("click", () => dom.updateFileInput.click());
  dom.updateFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleUpdateSelectedFile(e.target.files[0]);
  });
  dom.confirmUpdateBtn.addEventListener("click", handleConfirmUpdate);

  // 销毁并释放空间
  dom.destroyRoomBtn.addEventListener("click", handleDestroyRoom);

  // 分享弹窗
  dom.shareBtn.addEventListener("click", () => (dom.shareModal.style.display = "flex"));
  dom.closeShareModal.addEventListener("click", () => (dom.shareModal.style.display = "none"));
  dom.copyAudienceUrlBtn.addEventListener("click", () => copyText(dom.audienceShareUrl.value, "观众分享链接已复制！"));
  dom.copyHostUrlBtn.addEventListener("click", () => copyText(dom.hostShareUrl.value, "主讲人管理链接已复制！"));

  // 分享弹窗中受控策略面板
  if (dom.shareSecurityEnabledCheck) {
    dom.shareSecurityEnabledCheck.addEventListener("change", (e) => {
      dom.shareSecurityInputs.style.display = e.target.checked ? "block" : "none";
    });

    dom.saveShareSecurityBtn.addEventListener("click", async () => {
      try {
        const payload = {
          secretKey: state.secretKey,
          enabled: dom.shareSecurityEnabledCheck.checked,
          maxViews: dom.shareMaxViewsSelect.value,
          expiresHours: dom.shareExpiresSelect.value,
          watermark: dom.shareWatermarkCheck.checked,
        };
        const res = await fetch(`/api/room/${encodeURIComponent(state.roomId)}/security`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Presenter-Key": state.secretKey,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("保存安全策略失败");
        const data = await res.json();
        state.security = data.security;
        applySecuritySettings(data.security);
        showToast("方案受控防盗策略已生效！", "success");
      } catch (err) {
        showToast(`保存失败: ${err.message}`, "danger");
      }
    });
  }

  // 观众端跟随切换
  dom.followToggleBtn.addEventListener("click", () => {
    state.isFollowingHost = !state.isFollowingHost;
    dom.followToggleBtn.classList.toggle("active-follow", state.isFollowingHost);
    dom.followStatusText.textContent = state.isFollowingHost ? "正在跟随主讲人" : "自由翻阅模式";
    if (state.isFollowingHost) {
      goToSlide(state.hostCurrentPage, false, "fade");
      dom.audienceSyncNotice.style.display = "none";
    }
  });

  dom.catchUpBtn.addEventListener("click", () => {
    state.isFollowingHost = true;
    dom.followToggleBtn.classList.add("active-follow");
    dom.followStatusText.textContent = "正在跟随主讲人";
    goToSlide(state.hostCurrentPage, false, "fade");
    dom.audienceSyncNotice.style.display = "none";
  });

  // 全屏沉浸
  dom.fullscreenBtn.addEventListener("click", toggleFullscreen);

  // 鼠标移动交互追踪 (激光笔与聚光灯)
  dom.slideStage.addEventListener("mousemove", (e) => {
    if (!state.isPresenter) return;
    const rect = dom.slideStage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (state.laserActive) {
      state.laserX = x;
      state.laserY = y;
      renderLaser({ active: true, x, y });
      broadcastSync(false);
    }

    if (state.spotlightActive) {
      state.spotlightX = x;
      state.spotlightY = y;
      renderSpotlight({ active: true, x, y });
      broadcastSync(false);
    }
  });

  // 荧光/提问标注画笔事件 (主讲人与参会端通用)
  let lastX = 0, lastY = 0;
  dom.drawCanvas.addEventListener("mousedown", (e) => {
    if (!state.penActive && !state.audiencePenActive) return;
    state.isDrawing = true;
    const rect = dom.drawCanvas.getBoundingClientRect();
    lastX = (e.clientX - rect.left) / rect.width;
    lastY = (e.clientY - rect.top) / rect.height;
  });

  dom.drawCanvas.addEventListener("mousemove", (e) => {
    if ((!state.penActive && !state.audiencePenActive) || !state.isDrawing) return;
    const rect = dom.drawCanvas.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / rect.width;
    const curY = (e.clientY - rect.top) / rect.height;

    const action = { type: "line", fromX: lastX, fromY: lastY, toX: curX, toY: curY, color: state.drawColor };
    handleRemoteDrawing(action);

    if (state.isPresenter) {
      broadcastDrawingAction(action);
    } else if (state.audiencePenActive) {
      sendAudienceAnnotation(action);
    }

    lastX = curX;
    lastY = curY;
  });

  window.addEventListener("mouseup", () => (state.isDrawing = false));
}

// ============================================================
// 14. 文件上传与智能极速压缩
// ============================================================
function handleSelectedFile(file) {
  state.selectedFile = file;
  dom.selectedFileName.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  dom.dropZone.style.display = "none";
  dom.selectedFileInfo.style.display = "flex";
  dom.startPresentBtn.disabled = false;

  if (file.name.toLowerCase().endsWith(".pptx")) {
    dom.compressOptionBox.style.display = "flex";
  } else {
    dom.compressOptionBox.style.display = "none";
  }
}

async function handleStartUpload() {
  if (!state.selectedFile) return;

  dom.startPresentBtn.disabled = true;
  dom.uploadSpinner.style.display = "inline-block";

  try {
    let fileToSend = state.selectedFile;
    if (dom.autoCompressCheck.checked && fileToSend.name.toLowerCase().endsWith(".pptx")) {
      fileToSend = await smartCompressPptx(fileToSend);
    }

    const formData = new FormData();
    formData.append("file", fileToSend);
    if (dom.roomNameInput.value.trim()) {
      formData.append("roomName", dom.roomNameInput.value.trim());
    }

    // 附带安全受控防盗参数 (如果勾选)
    if (dom.homeSecurityCheck && dom.homeSecurityCheck.checked) {
      formData.append("maxViews", dom.homeMaxViews.value);
      formData.append("expiresHours", dom.homeExpiresHours.value);
      formData.append("watermark", dom.homeWatermarkCheck.checked);
    }

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("文稿上传失败");

    const data = await res.json();
    window.location.href = `/room/${data.roomId}?key=${data.secretKey}`;
  } catch (err) {
    showToast(`创建失败: ${err.message}`, "danger");
    dom.startPresentBtn.disabled = false;
    dom.uploadSpinner.style.display = "none";
  }
}

async function smartCompressPptx(file) {
  showToast("⚡ 正在执行建筑高清智能瘦身...", "info");
  const origSize = file.size;
  const zip = await JSZip.loadAsync(file);

  const mediaFiles = [];
  zip.forEach((path) => {
    if (path.startsWith("ppt/media/") && /\.(png|jpe?g)$/i.test(path)) {
      mediaFiles.push(path);
    }
  });

  for (const path of mediaFiles) {
    try {
      const blob = await zip.file(path).async("blob");
      const compressedBlob = await compressImageBlob(blob, 1920, 1080, 0.82);
      if (compressedBlob.size < blob.size) {
        zip.file(path, compressedBlob);
      }
    } catch (e) {}
  }

  const outBlob = await zip.generateAsync({ type: "blob" });
  const compSize = outBlob.size;
  const saved = Math.max(0, Math.round(((origSize - compSize) / origSize) * 100));

  dom.compressionStats.style.display = "flex";
  dom.origSizeText.textContent = `${(origSize / 1024 / 1024).toFixed(1)} MB`;
  dom.compSizeText.textContent = `${(compSize / 1024 / 1024).toFixed(1)} MB`;
  dom.savedPercentText.textContent = `${saved}%`;

  return new File([outBlob], file.name, { type: file.type });
}

function compressImageBlob(blob, maxWidth, maxHeight, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let w = img.width, h = img.height;
      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w *= ratio;
        h *= ratio;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b || blob), "image/jpeg", quality);
    };
    img.onerror = () => resolve(blob);
  });
}

// 换稿确认
function handleUpdateSelectedFile(file) {
  state.updateFile = file;
  dom.updateFileName.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  dom.updateDropZone.style.display = "none";
  dom.updateFileInfo.style.display = "flex";
  dom.confirmUpdateBtn.disabled = false;
  dom.updateCompressBox.style.display = file.name.toLowerCase().endsWith(".pptx") ? "flex" : "none";
}

async function handleConfirmUpdate() {
  if (!state.updateFile) return;
  dom.confirmUpdateBtn.disabled = true;
  dom.updateSpinner.style.display = "inline-block";

  try {
    let fileToSend = state.updateFile;
    if (dom.updateAutoCompressCheck && dom.updateAutoCompressCheck.checked && fileToSend.name.toLowerCase().endsWith(".pptx")) {
      fileToSend = await smartCompressPptx(fileToSend);
    }

    const formData = new FormData();
    formData.append("file", fileToSend);
    formData.append("roomId", state.roomId);
    formData.append("secretKey", state.secretKey);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("方案热重载失败");

    dom.updateModal.style.display = "none";
    showToast("换稿成功！老版本已从服务器自动释放，观众端零感同步！", "success");
  } catch (err) {
    showToast(`换稿失败: ${err.message}`, "danger");
  } finally {
    dom.confirmUpdateBtn.disabled = false;
    dom.updateSpinner.style.display = "none";
  }
}

// 销毁房间
async function handleDestroyRoom() {
  if (!confirm("确定结束本次汇报并立即删除服务器上的所有图纸吗？（此操作不可逆，将彻底释放云盘存储）")) return;

  try {
    const res = await fetch(`/api/room/${encodeURIComponent(state.roomId)}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Presenter-Key": state.secretKey },
      body: JSON.stringify({ secretKey: state.secretKey }),
    });
    if (!res.ok) throw new Error("销毁失败");
    showToast("文稿已从云盘彻底销毁，存储空间已成功释放！", "success");
    setTimeout(() => (window.location.href = "/"), 1500);
  } catch (err) {
    showToast(`操作失败: ${err.message}`, "danger");
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function copyText(text, toastMsg) {
  navigator.clipboard.writeText(text).then(() => showToast(toastMsg, "success")).catch(() => {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast(toastMsg, "success");
  });
}

function showLoading(text = "正在加载建筑方案图纸...") {
  dom.loadingText.textContent = text;
  dom.slideLoadingMask.style.display = "flex";
}

function hideLoading() {
  dom.slideLoadingMask.style.display = "none";
}
