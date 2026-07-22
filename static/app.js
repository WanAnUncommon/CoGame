const PAGE_SIZE = {
  skills: 9,
  mcp: 9,
  plugins: 12,
  missions: 4,
};

const ui = {
  notice: document.getElementById("notice"),
  refreshButton: document.getElementById("refresh-button"),
  scanTime: document.getElementById("scan-time"),
  skillList: document.getElementById("skill-list"),
  skillCount: document.getElementById("skill-count"),
  skillTotal: document.getElementById("skill-total"),
  skillPrev: document.getElementById("skill-prev"),
  skillNext: document.getElementById("skill-next"),
  skillPageNumber: document.getElementById("skill-page-number"),
  skillPageTotal: document.getElementById("skill-page-total"),
  mcpList: document.getElementById("mcp-list"),
  mcpCount: document.getElementById("mcp-count"),
  mcpTotal: document.getElementById("mcp-total"),
  mcpPrev: document.getElementById("mcp-prev"),
  mcpNext: document.getElementById("mcp-next"),
  mcpPageNumber: document.getElementById("mcp-page-number"),
  mcpPageTotal: document.getElementById("mcp-page-total"),
  pluginLeft: document.getElementById("plugin-left"),
  pluginRight: document.getElementById("plugin-right"),
  pluginTotal: document.getElementById("plugin-total"),
  pluginPrev: document.getElementById("plugin-prev"),
  pluginNext: document.getElementById("plugin-next"),
  pluginPageNumber: document.getElementById("plugin-page-number"),
  pluginPageTotal: document.getElementById("plugin-page-total"),
  missionList: document.getElementById("mission-list"),
  missionDetail: document.getElementById("mission-detail"),
  missionTotal: document.getElementById("mission-total"),
  missionPrev: document.getElementById("mission-prev"),
  missionNext: document.getElementById("mission-next"),
  missionPageNumber: document.getElementById("mission-page-number"),
  missionPageTotal: document.getElementById("mission-page-total"),
  rulesEditor: document.getElementById("rules-editor"),
  rulesPath: document.getElementById("rules-path"),
  rulesState: document.getElementById("rules-state"),
  rulesReload: document.getElementById("rules-reload"),
  rulesSave: document.getElementById("rules-save"),
  rulesCharacterCount: document.getElementById("rules-character-count"),
  wardrobeBuildId: document.getElementById("wardrobe-build-id"),
  rulesStrip: document.getElementById("rules-strip"),
  skillStat: document.getElementById("skill-stat"),
  gearStat: document.getElementById("gear-stat"),
  missionStat: document.getElementById("mission-stat"),
  appearanceName: document.getElementById("appearance-name"),
  skinPreviewMeta: document.getElementById("skin-preview-meta"),
  skinTableBody: document.getElementById("skin-table-body"),
  skinTotal: document.getElementById("skin-total"),
  skinCatalogStatus: document.getElementById("skin-catalog-status"),
  skinCatalogWarning: document.getElementById("skin-catalog-warning"),
  wardrobeAvatar: document.getElementById("wardrobe-avatar"),
  wardrobePreview: document.querySelector(".wardrobe-preview"),
  skinRuntimeIndicator: document.getElementById("skin-runtime-indicator"),
  skinRuntimeLabel: document.getElementById("skin-runtime-label"),
  skinRuntimeDetail: document.getElementById("skin-runtime-detail"),
  applySkin: document.getElementById("apply-skin"),
  restoreSkin: document.getElementById("restore-skin"),
  detailPopover: document.getElementById("detail-popover"),
};

let skins = [];
let skinRuntimeStatus = null;
let skinActionToken = "";
let skinActionBusy = false;
let rulesActionToken = "";
let rulesRevision = "";
let rulesOriginalContent = "";
let rulesLineEnding = "\n";
let rulesLoaded = false;
let rulesDirty = false;
let rulesBusy = false;
const data = {
  skills: [],
  mcp: [],
  plugins: [],
  missions: [],
};

const pages = {
  skills: 0,
  mcp: 0,
  plugins: 0,
  missions: 0,
};

let selectedMissionId = null;
let selectedSkinId = null;

function normalizedText(value, fallback = "NO DATA") {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  return value.trim().replace(/\s+/g, " ");
}

function compactText(value, fallback = "NO DATA", maxLength = 72) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function hideDetail() {
  ui.detailPopover.classList.remove("is-visible");
  ui.detailPopover.hidden = true;
}

function detailFields(kind, item) {
  if (kind === "mcp") {
    return [
      ["STATUS", item.status || (item.enabled === false ? "disabled" : "ready")],
      ["TRANSPORT", item.transport || "stdio"],
      ["ENDPOINT", item.endpoint || item.command || "LOCAL"],
      ["ENV", Array.isArray(item.env_keys) && item.env_keys.length ? item.env_keys.join(", ") : "NONE"],
    ];
  }
  if (kind === "plugin") {
    return [
      ["STATUS", item.status || "ready"],
      ["VERSION", item.version || "UNVERSIONED"],
      ["DESCRIPTION", item.description || "NO DESCRIPTION"],
      ["PATH", item.path || "LOCAL"],
    ];
  }
  return [
    ["STATUS", item.status || "ready"],
    ["SOURCE", item.source || "unknown"],
    ["DESCRIPTION", item.description || "NO DESCRIPTION"],
    ["PATH", item.path || "LOCAL"],
  ];
}

function positionDetail(x, y) {
  const rect = ui.detailPopover.getBoundingClientRect();
  const gap = 16;
  let left = x + gap;
  let top = y + gap;
  if (left + rect.width > window.innerWidth - 12) left = Math.max(12, x - rect.width - gap);
  if (top + rect.height > window.innerHeight - 12) top = Math.max(12, y - rect.height - gap);
  ui.detailPopover.style.left = `${left}px`;
  ui.detailPopover.style.top = `${top}px`;
}

function showDetail(card, kind, item, x, y) {
  if (!item) return;
  ui.detailPopover.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = item.name || "UNNAMED ITEM";
  const type = document.createElement("div");
  type.className = "popover-kind";
  type.textContent = `${kind.toUpperCase()} // DETAIL`;
  const fields = document.createElement("dl");
  detailFields(kind, item).forEach(([label, value]) => {
    const key = document.createElement("dt");
    key.textContent = label;
    const text = document.createElement("dd");
    text.textContent = compactText(value, "NO DATA", 260);
    fields.append(key, text);
  });
  ui.detailPopover.append(title, type, fields);
  ui.detailPopover.hidden = false;
  ui.detailPopover.classList.add("is-visible");
  positionDetail(x, y);
}

function bindDetail(card, kind, item) {
  card.tabIndex = 0;
  card.setAttribute("aria-describedby", "detail-popover");
  card.addEventListener("pointerenter", (event) => showDetail(card, kind, item, event.clientX, event.clientY));
  card.addEventListener("pointermove", (event) => {
    if (!ui.detailPopover.hidden) positionDetail(event.clientX, event.clientY);
  });
  card.addEventListener("pointerleave", hideDetail);
  card.addEventListener("focus", () => {
    const rect = card.getBoundingClientRect();
    showDetail(card, kind, item, rect.right, rect.top + rect.height / 2);
  });
  card.addEventListener("blur", hideDetail);
}
function statusClass(status) {
  if (status === "error") return "error";
  if (status === "disabled") return "disabled";
  return "";
}

function makeEmptySlot(extraClass = "") {
  const slot = document.getElementById("empty-slot-template").content.firstElementChild.cloneNode(true);
  if (extraClass) slot.classList.add(extraClass);
  return slot;
}

function fillSlots(container, items, capacity, factory, extraClass = "") {
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < capacity; index += 1) {
    fragment.append(items[index] ? factory(items[index], index) : makeEmptySlot(extraClass));
  }
  container.append(fragment);
}

function pageSlice(key) {
  const totalPages = Math.max(1, Math.ceil(data[key].length / PAGE_SIZE[key]));
  pages[key] = Math.min(Math.max(0, pages[key]), totalPages - 1);
  const start = pages[key] * PAGE_SIZE[key];
  return { items: data[key].slice(start, start + PAGE_SIZE[key]), start, totalPages };
}

function pageSequence(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index);
  const values = new Set([0, 1, total - 2, total - 1, current - 1, current, current + 1]);
  return [...values].filter((value) => value >= 0 && value < total).sort((a, b) => a - b);
}

function renderPageStrip(element, current, total, onSelect) {
  element.replaceChildren();
  const fragment = document.createDocumentFragment();
  let previous = -1;
  pageSequence(current, total).forEach((page) => {
    if (previous >= 0 && page - previous > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "…";
      fragment.append(ellipsis);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-link${page === current ? " is-current" : ""}`;
    button.textContent = String(page + 1);
    button.setAttribute("aria-label", `第 ${page + 1} 页`);
    button.setAttribute("aria-current", page === current ? "page" : "false");
    button.addEventListener("click", () => onSelect(page));
    fragment.append(button);
    previous = page;
  });
  element.append(fragment);
}

function updatePager(key, totalPages, elements, render) {
  const current = pages[key];
  elements.total.textContent = String(data[key].length);
  elements.pageTotal.textContent = `/ ${totalPages}`;
  elements.prev.disabled = current === 0;
  elements.next.disabled = current === totalPages - 1;
  renderPageStrip(elements.pageNumber, current, totalPages, (page) => {
    pages[key] = page;
    render();
  });
}

function createSkillCard(item, index) {
  const card = document.createElement("article");
  card.className = "data-card skill-card";
  const number = document.createElement("span");
  number.className = "card-index";
  number.textContent = `S${String(index + 1).padStart(2, "0")}`;
  const copy = document.createElement("div");
  copy.className = "card-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED SKILL";
  const detail = document.createElement("small");
  detail.textContent = normalizedText(item.description, String(item.source || "SKILL").toUpperCase());
  copy.append(name, detail);
  const status = document.createElement("span");
  status.className = `status-dot ${statusClass(item.status)}`.trim();
  status.setAttribute("aria-label", item.status || "ready");
  card.append(number, copy, status);
  bindDetail(card, "skill", item);
  return card;
}

function createMcpCard(item, index) {
  const card = document.createElement("article");
  card.className = "data-card mcp-card";
  const top = document.createElement("div");
  top.className = "card-top";
  const number = document.createElement("span");
  number.className = "card-index";
  number.textContent = `M${String(index + 1).padStart(2, "0")}`;
  const status = document.createElement("span");
  status.className = `status-dot ${statusClass(item.status)}`.trim();
  status.setAttribute("aria-label", item.status || "ready");
  top.append(number, status);
  const copy = document.createElement("div");
  copy.className = "card-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED MCP";
  const detail = document.createElement("small");
  detail.textContent = `${String(item.transport || "MCP").toUpperCase()} // ${item.endpoint || item.command || "LOCAL"}`;
  copy.append(name, detail);
  card.append(top, copy);
  bindDetail(card, "mcp", item);
  return card;
}

function createPluginCard(item, index) {
  const card = document.createElement("article");
  card.className = "plugin-card";
  const number = document.createElement("span");
  number.className = "card-index";
  number.textContent = `P${String(index + 1).padStart(2, "0")}`;
  const copy = document.createElement("div");
  copy.className = "card-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED PLUGIN";
  const detail = document.createElement("small");
  detail.textContent = item.version ? `VERSION // ${item.version}` : compactText(item.description, "PLUGIN", 36);
  copy.append(name, detail);
  const status = document.createElement("span");
  status.className = `status-dot ${statusClass(item.status)}`.trim();
  status.setAttribute("aria-label", item.status || "ready");
  card.append(number, copy, status);
  bindDetail(card, "plugin", item);
  return card;
}

function createMissionCard(item, index) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `mission-item${item.id === selectedMissionId ? " is-selected" : ""}`;
  const inner = document.createElement("span");
  inner.className = "mission-item-inner";
  const number = document.createElement("span");
  number.className = "mission-index";
  number.textContent = `JOB.${String(index + 1).padStart(2, "0")}`;
  const copy = document.createElement("span");
  copy.className = "mission-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED TASK";
  const schedule = document.createElement("small");
  schedule.textContent = compactText(item.schedule, item.kind || "SCHEDULED", 62);
  copy.append(name, schedule);
  const status = document.createElement("span");
  status.className = `status-label${item.status === "error" ? " error" : ""}`;
  status.textContent = item.status || "active";
  inner.append(number, copy, status);
  card.append(inner);
  card.addEventListener("click", () => {
    selectedMissionId = item.id;
    renderMissions();
  });
  return card;
}

let skillClampFrame = null;
let skillListResizeObserver = null;

function fitSkillDescriptions() {
  ui.skillList.querySelectorAll(".skill-card:not(.is-empty) .card-copy small").forEach((detail) => {
    detail.style.removeProperty("-webkit-line-clamp");
    const copyRect = detail.parentElement.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(detail).lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

    const availableHeight = copyRect.bottom - detailRect.top;
    const visibleLines = Math.max(1, Math.floor(availableHeight / lineHeight));
    detail.style.setProperty("-webkit-line-clamp", String(visibleLines));
  });
}

function scheduleSkillDescriptionFit() {
  if (skillClampFrame !== null) cancelAnimationFrame(skillClampFrame);
  skillClampFrame = requestAnimationFrame(() => {
    skillClampFrame = null;
    fitSkillDescriptions();
  });
}

function renderSkills() {
  hideDetail();
  const page = pageSlice("skills");
  fillSlots(ui.skillList, page.items, PAGE_SIZE.skills, (item, index) => createSkillCard(item, page.start + index), "skill-card");
  updatePager("skills", page.totalPages, { total: ui.skillTotal, prev: ui.skillPrev, next: ui.skillNext, pageNumber: ui.skillPageNumber, pageTotal: ui.skillPageTotal }, renderSkills);
  scheduleSkillDescriptionFit();
}

function renderMcp() {
  hideDetail();
  const page = pageSlice("mcp");
  fillSlots(ui.mcpList, page.items, PAGE_SIZE.mcp, (item, index) => createMcpCard(item, page.start + index), "mcp-card");
  updatePager("mcp", page.totalPages, { total: ui.mcpTotal, prev: ui.mcpPrev, next: ui.mcpNext, pageNumber: ui.mcpPageNumber, pageTotal: ui.mcpPageTotal }, renderMcp);
}

function renderPlugins() {
  hideDetail();
  const page = pageSlice("plugins");
  const left = page.items.slice(0, 6);
  const right = page.items.slice(6, 12);
  fillSlots(ui.pluginLeft, left, 6, (item, index) => createPluginCard(item, page.start + index), "plugin-card");
  fillSlots(ui.pluginRight, right, 6, (item, index) => createPluginCard(item, page.start + 6 + index), "plugin-card");
  updatePager("plugins", page.totalPages, { total: ui.pluginTotal, prev: ui.pluginPrev, next: ui.pluginNext, pageNumber: ui.pluginPageNumber, pageTotal: ui.pluginPageTotal }, renderPlugins);
}

function renderMissionDetail(item) {
  ui.missionDetail.replaceChildren();
  const content = document.createElement("div");
  content.className = "detail-content";
  const kicker = document.createElement("span");
  kicker.className = "detail-kicker";
  kicker.textContent = `TASK DETAIL // ${item.id || "LOCAL"}`;
  const name = document.createElement("h2");
  name.textContent = item.name || "UNNAMED TASK";
  const status = document.createElement("span");
  status.className = `detail-status${item.status === "error" ? " error" : ""}`;
  status.textContent = String(item.status || "active").toUpperCase();
  const grid = document.createElement("div");
  grid.className = "detail-grid";
  [["TYPE", item.kind || "scheduled"], ["SCHEDULE", compactText(item.schedule, "未配置计划", 120)], ["SOURCE", item.path || "LOCAL"], ["IDENTIFIER", item.id || "UNKNOWN"]].forEach(([label, value]) => {
    const cell = document.createElement("div");
    const key = document.createElement("span");
    key.textContent = label;
    const text = document.createElement("strong");
    text.textContent = value;
    cell.append(key, text);
    grid.append(cell);
  });
  content.append(kicker, name, status, grid);
  ui.missionDetail.append(content);
}

function renderMissions() {
  const page = pageSlice("missions");
  if (page.items.length && !page.items.some((item) => item.id === selectedMissionId)) selectedMissionId = page.items[0].id;
  ui.missionList.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < PAGE_SIZE.missions; index += 1) {
    fragment.append(page.items[index] ? createMissionCard(page.items[index], page.start + index) : makeEmptySlot("mission-item"));
  }
  ui.missionList.append(fragment);
  const selected = page.items.find((item) => item.id === selectedMissionId);
  if (selected) {
    renderMissionDetail(selected);
  } else {
    ui.missionDetail.innerHTML = '<span class="detail-kicker">TASK DETAIL</span><div class="detail-empty">暂无定时任务</div>';
  }
  updatePager("missions", page.totalPages, { total: ui.missionTotal, prev: ui.missionPrev, next: ui.missionNext, pageNumber: ui.missionPageNumber, pageTotal: ui.missionPageTotal }, renderMissions);
}

function changePage(key, offset, render) {
  const totalPages = Math.max(1, Math.ceil(data[key].length / PAGE_SIZE[key]));
  const next = pages[key] + offset;
  if (next < 0 || next >= totalPages) return;
  pages[key] = next;
  render();
}

function renderState(state) {
  data.skills = Array.isArray(state.skills) ? state.skills : [];
  data.mcp = Array.isArray(state.mcp_servers) ? state.mcp_servers : [];
  data.plugins = Array.isArray(state.plugins) ? state.plugins : [];
  data.missions = Array.isArray(state.automations) ? state.automations : [];
  const agents = Array.isArray(state.agents) ? state.agents : [];
  const errors = Array.isArray(state.errors) ? state.errors : [];
  const gearCount = data.mcp.length + data.plugins.length;
  const buildId = `CG-${String(data.skills.length * 13 + gearCount * 7 + agents.length).padStart(3, "0")}`;

  renderSkills();
  renderMcp();
  renderPlugins();
  renderMissions();

  ui.skillCount.textContent = String(data.skills.length).padStart(2, "0");
  ui.mcpCount.textContent = String(data.mcp.length).padStart(2, "0");
  ui.skillStat.textContent = String(data.skills.length).padStart(2, "0");
  ui.gearStat.textContent = String(gearCount).padStart(2, "0");
  ui.missionStat.textContent = String(data.missions.length).padStart(2, "0");
  ui.wardrobeBuildId.textContent = buildId;
  ui.rulesStrip.textContent = agents.length ? `AGENT PROTOCOL ${agents.length}` : "LOCAL SKIN CONTROL";

  const scanDate = new Date(state.scanned_at);
  ui.scanTime.textContent = Number.isNaN(scanDate.getTime()) ? "SCAN COMPLETE" : `SYNC ${scanDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (errors.length) {
    ui.notice.textContent = `WARNING // ${errors.length} 个数据源读取不完整`;
    ui.notice.className = "notice is-error";
  } else {
    ui.notice.textContent = "";
    ui.notice.className = "notice is-hidden";
  }
}

async function loadState() {
  ui.refreshButton.disabled = true;
  ui.refreshButton.classList.add("is-loading");
  ui.notice.textContent = "SCANNING // 正在读取本地 Codex 配置…";
  ui.notice.className = "notice";
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    const state = await response.json();
    if (!response.ok) throw new Error(state.message || "扫描服务返回错误");
    renderState(state);
  } catch (error) {
    ui.notice.textContent = `LINK FAILURE // ${error.message}`;
    ui.notice.className = "notice is-error";
    ui.scanTime.textContent = "OFFLINE";
    renderSkills();
    renderMcp();
    renderPlugins();
    renderMissions();
  } finally {
    ui.refreshButton.disabled = false;
    ui.refreshButton.classList.remove("is-loading");
  }
}

function setRulesState(message, tone = "") {
  ui.rulesState.textContent = message;
  ui.rulesState.className = `rules-state${tone ? ` is-${tone}` : ""}`;
}

function updateRulesControls() {
  ui.rulesEditor.disabled = rulesBusy || !rulesLoaded;
  ui.rulesReload.disabled = rulesBusy;
  ui.rulesSave.disabled = rulesBusy || !rulesLoaded || !rulesDirty;
  ui.rulesReload.classList.toggle("is-loading", rulesBusy);
  ui.rulesCharacterCount.textContent = `${ui.rulesEditor.value.length} CHAR`;
}

function applyRulesPayload(payload, stateLabel = "已同步") {
  rulesActionToken = payload.action_token || rulesActionToken;
  rulesRevision = payload.revision;
  rulesLineEnding = payload.content.includes("\r\n") ? "\r\n" : "\n";
  ui.rulesEditor.value = payload.content;
  rulesOriginalContent = ui.rulesEditor.value;
  rulesLoaded = true;
  rulesDirty = false;
  ui.rulesPath.textContent = payload.path || "$CODEX_HOME/AGENTS.md";
  setRulesState(payload.exists ? stateLabel : "新文件", "saved");
  updateRulesControls();
}

async function loadRules() {
  rulesBusy = true;
  setRulesState("正在读取");
  updateRulesControls();
  try {
    const response = await fetch("/api/rules", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "全局规则读取失败");
    applyRulesPayload(payload);
  } catch (error) {
    setRulesState(error.message, "error");
  } finally {
    rulesBusy = false;
    updateRulesControls();
  }
}

async function reloadRules() {
  if (rulesDirty && !window.confirm("重新载入会丢弃尚未保存的规则修改。继续吗？")) return;
  await loadRules();
}

async function saveRules() {
  if (!rulesLoaded || !rulesDirty || rulesBusy) return;
  if (!rulesActionToken) {
    setRulesState("操作令牌缺失，请重新载入", "error");
    return;
  }

  rulesBusy = true;
  setRulesState("正在保存");
  updateRulesControls();
  const content = rulesLineEnding === "\r\n" ? ui.rulesEditor.value.replace(/\n/g, "\r\n") : ui.rulesEditor.value;
  try {
    const response = await fetch("/api/rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CoGame-Action-Token": rulesActionToken,
      },
      body: JSON.stringify({ content, revision: rulesRevision }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "全局规则保存失败");
    applyRulesPayload(payload, "已保存");
  } catch (error) {
    setRulesState(error.message, "error");
  } finally {
    rulesBusy = false;
    updateRulesControls();
  }
}

function selectView(viewName) {
  hideDetail();
  document.querySelectorAll(".tab").forEach((tab) => {
    const selected = tab.dataset.view === viewName;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".view").forEach((view) => {
    const selected = view.id === `view-${viewName}`;
    view.classList.toggle("is-active", selected);
    view.hidden = !selected;
  });
}

function skinDimensions(skin) {
  return skin.width && skin.height ? `${skin.width} × ${skin.height}` : "无法读取";
}

function createSkinRow(skin) {
  const row = document.createElement("tr");
  row.dataset.skinId = skin.id;
  row.classList.toggle("is-error", !skin.valid);

  const imageCell = document.createElement("td");
  const button = document.createElement("button");
  button.className = "skin-select";
  button.type = "button";
  button.dataset.skinId = skin.id;
  button.disabled = !skin.valid;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", skin.valid ? `预览皮肤：${skin.name}` : `${skin.name}：${skin.error}`);

  let thumbnail;
  if (skin.valid && skin.url) {
    thumbnail = document.createElement("img");
    thumbnail.className = "skin-thumbnail";
    thumbnail.src = skin.url;
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    thumbnail.decoding = "async";
  } else {
    thumbnail = document.createElement("span");
    thumbnail.className = "skin-thumbnail skin-thumbnail-error";
    thumbnail.textContent = "ERR";
    thumbnail.setAttribute("aria-hidden", "true");
  }

  const copy = document.createElement("span");
  copy.className = "skin-row-copy";
  const name = document.createElement("strong");
  name.textContent = skin.name;
  const description = document.createElement("small");
  description.className = "skin-description";
  description.textContent = skin.valid ? skin.description : skin.error;
  const source = document.createElement("small");
  source.className = "skin-source";
  source.textContent = `${skin.filename} · ${skin.source}`;
  copy.append(name, description, source);
  button.append(thumbnail, copy);
  imageCell.append(button);

  const formatCell = document.createElement("td");
  formatCell.textContent = skin.format;
  const dimensionsCell = document.createElement("td");
  dimensionsCell.textContent = skinDimensions(skin);
  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `skin-status${skin.valid ? "" : " error"}`;
  status.textContent = skin.valid ? "可用" : "错误";
  statusCell.append(status);

  row.append(imageCell, formatCell, dimensionsCell, statusCell);
  return row;
}

function renderSkinTable() {
  if (!skins.length) {
    const row = document.createElement("tr");
    row.className = "skin-empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "皮肤目录中没有图片资源";
    row.append(cell);
    ui.skinTableBody.replaceChildren(row);
  } else {
    ui.skinTableBody.replaceChildren(...skins.map(createSkinRow));
  }
  const invalidCount = skins.filter((skin) => !skin.valid).length;
  ui.skinTotal.textContent = skins.length;
  ui.skinCatalogStatus.textContent = `${skins.length} FILES${invalidCount ? ` · ${invalidCount} ERRORS` : ""}`;
  updateSkinStatusRows();
  updateSkinActions();
}

function showEmptySkin(title, detail, isError = false) {
  selectedSkinId = null;
  ui.wardrobeAvatar.removeAttribute("src");
  ui.wardrobeAvatar.hidden = true;
  ui.wardrobePreview.classList.toggle("is-image-error", isError);
  ui.appearanceName.textContent = title;
  ui.skinPreviewMeta.textContent = detail;
  updateSkinActions();
}

function selectSkin(skinId) {
  const skin = skins.find((item) => item.id === skinId && item.valid);
  if (!skin) return;

  selectedSkinId = skin.id;
  ui.wardrobeAvatar.hidden = false;
  ui.wardrobePreview.classList.remove("is-image-error");
  ui.wardrobeAvatar.src = skin.url;
  ui.wardrobeAvatar.alt = `${skin.name}皮肤预览`;
  ui.appearanceName.textContent = skin.name;
  ui.skinPreviewMeta.textContent = `${skin.format} · ${skinDimensions(skin)} · ${skin.source}`;
  localStorage.setItem("cogame-selected-skin", skin.id);

  ui.skinTableBody.querySelectorAll("tr[data-skin-id]").forEach((row) => {
    const selected = row.dataset.skinId === skin.id;
    row.classList.toggle("is-selected", selected);
    row.querySelector(".skin-select").setAttribute("aria-pressed", String(selected));
  });
  updateSkinActions();
}

function currentSkinId() {
  const saved = localStorage.getItem("cogame-selected-skin");
  const savedSkin = skins.find((skin) => skin.id === saved && skin.valid);
  return savedSkin?.id || skins.find((skin) => skin.valid)?.id || null;
}

function activeSkinId() {
  return skinRuntimeStatus?.session_configured ? skinRuntimeStatus.active_theme?.id || null : null;
}

function updateSkinStatusRows() {
  const activeId = activeSkinId();
  ui.skinTableBody.querySelectorAll("tr[data-skin-id]").forEach((row) => {
    const skin = skins.find((item) => item.id === row.dataset.skinId);
    const status = row.querySelector(".skin-status");
    if (!skin?.valid || !status) return;
    status.textContent = skin.id === activeId ? "应用中" : "可用";
  });
}

function updateSkinActions() {
  const selected = skins.find((skin) => skin.id === selectedSkinId && skin.valid);
  ui.applySkin.disabled = skinActionBusy || !skinRuntimeStatus?.ready || !selected;
  ui.restoreSkin.disabled = skinActionBusy || !skinRuntimeStatus?.ready;
}

function setSkinRuntimeStatus(status) {
  skinRuntimeStatus = status;
  skinActionToken = status?.action_token || skinActionToken;
  const ready = Boolean(status?.ready);
  ui.skinRuntimeIndicator.classList.toggle("is-ready", ready);
  ui.skinRuntimeIndicator.classList.toggle("is-error", !ready);
  ui.skinRuntimeLabel.textContent = ready ? "运行环境就绪" : "运行环境未就绪";
  if (ready) {
    const activeTheme = status.session_configured ? status.active_theme : null;
    const session = activeTheme?.name ? `当前皮肤：${activeTheme.name}` : status.session_configured ? "已配置会话" : "等待首次启动";
    ui.skinRuntimeDetail.textContent = `CODEX ${status.codex_version} · NODE ${status.node_version} · ${session}`;
  } else {
    ui.skinRuntimeDetail.textContent = status?.requirements?.join(" · ") || "无法读取 Dream Skin 状态";
  }
  updateSkinStatusRows();
  updateSkinActions();
}

async function loadSkinCatalog() {
  ui.skinCatalogStatus.textContent = "SCANNING";
  try {
    const response = await fetch("/api/skins", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "皮肤目录扫描失败");
    skins = Array.isArray(payload.skins) ? payload.skins : [];
    renderSkinTable();

    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const invalidCount = skins.filter((skin) => !skin.valid).length;
    const messages = [...warnings];
    if (invalidCount) messages.push(`${invalidCount} 个皮肤文件无法使用，请查看错误行`);
    ui.skinCatalogWarning.textContent = messages.join("；");
    ui.skinCatalogWarning.hidden = !messages.length;

    const initialSkinId = currentSkinId();
    if (initialSkinId) {
      selectSkin(initialSkinId);
    } else {
      showEmptySkin("没有可用皮肤", skins.length ? "请修复表格中的图片错误" : "将 PNG、JPEG 或 WebP 放入皮肤目录", true);
    }
  } catch (error) {
    skins = [];
    renderSkinTable();
    ui.skinCatalogStatus.textContent = "SCAN FAILED";
    ui.skinCatalogWarning.textContent = error.message;
    ui.skinCatalogWarning.hidden = false;
    showEmptySkin("扫描失败", error.message, true);
  }
}

async function loadSkinRuntimeStatus() {
  try {
    const response = await fetch("/api/skins/status", { cache: "no-store" });
    const status = await response.json();
    if (!response.ok) throw new Error(status.message || "运行环境检测失败");
    setSkinRuntimeStatus(status);
  } catch (error) {
    setSkinRuntimeStatus({ ready: false, requirements: [error.message] });
  }
}

function setSkinActionBusy(busy, action = "") {
  skinActionBusy = busy;
  ui.applySkin.textContent = busy && action === "apply" ? "正在应用" : "应用皮肤";
  ui.restoreSkin.textContent = busy && action === "restore" ? "正在恢复" : "恢复官方外观";
  updateSkinActions();
}

async function requestSkinAction(route, payload) {
  if (!skinActionToken) throw new Error("操作令牌缺失，请刷新页面后重试");
  const response = await fetch(route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CoGame-Action-Token": skinActionToken,
    },
    body: JSON.stringify(payload),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    result = { message: "服务返回了无法识别的响应" };
  }
  if (!response.ok) {
    const error = new Error(result.message || "Dream Skin 操作失败");
    error.runtimeStatus = result.status;
    throw error;
  }
  return result;
}

function showSkinActionNotice(message, isError = false) {
  ui.notice.textContent = `${isError ? "SKIN FAILURE" : "SKIN READY"} // ${message}`;
  ui.notice.className = `notice${isError ? " is-error" : ""}`;
}

async function applySelectedSkin() {
  const skin = skins.find((item) => item.id === selectedSkinId && item.valid);
  if (!skin || !skinRuntimeStatus?.ready || skinActionBusy) return;
  if (!window.confirm(`应用“${skin.name}”可能会重启 Codex，未发送的输入可能丢失。继续吗？`)) return;

  setSkinActionBusy(true, "apply");
  try {
    const result = await requestSkinAction("/api/skins/apply", { skin_id: skin.id, restart_existing: true });
    showSkinActionNotice(result.message || `已应用：${skin.name}`);
    await loadSkinRuntimeStatus();
  } catch (error) {
    if (error.runtimeStatus) setSkinRuntimeStatus(error.runtimeStatus);
    showSkinActionNotice(error.message, true);
  } finally {
    setSkinActionBusy(false);
  }
}

async function restoreOfficialSkin() {
  if (!skinRuntimeStatus?.ready || skinActionBusy) return;
  if (!window.confirm("恢复官方外观会关闭 Dream Skin 会话并重启 Codex。继续吗？")) return;

  setSkinActionBusy(true, "restore");
  try {
    const result = await requestSkinAction("/api/skins/restore", { restart_existing: true });
    showSkinActionNotice(result.message || "已恢复官方外观");
    await loadSkinRuntimeStatus();
  } catch (error) {
    if (error.runtimeStatus) setSkinRuntimeStatus(error.runtimeStatus);
    showSkinActionNotice(error.message, true);
  } finally {
    setSkinActionBusy(false);
  }
}

async function refreshAll(forceRules = false) {
  if (!forceRules && rulesDirty && !window.confirm("刷新会丢弃尚未保存的规则修改。继续吗？")) return;
  await Promise.allSettled([loadState(), loadRules(), loadSkinCatalog(), loadSkinRuntimeStatus()]);
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  selectView(tab.dataset.view);
  history.replaceState(null, "", `#${tab.dataset.view}`);
}));
ui.skinTableBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-skin-id]");
  if (row) selectSkin(row.dataset.skinId);
});
ui.wardrobeAvatar.addEventListener("load", () => ui.wardrobePreview.classList.remove("is-image-error"));
ui.wardrobeAvatar.addEventListener("error", () => {
  ui.wardrobePreview.classList.add("is-image-error");
  ui.skinPreviewMeta.textContent = "图片无法载入";
});
ui.skillPrev.addEventListener("click", () => changePage("skills", -1, renderSkills));
ui.skillNext.addEventListener("click", () => changePage("skills", 1, renderSkills));
ui.mcpPrev.addEventListener("click", () => changePage("mcp", -1, renderMcp));
ui.mcpNext.addEventListener("click", () => changePage("mcp", 1, renderMcp));
ui.pluginPrev.addEventListener("click", () => changePage("plugins", -1, renderPlugins));
ui.pluginNext.addEventListener("click", () => changePage("plugins", 1, renderPlugins));
ui.missionPrev.addEventListener("click", () => changePage("missions", -1, renderMissions));
ui.missionNext.addEventListener("click", () => changePage("missions", 1, renderMissions));
ui.rulesEditor.addEventListener("input", () => {
  rulesDirty = ui.rulesEditor.value !== rulesOriginalContent;
  setRulesState(rulesDirty ? "有未保存更改" : "已同步", rulesDirty ? "dirty" : "saved");
  updateRulesControls();
});
ui.rulesReload.addEventListener("click", reloadRules);
ui.rulesSave.addEventListener("click", saveRules);
ui.applySkin.addEventListener("click", applySelectedSkin);
ui.restoreSkin.addEventListener("click", restoreOfficialSkin);
ui.refreshButton.addEventListener("click", () => refreshAll());

if ("ResizeObserver" in window) {
  skillListResizeObserver = new ResizeObserver(scheduleSkillDescriptionFit);
  skillListResizeObserver.observe(ui.skillList);
} else {
  window.addEventListener("resize", scheduleSkillDescriptionFit);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideDetail();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && !ui.rulesEditor.disabled) {
    event.preventDefault();
    saveRules();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!rulesDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

const hashView = location.hash.slice(1) === "dashboard" ? "equipment" : location.hash.slice(1);
const initialView = ["equipment", "plugins", "rules", "missions", "wardrobe"].includes(hashView) ? hashView : "equipment";
selectView(initialView);
refreshAll(true);
