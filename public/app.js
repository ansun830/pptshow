/**
 * SlideCast - 前端核心逻辑 (集成小存储云服务器清理与销毁功能)
 * 涵盖：PPTX/PDF 渲染引擎、SSE 实时同步、主讲人控制台、观众自适应视图、热更新换稿、一键释放磁盘空间
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
  laserActive: false,
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
  prevSlideBtn: document.getElementById("prevSlideBtn"),
  nextSlideBtn: document.getElementById("nextSlideBtn"),
  presenterTools: document.getElementById("presenterTools"),
  audienceTools: document.getElementById("audienceTools"),
  laserBtn: document.getElementById("laserBtn"),
  updateFileBtn: document.getElementById("updateFileBtn"),
  destroyRoomBtn: document.getElementById("destroyRoomBtn"),
  followToggleBtn: document.getElementById("followToggleBtn"),
  followStatusText: document.getElementById("followStatusText"),
  shareBtn: document.getElementById("shareBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),

  slideViewport: document.getElementById("slideViewport"),
  slideStage: document.getElementById("slideStage"),
  pdfCanvas: document.getElementById("pdfCanvas"),
  pptxContainer: document.getElementById("pptxContainer"),
  laserPointer: document.getElementById("laserPointer"),
  slideLoadingMask: document.getElementById("slideLoadingMask"),
  loadingText: document.getElementById("loadingText"),
  audienceSyncNotice: document.getElementById("audienceSyncNotice"),
  hostCurrentPageTag: document.getElementById("hostCurrentPageTag"),
  catchUpBtn: document.getElementById("catchUpBtn"),
  slideProgressFill: document.getElementById("slideProgressFill"),

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
    if (!res.ok) {
      throw new Error("演示房间未找到或已过期");
    }

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
  } catch (err) {
    showToast(err.message, "danger");
    setTimeout(() => {
      window.location.href = "/";
    }, 2500);
  }
}

function updateRoleUI() {
  if (state.isPresenter) {
    dom.roleBadge.textContent = "主讲人";
    dom.roleBadge.className = "badge badge-host";
    dom.presenterTools.style.display = "flex";
    dom.audienceTools.style.display = "none";
    dom.hostLinkSection.style.display = "block";
  } else {
    dom.roleBadge.textContent = "观众端";
    dom.roleBadge.className = "badge badge-guest";
    dom.presenterTools.style.display = "none";
    dom.audienceTools.style.display = "flex";
    dom.hostLinkSection.style.display = "none";
  }
}

function initSSE(roomId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

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
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    } catch (err) {}
  });
}

function handleSyncState(data) {
  if (data.page !== undefined) {
    state.hostCurrentPage = data.page;
    dom.hostCurrentPageTag.textContent = data.page;

    if (state.isPresenter || state.isFollowingHost) {
      goToSlide(data.page, false);
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
}

let syncTimer = null;
function broadcastSync(immediate = false) {
  if (!state.isPresenter) return;

  const payload = {
    secretKey: state.secretKey,
    page: state.currentPage,
    totalPages: state.totalPages,
    laser: {
      active: state.laserActive,
      x: state.laserX || 0,
      y: state.laserY || 0,
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
    goToSlide(state.currentPage, false);
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

async function renderPdfPage(pageNum) {
  if (!state.pdfDoc) return;

  try {
    const page = await state.pdfDoc.getPage(pageNum);
    const canvas = dom.pdfCanvas;
    const ctx = canvas.getContext("2d");

    const container = dom.slideViewport;
    const maxWidth = container.clientWidth - 30;
    const maxHeight = container.clientHeight - 30;

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

function renderPptxPage(pageNum) {
  const slide = state.pptxSlides[pageNum - 1];
  if (!slide) return;

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; text-align: left; padding: 20px;">
      <h1 style="font-size: 28px; font-weight: 700; color: #1e293b; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">
        ${escapeHtml(slide.title)}
      </h1>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 14px; font-size: 18px; color: #334155; line-height: 1.6;">
        ${slide.items.map((it) => `<div style="display: flex; align-items: flex-start; gap: 10px;"><span style="color: #3b82f6; font-size: 20px;">•</span><span>${escapeHtml(it)}</span></div>`).join("")}
      </div>
      <div style="font-size: 12px; color: #94a3b8; text-align: right; margin-top: auto;">
        第 ${pageNum} / ${state.totalPages} 页
      </div>
    </div>
  `;
  dom.pptxContainer.innerHTML = html;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function goToSlide(pageNum, triggerBroadcast = true) {
  const target = Math.max(1, Math.min(pageNum, state.totalPages));
  state.currentPage = target;

  updatePaginationUI();

  if (state.fileType === "pdf") {
    renderPdfPage(target);
  } else {
    renderPptxPage(target);
  }

  const percent = ((target - 1) / Math.max(1, state.totalPages - 1)) * 100;
  dom.slideProgressFill.style.width = `${percent}%`;

  if (triggerBroadcast && state.isPresenter) {
    broadcastSync(true);
  }
}

function updatePaginationUI() {
  dom.currentPageNum.textContent = state.currentPage;
  dom.totalPagesNum.textContent = state.totalPages;
  dom.prevSlideBtn.disabled = state.currentPage <= 1;
  dom.nextSlideBtn.disabled = state.currentPage >= state.totalPages;
}

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
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
  dom.fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
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

  window.addEventListener("keydown", (e) => {
    if (state.view !== "present") return;
    if (e.target.tagName === "INPUT") return;

    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goToSlide(state.currentPage - 1);
    } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      goToSlide(state.currentPage + 1);
    } else if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    } else if (e.key === "l" || e.key === "L") {
      if (state.isPresenter) toggleLaser();
    }
  });

  dom.laserBtn.addEventListener("click", toggleLaser);

  dom.slideStage.addEventListener("mousemove", (e) => {
    if (!state.isPresenter || !state.laserActive) return;

    const rect = dom.slideStage.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    state.laserX = normX;
    state.laserY = normY;
    renderLaser({ active: true, x: normX, y: normY });
    broadcastSync(false);
  });

  dom.slideStage.addEventListener("mouseleave", () => {
    if (state.isPresenter && state.laserActive) {
      renderLaser({ active: false });
      broadcastSync(true);
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

  dom.updateFileBtn.addEventListener("click", () => {
    dom.updateModal.style.display = "flex";
  });
  dom.closeUpdateModal.addEventListener("click", () => (dom.updateModal.style.display = "none"));

  dom.updateDropZone.addEventListener("click", () => dom.updateFileInput.click());
  dom.updateFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      state.updateFile = e.target.files[0];
      dom.updateFileName.textContent = state.updateFile.name;
      dom.updateFileInfo.style.display = "flex";
      dom.confirmUpdateBtn.disabled = false;
    }
  });

  dom.confirmUpdateBtn.addEventListener("click", handleConfirmUpdate);

  if (dom.destroyRoomBtn) {
    dom.destroyRoomBtn.addEventListener("click", handleDestroyRoom);
  }

  window.addEventListener("resize", () => {
    if (state.view === "present" && state.fileType === "pdf") {
      renderPdfPage(state.currentPage);
    }
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
  dom.selectedFileName.textContent = file.name;
  dom.dropZone.style.display = "none";
  dom.selectedFileInfo.style.display = "flex";
  dom.startPresentBtn.disabled = false;
}

async function handleStartUpload() {
  if (!state.selectedFile) return;

  dom.startPresentBtn.disabled = true;
  dom.uploadSpinner.style.display = "inline-block";

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
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  } catch (err) {
    showToast(`操作失败: ${err.message}`, "danger");
  }
}

function toggleLaser() {
  state.laserActive = !state.laserActive;
  dom.laserBtn.classList.toggle("active", state.laserActive);
  if (!state.laserActive) {
    renderLaser({ active: false });
    broadcastSync(true);
  }
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
