/**
 * SlideCast - 前端核心逻辑 (高级演示动效、聚光灯、荧光画笔与多宫格总览版)
 * 涵盖：PPTX/PDF 渲染引擎、平滑转场动画、电影级聚光灯、实时荧光笔标注、SSE 实时同步、换稿热重载
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
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
  laserActive: false,
  laserX: 0,
  laserY: 0,

  spotlightActive: false,
  spotlightX: 0.5,
  spotlightY: 0.5,

  penActive: false,
  isDrawing: false,
  drawColor: "#38bdf8",
  drawPoints: [],

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

  displayRoomName: document.getElementById("displayRoomName"),
  roleBadge: document.getElementById("roleBadge"),
  connStatus: document.getElementById("connStatus"),
  currentPageNum: document.getElementById("currentPageNum"),
  totalPagesNum: document.getElementById("totalPagesNum"),
  pageDisplayBtn: document.getElementById("pageDisplayBtn"),
  prevSlideBtn: document.getElementById("prevSlideBtn"),
  nextSlideBtn: document.getElementById("nextSlideBtn"),
  transitionSelect: document.getElementById("transitionSelect"),

  presenterTools: document.getElementById("presenterTools"),
  audienceTools: document.getElementById("audienceTools"),
  laserBtn: document.getElementById("laserBtn"),
  spotlightBtn: document.getElementById("spotlightBtn"),
  penBtn: document.getElementById("penBtn"),
  clearDrawBtn: document.getElementById("clearDrawBtn"),
  gridOverviewBtn: document.getElementById("gridOverviewBtn"),
  audienceGridBtn: document.getElementById("audienceGridBtn"),
  updateFileBtn: document.getElementById("updateFileBtn"),
  destroyRoomBtn: document.getElementById("destroyRoomBtn"),
  followToggleBtn: document.getElementById("followToggleBtn"),
  followStatusText: document.getElementById("followStatusText"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  shareBtn: document.getElementById("shareBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),

  slideViewport: document.getElementById("slideViewport"),
  slideStage: document.getElementById("slideStage"),
  pdfCanvas: document.getElementById("pdfCanvas"),
  pptxContainer: document.getElementById("pptxContainer"),
  drawCanvas: document.getElementById("drawCanvas"),
  spotlightMask: document.getElementById("spotlightMask"),
  laserPointer: document.getElementById("laserPointer"),
  slideLoadingMask: document.getElementById("slideLoadingMask"),
  loadingText: document.getElementById("loadingText"),
  audienceSyncNotice: document.getElementById("audienceSyncNotice"),
  hostCurrentPageTag: document.getElementById("hostCurrentPageTag"),
  catchUpBtn: document.getElementById("catchUpBtn"),
  slideProgressFill: document.getElementById("slideProgressFill"),

  // 模态框
  gridModal: document.getElementById("gridModal"),
  closeGridModal: document.getElementById("closeGridModal"),
  gridSlidesContainer: document.getElementById("gridSlidesContainer"),

  shortcutsModal: document.getElementById("shortcutsModal"),
  closeShortcutsModal: document.getElementById("closeShortcutsModal"),

  shareModal: document.getElementById("shareModal"),
  closeShareModal: document.getElementById("closeShareModal"),
  audienceShareUrl: document.getElementById("audienceShareUrl"),
  copyAudienceUrlBtn: document.getElementById("copyAudienceUrlBtn"),
  hostLinkSection: document.getElementById("hostLinkSection"),
  hostShareUrl: document.getElementById("hostShareUrl"),
  copyHostUrlBtn: document.getElementById("copyHostUrlBtn"),

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
  updateCompressBox: document.getElementById("updateCompressBox"),
  updateAutoCompressCheck: document.getElementById("updateAutoCompressCheck"),

  toastContainer: document.getElementById("toastContainer"),
};

window.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  const urlKey = params.get("key");

  if (roomId) {
    state.roomId = roomId;
    const storedKey = localStorage.getItem(`slidecast_key_${roomId}`);
    state.secretKey = urlKey || storedKey || null;

    if (urlKey) {
      localStorage.setItem(`slidecast_key_${roomId}`, urlKey);
    }

    loadRoomData(roomId);
  } else {
    showHomeView();
  }
});

function showHomeView() {
  state.view = "home";
  dom.homeView.style.display = "flex";
  dom.presentView.style.display = "none";
}

function showPresentView() {
  state.view = "present";
  dom.homeView.style.display = "none";
  dom.presentView.style.display = "flex";
}

async function loadRoomData(roomId) {
  showPresentView();
  showLoading("正在连接演示房间...");

  try {
    const url = `/api/room/${encodeURIComponent(roomId)}${state.secretKey ? "?key=" + encodeURIComponent(state.secretKey) : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("演示房间未找到或已过期");

    const data = await res.json();
    state.roomName = data.name || "演示文稿";
    state.fileName = data.fileName;
    state.fileType = data.fileType;
    state.fileUrl = data.fileUrl;
    state.fileVersion = data.fileVersion || 1;
    state.currentPage = data.currentPage || 1;
    state.totalPages = data.totalPages || 1;
    state.hostCurrentPage = data.currentPage || 1;
    state.isPresenter = Boolean(data.isPresenter);

    updateRoleUI();
    dom.displayRoomName.textContent = state.roomName;
    document.title = `${state.roomName} - SlideCast`;

    initSSE(roomId);
    await loadPresentationDocument();
    initDrawCanvas();
  } catch (err) {
    showToast(err.message, "danger");
    setTimeout(() => (window.location.href = "/"), 2500);
  }
}

function updateRoleUI() {
  if (state.isPresenter) {
    dom.roleBadge.textContent = "主讲人";
    dom.roleBadge.className = "badge badge-host";
    dom.presenterTools.style.display = "flex";
    dom.audienceTools.style.display = "none";
    dom.hostLinkSection.style.display = "block";
    dom.transitionSelect.style.display = "inline-block";
  } else {
    dom.roleBadge.textContent = "观众端";
    dom.roleBadge.className = "badge badge-guest";
    dom.presenterTools.style.display = "none";
    dom.audienceTools.style.display = "flex";
    dom.hostLinkSection.style.display = "none";
    dom.transitionSelect.style.display = "none";
  }
}

function initSSE(roomId) {
  if (state.eventSource) state.eventSource.close();

  const sseUrl = `/api/room/${encodeURIComponent(roomId)}/events`;
  const es = new EventSource(sseUrl);
  state.eventSource = es;

  es.onopen = () => {
    dom.connStatus.className = "conn-status online";
    dom.connStatus.innerHTML = `<span class="dot"></span> 实时同步中`;
  };

  es.onerror = () => {
    dom.connStatus.className = "conn-status";
    dom.connStatus.innerHTML = `<span class="dot" style="background:#f59e0b;"></span> 正在重连...`;
  };

  es.addEventListener("state", (e) => {
    try {
      const data = JSON.parse(e.data);
      handleSyncState(data);
    } catch (err) {
      console.error(err);
    }
  });

  es.addEventListener("sync", (e) => {
    try {
      const data = JSON.parse(e.data);
      handleSyncState(data);
    } catch (err) {
      console.error(err);
    }
  });

  es.addEventListener("file_updated", async (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast("📢 主讲人已更新演示文稿，老版本已清除，已载入最新版！", "info");

      state.fileVersion = data.fileVersion;
      state.fileUrl = data.fileUrl;
      state.fileType = data.fileType;
      state.fileName = data.fileName;

      await loadPresentationDocument();
    } catch (err) {
      console.error("处理热替换失败:", err);
    }
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
  if (data.transition) {
    state.transitionEffect = data.transition;
    if (dom.transitionSelect) dom.transitionSelect.value = data.transition;
  }

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

  if (data.laser) {
    renderLaser(data.laser);
  }

  if (data.spotlight) {
    renderSpotlight(data.spotlight);
  }

  if (data.drawing) {
    handleRemoteDrawing(data.drawing);
  }
}

let syncTimer = null;
function broadcastSync(immediate = false, direction = "next") {
  if (!state.isPresenter) return;

  const payload = {
    secretKey: state.secretKey,
    page: state.currentPage,
    totalPages: state.totalPages,
    transition: state.transitionEffect,
    direction: direction,
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

function broadcastDrawing(drawData) {
  if (!state.isPresenter) return;
  fetch(`/api/room/${encodeURIComponent(state.roomId)}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Presenter-Key": state.secretKey,
    },
    body: JSON.stringify({
      secretKey: state.secretKey,
      drawing: drawData,
    }),
  }).catch(console.error);
}

// ==============================
// 文档加载与动效渲染
// ==============================
async function loadPresentationDocument() {
  showLoading("正在渲染幻灯片...");

  try {
    if (state.fileType === "pdf") {
      dom.pptxContainer.style.display = "none";
      dom.pdfCanvas.style.display = "block";
      await loadPdf(state.fileUrl);
    } else {
      dom.pdfCanvas.style.display = "none";
      dom.pptxContainer.style.display = "flex";
      await loadPptx(state.fileUrl);
    }

    hideLoading();
    goToSlide(state.currentPage, false, "none");
  } catch (err) {
    hideLoading();
    showToast(`文档渲染失败: ${err.message}`, "danger");
  }
}

async function loadPdf(url) {
  const loadingTask = pdfjsLib.getDocument({
    url: `${url}?t=${Date.now()}`,
    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
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
    const page = await state.pdfDoc.getPage(pageNum);
    const canvas = dom.pdfCanvas;
    const ctx = canvas.getContext("2d");

    const container = dom.slideViewport;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / unscaledViewport.width, maxHeight / unscaledViewport.height, 2.5);

    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + "px";
    canvas.style.height = Math.floor(viewport.height) + "px";

    ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // 重新调整画笔画布大小匹配幻灯片
    syncDrawCanvasSize(canvas.style.width, canvas.style.height);

    // 触发转场动画
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
    state.pptxSlides = [{ title: state.fileName, items: ["演示文稿已载入"] }];
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

  const title = texts.length > 0 ? texts[0] : `幻灯片 ${slideIdx}`;
  const bodyItems = texts.slice(1);

  return {
    index: slideIdx,
    title,
    items: bodyItems.length > 0 ? bodyItems : ["(该页主要包含图表或排版图形)"],
  };
}

function renderPptxPage(pageNum, direction = "next") {
  const slide = state.pptxSlides[pageNum - 1];
  if (!slide) return;

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; text-align: left; padding: 24px;">
      <h1 style="font-size: 30px; font-weight: 800; color: #0f172a; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; letter-spacing: -0.5px;">
        ${escapeHtml(slide.title)}
      </h1>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; font-size: 19px; color: #334155; line-height: 1.6;">
        ${slide.items.map((it) => `<div style="display: flex; align-items: flex-start; gap: 12px;"><span style="color: #3b82f6; font-size: 24px; line-height: 1;">•</span><span>${escapeHtml(it)}</span></div>`).join("")}
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #94a3b8; text-align: right; margin-top: auto;">
        ${pageNum} / ${state.totalPages}
      </div>
    </div>
  `;
  dom.pptxContainer.innerHTML = html;

  syncDrawCanvasSize("960px", "540px");
  applySlideTransition(dom.pptxContainer, direction);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applySlideTransition(el, direction = "next") {
  if (state.transitionEffect === "none") return;

  el.classList.remove("anim-fade", "anim-slide-next", "anim-slide-prev", "anim-zoom");
  // 触发 DOM 重绘
  void el.offsetWidth;

  if (state.transitionEffect === "slide") {
    el.classList.add(direction === "prev" ? "anim-slide-prev" : "anim-slide-next");
  } else if (state.transitionEffect === "zoom") {
    el.classList.add("anim-zoom");
  } else {
    // 默认 fade
    el.classList.add("anim-fade");
  }
}

// 翻页主控制
function goToSlide(pageNum, triggerBroadcast = true, direction = "next") {
  const target = Math.max(1, Math.min(pageNum, state.totalPages));
  const oldPage = state.currentPage;
  state.currentPage = target;

  const actualDir = direction !== "none" ? (target >= oldPage ? "next" : "prev") : "none";

  updatePaginationUI();
  clearDrawCanvas(false); // 翻页时清理画笔标注

  if (state.fileType === "pdf") {
    renderPdfPage(target, actualDir);
  } else {
    renderPptxPage(target, actualDir);
  }

  const percent = ((target - 1) / Math.max(1, state.totalPages - 1)) * 100;
  dom.slideProgressFill.style.width = `${percent}%`;

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

// ==============================
// 激光笔与聚光灯聚焦引擎
// ==============================
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

// ==============================
// 荧光画笔标注系统
// ==============================
function initDrawCanvas() {
  const canvas = dom.drawCanvas;
  if (!canvas) return;

  let ctx = canvas.getContext("2d");

  canvas.addEventListener("mousedown", (e) => {
    if (!state.isPresenter || !state.penActive) return;
    state.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = state.drawColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = state.drawColor;
    ctx.shadowBlur = 8;

    state.drawPoints = [{ x: x / rect.width, y: y / rect.height }];
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!state.isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();

    const normX = x / rect.width;
    const normY = y / rect.height;
    state.drawPoints.push({ x: normX, y: normY });
  });

  canvas.addEventListener("mouseup", () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    ctx.closePath();

    if (state.drawPoints.length > 1) {
      broadcastDrawing({ action: "draw", points: state.drawPoints, color: state.drawColor });
    }
    state.drawPoints = [];
  });
}

function syncDrawCanvasSize(widthStr, heightStr) {
  const canvas = dom.drawCanvas;
  if (!canvas) return;
  canvas.style.width = widthStr;
  canvas.style.height = heightStr;
  canvas.width = parseInt(widthStr) || 960;
  canvas.height = parseInt(heightStr) || 540;
}

function clearDrawCanvas(broadcast = true) {
  const canvas = dom.drawCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (broadcast && state.isPresenter) {
    broadcastDrawing({ action: "clear" });
  }
}

function handleRemoteDrawing(data) {
  const canvas = dom.drawCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (data.action === "clear") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else if (data.action === "draw" && data.points && data.points.length > 1) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.beginPath();
    ctx.strokeStyle = data.color || "#38bdf8";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = data.color || "#38bdf8";
    ctx.shadowBlur = 8;

    ctx.moveTo(data.points[0].x * w, data.points[0].y * h);
    for (let i = 1; i < data.points.length; i++) {
      ctx.lineTo(data.points[i].x * w, data.points[i].y * h);
    }
    ctx.stroke();
    ctx.closePath();
  }
}

// ==============================
// 幻灯片总览网格弹窗
// ==============================
function openGridModal() {
  const container = dom.gridSlidesContainer;
  container.innerHTML = "";

  for (let i = 1; i <= state.totalPages; i++) {
    const card = document.createElement("div");
    card.className = `grid-slide-card ${i === state.currentPage ? "active" : ""}`;

    let titleText = `第 ${i} 页`;
    if (state.fileType === "pptx" && state.pptxSlides[i - 1]) {
      titleText = state.pptxSlides[i - 1].title || titleText;
    }

    card.innerHTML = `
      <div class="grid-card-num">#${i}</div>
      <div class="grid-card-title">${escapeHtml(titleText)}</div>
    `;

    card.addEventListener("click", () => {
      goToSlide(i, true);
      dom.gridModal.style.display = "none";
    });

    container.appendChild(card);
  }

  dom.gridModal.style.display = "flex";
}

// ==============================
// 事件监听器
// ==============================
function setupEventListeners() {
  dom.dropZone.addEventListener("click", () => dom.fileInput.click());
  dom.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dom.dropZone.classList.add("dragover");
  });
  dom.dropZone.addEventListener("dragleave", () => dom.dropZone.classList.remove("dragover"));
  dom.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) handleFileSelected(e.dataTransfer.files[0]);
  });
  dom.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileSelected(e.target.files[0]);
  });

  dom.removeFileBtn.addEventListener("click", () => {
    state.selectedFile = null;
    dom.fileInput.value = "";
    dom.selectedFileInfo.style.display = "none";
    dom.dropZone.style.display = "block";
    dom.startPresentBtn.disabled = true;
  });

  dom.startPresentBtn.addEventListener("click", handleStartUpload);

  dom.prevSlideBtn.addEventListener("click", () => goToSlide(state.currentPage - 1));
  dom.nextSlideBtn.addEventListener("click", () => goToSlide(state.currentPage + 1));

  // 转场动效选择器
  if (dom.transitionSelect) {
    dom.transitionSelect.addEventListener("change", (e) => {
      state.transitionEffect = e.target.value;
      broadcastSync(true);
      showToast(`已切换转场动画：${dom.transitionSelect.options[dom.transitionSelect.selectedIndex].text}`, "info");
    });
  }

  // 快捷键监听
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
    } else if (e.key === "s" || e.key === "S") {
      if (state.isPresenter) toggleSpotlight();
    } else if (e.key === "p" || e.key === "P") {
      if (state.isPresenter) togglePen();
    } else if (e.key === "g" || e.key === "G") {
      openGridModal();
    } else if (e.key === "?" || e.key === "/") {
      dom.shortcutsModal.style.display = "flex";
    } else if (e.key === "Escape") {
      dom.gridModal.style.display = "none";
      dom.shortcutsModal.style.display = "none";
      dom.shareModal.style.display = "none";
      dom.updateModal.style.display = "none";
      if (state.spotlightActive) toggleSpotlight();
      if (state.laserActive) toggleLaser();
      if (state.penActive) togglePen();
    }
  });

  // 工具栏交互
  dom.laserBtn.addEventListener("click", toggleLaser);
  dom.spotlightBtn.addEventListener("click", toggleSpotlight);
  dom.penBtn.addEventListener("click", togglePen);
  dom.clearDrawBtn.addEventListener("click", () => clearDrawCanvas(true));

  dom.pageDisplayBtn.addEventListener("click", openGridModal);
  dom.gridOverviewBtn.addEventListener("click", openGridModal);
  if (dom.audienceGridBtn) dom.audienceGridBtn.addEventListener("click", openGridModal);
  dom.closeGridModal.addEventListener("click", () => (dom.gridModal.style.display = "none"));

  dom.shortcutsBtn.addEventListener("click", () => (dom.shortcutsModal.style.display = "flex"));
  dom.closeShortcutsModal.addEventListener("click", () => (dom.shortcutsModal.style.display = "none"));

  // 鼠标移动监听 (激光笔 & 聚光灯)
  dom.slideStage.addEventListener("mousemove", (e) => {
    if (!state.isPresenter) return;
    const rect = dom.slideStage.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (state.laserActive) {
      state.laserX = normX;
      state.laserY = normY;
      renderLaser({ active: true, x: normX, y: normY });
      broadcastSync(false);
    }

    if (state.spotlightActive) {
      state.spotlightX = normX;
      state.spotlightY = normY;
      renderSpotlight({ active: true, x: normX, y: normY });
      broadcastSync(false);
    }
  });

  dom.slideStage.addEventListener("mouseleave", () => {
    if (state.isPresenter) {
      if (state.laserActive) {
        renderLaser({ active: false });
        broadcastSync(true);
      }
    }
  });

  dom.followToggleBtn.addEventListener("click", () => {
    state.isFollowingHost = !state.isFollowingHost;
    if (state.isFollowingHost) {
      dom.followToggleBtn.classList.add("active");
      dom.followStatusText.textContent = "正在跟随主讲人";
      dom.audienceSyncNotice.style.display = "none";
      goToSlide(state.hostCurrentPage, false);
    } else {
      dom.followToggleBtn.classList.remove("active");
      dom.followStatusText.textContent = "自由查看模式";
    }
  });

  dom.catchUpBtn.addEventListener("click", () => {
    state.isFollowingHost = true;
    dom.followToggleBtn.classList.add("active");
    dom.followStatusText.textContent = "正在跟随主讲人";
    dom.audienceSyncNotice.style.display = "none";
    goToSlide(state.hostCurrentPage, false);
  });

  dom.fullscreenBtn.addEventListener("click", toggleFullscreen);

  dom.shareBtn.addEventListener("click", openShareModal);
  dom.closeShareModal.addEventListener("click", () => (dom.shareModal.style.display = "none"));
  dom.copyAudienceUrlBtn.addEventListener("click", () => copyToClipboard(dom.audienceShareUrl.value, "观众分享网址"));
  dom.copyHostUrlBtn.addEventListener("click", () => copyToClipboard(dom.hostShareUrl.value, "主讲人管理网址"));

  dom.updateFileBtn.addEventListener("click", () => (dom.updateModal.style.display = "flex"));
  dom.closeUpdateModal.addEventListener("click", () => (dom.updateModal.style.display = "none"));

  dom.updateDropZone.addEventListener("click", () => dom.updateFileInput.click());
  dom.updateFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      state.updateFile = e.target.files[0];
      dom.updateFileName.textContent = state.updateFile.name;
      dom.updateFileInfo.style.display = "flex";
      const ext = state.updateFile.name.split(".").pop().toLowerCase();
      if (dom.updateCompressBox) {
        dom.updateCompressBox.style.display = ext === "pptx" ? "flex" : "none";
      }
      dom.confirmUpdateBtn.disabled = false;
    }
  });

  dom.confirmUpdateBtn.addEventListener("click", handleConfirmUpdate);

  if (dom.destroyRoomBtn) {
    dom.destroyRoomBtn.addEventListener("click", handleDestroyRoom);
  }

  window.addEventListener("resize", () => {
    if (state.view === "present" && state.fileType === "pdf") {
      renderPdfPage(state.currentPage, "none");
    }
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function compressPptxFile(file, quality = 0.8, maxDim = 1920) {
  if (!file || !file.name.toLowerCase().endsWith(".pptx")) return file;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const imageEntries = [];

    zip.forEach((path, entry) => {
      if (path.startsWith("ppt/media/") && /\.(png|jpe?g|bmp)$/i.test(path)) {
        imageEntries.push({ path, entry });
      }
    });

    if (imageEntries.length === 0) return file;

    let compressedCount = 0;
    for (const { path, entry } of imageEntries) {
      const blob = await entry.async("blob");
      // 针对超过 120KB 的大图片进行高清重采样和无损/高保真压缩
      if (blob.size > 120 * 1024) {
        const compressedBlob = await compressImageBlob(blob, maxDim, quality);
        if (compressedBlob && compressedBlob.size < blob.size) {
          zip.file(path, compressedBlob);
          compressedCount++;
        }
      }
    }

    if (compressedCount > 0) {
      const newBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      return new File([newBlob], file.name, { type: file.type });
    }
  } catch (err) {
    console.warn("PPTX 压缩处理跳过:", err);
  }
  return file;
}

function compressImageBlob(blob, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((resBlob) => {
        resolve(resBlob || blob);
      }, "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

function handleFileSelected(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext !== "pptx" && ext !== "pdf") {
    showToast("请上传 .pptx 或 .pdf 格式文件", "warning");
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    showToast("文件体积超过 200MB 上限，已拦截以保护服务器存储空间", "warning");
    return;
  }

  state.selectedFile = file;
  dom.selectedFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
  dom.dropZone.style.display = "none";
  dom.selectedFileInfo.style.display = "flex";

  if (ext === "pptx") {
    if (dom.compressOptionBox) dom.compressOptionBox.style.display = "flex";
    if (dom.compressionStats) dom.compressionStats.style.display = "none";
    if (file.size > 15 * 1024 * 1024) {
      showToast(`检测到文稿较大 (${formatFileSize(file.size)})，已为您开启智能压缩瘦身`, "info");
    }
  } else {
    if (dom.compressOptionBox) dom.compressOptionBox.style.display = "none";
  }

  dom.startPresentBtn.disabled = false;
}

async function handleStartUpload() {
  if (!state.selectedFile) return;

  dom.startPresentBtn.disabled = true;
  dom.uploadSpinner.style.display = "inline-block";

  // 智能无损轻量化压缩
  if (dom.autoCompressCheck && dom.autoCompressCheck.checked && state.selectedFile.name.toLowerCase().endsWith(".pptx")) {
    const origBytes = state.selectedFile.size;
    if (origBytes > 3 * 1024 * 1024) {
      showToast("⚡ 正在优化文稿高清图片并智能瘦身，请稍候...", "info");
    }
    const compressed = await compressPptxFile(state.selectedFile);
    if (compressed && compressed.size < origBytes) {
      const compBytes = compressed.size;
      const savedPercent = Math.round((1 - compBytes / origBytes) * 100);
      if (dom.origSizeText) dom.origSizeText.textContent = formatFileSize(origBytes);
      if (dom.compSizeText) dom.compSizeText.textContent = formatFileSize(compBytes);
      if (dom.savedPercentText) dom.savedPercentText.textContent = `${savedPercent}%`;
      if (dom.compressionStats) dom.compressionStats.style.display = "flex";
      showToast(`文稿瘦身成功！体积缩减 ${savedPercent}%，观众加载速度提升数倍！`, "success");
      state.selectedFile = compressed;
    }
  }

  const formData = new FormData();
  formData.append("file", state.selectedFile);
  formData.append("roomName", dom.roomNameInput.value.trim());

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "上传失败");

    localStorage.setItem(`slidecast_key_${data.roomId}`, data.secretKey);
    window.location.href = `/?room=${encodeURIComponent(data.roomId)}&key=${encodeURIComponent(data.secretKey)}`;
  } catch (err) {
    showToast(`创建失败: ${err.message}`, "danger");
    dom.startPresentBtn.disabled = false;
    dom.uploadSpinner.style.display = "none";
  }
}

async function handleConfirmUpdate() {
  if (!state.updateFile || !state.secretKey) return;

  dom.confirmUpdateBtn.disabled = true;
  dom.updateSpinner.style.display = "inline-block";

  // 换稿智能压缩
  if (dom.updateAutoCompressCheck && dom.updateAutoCompressCheck.checked && state.updateFile.name.toLowerCase().endsWith(".pptx")) {
    const origBytes = state.updateFile.size;
    showToast("⚡ 正在对新版文稿进行智能轻量化瘦身...", "info");
    const compressed = await compressPptxFile(state.updateFile);
    if (compressed && compressed.size < origBytes) {
      state.updateFile = compressed;
    }
  }

  const formData = new FormData();
  formData.append("file", state.updateFile);
  formData.append("roomId", state.roomId);
  formData.append("secretKey", state.secretKey);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "热替换上传失败");

    dom.updateModal.style.display = "none";
    showToast("文稿替换成功！历史版本已从服务器物理清除，最新版已推送到所有观众端屏幕。", "success");

    state.fileVersion = data.fileVersion;
    state.fileUrl = data.fileUrl;
    state.fileType = data.fileType;
    state.fileName = data.fileName;

    await loadPresentationDocument();
  } catch (err) {
    showToast(`更新失败: ${err.message}`, "danger");
  } finally {
    dom.confirmUpdateBtn.disabled = false;
    dom.updateSpinner.style.display = "none";
  }
}

async function handleDestroyRoom() {
  if (!state.isPresenter || !state.secretKey) return;
  const ok = confirm("确定要结束演示并立即销毁该文稿吗？\n该操作将永久从云服务器物理删除此文稿文件并释放磁盘空间。");
  if (!ok) return;

  try {
    const res = await fetch(`/api/room/${encodeURIComponent(state.roomId)}/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Presenter-Key": state.secretKey,
      },
      body: JSON.stringify({ secretKey: state.secretKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");
    showToast("文稿已从服务器彻底删除，存储空间已成功释放！", "success");
    setTimeout(() => (window.location.href = "/"), 1500);
  } catch (err) {
    showToast(`操作失败: ${err.message}`, "danger");
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

function toggleSpotlight() {
  state.spotlightActive = !state.spotlightActive;
  dom.spotlightBtn.classList.toggle("active", state.spotlightActive);
  renderSpotlight({ active: state.spotlightActive, x: state.spotlightX, y: state.spotlightY });
  broadcastSync(true);
}

function togglePen() {
  state.penActive = !state.penActive;
  dom.penBtn.classList.toggle("active", state.penActive);
  dom.drawCanvas.classList.toggle("drawing-active", state.penActive);
  dom.clearDrawBtn.style.display = state.penActive ? "inline-flex" : "none";
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(console.error);
  } else {
    document.exitFullscreen().catch(console.error);
  }
}

function openShareModal() {
  const origin = window.location.origin;
  const audienceUrl = `${origin}/?room=${encodeURIComponent(state.roomId)}`;
  dom.audienceShareUrl.value = audienceUrl;

  if (state.isPresenter && state.secretKey) {
    const hostUrl = `${origin}/?room=${encodeURIComponent(state.roomId)}&key=${encodeURIComponent(state.secretKey)}`;
    dom.hostShareUrl.value = hostUrl;
    dom.hostLinkSection.style.display = "block";
  } else {
    dom.hostLinkSection.style.display = "none";
  }

  dom.shareModal.style.display = "flex";
}

function copyToClipboard(text, name) {
  navigator.clipboard.writeText(text).then(
    () => showToast(`已复制${name}到剪贴板！`, "success"),
    () => showToast("复制失败，请手动选中复制", "warning")
  );
}

function showLoading(text) {
  dom.loadingText.textContent = text;
  dom.slideLoadingMask.style.display = "flex";
}

function hideLoading() {
  dom.slideLoadingMask.style.display = "none";
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
