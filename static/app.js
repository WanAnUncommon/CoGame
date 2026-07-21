const SKILLS_PER_PAGE = 6;
const LOADOUT_ITEMS_PER_PAGE = 4;

const ui = {
  notice: document.getElementById("notice"),
  refreshButton: document.getElementById("refresh-button"),
  scanTime: document.getElementById("scan-time"),
  mcpList: document.getElementById("mcp-list"),
  pluginList: document.getElementById("plugin-list"),
  mcpSection: document.getElementById("mcp-section"),
  pluginSection: document.getElementById("plugin-section"),
  loadoutPrev: document.getElementById("loadout-prev"),
  loadoutNext: document.getElementById("loadout-next"),
  loadoutPageNumber: document.getElementById("loadout-page-number"),
  loadoutPageProgress: document.getElementById("loadout-page-progress"),
  skillList: document.getElementById("skill-list"),
  skillPrev: document.getElementById("skill-prev"),
  skillNext: document.getElementById("skill-next"),
  skillPageStatus: document.getElementById("skill-page-status"),
  skillPageNumber: document.getElementById("skill-page-number"),
  skillPageProgress: document.getElementById("skill-page-progress"),
  missionList: document.getElementById("mission-list"),
  equipmentCount: document.getElementById("equipment-count"),
  skillCount: document.getElementById("skill-count"),
  skillStat: document.getElementById("skill-stat"),
  gearStat: document.getElementById("gear-stat"),
  missionStat: document.getElementById("mission-stat"),
  missionOverviewCount: document.getElementById("mission-overview-count"),
  projectName: document.getElementById("project-name"),
  characterClass: document.getElementById("character-class"),
  characterLevel: document.getElementById("character-level"),
  buildId: document.getElementById("build-id"),
  rulesStrip: document.getElementById("rules-strip"),
  appearanceName: document.getElementById("appearance-name"),
};

const sourceNames = {
  user: "USER CHIP",
  system: "SYSTEM CHIP",
  plugin: "PLUGIN CHIP",
};

const paletteNames = {
  night: "夜之黄",
  neural: "神经青",
  alert: "警戒红",
};

const displayNames = {
  standard: "标准",
  compact: "紧凑",
};

let skillItems = [];
let skillPage = 0;
let loadoutItems = [];
let loadoutPage = 0;


function clear(element) {
  element.replaceChildren();
}


function compactText(value, fallback = "NO DESCRIPTION", maxLength = 116) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}


function initials(name, fallback) {
  const parts = String(name || "").trim().split(/[\s_-]+/).filter(Boolean);
  if (!parts.length) {
    return fallback;
  }
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}


function statusClass(status) {
  if (status === "error") {
    return "error";
  }
  if (status === "disabled") {
    return "disabled";
  }
  return "";
}


function createEmpty(message) {
  const fragment = document.getElementById("empty-template").content.cloneNode(true);
  fragment.querySelector("p").textContent = message;
  return fragment;
}


function createLoadoutItem(item, type) {
  const article = document.createElement("article");
  article.className = `loadout-item loadout-${type}`;

  const icon = document.createElement("span");
  icon.className = `item-icon${type === "plugin" ? " plugin" : ""}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = initials(item.name, type === "plugin" ? "PL" : "MC");

  const copy = document.createElement("div");
  copy.className = "item-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED MODULE";
  const detail = document.createElement("small");
  if (type === "plugin") {
    detail.textContent = item.version ? `CYBERWARE // ${item.version}` : "CYBERWARE MODULE";
  } else {
    detail.textContent = `TOOL // ${item.endpoint || item.command || item.transport || "MCP"}`;
  }
  copy.append(name, detail);

  const status = document.createElement("span");
  const itemStatus = item.status || (item.enabled === false ? "disabled" : "ready");
  status.className = `status-dot ${statusClass(itemStatus)}`.trim();
  status.setAttribute("aria-label", itemStatus === "ready" ? "在线" : itemStatus);

  article.append(icon, copy, status);
  return article;
}


function createSkillItem(item, index) {
  const article = document.createElement("article");
  const sourceClass = String(item.source || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  article.className = `skill-item skill-${sourceClass}`;

  const head = document.createElement("div");
  head.className = "skill-head";

  const key = document.createElement("span");
  key.className = "skill-key";
  key.setAttribute("aria-hidden", "true");
  key.textContent = `S${String(index + 1).padStart(2, "0")}`;

  const title = document.createElement("div");
  title.className = "skill-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED CHIP";
  title.append(name);
  head.append(key, title);

  const body = document.createElement("div");
  body.className = "skill-copy";
  const description = document.createElement("p");
  description.textContent = compactText(item.description, "NO DESCRIPTION", 132);
  body.append(description);

  const source = document.createElement("span");
  source.className = "source-label";
  source.textContent = sourceNames[item.source] || item.source || "UNKNOWN CHIP";

  article.append(head, body, source);
  return article;
}


function createMissionItem(item, index) {
  const article = document.createElement("article");
  article.className = "mission-item";

  const number = document.createElement("span");
  number.className = "mission-index";
  number.textContent = `JOB.${String(index + 1).padStart(2, "0")}`;

  const copy = document.createElement("div");
  copy.className = "mission-copy";
  const name = document.createElement("strong");
  name.textContent = item.name || "UNNAMED CONTRACT";
  const schedule = document.createElement("p");
  schedule.textContent = compactText(item.schedule, item.kind || "LOCAL AUTOMATION", 88);
  copy.append(name, schedule);

  const status = document.createElement("span");
  const isError = item.status === "error";
  status.className = `status-label${isError ? " error" : ""}`;
  status.textContent = isError ? "ERROR" : (item.status || "ACTIVE").toUpperCase();

  article.append(number, copy, status);
  return article;
}


function renderCollection(element, items, factory, emptyMessage) {
  clear(element);
  if (!items.length) {
    element.append(createEmpty(emptyMessage));
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => fragment.append(factory(item, index)));
  element.append(fragment);
}


function renderLoadout() {
  clear(ui.mcpList);
  clear(ui.pluginList);

  if (!loadoutItems.length) {
    loadoutPage = 0;
    ui.mcpSection.hidden = false;
    ui.pluginSection.hidden = true;
    ui.mcpList.append(createEmpty("未检测到可用模组"));
    ui.loadoutPageNumber.textContent = "00 / 00";
    ui.loadoutPageProgress.style.width = "0%";
    ui.loadoutPrev.disabled = true;
    ui.loadoutNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(loadoutItems.length / LOADOUT_ITEMS_PER_PAGE);
  loadoutPage = Math.min(Math.max(loadoutPage, 0), totalPages - 1);
  const start = loadoutPage * LOADOUT_ITEMS_PER_PAGE;
  const pageItems = loadoutItems.slice(start, start + LOADOUT_ITEMS_PER_PAGE);
  const mcpFragment = document.createDocumentFragment();
  const pluginFragment = document.createDocumentFragment();
  let mcpCount = 0;
  let pluginCount = 0;

  pageItems.forEach(({ item, type }) => {
    if (type === "mcp") {
      mcpFragment.append(createLoadoutItem(item, type));
      mcpCount += 1;
    } else {
      pluginFragment.append(createLoadoutItem(item, type));
      pluginCount += 1;
    }
  });

  ui.mcpSection.hidden = mcpCount === 0;
  ui.pluginSection.hidden = pluginCount === 0;
  ui.mcpList.append(mcpFragment);
  ui.pluginList.append(pluginFragment);

  const currentLabel = String(loadoutPage + 1).padStart(2, "0");
  const totalLabel = String(totalPages).padStart(2, "0");
  ui.loadoutPageNumber.textContent = `${currentLabel} / ${totalLabel}`;
  ui.loadoutPageProgress.style.width = `${((loadoutPage + 1) / totalPages) * 100}%`;
  ui.loadoutPrev.disabled = loadoutPage === 0;
  ui.loadoutNext.disabled = loadoutPage === totalPages - 1;
}


function changeLoadoutPage(offset) {
  const totalPages = Math.ceil(loadoutItems.length / LOADOUT_ITEMS_PER_PAGE);
  const nextPage = loadoutPage + offset;
  if (nextPage < 0 || nextPage >= totalPages) {
    return;
  }
  loadoutPage = nextPage;
  renderLoadout();
}


function renderSkills() {
  clear(ui.skillList);

  if (!skillItems.length) {
    skillPage = 0;
    ui.skillList.append(createEmpty("未检测到能力芯片"));
    ui.skillPageStatus.textContent = "PAGE 00 / 00";
    ui.skillPageNumber.textContent = "00 / 00";
    ui.skillPageProgress.style.width = "0%";
    ui.skillPrev.disabled = true;
    ui.skillNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(skillItems.length / SKILLS_PER_PAGE);
  skillPage = Math.min(Math.max(skillPage, 0), totalPages - 1);
  const start = skillPage * SKILLS_PER_PAGE;
  const pageItems = skillItems.slice(start, start + SKILLS_PER_PAGE);
  const fragment = document.createDocumentFragment();

  pageItems.forEach((item, index) => {
    fragment.append(createSkillItem(item, start + index));
  });
  ui.skillList.append(fragment);

  const currentLabel = String(skillPage + 1).padStart(2, "0");
  const totalLabel = String(totalPages).padStart(2, "0");
  ui.skillPageStatus.textContent = `PAGE ${currentLabel} / ${totalLabel}`;
  ui.skillPageNumber.textContent = `${currentLabel} / ${totalLabel}`;
  ui.skillPageProgress.style.width = `${((skillPage + 1) / totalPages) * 100}%`;
  ui.skillPrev.disabled = skillPage === 0;
  ui.skillNext.disabled = skillPage === totalPages - 1;
}


function changeSkillPage(offset) {
  const totalPages = Math.ceil(skillItems.length / SKILLS_PER_PAGE);
  const nextPage = skillPage + offset;
  if (nextPage < 0 || nextPage >= totalPages) {
    return;
  }
  skillPage = nextPage;
  renderSkills();
}


function characterTitle(skillCount, gearCount, missionCount) {
  if (missionCount >= 3) {
    return "自动化佣兵";
  }
  if (skillCount >= 12 && gearCount >= 4) {
    return "全栈构筑者";
  }
  if (skillCount >= 8) {
    return "神经网络行者";
  }
  if (gearCount >= 3) {
    return "模组专家";
  }
  return "配置探索者";
}


function renderState(state) {
  const skills = Array.isArray(state.skills) ? state.skills : [];
  const mcpServers = Array.isArray(state.mcp_servers) ? state.mcp_servers : [];
  const plugins = Array.isArray(state.plugins) ? state.plugins : [];
  const automations = Array.isArray(state.automations) ? state.automations : [];
  const agents = Array.isArray(state.agents) ? state.agents : [];
  const errors = Array.isArray(state.errors) ? state.errors : [];
  const gearCount = mcpServers.length + plugins.length;
  const level = Math.min(99, Math.max(1, skills.length + gearCount + automations.length));

  loadoutItems = [
    ...mcpServers.map((item) => ({ item, type: "mcp" })),
    ...plugins.map((item) => ({ item, type: "plugin" })),
  ];
  renderLoadout();
  skillItems = skills;
  renderSkills();
  renderCollection(ui.missionList, automations, createMissionItem, "当前无活动委托");

  ui.equipmentCount.textContent = String(gearCount).padStart(2, "0");
  ui.skillCount.textContent = String(skills.length).padStart(2, "0");
  ui.skillStat.textContent = String(skills.length).padStart(2, "0");
  ui.gearStat.textContent = String(gearCount).padStart(2, "0");
  ui.missionStat.textContent = String(automations.length).padStart(2, "0");
  ui.missionOverviewCount.textContent = String(automations.length).padStart(2, "0");
  ui.characterLevel.textContent = String(level).padStart(2, "0");
  ui.buildId.textContent = `CG-${String(skills.length * 13 + gearCount * 7 + agents.length).padStart(3, "0")}`;
  ui.projectName.textContent = state.project || "LOCAL WORKSPACE";
  ui.characterClass.textContent = characterTitle(skills.length, gearCount, automations.length);
  ui.rulesStrip.textContent = agents.length
    ? `AGENT PROTOCOL // ${agents.length} 份角色准则已接入`
    : "AGENT PROTOCOL // 未检测到项目准则";

  const scanDate = new Date(state.scanned_at);
  ui.scanTime.textContent = Number.isNaN(scanDate.getTime())
    ? "SCAN COMPLETE"
    : `SYNC ${scanDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;

  if (errors.length) {
    ui.notice.textContent = `WARNING // ${errors.length} 个数据源读取不完整，其余构筑已载入。`;
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
    if (!response.ok) {
      throw new Error(state.message || "扫描服务返回错误");
    }
    renderState(state);
  } catch (error) {
    ui.notice.textContent = `LINK FAILURE // ${error.message}`;
    ui.notice.className = "notice is-error";
    ui.scanTime.textContent = "OFFLINE";
  } finally {
    ui.refreshButton.disabled = false;
    ui.refreshButton.classList.remove("is-loading");
  }
}


function selectView(viewName) {
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


function applyAppearance(palette, display) {
  document.body.dataset.palette = palette;
  document.body.dataset.display = display;
  ui.appearanceName.textContent = `${paletteNames[palette]} // ${displayNames[display]}`;
  localStorage.setItem("cogame-appearance", JSON.stringify({ palette, display }));

  document.querySelectorAll("[data-palette]").forEach((button) => {
    const selected = button.dataset.palette === palette;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-display]").forEach((button) => {
    const selected = button.dataset.display === display;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}


function currentAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem("cogame-appearance"));
    return {
      palette: paletteNames[saved?.palette] ? saved.palette : "night",
      display: displayNames[saved?.display] ? saved.display : "standard",
    };
  } catch {
    return { palette: "night", display: "standard" };
  }
}


document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectView(tab.dataset.view);
    history.replaceState(null, "", `#${tab.dataset.view}`);
  });
});

document.querySelectorAll("[data-palette]").forEach((button) => {
  button.addEventListener("click", () => {
    applyAppearance(button.dataset.palette, document.body.dataset.display || "standard");
  });
});

document.querySelectorAll("[data-display]").forEach((button) => {
  button.addEventListener("click", () => {
    applyAppearance(document.body.dataset.palette || "night", button.dataset.display);
  });
});

ui.skillPrev.addEventListener("click", () => changeSkillPage(-1));
ui.skillNext.addEventListener("click", () => changeSkillPage(1));
ui.loadoutPrev.addEventListener("click", () => changeLoadoutPage(-1));
ui.loadoutNext.addEventListener("click", () => changeLoadoutPage(1));
ui.refreshButton.addEventListener("click", loadState);

const initialView = ["dashboard", "missions", "wardrobe"].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : "dashboard";
const appearance = currentAppearance();
selectView(initialView);
applyAppearance(appearance.palette, appearance.display);
loadState();
