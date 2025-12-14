import { REFRESH_INTERVAL_MS } from "./config.js";
import { t, setCurrentLang } from "./i18n.js";
import { initAIAssistant } from "./ai-assistant.js";
import {
  fetchLeaderboard,
  fetchRecordLeaderboard,
  fetchUserProfile,
  fetchUserMatches,
  fetchMatchDetail,
} from "./api.js";
import {
  formatEloWithRank,
  getEloRank,
  getPlayerAvatar,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFullMs,
} from "./services.js";
import { state } from "./state.js";
import {
  setStatus,
  setSyncIndicatorState,
  updateSyncIndicatorTooltip,
  updateTimestamp,
  refreshLastUpdatedLabel,
  toggleLoading,
} from "./status.js";
import {
  statusMessage,
  seasonNumber,
  seasonRange,
  topElo,
  topPlayer,
  averageElo,
  countryCount,
  heroTitle,
  heroSubtitle,
  leaderboardBody,
  leaderboardPagination,
  syncIndicator,
  leaderboardToggleButtons,
  refreshBtn,
  searchInput,
  playerLookupInput,
  lookupBtn,
  playerModal,
  modalOverlay,
  modalClose,
  modalScreenshot,
  modalCompare,
  modalExpand,
  modalPlayerName,
  modalBody,
} from "./dom.js";

// Disable all Chart.js legends globally to avoid showing the "Elo" legend.
if (typeof Chart !== "undefined" && Chart.defaults?.plugins?.legend) {
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.legend.labels.display = false;
}

// Initialize AI Assistant
initAIAssistant();

function setLanguage() {
  setCurrentLang("en");
  localStorage.setItem("mcsr-lang", "en");
  document.documentElement.lang = "en";
  updateRegionNames();
  updateUI();
}

function updateUI() {
  updateLeaderboardCopy();
  // 更新所有 UI 文字
  const timestamp = document.querySelector(".timestamp");
  const tableHeaderP = document.querySelector(".table-header p");
  const searchLabel = document.querySelector('label[for="search-input"] span');
  const searchInput = document.getElementById("search-input");
  const lookupLabel = document.querySelector('label[for="player-lookup-input"] span');
  const lookupInput = document.getElementById("player-lookup-input");
  const lookupBtn = document.getElementById("lookup-btn");

  if (refreshBtn) refreshBtn.textContent = t("ui.updateNow");
  if (timestamp) {
    const lastEl = document.getElementById("last-updated");
    if (lastEl) lastEl.textContent = t("ui.notLoaded");
    updateSyncIndicatorTooltip(t("ui.notLoaded"));
    setSyncIndicatorState(state.lastError ? "error" : "ok", syncIndicator?.title);
  }
  if (tableHeaderP) tableHeaderP.textContent = t("ui.refreshInfo");
  if (searchLabel) searchLabel.textContent = t("ui.searchPlayer");
  if (searchInput) searchInput.placeholder = t("ui.searchPlaceholder");
  if (lookupLabel) lookupLabel.textContent = t("ui.lookupPlayer");
  if (lookupInput) lookupInput.placeholder = t("ui.lookupPlaceholder");
  if (lookupBtn) lookupBtn.textContent = t("ui.view");

  // 更新表格標題
  const ths = document.querySelectorAll("thead th");
  if (ths.length >= 6) {
    ths[0].textContent = t("ui.rank");
    ths[1].textContent = t("ui.player");
    ths[2].textContent = t("ui.elo");
    ths[3].textContent = t("ui.role");
    ths[4].textContent = t("ui.country");
    ths[5].textContent = t("ui.phasePoints");
  }

  // 更新統計卡片
  const statLabels = document.querySelectorAll(".stat-label");
  if (statLabels.length >= 4) {
    statLabels[0].textContent = t("ui.season");
    statLabels[1].textContent = t("ui.highestElo");
    statLabels[2].textContent = t("ui.averageElo");
    statLabels[3].textContent = t("ui.countryCount");
  }

  const statSubs = document.querySelectorAll(".stat-sub");
  if (statSubs.length >= 4) {
    // statSubs[0] = season range, statSubs[1] = top player name
    // statSubs[2] = Top 150 average, statSubs[3] = Top 150 countries
    statSubs[2].textContent = t("ui.top150Average");
    statSubs[3].textContent = t("ui.top150Countries");
  }

  // 更新截圖按鈕標籤
  if (modalScreenshot) {
    const screenshotLabel = "Save Screenshot";
    modalScreenshot.setAttribute("aria-label", screenshotLabel);
    modalScreenshot.setAttribute("title", screenshotLabel);
  }

  // 更新玩家詳情模態框上的其他按鈕標籤
  if (modalExpand) {
    const label = "Expand / Restore";
    modalExpand.setAttribute("aria-label", label);
    modalExpand.setAttribute("title", label);
  }
  if (modalCompare) {
    const label = t("ui.comparePlayer");
    modalCompare.setAttribute("aria-label", label);
    modalCompare.setAttribute("title", label);
  }
  if (modalClose) {
    const label = t("ui.close");
    modalClose.setAttribute("aria-label", label);
    modalClose.setAttribute("title", label);
  }

  // 更新頁腳資料來源文字
  const dataSourceEl = document.getElementById("data-source");
  if (dataSourceEl) {
    const linkHtml =
      '<a href="https://mcsrranked.com" target="_blank" rel="noopener">mcsrranked.com</a>';
    dataSourceEl.innerHTML = `${t("ui.dataSource")}: ${linkHtml} ${t(
      "ui.dataSourceNote",
    )}`;
  }

  // 依目前語言重繪最後更新時間的相對文字
  refreshLastUpdatedLabel();

  // 重新載入排行榜以更新文字
  if (state.users.length > 0) {
    renderLeaderboard(state.filtered.length > 0 ? state.filtered : state.users);
  }

  // 如果模態框是打開的，重新渲染玩家詳情（避免無限循環）
  if (!playerModal.classList.contains("hidden") && modalPlayerName && modalPlayerName.textContent) {
    const currentNickname = modalPlayerName.textContent;
    // 使用 setTimeout 避免在 updateUI 執行過程中觸發
    setTimeout(() => {
      if (!playerModal.classList.contains("hidden") && modalPlayerName.textContent === currentNickname) {
        showPlayerDetails(currentNickname, null);
      }
    }, 100);
  }
}

// roleLabels 已移至 translations 中

let regionNames = null;

function updateRegionNames() {
  if (typeof Intl !== "undefined" && Intl.DisplayNames) {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  }
}

function buildRecordLeaderboard(users = []) {
  return users
    .map((u) => {
      const bestElo = Number.isFinite(u?.seasonResult?.highest)
        ? u.seasonResult.highest
        : Number.isFinite(u?.eloRate)
          ? u.eloRate
          : null;
      return {
        ...u,
        recordValue: bestElo,
      };
    })
    .filter((u) => u.recordValue !== null)
    .sort((a, b) => (b.recordValue ?? 0) - (a.recordValue ?? 0))
    .map((u, idx) => ({
      ...u,
      recordRank: idx + 1,
    }));
}

function getActiveDataset() {
  if (state.leaderboardType === "record") {
    return Array.isArray(state.recordUsers) ? state.recordUsers : [];
  }
  return Array.isArray(state.users) ? state.users : [];
}

function updateLeaderboardToggleUI() {
  if (!leaderboardToggleButtons) return;
  leaderboardToggleButtons.forEach((btn) => {
    const isActive = btn.dataset.leaderboardType === state.leaderboardType;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateLeaderboardCopy() {
  const isRecord = state.leaderboardType === "record";
  if (heroTitle) heroTitle.textContent = t(isRecord ? "ui.titleRecord" : "ui.title");
  if (heroSubtitle) heroSubtitle.textContent = t("ui.subtitleUnified");

  const statsGrid = document.querySelector(".stats-grid");
  if (statsGrid) {
    statsGrid.style.display = isRecord ? "none" : "";
  }

  const tableHeader = document.querySelector(".table-header h2");
  if (tableHeader) tableHeader.textContent = t(isRecord ? "ui.recordLeaderboard" : "ui.leaderboard");

  const ths = document.querySelectorAll("thead th");
  if (ths.length >= 5) {
    ths[0].textContent = t("ui.rank");
    ths[1].textContent = t("ui.player");
    ths[2].textContent = t(isRecord ? "ui.recordValue" : "ui.elo");
    ths[3].textContent = t("ui.country");
    ths[4].textContent = t(isRecord ? "ui.recordSeason" : "ui.phasePoints");
  }
  updateLeaderboardToggleUI();
}

function setLeaderboardType(type) {
  if (!["elo", "record"].includes(type)) return;
  if (state.leaderboardType === type && (type !== "record" || state.recordUsers.length)) return;
  state.leaderboardType = type;
  state.leaderboardPage = 1;
  updateLeaderboardToggleUI();
  updateLeaderboardCopy();

  if (type === "record" && !state.recordUsers.length && !state.recordLoading) {
    renderPlaceholder(t("ui.loadingData"));
    loadRecordLeaderboard().finally(() => {
      applySearch();
    });
    return;
  }

  applySearch();
}

// ============================================================================
// 玩家比賽快取系統 - 按需載入，避免一次抓取整季資料
// ============================================================================
const playerMatchesCache = new Map();
let currentPlayerAbortController = null;

/**
 * 取得或建立玩家的快取物件
 * @param {string} nickname - 玩家名稱
 * @returns {Object} 快取物件
 */
function getPlayerCache(nickname) {
  const key = nickname.toLowerCase();
  if (!playerMatchesCache.has(key)) {
    playerMatchesCache.set(key, {
      nickname: nickname,
      totalSeasonMatches: 0,      // 本季總場次（從 user API 取得）
      matches: [],                 // 已載入的 match list（由新到舊）
      beforeCursor: null,          // 下一頁游標（最舊一場的 id）
      isFetching: false,           // 避免同時多個載入請求
      fetchedMatchIds: new Set(),  // 去重用
      hasMoreMatches: true,        // 是否還有更多比賽可載入
      abortController: null,       // 請求取消控制器
    });
  }
  return playerMatchesCache.get(key);
}

/**
 * 清除指定玩家的快取
 * @param {string} nickname - 玩家名稱
 */
function clearPlayerCache(nickname) {
  const key = nickname.toLowerCase();
  const cache = playerMatchesCache.get(key);
  if (cache && cache.abortController) {
    cache.abortController.abort();
  }
  playerMatchesCache.delete(key);
}

/**
 * 清除所有玩家的快取
 */
function clearAllPlayerCaches() {
  for (const [key, cache] of playerMatchesCache) {
    if (cache.abortController) {
      cache.abortController.abort();
    }
  }
  playerMatchesCache.clear();
}

/**
 * 取消當前玩家的所有未完成請求
 */
function cancelCurrentPlayerRequests() {
  if (currentPlayerAbortController) {
    currentPlayerAbortController.abort();
    currentPlayerAbortController = null;
  }
}

/**
 * 獲取更多比賽（單次 API 請求）
 * @param {string} nickname - 玩家名稱
 * @param {number} batchSize - 每次獲取的數量（預設 50）
 * @returns {Promise<Array>} 新獲取的比賽列表
 */
async function fetchMoreMatchesBatch(nickname, batchSize = 50) {
  const cache = getPlayerCache(nickname);

  if (cache.isFetching) {
    console.log(`[Cache] Already fetching for ${nickname}, skipping`);
    return [];
  }

  if (!cache.hasMoreMatches) {
    console.log(`[Cache] No more matches for ${nickname}`);
    return [];
  }

  cache.isFetching = true;
  cache.abortController = new AbortController();

  try {
    // 構建 URL
    let url = `https://mcsrranked.com/api/users/${nickname}/matches?sort=newest&count=${batchSize}&type=2&t=${Date.now()}`;

    // 若有指定賽季，則僅抓取該賽季
    const seasonNumber = state.currentSeasonNumber;
    if (seasonNumber != null) {
      url += `&season=${seasonNumber}`;
    }

    // 使用 beforeCursor 進行分頁
    if (cache.beforeCursor) {
      url += `&before=${cache.beforeCursor}`;
    }

    console.log(`[Cache] Fetching batch for ${nickname}: ${url}`);

    const response = await fetch(url, {
      cache: "no-store",
      signal: cache.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (payload.status !== "success" || !payload.data || !Array.isArray(payload.data)) {
      cache.hasMoreMatches = false;
      return [];
    }

    const pageMatches = payload.data;

    if (pageMatches.length === 0) {
      cache.hasMoreMatches = false;
      return [];
    }

    // 去重並添加到快取
    const newMatches = [];
    for (const match of pageMatches) {
      if (match.id && !cache.fetchedMatchIds.has(match.id)) {
        cache.fetchedMatchIds.add(match.id);
        newMatches.push(match);
      }
    }

    // 添加到快取的 matches 陣列（保持由新到舊的順序）
    cache.matches.push(...newMatches);

    // 更新 beforeCursor 為最舊一場的 id
    if (pageMatches.length > 0) {
      cache.beforeCursor = pageMatches[pageMatches.length - 1].id;
    }

    // 判斷是否還有更多
    if (pageMatches.length < batchSize) {
      cache.hasMoreMatches = false;
    }

    console.log(`[Cache] Fetched ${newMatches.length} new matches for ${nickname}, total: ${cache.matches.length}`);

    return newMatches;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`[Cache] Request aborted for ${nickname}`);
    } else {
      console.error(`[Cache] Error fetching matches for ${nickname}:`, error);
    }
    return [];
  } finally {
    cache.isFetching = false;
    cache.abortController = null;
  }
}

/**
 * 確保已載入足夠的比賽數量
 * @param {string} nickname - 玩家名稱
 * @param {number} targetCount - 目標數量
 * @returns {Promise<Array>} 目前已載入的所有比賽
 */
async function ensureMatchesLoaded(nickname, targetCount) {
  const cache = getPlayerCache(nickname);

  // 若目標比已知總場次還大，動態提升預估總場次以便繼續抓取
  if ((cache.totalSeasonMatches || 0) < targetCount) {
    cache.totalSeasonMatches = targetCount;
  }

  // 如果已載入足夠或已確認沒有更多，直接返回
  if (cache.matches.length >= targetCount || !cache.hasMoreMatches) {
    return cache.matches;
  }

  const batchSize = 50;
  const need = targetCount - cache.matches.length;
  const batchCount = Math.ceil(need / batchSize);

  console.log(`[Cache] Need ${need} more matches for ${nickname}, fetching ${batchCount} batches`);

  for (let i = 0; i < batchCount; i++) {
    if (!cache.hasMoreMatches) break;

    // 按需抓取，不再依賴 totalSeasonMatches 的剩餘估算
    const remainingNeed = targetCount - cache.matches.length;
    const thisBatchSize = remainingNeed > 0 ? Math.min(batchSize, remainingNeed) : batchSize;

    await fetchMoreMatchesBatch(nickname, thisBatchSize);

    // 避免請求過快
    if (i < batchCount - 1 && cache.hasMoreMatches) {
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  return cache.matches;
}

/**
 * 初始化玩家快取（設定總場次等資訊）
 * @param {string} nickname - 玩家名稱
 * @param {Object} userData - 玩家資料
 * @param {Array} initialMatches - 初始載入的比賽
 */
function initPlayerCache(nickname, userData, initialMatches) {
  const cache = getPlayerCache(nickname);

  // 從統計資訊取得本季總場次（若缺失則稍後以 slider 需求回填）
  const seasonMatches = userData?.statistics?.season?.playedMatches?.ranked;
  cache.totalSeasonMatches = seasonMatches || 0;

  // 設定初始比賽
  cache.matches = [];
  cache.fetchedMatchIds.clear();

  for (const match of initialMatches) {
    if (match.id && !cache.fetchedMatchIds.has(match.id)) {
      cache.fetchedMatchIds.add(match.id);
      cache.matches.push(match);
    }
  }

  // 更新 beforeCursor
  if (initialMatches.length > 0) {
    cache.beforeCursor = initialMatches[initialMatches.length - 1].id;
  }

  // 判斷是否還有更多；若無總場數資訊但初始批次存在，先假設還有更多
  cache.hasMoreMatches = cache.totalSeasonMatches
    ? cache.matches.length < cache.totalSeasonMatches
    : (cache.matches.length > 0);

  console.log(`[Cache] Initialized for ${nickname}: ${cache.matches.length}/${cache.totalSeasonMatches} matches`);
}

async function loadLeaderboard() {
  toggleLoading(true);
  // 不再在畫面上顯示「Fetching latest data...」，只在按鈕與時間上反映狀態
  setStatus("");
  try {
    const payload = await fetchLeaderboard();

    const { season, users } = payload.data;

    // 保存當前賽季編號到狀態，供後續比賽查詢使用
    state.currentSeasonNumber = season?.number ?? null;

    state.users = users.slice(0, 150);
    // Record leaderboard 使用獨立 API，先清空，待切換時載入
    state.recordUsers = state.leaderboardType === "record" ? state.recordUsers : [];
    state.lastError = false;
    setSyncIndicatorState("ok", syncIndicator?.title);
    applySearch(); // 會觸發 render（使用目前的 leaderboardType）

    hydrateStats(season, state.users);
    updateTimestamp();
    // 成功更新時不再顯示「Data updated (Season #x)」，只在按鈕下方顯示最後更新時間
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(t("ui.failedToLoad"), true);
    if (!state.users.length) {
      renderPlaceholder(t("ui.noData"));
    }
    state.lastError = true;
    setSyncIndicatorState("error", syncIndicator?.title);
  } finally {
    toggleLoading(false);
  }
}

async function loadRecordLeaderboard() {
  try {
    state.recordLoading = true;
    setStatus(t("ui.loadingData"));
    const payload = await fetchRecordLeaderboard();

    state.recordUsers = payload.data.slice(0, 150).map((entry, idx) => {
      const user = entry.user || {};
      return {
        ...user,
        recordRank: entry.rank ?? idx + 1,
        recordTimeMs: entry.time ?? null,
        recordSeason: entry.season ?? null,
        recordId: entry.id,
        recordDate: entry.date,
      };
    });
    setStatus("");
    state.lastError = false;
    setSyncIndicatorState("ok", syncIndicator?.title);
    if (state.leaderboardType === "record") {
      applySearch();
    }
  } catch (error) {
    console.error(error);
    setStatus(t("ui.failedToLoad"), true);
    state.lastError = true;
    setSyncIndicatorState("error", syncIndicator?.title);
  } finally {
    state.recordLoading = false;
  }
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  const base = getActiveDataset();
  state.filtered = query
    ? base.filter((user) =>
      user.nickname.toLowerCase().includes(query),
    )
    : base;
  // 每次搜尋都回到第 1 頁
  state.leaderboardPage = 1;
  renderLeaderboard(state.filtered);
}

function hydrateStats(season, users) {
  seasonNumber.textContent = `#${season.number ?? "--"}`;
  seasonRange.textContent = `${formatDate(season.startsAt)} – ${formatDate(
    season.endsAt,
  )}`;

  if (users.length) {
    const highest = users[0];
    const avg =
      users.reduce((acc, { eloRate }) => acc + (eloRate ?? 0), 0) /
      users.length;
    const countries = new Set(
      users
        .map((user) => (user.country ? user.country.toUpperCase() : null))
        .filter(Boolean),
    );

    topElo.textContent = highest.eloRate.toLocaleString();
    topPlayer.textContent = highest.nickname;
    averageElo.textContent = Math.round(avg).toLocaleString();
    countryCount.textContent = countries.size || "--";
  } else {
    topElo.textContent = averageElo.textContent = countryCount.textContent =
      "--";
    topPlayer.textContent = "--";
  }
}

function renderLeaderboardPagination(totalPages) {
  if (!leaderboardPagination) return;

  if (!totalPages || totalPages <= 1) {
    leaderboardPagination.innerHTML = "";
    return;
  }

  const current = state.leaderboardPage || 1;
  let html = `
    <button class="page-btn" data-page="prev" ${current === 1 ? "disabled" : ""}>&lt;</button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === current ? "active" : ""}" data-page="${i}">${i}</button>`;
  }

  html += `
    <button class="page-btn" data-page="next" ${current === totalPages ? "disabled" : ""}>&gt;</button>
  `;

  leaderboardPagination.innerHTML = html;

  leaderboardPagination.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.page;
      let targetPage = current;
      if (val === "prev") {
        targetPage = Math.max(1, current - 1);
      } else if (val === "next") {
        targetPage = Math.min(totalPages, current + 1);
      } else {
        const parsed = parseInt(val, 10);
        if (!Number.isNaN(parsed)) targetPage = parsed;
      }

      if (targetPage !== state.leaderboardPage) {
        state.leaderboardPage = targetPage;
        renderLeaderboard(state.filtered);
      }
    });
  });
}

function renderLeaderboard(users) {
  updateLeaderboardCopy();
  if (!users.length) {
    renderPlaceholder(t("ui.noResults"));
    if (leaderboardPagination) leaderboardPagination.innerHTML = "";
    return;
  }

  const pageSize = state.leaderboardPageSize || 50;
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  if (!state.leaderboardPage || state.leaderboardPage > totalPages) {
    state.leaderboardPage = 1;
  }

  const startIndex = (state.leaderboardPage - 1) * pageSize;
  const pageUsers = users.slice(startIndex, startIndex + pageSize);
  const isRecordMode = state.leaderboardType === "record";

  const rows = pageUsers
    .map((user, idx) => {
      const displayRank = isRecordMode
        ? user.recordRank ?? startIndex + idx + 1
        : user.eloRank;
      let rankClass = "";
      if (displayRank === 1) {
        rankClass = "rank-1";
      } else if (displayRank === 2) {
        rankClass = "rank-2";
      } else if (displayRank === 3) {
        rankClass = "rank-3";
      }
      // 前三名已使用 rank-1/2/3 做特效，不再額外加 highlight，避免顏色被疊成灰霧感
      const highlightClass = "";
      return `
        <tr class="${highlightClass} ${rankClass}">
          <td>${displayRank ?? "--"}</td>
          <td class="player-cell">
            <div class="player-info">
              <img src="${getPlayerAvatar(user.uuid, 32)}" alt="${user.nickname}" class="player-avatar" loading="lazy" />
              <div class="player-text">
                <strong class="player-name-link" data-nickname="${user.nickname}" data-uuid="${user.uuid}">${user.nickname}</strong>
                <span>${user.uuid.slice(0, 8)}…</span>
              </div>
            </div>
          </td>
          <td class="${isRecordMode ? "record-cell" : "elo-cell"}">
            ${isRecordMode
          ? (() => {
            const recordVal = user.recordTimeMs;
            const recordDisplay = Number.isFinite(recordVal) ? formatFullMs(recordVal) : "--";
            return `
                      <div class="record-value-wrapper">
                        <span class="record-value">${recordDisplay}</span>
                        <span class="record-label">${user.recordSeason ? `${t("ui.recordSeason")} #${user.recordSeason}` : t("ui.recordNote")}</span>
                      </div>
                    `;
          })()
          : (() => {
            const eloData = formatEloWithRank(user.eloRate);
            return `
                      <div class="elo-rank-wrapper rank-${eloData.rank.name.toLowerCase()}">
                        <img src="${eloData.rank.iconUrl}" alt="${eloData.rank.name}" class="elo-rank-icon" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
                        <span class="elo-rank-icon-fallback" style="display: none;">${eloData.rank.icon}</span>
                        <span class="elo-value">${eloData.value}</span>
                        <span class="elo-rank-name">${eloData.displayName}</span>
                      </div>
                    `;
          })()
        }
          </td>
          <td>${formatCountry(user.country)}</td>
          <td>${isRecordMode
          ? (user.recordSeason ? `#${user.recordSeason}` : "--")
          : (user.seasonResult?.phasePoint ?? user.seasonResult?.last?.phasePoint ?? 0)
        }</td>
        </tr>
      `;
    })
    .join("");

  leaderboardBody.innerHTML = rows;

  // 綁定點擊事件到玩家名稱
  leaderboardBody.querySelectorAll(".player-name-link").forEach((link) => {
    link.addEventListener("click", () => {
      const nickname = link.dataset.nickname;
      const uuid = link.dataset.uuid;
      showPlayerDetails(nickname, uuid);
    });
  });

  renderLeaderboardPagination(totalPages);
}

function renderPlaceholder(message) {
  leaderboardBody.innerHTML = `<tr><td colspan="5" class="placeholder">${message}</td></tr>`;
}

function getCountryFlagUrl(code, useSvg = true) {
  if (!code || code.length !== 2) return null;
  try {
    const upper = code.toUpperCase();
    const lower = upper.toLowerCase();
    // 使用 flagcdn.com API
    // SVG 格式可以無損縮放，畫質最佳
    if (useSvg) {
      return `https://flagcdn.com/${lower}.svg`;
    }
    // 如果需要 PNG，使用較大尺寸以確保清晰度
    return `https://flagcdn.com/w80/${lower}.png`;
  } catch {
    return null;
  }
}

function formatCountry(code) {
  if (!code) return "—";
  try {
    const upper = code.toUpperCase();
    const flagUrl = getCountryFlagUrl(upper, true); // 使用 SVG 格式
    const countryName = regionNames ? regionNames.of(upper) : t("ui.unknownRegion");
    if (flagUrl) {
      return `<span class="country-flag-wrapper">
        <img src="${flagUrl}" alt="${upper}" class="country-flag" loading="lazy" onerror="this.style.display='none'" />
        <span class="country-name">${countryName}</span>
      </span>`;
    }
    return countryName;
  } catch {
    return code.toUpperCase();
  }
}

function initAutoRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(loadLeaderboard, REFRESH_INTERVAL_MS);
}

if (syncIndicator) {
  syncIndicator.addEventListener("click", async () => {
    setSyncIndicatorState("syncing", t("ui.loadingData"));
    await loadLeaderboard();
    if (state.leaderboardType === "record") {
      renderPlaceholder(t("ui.loadingData"));
      await loadRecordLeaderboard();
    }
    applySearch();
  });
}
searchInput.addEventListener("input", () => {
  applySearch();
  setStatus(
    searchInput.value
      ? t("ui.applySearch", { query: searchInput.value })
      : t("ui.showAll"),
  );
});

leaderboardToggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setLeaderboardType(btn.dataset.leaderboardType);
  });
});

// 查詢玩家功能
function handlePlayerLookup() {
  const nickname = playerLookupInput.value.trim();
  if (!nickname) {
    setStatus(t("ui.enterPlayerId"), true);
    return;
  }

  setStatus(t("ui.searching", { name: nickname }));
  showPlayerDetails(nickname, null);
}

lookupBtn.addEventListener("click", handlePlayerLookup);
playerLookupInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handlePlayerLookup();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadLeaderboard();
  }
});

// 模態框事件
modalOverlay.addEventListener("click", closeModal);
modalClose.addEventListener("click", closeModal);

if (modalExpand) {
  modalExpand.addEventListener("click", () => {
    if (!playerModal) return;
    playerModal.classList.toggle("fullscreen");
  });
}

if (modalCompare) {
  modalCompare.addEventListener("click", async () => {
    if (!modalBody || !modalBody._playerData) {
      alert(t("ui.loadingPlayerInfo"));
      return;
    }
    const baseData = modalBody._playerData;
    const baseMatches = modalBody._matchesList || [];

    const input = prompt(t("ui.comparePrompt"), "");
    if (!input) return;
    const otherNickname = input.trim();
    if (!otherNickname) return;

    // 進入比較模式時，自動全螢幕以增加可視寬度
    if (playerModal) {
      playerModal.classList.add("fullscreen");
    }

    modalBody.innerHTML = `<div class="loading-spinner">${t("ui.loadingPlayerInfo")}</div>`;

    try {
      const { userData: otherData, matches: otherMatches } = await loadPlayerAndMatches(otherNickname);
      renderPlayerCompareView(baseData, baseMatches, otherData, otherMatches);
      if (modalPlayerName) {
        modalPlayerName.textContent = `${baseData.nickname || ""} vs ${otherData.nickname || otherNickname}`;
      }
    } catch (error) {
      console.error("Compare players failed:", error);
      modalBody.innerHTML = `<div class="error-message">${t("ui.failedToLoadPlayer", { error: error.message })}</div>`;
    }
  });
}

// 截圖功能
async function capturePlayerDetails() {
  console.log("截圖功能被觸發");

  // 等待 html2canvas 載入（如果還沒載入）
  let html2canvasFunc = null;

  // 檢查多種可能的位置
  if (typeof window !== "undefined" && window.html2canvas) {
    html2canvasFunc = window.html2canvas;
  } else if (typeof html2canvas !== "undefined") {
    html2canvasFunc = html2canvas;
  } else {
    // 嘗試等待載入
    let attempts = 0;
    while (attempts < 10 && !html2canvasFunc) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.html2canvas) {
        html2canvasFunc = window.html2canvas;
        break;
      }
      attempts++;
    }
  }

  if (!html2canvasFunc) {
    const errorMsg = "html2canvas library not loaded. Please check your internet connection and refresh the page.";
    console.error(errorMsg);
    console.log("window.html2canvas:", window.html2canvas);
    console.log("typeof html2canvas:", typeof html2canvas);
    console.log("window.html2canvasLoaded:", window.html2canvasLoaded);
    setStatus(t("ui.screenshotError", { error: errorMsg }), true);
    alert(errorMsg);
    return;
  }

  const modalContent = document.querySelector(".modal-content");
  if (!modalContent) {
    const errorMsg = "Content not found";
    console.error(errorMsg);
    setStatus(t("ui.screenshotError", { error: errorMsg }), true);
    return;
  }

  // 獲取截圖按鈕（可能需要在運行時重新獲取）
  const screenshotBtn = document.getElementById("modal-screenshot");
  if (!screenshotBtn) {
    console.error("截圖按鈕元素未找到");
    return;
  }

  // 顯示載入狀態
  const originalText = screenshotBtn.textContent;
  screenshotBtn.disabled = true;
  screenshotBtn.textContent = "⏳";

  try {
    // 使用 html2canvas 截圖
    console.log("開始截圖...");

    // 獲取模態框的完整尺寸（包括滾動內容）
    const modalBody = document.querySelector(".modal-body");
    const fullHeight = Math.max(
      modalContent.scrollHeight,
      modalContent.offsetHeight,
      modalBody ? modalBody.scrollHeight : 0
    );
    const fullWidth = Math.max(
      modalContent.scrollWidth,
      modalContent.offsetWidth
    );

    console.log("模態框尺寸:", { width: fullWidth, height: fullHeight });

    const canvas = await html2canvasFunc(modalContent, {
      backgroundColor: "#111a2b",
      scale: 2, // 提高解析度
      logging: false,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      onclone: (doc) => {
        // 解除克隆節點中的高度與滾動限制，確保能截取完整內容
        const clonedModal = doc.querySelector(".modal-content");
        const clonedBody = doc.querySelector(".modal-body");
        const clonedOverlay = doc.getElementById("modal-overlay");
        const clonedRoot = doc.getElementById("player-modal");
        if (clonedRoot) {
          clonedRoot.classList.remove("hidden");
        }
        if (clonedOverlay) {
          clonedOverlay.style.display = "none";
        }
        if (clonedModal) {
          clonedModal.style.maxHeight = "none";
          clonedModal.style.height = "auto";
          clonedModal.style.overflow = "visible";
        }
        if (clonedBody) {
          clonedBody.style.maxHeight = "none";
          clonedBody.style.height = "auto";
          clonedBody.style.overflow = "visible";
        }
      },
    });
    console.log("截圖完成，開始下載...");

    // 轉換為圖片並下載
    const playerName = modalPlayerName.textContent || "player";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `MCSR_${playerName}_${timestamp}.png`;

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus(t("ui.screenshotSaved", { filename }));
    }, "image/png");

  } catch (error) {
    console.error("截圖失敗：", error);
    setStatus(t("ui.screenshotError", { error: error.message }), true);
  } finally {
    const screenshotBtn = document.getElementById("modal-screenshot");
    if (screenshotBtn) {
      screenshotBtn.disabled = false;
      screenshotBtn.textContent = originalText;
    }
  }
}

// 綁定截圖按鈕事件（使用事件委派，確保動態創建的按鈕也能工作）
if (modalScreenshot) {
  modalScreenshot.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    capturePlayerDetails();
  });
} else {
  console.warn("截圖按鈕未找到");
}

// 也使用事件委派作為備用方案
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "modal-screenshot") {
    e.preventDefault();
    e.stopPropagation();
    capturePlayerDetails();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !playerModal.classList.contains("hidden")) {
    closeModal();
  }
});

function closeModal() {
  playerModal.classList.add("hidden");
  playerModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  cancelCurrentPlayerRequests();
}

function openModal() {
  playerModal.classList.remove("hidden");
  playerModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function loadPlayerAndMatches(nickname) {
  // 取消之前的請求
  cancelCurrentPlayerRequests();
  currentPlayerAbortController = new AbortController();

  try {
    // 只抓取最近 50 場比賽（一次 API 最大值）
    const INITIAL_MATCHES_COUNT = 50;
    const seasonNumber = state.currentSeasonNumber ?? null;

    const [userData, matches] = await Promise.all([
      fetchUserProfile(nickname, currentPlayerAbortController.signal),
      fetchUserMatches({
        nickname,
        season: seasonNumber,
        count: INITIAL_MATCHES_COUNT,
        type: 2,
        signal: currentPlayerAbortController.signal,
      }),
    ]);

    // 初始化玩家快取（設定總場次，供後續按需載入使用）
    initPlayerCache(nickname, userData, matches || []);

    return { userData, matches: matches || [] };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`[Fast Load] Request aborted for ${nickname}`);
      throw new Error("Request cancelled");
    }
    console.error("Error loading player and matches:", error);
    if (error.message === "not found") {
      throw new Error(t("ui.playerNotFound"));
    }
    throw error;
  }
}

async function showPlayerDetails(nickname, uuid) {
  openModal();
  modalPlayerName.textContent = nickname;
  modalBody.innerHTML = `<div class="loading-spinner">${t("ui.loadingPlayerInfo")}</div>`;

  try {
    const { userData, matches } = await loadPlayerAndMatches(nickname);
    renderPlayerDetails(userData, matches, nickname);
    setStatus(t("ui.playerInfoLoaded", { name: nickname }));
    // 清空查詢輸入框
    if (playerLookupInput) {
      playerLookupInput.value = "";
    }
  } catch (error) {
    modalBody.innerHTML = `<div class="error-message">${t("ui.failedToLoadPlayer", { error: error.message })}</div>`;
    setStatus(`${t("ui.searching", { name: nickname })}: ${error.message}`, true);
  }
}

function renderPlayerDetails(data, matches = [], nickname = "") {
  const stats = data.statistics || {};
  const seasonStats = stats.season || {};
  const totalStats = stats.total || {};
  const timestamp = data.timestamp || {};
  const connections = data.connections || {};
  const seasonResult = data.seasonResult || {};
  const achievements = data.achievements || {};

  // 更新 modal header 為新的設計（按照圖片樣式）
  const modalHeader = document.querySelector(".modal-header");
  if (modalHeader) {
    const eloData = data.eloRate !== undefined && data.eloRate !== null ? formatEloWithRank(data.eloRate) : null;
    modalHeader.innerHTML = `
      <div class="modal-header-player-info">
        <img src="${getPlayerAvatar(data.uuid, 48)}" alt="${nickname || data.nickname}" class="modal-header-avatar" loading="lazy" />
        <div class="modal-header-player-details">
          <div class="modal-header-player-name">${nickname || data.nickname}</div>
        </div>
      </div>
      <div class="modal-header-actions">
        <button class="modal-expand" id="modal-expand" aria-label="Expand / Restore" title="Expand / Restore">
          🔍
        </button>
        <button class="modal-compare" id="modal-compare" aria-label="Compare Player" title="Compare Player">
          🔀
        </button>
        <button class="modal-screenshot" id="modal-screenshot" aria-label="Save Screenshot" title="Save Screenshot">
          📸
        </button>
        <button class="modal-close" id="modal-close" aria-label="Close">✕</button>
      </div>
    `;

    // 重新綁定事件監聽器（因為按鈕是動態創建的）
    const newModalClose = document.getElementById("modal-close");
    const newModalExpand = document.getElementById("modal-expand");
    const newModalCompare = document.getElementById("modal-compare");
    const newModalScreenshot = document.getElementById("modal-screenshot");

    if (newModalClose) {
      newModalClose.addEventListener("click", closeModal);
    }
    if (newModalExpand) {
      newModalExpand.addEventListener("click", () => {
        const modal = document.getElementById("player-modal");
        if (modal) {
          modal.classList.toggle("fullscreen");
        }
      });
    }
    if (newModalCompare) {
      newModalCompare.addEventListener("click", async () => {
        if (!modalBody || !modalBody._playerData) {
          alert(t("ui.loadingPlayerInfo"));
          return;
        }
        const baseData = modalBody._playerData;
        const baseMatches = modalBody._matchesList || [];

        const input = prompt(t("ui.comparePrompt"), "");
        if (!input) return;
        const otherNickname = input.trim();
        if (!otherNickname) return;

        // 進入比較模式時，自動全螢幕以增加可視寬度
        const playerModal = document.getElementById("player-modal");
        if (playerModal) {
          playerModal.classList.add("fullscreen");
        }

        modalBody.innerHTML = `<div class="loading-spinner">${t("ui.loadingPlayerInfo")}</div>`;

        try {
          const { userData: otherData, matches: otherMatches } = await loadPlayerAndMatches(otherNickname);
          renderPlayerCompareView(baseData, baseMatches, otherData, otherMatches);
          const modalPlayerName = document.getElementById("modal-player-name");
          if (modalPlayerName) {
            modalPlayerName.textContent = `${baseData.nickname || ""} vs ${otherData.nickname || otherNickname}`;
          }
        } catch (error) {
          console.error("Compare players failed:", error);
          modalBody.innerHTML = `<div class="error-message">${t("ui.failedToLoadPlayer", { error: error.message })}</div>`;
        }
      });
    }
    if (newModalScreenshot) {
      newModalScreenshot.addEventListener("click", () => {
        takeScreenshot();
      });
    }
  }

  modalBody.innerHTML = `
    <div class="player-details">
      <!-- 分頁標籤（導航欄） -->
      <div class="player-tabs">
        <button class="player-tab active" data-tab="overview">${t("ui.tabOverview")}</button>
        <button class="player-tab ${matches.length > 0 || seasonStats.playedMatches?.ranked > 0 ? "" : "disabled"}" data-tab="matches" ${matches.length > 0 || seasonStats.playedMatches?.ranked > 0 ? "" : "disabled"}>${t("ui.tabMatches")}${seasonStats.playedMatches?.ranked > 0 ? ` (${seasonStats.playedMatches.ranked})` : (matches.length > 0 ? ` (${matches.length})` : "")}</button>
        <button class="player-tab ${matches.length > 0 || seasonStats.playedMatches?.ranked > 0 ? "" : "disabled"}" data-tab="elotrend" ${matches.length > 0 || seasonStats.playedMatches?.ranked > 0 ? "" : "disabled"}>${t("ui.tabEloTrend")}</button>
      </div>

      <!-- 概覽分頁 -->
      <div class="player-tab-content active" data-tab-content="overview">

      <!-- 基本資訊 -->
      <section class="detail-section">
        <h3>${t("ui.basicInfo")}</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">${t("ui.eloScore")}</span>
            <span class="detail-value">
              ${(() => {
      if (!data.eloRate && data.eloRate !== 0) return "--";
      const eloData = formatEloWithRank(data.eloRate);
      return `
                  <div class="elo-rank-wrapper rank-${eloData.rank.name.toLowerCase()}">
                    <img src="${eloData.rank.iconUrl}" alt="${eloData.rank.name}" class="elo-rank-icon" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
                    <span class="elo-rank-icon-fallback" style="display: none;">${eloData.rank.icon}</span>
                    <span class="elo-value">${eloData.value}</span>
                    <span class="elo-rank-name">${eloData.displayName}</span>
                  </div>
                `;
    })()}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.rankNum")}</span>
            <span class="detail-value">#${data.eloRank ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.role")}</span>
            <span class="detail-value">${t(`role.${data.roleType}`) ?? t("role.0")}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.countryRegion")}</span>
            <span class="detail-value">${formatCountry(data.country)}</span>
          </div>
        </div>
      </section>

      <!-- 賽季統計 -->
      <section class="detail-section">
        <h3>${t("ui.seasonStats")}</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">${t("ui.bestTime")}</span>
            <span class="detail-value">${formatTime(seasonStats.bestTime?.ranked)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.matches")}</span>
            <span class="detail-value">${seasonStats.playedMatches?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.wins")}</span>
            <span class="detail-value">${seasonStats.wins?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.loses")}</span>
            <span class="detail-value">${seasonStats.loses?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.completions")}</span>
            <span class="detail-value">${seasonStats.completions?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.forfeits")}</span>
            <span class="detail-value">${seasonStats.forfeits?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.highestWinStreak")}</span>
            <span class="detail-value">${seasonStats.highestWinStreak?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.currentWinStreak")}</span>
            <span class="detail-value">${seasonStats.currentWinStreak?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.playtime")}</span>
            <span class="detail-value">${formatDuration(seasonStats.playtime?.ranked)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.completionTime")}</span>
            <span class="detail-value">${formatDuration(seasonStats.completionTime?.ranked)}</span>
          </div>
        </div>
      </section>

      <!-- 總計統計 -->
      <section class="detail-section">
        <h3>${t("ui.totalStats")}</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">${t("ui.bestTime")}</span>
            <span class="detail-value">${formatTime(totalStats.bestTime?.ranked)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.matches")}</span>
            <span class="detail-value">${totalStats.playedMatches?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.wins")}</span>
            <span class="detail-value">${totalStats.wins?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.loses")}</span>
            <span class="detail-value">${totalStats.loses?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.completions")}</span>
            <span class="detail-value">${totalStats.completions?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.forfeits")}</span>
            <span class="detail-value">${totalStats.forfeits?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.highestWinStreak")}</span>
            <span class="detail-value">${totalStats.highestWinStreak?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.currentWinStreak")}</span>
            <span class="detail-value">${totalStats.currentWinStreak?.ranked?.toLocaleString() ?? "--"}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.playtime")}</span>
            <span class="detail-value">${formatDuration(totalStats.playtime?.ranked)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t("ui.completionTime")}</span>
            <span class="detail-value">${formatDuration(totalStats.completionTime?.ranked)}</span>
          </div>
        </div>
      </section>

      <!-- 賽季結果 -->
      ${seasonResult.last || seasonResult.highest || seasonResult.lowest ? `
      <section class="detail-section">
        <h3>${t("ui.seasonResult")}</h3>
        <div class="detail-grid">
          ${seasonResult.highest ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.highestElo2")}</span>
            <span class="detail-value">${seasonResult.highest.toLocaleString()}</span>
          </div>
          ` : ""}
          ${seasonResult.lowest ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.lowestElo")}</span>
            <span class="detail-value">${seasonResult.lowest.toLocaleString()}</span>
          </div>
          ` : ""}
          ${seasonResult.last?.phasePoint !== undefined ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.phasePoint")}</span>
            <span class="detail-value">${seasonResult.last.phasePoint}</span>
          </div>
          ` : ""}
        </div>
        ${seasonResult.phases && seasonResult.phases.length > 0 ? `
        <div class="phases-list">
          <h4>${t("ui.phasePerformance")}</h4>
          ${seasonResult.phases.map(phase => `
            <div class="phase-item">
              <span>${t("ui.phase")} ${phase.phase}</span>
              <span>Elo: ${phase.eloRate?.toLocaleString() ?? "--"}</span>
              <span>${t("ui.rankNum")}: #${phase.eloRank ?? "--"}</span>
              <span>${t("ui.phasePoint")}: ${phase.point ?? "--"}</span>
            </div>
          `).join("")}
        </div>
        ` : ""}
      </section>
      ` : ""}

      <!-- 時間戳記 -->
      ${timestamp.firstOnline || timestamp.lastOnline || timestamp.lastRanked ? `
      <section class="detail-section">
        <h3>${t("ui.timeInfo")}</h3>
        <div class="detail-grid">
          ${timestamp.firstOnline ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.firstOnline")}</span>
            <span class="detail-value">${formatDateTime(timestamp.firstOnline)}</span>
          </div>
          ` : ""}
          ${timestamp.lastOnline ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.lastOnline")}</span>
            <span class="detail-value">${formatDateTime(timestamp.lastOnline)}</span>
          </div>
          ` : ""}
          ${timestamp.lastRanked ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.lastRanked")}</span>
            <span class="detail-value">${formatDateTime(timestamp.lastRanked)}</span>
          </div>
          ` : ""}
          ${timestamp.nextDecay ? `
          <div class="detail-item">
            <span class="detail-label">${t("ui.nextDecay")}</span>
            <span class="detail-value">${formatDateTime(timestamp.nextDecay)}</span>
          </div>
          ` : ""}
        </div>
      </section>
      ` : ""}

      <!-- 社交連結 -->
      ${connections.discord || connections.youtube || connections.twitch ? `
      <section class="detail-section">
        <h3>${t("ui.socialLinks")}</h3>
        <div class="connections-list">
          ${connections.discord ? `
          <a href="https://discord.com/users/${connections.discord.id}" target="_blank" rel="noopener" class="connection-link">
            <span>Discord</span>
            <span>${connections.discord.name || connections.discord.id}</span>
          </a>
          ` : ""}
          ${connections.youtube ? `
          <a href="https://youtube.com/channel/${connections.youtube.id}" target="_blank" rel="noopener" class="connection-link">
            <span>YouTube</span>
            <span>${connections.youtube.name || connections.youtube.id}</span>
          </a>
          ` : ""}
          ${connections.twitch ? `
          <a href="https://twitch.tv/${connections.twitch.id}" target="_blank" rel="noopener" class="connection-link">
            <span>Twitch</span>
            <span>${connections.twitch.name || connections.twitch.id}</span>
          </a>
          ` : ""}
        </div>
      </section>
      ` : ""}

      <!-- 成就 -->
      ${achievements.display && achievements.display.length > 0 ? `
      <section class="detail-section">
        <h3>${t("ui.displayAchievements")}</h3>
        <div class="achievements-list">
          ${achievements.display.map(ach => {
      const badgeUrl = getAchievementBadgeUrl(ach.id, ach.level);
      const fallbackIcon = getAchievementIcon(ach.id);
      return `
            <div class="achievement-item">
              <div class="achievement-badge-wrapper">
                <img src="${badgeUrl}" alt="${formatAchievementName(ach.id)}" class="achievement-badge" loading="lazy" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="achievement-badge-fallback" style="display: none;">
                  <span class="achievement-icon">${fallbackIcon}</span>
                  ${ach.level ? `<span class="achievement-badge-level">${ach.level}</span>` : ""}
                </div>
              </div>
              <div class="achievement-info">
                <span class="achievement-name">${formatAchievementName(ach.id)}</span>
                ${ach.level ? `<span class="achievement-level">${t("ui.level")} ${ach.level}</span>` : ""}
                ${ach.value !== null && ach.value !== undefined ? `<span class="achievement-value">${ach.value.toLocaleString()}</span>` : ""}
                ${ach.date ? `<span class="achievement-date">${formatDateTime(ach.date)}</span>` : ""}
              </div>
            </div>
            `;
    }).join("")}
        </div>
      </section>
      ` : ""}
      </div>

      <!-- 比賽記錄分頁 -->
      <div class="player-tab-content" data-tab-content="matches">
        ${matches.length > 0 || seasonStats.playedMatches?.ranked > 0 ? `
        <section class="detail-section">
          <h3>${t("ui.recentMatches")} (<span id="matches-loaded-count">${matches.length}</span>/<span id="matches-total-count">${seasonStats.playedMatches?.ranked || matches.length}</span> ${t("ui.matchesCount")})</h3>
          <div class="matches-list" id="matches-list-container">
            ${matches.slice(0, 20).map((match, i) => {
      const selfPlayer = match.players.find(p => p.uuid === data.uuid);
      const isSelfForfeit = !!selfPlayer?.forfeited;
      const hasWinner = !!match.result?.uuid;
      const isWinner = hasWinner && match.result?.uuid === data.uuid;
      const isDraw = !hasWinner && !isSelfForfeit;
      const opponent = match.players.find(p => p.uuid !== data.uuid);
      const eloChange = match.changes?.find(c => c.uuid === data.uuid);
      const matchVod = match.vod?.find(v => v.uuid === data.uuid);

      let statusClass;
      let statusLabel;
      if (isSelfForfeit) {
        statusClass = "forfeit";
        statusLabel = t("ui.forfeit");
      } else if (isDraw) {
        statusClass = "draw";
        statusLabel = t("ui.draw");
      } else if (isWinner) {
        statusClass = "win";
        statusLabel = t("ui.victory");
      } else {
        statusClass = "loss";
        statusLabel = t("ui.defeat");
      }

      const matchItemClass = isSelfForfeit
        ? "match-forfeit"
        : isDraw
          ? "match-draw"
          : isWinner
            ? "match-win"
            : "match-loss";

      return `
              <div class="match-item ${matchItemClass}" data-index="${i}">
                <div class="match-header">
                  <div class="match-result">
                    <span class="match-status ${statusClass}">${statusLabel}</span>
                    ${isSelfForfeit ? `<span class="forfeit-badge">${t("ui.forfeit")}</span>` : ""}
                    ${eloChange ? `<span class="elo-change ${eloChange.change > 0 ? "positive" : "negative"}">${eloChange.change > 0 ? "+" : ""}${eloChange.change}</span>` : ""}
                  </div>
                  <div class="match-date">${formatDateTime(match.date)}</div>
                </div>
                <div class="match-details">
                  <div class="match-opponent">
                    <strong>${t("ui.opponent")}：</strong>
                    ${opponent ? `
                    <div class="opponent-info">
                      <img src="${getPlayerAvatar(opponent.uuid, 24)}" alt="${opponent.nickname}" class="opponent-avatar" loading="lazy" />
                      <span class="opponent-name-link" data-nickname="${opponent.nickname}" data-uuid="${opponent.uuid}">${opponent.nickname}</span>
                      <span class="opponent-elo">(${opponent.eloRate?.toLocaleString() ?? "--"} Elo)</span>
                    </div>
                    ` : t("ui.unknown")}
                  </div>
                  ${match.result?.time ? `
                  <div class="match-time">
                    <strong>${t("ui.time")}：</strong>${formatTime(match.result.time)}
                  </div>
                  ` : ""}
                  <div class="match-seed">
                    <strong>${t("ui.seed")}：</strong>
                    <span>${formatSeedType(match.seedType)} / ${formatBastionType(match.bastionType)}</span>
                    ${match.seed?.id ? `<span class="seed-id" title="${t("ui.seed")} ID">${match.seed.id}</span>` : ""}
                  </div>
                  ${matchVod ? `
                  <div class="match-vod">
                    <a href="${matchVod.url}" target="_blank" rel="noopener" class="vod-link">
                      📹 ${t("ui.watchVod")}
                    </a>
                  </div>
                  ` : ""}
                </div>
              </div>
              `;
    }).join("")}
          </div>
          ${(() => {
        const totalMatches = seasonStats.playedMatches?.ranked || matches.length;
        const remaining = totalMatches - matches.length;
        if (remaining > 0) {
          return `
              <div class="load-more-matches-container">
                <button id="load-more-matches-btn" class="load-more-matches-btn" data-nickname="${nickname || data.nickname}">
                  ${t("ui.loadMoreMatchesRemaining", { remaining: remaining })}
                </button>
              </div>`;
        } else if (matches.length > 20) {
          // 已載入全部但還沒顯示完
          return `
              <div class="load-more-matches-container">
                <button id="load-more-matches-btn" class="load-more-matches-btn" data-nickname="${nickname || data.nickname}">
                  ${t("ui.loadMoreMatches")} (${matches.length - 20} ${t("ui.matchesCount")})
                </button>
              </div>`;
        }
        return "";
      })()}
        </section>
        ` : `
        <section class="detail-section">
          <div class="empty-matches">${t("ui.noMatches")}</div>
        </section>
        `}
      </div>

      <!-- Elo 趨勢圖分頁 -->
      <div class="player-tab-content" data-tab-content="elotrend">
        <section class="detail-section">
          <h3>${t("ui.eloTrend")}</h3>
          
          <div class="elo-chart-wrapper">
            <div class="elo-chart-container">
              <canvas id="elo-trend-chart"></canvas>
              <canvas id="elo-chart-crosshair" class="chart-crosshair-overlay"></canvas>
            </div>
            
            <!-- 圖表選項控制面板 -->
            <div class="chart-controls">
            <div class="chart-controls-main">
              <!-- 左側：顯示選項 -->
              <div class="chart-control-group chart-group-display">
                <div class="chart-group-label">Display</div>
                <div class="chart-group-content">
                  <label class="cyberpunk-checkbox-label">
                    <input type="checkbox" id="show-grid-checkbox" class="cyberpunk-checkbox" checked>
                    ${t("ui.showGrid")}
                  </label>
                  <label class="cyberpunk-checkbox-label">
                    <input type="checkbox" id="show-points-checkbox" class="cyberpunk-checkbox" checked>
                    ${t("ui.showPoints")}
                  </label>
                </div>
              </div>
              
              <!-- 中間：圖表類型 -->
              <div class="chart-control-group chart-group-type">
                <div class="chart-group-label">Chart Type</div>
                <div class="chart-group-content">
                  <div class="segmented-control" id="chart-type-segmented">
                    <button type="button" class="segmented-option" data-value="line">
                      ${t("ui.chartTypeLine")}
                    </button>
                    <button type="button" class="segmented-option active" data-value="area">
                      ${t("ui.chartTypeArea")}
                    </button>
                  </div>
                  <input type="hidden" id="chart-type-select" value="area">
                </div>
              </div>
              
              <!-- 中間：範圍控制 -->
              <div class="chart-control-group chart-group-range">
                <div class="chart-group-label">Range</div>
                <div class="chart-group-content">
                  <div class="chart-range-wrapper">
                  <label class="chart-range-label">
                    <span>Matches</span>
                    <span class="chart-range-value" id="match-range-value">20</span>
                  </label>
                  <input 
                      type="range" 
                      id="time-range-slider" 
                      class="chart-range-slider"
                      min="20" 
                      max="20" 
                      value="20"
                      step="1"
                    >
                    <div class="chart-visible-meta">
                      <span class="chart-visible-label">${t("ui.visibleMatches")}</span>
                      <span class="chart-visible-value" id="visible-matches-count">--</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 右側：工具按鈕 -->
              <div class="chart-control-group chart-group-tools">
                <div class="chart-group-label">Tools</div>
                <div class="chart-group-content">
                  <button id="crosshair-toggle-btn" class="chart-btn" title="Toggle Crosshair">
                    <span class="chart-btn-icon">✚</span>
                    Crosshair
                  </button>
                  <button id="reset-zoom-btn" class="chart-btn">
                    <span class="chart-btn-icon">↻</span>
                    ${t("ui.resetZoom")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>
    </div>
  `;

  // 綁定分頁切換事件
  setTimeout(() => {
    modalBody.querySelectorAll(".player-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        if (tab.classList.contains("disabled")) return;

        const targetTab = tab.dataset.tab;
        const allTabs = modalBody.querySelectorAll(".player-tab");
        const allContents = modalBody.querySelectorAll(".player-tab-content");

        // 移除所有 active 類
        allTabs.forEach(t => t.classList.remove("active"));
        allContents.forEach(c => c.classList.remove("active"));

        // 添加 active 類到選中的標籤和內容
        tab.classList.add("active");
        const targetContent = modalBody.querySelector(`[data-tab-content="${targetTab}"]`);
        if (targetContent) {
          targetContent.classList.add("active");

          // 如果切換到 Elo 趨勢分頁，渲染圖表
          if (targetTab === "elotrend") {
            // 使用 setTimeout 確保 DOM 已更新
            setTimeout(() => {
              renderEloTrendChart(modalBody._playerData, modalBody._matchesList);
              setupChartControls(modalBody._playerData, modalBody._matchesList);
            }, 100);
          }
        }
      });
    });

    // 綁定對手名稱點擊事件
    modalBody.querySelectorAll(".opponent-name-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const nickname = link.dataset.nickname;
        const uuid = link.dataset.uuid;
        showPlayerDetails(nickname, uuid);
      });
    });

    // 保存 matches 到 modalBody 以便後續使用
    modalBody._matchesList = matches || [];
    modalBody._playerUuid = data.uuid;
    modalBody._playerData = data;
    modalBody._displayedMatchesCount = Math.min(20, matches.length); // 記錄已顯示的比賽數量

    // 綁定載入更多比賽按鈕
    const loadMoreBtn = modalBody.querySelector("#load-more-matches-btn");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        loadMoreMatches(modalBody, data);
      });
    }

    // 綁定比賽項目點擊事件
    const matchItems = modalBody.querySelectorAll(".match-item");
    console.log("Found match items:", matchItems.length, "matches list:", modalBody._matchesList.length);

    matchItems.forEach((item, idx) => {
      // 確保 data-index 屬性存在
      if (!item.dataset.index) {
        item.dataset.index = idx.toString();
      }

      item.style.cursor = "pointer";
      item.addEventListener("click", (e) => {
        // 忽略內部的連結點擊
        if (e.target.closest("a") || e.target.closest(".vod-link") || e.target.closest(".opponent-name-link")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const index = Number(item.dataset.index || idx);
        console.log("Match item clicked, index:", index, "matches list length:", modalBody._matchesList?.length);

        if (index >= 0 && modalBody._matchesList && modalBody._matchesList[index]) {
          console.log("Opening match modal for match:", modalBody._matchesList[index]);
          try {
            openMatchModal(modalBody._matchesList[index], modalBody._playerUuid);
          } catch (error) {
            console.error("Error opening match modal:", error);
          }
        } else {
          console.warn("Invalid match index or match not found", {
            index,
            listLength: modalBody._matchesList?.length,
            hasList: !!modalBody._matchesList,
            match: modalBody._matchesList?.[index]
          });
        }
      });
    });
  }, 0);
}

function renderPlayerCompareView(playerA, matchesA, playerB, matchesB) {
  const statsA = playerA.statistics || {};
  const seasonA = statsA.season || {};
  const totalA = statsA.total || {};
  const timestampA = playerA.timestamp || {};
  const connectionsA = playerA.connections || {};
  const achievementsA = playerA.achievements || {};

  const statsB = playerB.statistics || {};
  const seasonB = statsB.season || {};
  const totalB = statsB.total || {};
  const timestampB = playerB.timestamp || {};
  const connectionsB = playerB.connections || {};
  const achievementsB = playerB.achievements || {};

  // 為每一種類型的卡片建立一個 cell，之後依序輸出 A 再 B，
  // 利用 CSS Grid (2 欄) 讓同一列的左右卡片高度自動對齊
  function buildHeaderCard(player) {
    const nickname = player.nickname || "";
    const eloRate = player.eloRate;
    const eloInfo = eloRate || eloRate === 0 ? formatEloWithRank(eloRate) : null;
    const country = formatCountry(player.country);

    return `
      <section class="detail-section player-header-section player-compare-card">
          <div class="player-header">
            <img src="${getPlayerAvatar(player.uuid, 64)}" alt="${nickname}" class="player-avatar-large" loading="lazy" />
            <div class="player-header-info">
              <h3 class="player-header-name">${nickname}</h3>
              <div class="player-header-badges">
                ${player.eloRank ? `<span class="rank-badge">#${player.eloRank}</span>` : ""}
                ${eloInfo ? `<span class="elo-badge rank-${eloInfo.rank.name.toLowerCase()}-badge">
                  <img src="${eloInfo.rank.iconUrl}" alt="${eloInfo.rank.name}" class="elo-badge-icon" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
                  <span class="elo-badge-icon-fallback" style="display: none;">${eloInfo.rank.icon}</span>
                  ${eloInfo.value} Elo · ${eloInfo.displayName}
                </span>` : ""}
                ${player.roleType !== undefined ? `<span class="role-badge">${t(`role.${player.roleType}`) ?? t("role.0")}</span>` : ""}
              </div>
            </div>
          </div>
        </section>
    `;
  }

  function buildBasicInfoCard(player) {
    const country = formatCountry(player.country);
    const eloRate = player.eloRate;
    const eloInfo = eloRate || eloRate === 0 ? formatEloWithRank(eloRate) : null;

    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.basicInfo")}</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">${t("ui.eloScore")}</span>
              <span class="detail-value">
                ${eloInfo ? `
                  <div class="elo-rank-wrapper rank-${eloInfo.rank.name.toLowerCase()}">
                    <img src="${eloInfo.rank.iconUrl}" alt="${eloInfo.rank.name}" class="elo-rank-icon" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
                    <span class="elo-rank-icon-fallback" style="display: none;">${eloInfo.rank.icon}</span>
                    <span class="elo-value">${eloInfo.value}</span>
                    <span class="elo-rank-name">${eloInfo.displayName}</span>
                  </div>
                ` : "--"}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.rankNum")}</span>
              <span class="detail-value">#${player.eloRank ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.role")}</span>
              <span class="detail-value">${t(`role.${player.roleType}`) ?? t("role.0")}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.countryRegion")}</span>
              <span class="detail-value">${country}</span>
            </div>
          </div>
        </section>
    `;
  }

  function buildSeasonStatsCard(seasonStats) {
    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.seasonStats")}</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">${t("ui.bestTime")}</span>
              <span class="detail-value">${formatTime(seasonStats.bestTime?.ranked)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.matches")}</span>
              <span class="detail-value">${seasonStats.playedMatches?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.wins")}</span>
              <span class="detail-value">${seasonStats.wins?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.loses")}</span>
              <span class="detail-value">${seasonStats.loses?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.completions")}</span>
              <span class="detail-value">${seasonStats.completions?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.forfeits")}</span>
              <span class="detail-value">${seasonStats.forfeits?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
          </div>
        </section>
    `;
  }

  function buildTotalStatsCard(totalStats) {
    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.totalStats")}</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">${t("ui.bestTime")}</span>
              <span class="detail-value">${formatTime(totalStats.bestTime?.ranked)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.matches")}</span>
              <span class="detail-value">${totalStats.playedMatches?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.wins")}</span>
              <span class="detail-value">${totalStats.wins?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.loses")}</span>
              <span class="detail-value">${totalStats.loses?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.completions")}</span>
              <span class="detail-value">${totalStats.completions?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">${t("ui.forfeits")}</span>
              <span class="detail-value">${totalStats.forfeits?.ranked?.toLocaleString() ?? "--"}</span>
            </div>
          </div>
        </section>
    `;
  }

  function buildSeasonResultCard(player) {
    const seasonResult = player.seasonResult || {};
    if (!seasonResult.last && !seasonResult.highest && !seasonResult.lowest) {
      return `<section class="detail-section player-compare-card"></section>`;
    }
    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.seasonResult")}</h3>
          <div class="detail-grid">
            ${seasonResult.highest ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.highestElo2")}</span>
              <span class="detail-value">${seasonResult.highest.toLocaleString()}</span>
            </div>
            ` : ""}
            ${seasonResult.lowest ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.lowestElo")}</span>
              <span class="detail-value">${seasonResult.lowest.toLocaleString()}</span>
            </div>
            ` : ""}
            ${seasonResult.last?.phasePoint !== undefined ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.phasePoint")}</span>
              <span class="detail-value">${seasonResult.last.phasePoint}</span>
            </div>
            ` : ""}
          </div>
        </section>
    `;
  }

  function buildTimeInfoCard(timestamp) {
    if (!timestamp.firstOnline && !timestamp.lastOnline && !timestamp.lastRanked) {
      return `<section class="detail-section player-compare-card"></section>`;
    }
    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.timeInfo")}</h3>
          <div class="detail-grid">
            ${timestamp.firstOnline ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.firstOnline")}</span>
              <span class="detail-value">${formatDateTime(timestamp.firstOnline)}</span>
            </div>
            ` : ""}
            ${timestamp.lastOnline ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.lastOnline")}</span>
              <span class="detail-value">${formatDateTime(timestamp.lastOnline)}</span>
            </div>
            ` : ""}
            ${timestamp.lastRanked ? `
            <div class="detail-item">
              <span class="detail-label">${t("ui.lastRanked")}</span>
              <span class="detail-value">${formatDateTime(timestamp.lastRanked)}</span>
            </div>
            ` : ""}
          </div>
        </section>
    `;
  }

  function buildSocialLinksCard(connections) {
    if (!connections.discord && !connections.youtube && !connections.twitch) {
      return `<section class="detail-section player-compare-card"></section>`;
    }
    return `
      <section class="detail-section player-compare-card">
          <h3>${t("ui.socialLinks")}</h3>
          <div class="connections-list">
            ${connections.discord ? `
            <a href="https://discord.com/users/${connections.discord.id}" target="_blank" rel="noopener" class="connection-link">
              <span>Discord</span>
              <span>${connections.discord.name || connections.discord.id}</span>
            </a>
            ` : ""}
            ${connections.youtube ? `
            <a href="https://youtube.com/channel/${connections.youtube.id}" target="_blank" rel="noopener" class="connection-link">
              <span>YouTube</span>
              <span>${connections.youtube.name || connections.youtube.id}</span>
            </a>
            ` : ""}
            ${connections.twitch ? `
            <a href="https://twitch.tv/${connections.twitch.id}" target="_blank" rel="noopener" class="connection-link">
              <span>Twitch</span>
              <span>${connections.twitch.name || connections.twitch.id}</span>
            </a>
            ` : ""}
          </div>
        </section>
    `;
  }

  function buildAchievementsCard(achievements) {
    if (!achievements.display || achievements.display.length === 0) {
      return `<section class="detail-section player-compare-card"></section>`;
    }
    return `
      <section class="detail-section player-compare-card">
        <h3>${t("ui.displayAchievements")}</h3>
        <div class="achievements-list">
          ${achievements.display.map(ach => {
      const badgeUrl = getAchievementBadgeUrl(ach.id, ach.level);
      const fallbackIcon = getAchievementIcon(ach.id);
      return `
            <div class="achievement-item">
              <div class="achievement-badge-wrapper">
                <img src="${badgeUrl}" alt="${formatAchievementName(ach.id)}" class="achievement-badge" loading="lazy" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="achievement-badge-fallback" style="display: none;">
                  <span class="achievement-icon">${fallbackIcon}</span>
                  ${ach.level ? `<span class="achievement-badge-level">${ach.level}</span>` : ""}
                </div>
              </div>
              <div class="achievement-info">
                <span class="achievement-name">${formatAchievementName(ach.id)}</span>
                ${ach.level ? `<span class="achievement-level">${t("ui.level")} ${ach.level}</span>` : ""}
                ${ach.value !== null && ach.value !== undefined ? `<span class="achievement-value">${ach.value.toLocaleString()}</span>` : ""}
                ${ach.date ? `<span class="achievement-date">${formatDateTime(ach.date)}</span>` : ""}
              </div>
            </div>
            `;
    }).join("")}
        </div>
      </section>
    `;
  }

  function buildEloTrendCard(chartId) {
    return `
      <section class="detail-section player-compare-card">
        <h3>${t("ui.eloTrend")}</h3>
        <div class="elo-chart-container">
          <canvas id="${chartId}"></canvas>
        </div>
      </section>
    `;
  }

  modalBody.innerHTML = `
    <div class="player-compare">
      ${buildHeaderCard(playerA)}
      ${buildHeaderCard(playerB)}

      ${buildBasicInfoCard(playerA)}
      ${buildBasicInfoCard(playerB)}

      ${buildSeasonStatsCard(seasonA)}
      ${buildSeasonStatsCard(seasonB)}

      ${buildTotalStatsCard(totalA)}
      ${buildTotalStatsCard(totalB)}

      ${buildSeasonResultCard(playerA)}
      ${buildSeasonResultCard(playerB)}

      ${buildTimeInfoCard(timestampA)}
      ${buildTimeInfoCard(timestampB)}

      ${buildSocialLinksCard(connectionsA)}
      ${buildSocialLinksCard(connectionsB)}

      ${buildAchievementsCard(achievementsA)}
      ${buildAchievementsCard(achievementsB)}

      ${buildEloTrendCard("compare-elo-chart-left")}
      ${buildEloTrendCard("compare-elo-chart-right")}
    </div>
  `;

  // 準備 Elo 歷史並確保左右 Y 軸對齊
  const eloHistoryA = extractEloHistory(playerA, matchesA) || [];
  const eloHistoryB = extractEloHistory(playerB, matchesB) || [];

  const allEloValues = [...eloHistoryA, ...eloHistoryB]
    .map((p) => p.elo)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  if (!allEloValues.length) {
    return;
  }

  const globalMin = Math.min(...allEloValues);
  const globalMax = Math.max(...allEloValues);

  renderCompareEloTrendChart("compare-elo-chart-left", eloHistoryA, globalMin, globalMax);
  renderCompareEloTrendChart("compare-elo-chart-right", eloHistoryB, globalMin, globalMax);
}

function renderCompareEloTrendChart(canvasId, eloHistory, globalMin, globalMax) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // 銷毀舊的比較圖表
  if (canvas._compareChartInstance) {
    canvas._compareChartInstance.destroy();
    canvas._compareChartInstance = null;
  }

  if (!eloHistory || eloHistory.length < 2) {
    const container = canvas.parentElement;
    if (container) {
      container.innerHTML = `<div class="empty-matches">${t("ui.eloTrendNoData")}</div>`;
    }
    return;
  }

  const labels = eloHistory.map((point) => {
    let timestampSec;
    if (point.date instanceof Date) {
      timestampSec = point.date.getTime() / 1000;
    } else if (typeof point.date === "number") {
      timestampSec = point.date > 1e12 ? point.date / 1000 : point.date;
    } else {
      const d = new Date(point.date);
      timestampSec = d.getTime() / 1000;
    }
    return formatDate(timestampSec);
  });

  const eloData = eloHistory.map((p) => p.elo);

  const ctx = canvas.getContext("2d");
  if (!ctx || typeof Chart === "undefined") return;

  canvas._compareChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Elo",
          data: eloData,
          borderColor: "rgba(61, 187, 255, 0.9)",
          backgroundColor: "rgba(61, 187, 255, 0.12)",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
          labels: {
            display: false
          },
          onClick: () => { }, // 禁用點擊
          onHover: () => { }, // 禁用懸停
          onLeave: () => { } // 禁用離開
        },
        tooltip: {
          backgroundColor: "rgba(17, 26, 43, 0.95)",
          titleColor: "#f4f6fc",
          bodyColor: "#f4f6fc",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => `Elo: ${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "rgba(143, 160, 194, 0.8)",
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 6,
          },
        },
        y: {
          grid: { display: true, color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "rgba(143, 160, 194, 0.8)",
            callback: (value) => value.toLocaleString(),
          },
          min: globalMin,
          max: globalMax,
        },
      },
      interaction: {
        mode: "nearest",
        intersect: false,
      },
    },
  });
}

// 載入更多比賽
async function loadMoreMatches(modalBody, data) {
  const loadMoreBtn = modalBody.querySelector("#load-more-matches-btn");
  const matchesListContainer = modalBody.querySelector("#matches-list-container");
  const nickname = loadMoreBtn?.dataset.nickname || modalBody._playerData?.nickname;

  if (!matchesListContainer || !nickname) {
    return;
  }

  const cache = getPlayerCache(nickname);
  const currentDisplayed = modalBody._displayedMatchesCount || 20;
  const totalSeasonMatches = cache.totalSeasonMatches || modalBody._matchesList?.length || 0;

  // 顯示載入中狀態
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = t("ui.loadingMoreMatches");
  }

  try {
    // 計算目標數量：當前顯示 + 50 場
    const BATCH_SIZE = 50;
    const targetCount = currentDisplayed + BATCH_SIZE;

    // 確保快取中有足夠的資料（會從 API 載入更多）
    await ensureMatchesLoaded(nickname, targetCount);

    // 更新 modalBody._matchesList 為最新的快取
    modalBody._matchesList = cache.matches;

    // 計算要渲染的新比賽
    const matchesList = cache.matches;
    const loadCount = Math.min(BATCH_SIZE, matchesList.length - currentDisplayed);

    if (loadCount <= 0) {
      // 沒有更多可載入的
      if (loadMoreBtn) {
        loadMoreBtn.textContent = t("ui.loadedAllMatches");
        loadMoreBtn.disabled = true;
      }
      return;
    }

    const newMatches = matchesList.slice(currentDisplayed, currentDisplayed + loadCount);

    // 渲染新的比賽項目
    const newMatchesHTML = newMatches.map((match, i) => {
      const actualIndex = currentDisplayed + i;
      const selfPlayer = match.players.find(p => p.uuid === data.uuid);
      const isSelfForfeit = !!selfPlayer?.forfeited;
      const hasWinner = !!match.result?.uuid;
      const isWinner = hasWinner && match.result?.uuid === data.uuid;
      const isDraw = !hasWinner && !isSelfForfeit;
      const opponent = match.players.find(p => p.uuid !== data.uuid);
      const eloChange = match.changes?.find(c => c.uuid === data.uuid);
      const matchVod = match.vod?.find(v => v.uuid === data.uuid);

      let statusClass;
      let statusLabel;
      if (isSelfForfeit) {
        statusClass = "forfeit";
        statusLabel = t("ui.forfeit");
      } else if (isDraw) {
        statusClass = "draw";
        statusLabel = t("ui.draw");
      } else if (isWinner) {
        statusClass = "win";
        statusLabel = t("ui.victory");
      } else {
        statusClass = "loss";
        statusLabel = t("ui.defeat");
      }

      const matchItemClass = isSelfForfeit
        ? "match-forfeit"
        : isDraw
          ? "match-draw"
          : isWinner
            ? "match-win"
            : "match-loss";

      return `
      <div class="match-item ${matchItemClass}" data-index="${actualIndex}">
        <div class="match-header">
          <div class="match-result">
            <span class="match-status ${statusClass}">${statusLabel}</span>
            ${isSelfForfeit ? `<span class="forfeit-badge">${t("ui.forfeit")}</span>` : ""}
            ${eloChange ? `<span class="elo-change ${eloChange.change > 0 ? "positive" : "negative"}">${eloChange.change > 0 ? "+" : ""}${eloChange.change}</span>` : ""}
          </div>
          <div class="match-date">${formatDateTime(match.date)}</div>
        </div>
        <div class="match-details">
          <div class="match-opponent">
            <strong>${t("ui.opponent")}：</strong>
            ${opponent ? `
            <div class="opponent-info">
              <img src="${getPlayerAvatar(opponent.uuid, 24)}" alt="${opponent.nickname}" class="opponent-avatar" loading="lazy" />
              <span class="opponent-name-link" data-nickname="${opponent.nickname}" data-uuid="${opponent.uuid}">${opponent.nickname}</span>
              <span class="opponent-elo">(${opponent.eloRate?.toLocaleString() ?? "--"} Elo)</span>
            </div>
            ` : t("ui.unknown")}
          </div>
          ${match.result?.time ? `
          <div class="match-time">
            <strong>${t("ui.time")}：</strong>${formatTime(match.result.time)}
          </div>
          ` : ""}
          <div class="match-seed">
            <strong>${t("ui.seed")}：</strong>
            <span>${formatSeedType(match.seedType)} / ${formatBastionType(match.bastionType)}</span>
            ${match.seed?.id ? `<span class="seed-id" title="${t("ui.seed")} ID">${match.seed.id}</span>` : ""}
          </div>
          ${matchVod ? `
          <div class="match-vod">
            <a href="${matchVod.url}" target="_blank" rel="noopener" class="vod-link">
              📹 ${t("ui.watchVod")}
            </a>
          </div>
          ` : ""}
        </div>
      </div>
      `;
    }).join("");

    // 添加新比賽到列表
    matchesListContainer.insertAdjacentHTML("beforeend", newMatchesHTML);

    // 更新已顯示的數量
    modalBody._displayedMatchesCount = currentDisplayed + loadCount;

    // 更新 UI 上的已載入數量
    const loadedCountSpan = modalBody.querySelector("#matches-loaded-count");
    if (loadedCountSpan) {
      loadedCountSpan.textContent = cache.matches.length.toString();
    }

    // 綁定新添加的比賽項目點擊事件
    const newMatchItems = matchesListContainer.querySelectorAll(`.match-item[data-index]`);
    newMatchItems.forEach((item) => {
      const index = Number(item.dataset.index);
      if (index >= currentDisplayed && index < currentDisplayed + loadCount) {
        item.style.cursor = "pointer";
        item.addEventListener("click", (e) => {
          if (e.target.closest("a") || e.target.closest(".vod-link") || e.target.closest(".opponent-name-link")) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (index >= 0 && modalBody._matchesList && modalBody._matchesList[index]) {
            try {
              openMatchModal(modalBody._matchesList[index], modalBody._playerUuid);
            } catch (error) {
              console.error("Error opening match modal:", error);
            }
          }
        });
      }
    });

    // 綁定新添加的對手名稱點擊事件
    matchesListContainer.querySelectorAll(".opponent-name-link").forEach((link) => {
      if (!link.dataset.listenerAttached) {
        link.dataset.listenerAttached = "true";
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const opponentNickname = link.dataset.nickname;
          const uuid = link.dataset.uuid;
          showPlayerDetails(opponentNickname, uuid);
        });
      }
    });

    // 更新載入更多按鈕
    if (loadMoreBtn) {
      const newDisplayed = modalBody._displayedMatchesCount;
      const cachedCount = cache.matches.length;
      const remaining = totalSeasonMatches - cachedCount;
      const notYetDisplayed = cachedCount - newDisplayed;

      if (remaining <= 0 && notYetDisplayed <= 0) {
        // 全部載入且全部顯示
        loadMoreBtn.textContent = t("ui.loadedAllMatches");
        loadMoreBtn.disabled = true;
      } else if (remaining > 0) {
        // 還有更多可從 API 載入
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = t("ui.loadMoreMatchesRemaining", { remaining: remaining });
      } else {
        // 還有已載入但未顯示的
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = `${t("ui.loadMoreMatches")} (${notYetDisplayed} ${t("ui.matchesCount")})`;
      }
    }
  } catch (error) {
    console.error("Error loading more matches:", error);
    if (loadMoreBtn) {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = t("ui.loadMoreMatches");
    }
  }
}

function formatTime(ms) {
  if (!ms) return "--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds}`;
}

// 使用內部 API 分頁獲取更多比賽數據
// options: { season?: number | null, type?: number | null }
async function fetchMatchesWithPagination(nickname, maxMatches = 1000, options = {}) {
  const allMatches = [];
  const pageSize = 50; // 每頁獲取 50 場
  let beforeId = null;
  let hasMore = true;
  let consecutiveEmptyPages = 0; // 追蹤連續空頁面

  const { season = null, type = 2 } = options || {};

  // 如果 maxMatches 很大（> 500），表示要獲取所有比賽，不設上限
  const shouldFetchAll = maxMatches > 500;

  while (hasMore && (shouldFetchAll || allMatches.length < maxMatches)) {
    try {
      const pageMatches = await fetchUserMatches({
        nickname,
        season,
        count: pageSize,
        before: beforeId,
        type,
      });

      if (pageMatches.length === 0) {
        consecutiveEmptyPages++;
        // 如果連續 2 頁都是空的，停止獲取
        if (consecutiveEmptyPages >= 2) {
          hasMore = false;
          break;
        }
        // 繼續嘗試下一頁
        continue;
      }

      consecutiveEmptyPages = 0; // 重置計數器

      // 添加到總列表
      allMatches.push(...pageMatches);

      console.log(`Fetched page: ${pageMatches.length} matches, total: ${allMatches.length}`);

      // 檢查是否還有更多數據
      if (pageMatches.length < pageSize) {
        // 如果返回的數據少於頁面大小，可能已經到最後一頁
        hasMore = false;
      } else {
        // 獲取最後一場比賽的 ID 作為下一頁的 before 參數
        beforeId = pageMatches[pageMatches.length - 1].id;

        // 避免無限循環（只有在設定了上限時才檢查）
        if (!beforeId || (!shouldFetchAll && allMatches.length >= maxMatches)) {
          hasMore = false;
        }
      }

      // 稍微延遲避免請求過快
      if (hasMore && allMatches.length < maxMatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`Error fetching matches page (before=${beforeId}):`, error);
      hasMore = false;
    }
  }

  // 去重（以防萬一）
  const uniqueMatches = [];
  const seenIds = new Set();
  for (const match of allMatches) {
    if (match.id && !seenIds.has(match.id)) {
      seenIds.add(match.id);
      uniqueMatches.push(match);
    }
  }

  // 按日期排序（最新的在前）
  uniqueMatches.sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime();
    const dateB = new Date(b.date || 0).getTime();
    return dateB - dateA;
  });

  return uniqueMatches;
}

// 從官網爬取更多比賽數據（保留作為備用方案）
async function scrapeMatchesFromWebsite(nickname, existingMatches = []) {
  try {
    // 方法1: 嘗試獲取 profile 頁面並解析
    const profileUrl = `https://mcsrranked.com/profile/${nickname}`;
    const response = await fetch(profileUrl, {
      cache: "no-store",
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // 查找可能的比賽 ID（從 HTML 中提取）
    const matchIdPattern = /matches\/(\d+)/g;
    const foundMatchIds = [];
    let match;
    while ((match = matchIdPattern.exec(html)) !== null) {
      foundMatchIds.push(parseInt(match[1]));
    }

    // 去重並排序
    const uniqueMatchIds = [...new Set(foundMatchIds)].sort((a, b) => b - a);
    console.log(`Found ${uniqueMatchIds.length} unique match IDs in HTML`);

    // 如果找到更多比賽 ID，嘗試獲取這些比賽的詳細信息
    if (uniqueMatchIds.length > existingMatches.length) {
      // 獲取現有比賽的 ID
      const existingMatchIds = new Set(existingMatches.map(m => m.id).filter(Boolean));

      // 找出新的比賽 ID
      const newMatchIds = uniqueMatchIds.filter(id => !existingMatchIds.has(id));
      console.log(`Found ${newMatchIds.length} new match IDs`);

      // 嘗試並行獲取新比賽的數據（限制並發數）
      const newMatches = [];
      const batchSize = 5; // 每次處理5個

      for (let i = 0; i < newMatchIds.length; i += batchSize) {
        const batch = newMatchIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (matchId) => {
          try {
            const matchResponse = await fetch(`https://api.mcsrranked.com/matches/${matchId}`, {
              cache: "no-store",
            });
            if (matchResponse.ok) {
              const matchData = await matchResponse.json();
              if (matchData.status === "success" && matchData.data) {
                return matchData.data;
              }
            }
          } catch (e) {
            console.log(`Failed to fetch match ${matchId}:`, e);
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        newMatches.push(...batchResults.filter(Boolean));

        // 稍微延遲避免請求過快
        if (i + batchSize < newMatchIds.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // 合併現有比賽和新獲取的比賽
      if (newMatches.length > 0) {
        // 將新比賽轉換為與 API 格式一致的格式
        const formattedNewMatches = newMatches.map(match => {
          // 從詳細比賽數據中提取基本信息
          return {
            id: match.id,
            date: match.date || match.createdAt,
            players: match.players || [],
            result: match.result,
            changes: match.changes || [],
            seedType: match.seedType,
            bastionType: match.bastionType,
            seed: match.seed,
            forfeited: match.forfeited,
            vod: match.vod || [],
          };
        });

        // 合併並按日期排序
        const allMatches = [...existingMatches, ...formattedNewMatches];
        allMatches.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateB - dateA; // 最新的在前
        });

        return allMatches;
      }
    }

    return existingMatches;
  } catch (error) {
    console.error("Error scraping matches from website:", error);
    return existingMatches;
  }
}

// 從比賽記錄中提取 Elo 歷史數據
function extractEloHistory(data, matches) {
  if (!matches || matches.length === 0) {
    return null;
  }

  const playerUuid = data.uuid;
  const currentElo = data.eloRate || 0;

  // 按時間排序（從舊到新）
  const sortedMatches = [...matches].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });

  // 從當前 Elo 開始，反向計算歷史 Elo
  const eloHistory = [];
  let currentEloValue = currentElo;

  // 從最新的比賽開始，反向計算
  for (let i = sortedMatches.length - 1; i >= 0; i--) {
    const match = sortedMatches[i];
    const eloChange = match.changes?.find(c => c.uuid === playerUuid);

    if (eloChange && eloChange.change !== undefined) {
      // 正確處理 match.date 的格式（可能是秒數、毫秒數或 ISO 字符串）
      let matchDate;
      if (typeof match.date === 'number') {
        // 如果是數字，判斷是秒數還是毫秒數（毫秒數通常 > 1e12）
        matchDate = match.date > 1e12 ? new Date(match.date) : new Date(match.date * 1000);
      } else if (typeof match.date === 'string') {
        matchDate = new Date(match.date);
      } else {
        matchDate = new Date(match.date);
      }

      // 減去變化量得到比賽前的 Elo
      const eloBeforeMatch = currentEloValue - eloChange.change;

      // 儲存比賽後的 ELO（currentEloValue）以及導致這個 ELO 的比賽（match）
      eloHistory.unshift({
        date: matchDate,
        elo: currentEloValue,  // 這是比賽後的 ELO
        matchId: match.id,
        match: match  // 這是導致這個 ELO 的比賽
      });

      // 更新為比賽前的 ELO，用於下一次迭代
      currentEloValue = eloBeforeMatch;
    }
  }

  // 如果有比賽記錄，添加初始 ELO 點（所有比賽前的 ELO）
  if (sortedMatches.length > 0 && currentEloValue !== currentElo) {
    const firstMatch = sortedMatches[0];
    let firstMatchDate;
    if (typeof firstMatch.date === 'number') {
      firstMatchDate = firstMatch.date > 1e12 ? new Date(firstMatch.date) : new Date(firstMatch.date * 1000);
    } else if (typeof firstMatch.date === 'string') {
      firstMatchDate = new Date(firstMatch.date);
    } else {
      firstMatchDate = new Date(firstMatch.date);
    }
    // 使用第一場比賽的日期作為初始點的日期（或稍微提前一點）
    const initialDate = new Date(firstMatchDate.getTime() - 86400000); // 提前一天

    eloHistory.unshift({
      date: initialDate,
      elo: currentEloValue,  // 初始 ELO（所有比賽前）
      matchId: null,
      match: null
    });
  }

  // 如果沒有足夠的數據點，返回 null
  if (eloHistory.length < 2) {
    return null;
  }

  return eloHistory;
}

// 計算移動平均線
function calculateMovingAverage(data, period) {
  const ma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ma.push(null); // 前幾個點沒有移動平均
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / period);
    }
  }
  return ma;
}

// 渲染 Elo 趨勢圖
function renderEloTrendChart(data, matches, options = {}) {
  const canvas = document.getElementById("elo-trend-chart");
  if (!canvas) {
    console.error("Chart canvas not found");
    return;
  }
  const visibleMatchesValue = document.getElementById("visible-matches-count");
  if (visibleMatchesValue) {
    visibleMatchesValue.textContent = "--";
  }

  // 銷毀現有圖表實例（如果存在）
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }

  const eloHistory = extractEloHistory(data, matches);

  if (!eloHistory || eloHistory.length < 2) {
    if (visibleMatchesValue) {
      visibleMatchesValue.textContent = "0";
    }
    const container = canvas.parentElement;
    container.innerHTML = `<div class="empty-matches">${t("ui.eloTrendNoData")}</div>`;
    return;
  }

  // 獲取圖表選項
  const chartType = document.getElementById("chart-type-select")?.value || "line";
  const showGrid = document.getElementById("show-grid-checkbox")?.checked !== false;
  const showPoints = document.getElementById("show-points-checkbox")?.checked !== false;
  const showMA = false; // 移動平均線功能已移除
  const maPeriod = 20;
  const timeRangeSlider = document.getElementById("time-range-slider");
  const matchRangeValue = document.getElementById("match-range-value");
  const minVisibleMatches = 5;
  const minZoomSpan = Math.max(1, minVisibleMatches - 1);
  const autoExtendStep = 1;
  const { preserveView, disableAnimation } = options || {};

  // 從快取取得總場次（用於設定滑桿最大值）
  const nickname = data?.nickname || modalBody?._playerData?.nickname;
  const cache = nickname ? getPlayerCache(nickname) : null;
  const totalSeasonMatches = cache?.totalSeasonMatches || eloHistory.length;

  // 更新滑桿的最大值為本季總場次（而非已載入場次）
  if (timeRangeSlider) {
    const maxMatches = Math.max(20, totalSeasonMatches);
    timeRangeSlider.max = maxMatches;
    // 不自動調整 slider 值，保持用戶選擇
  }

  // 獲取滑桿值
  const timeRange = timeRangeSlider ? parseInt(timeRangeSlider.value) : eloHistory.length;

  // 更新顯示的數值
  if (matchRangeValue) {
    matchRangeValue.textContent = timeRange;
  }

  // 保留所有已載入的資料用於背景渲染；未載入的場次用佔位，預設只顯示最新 N 場（滑桿值，預設20）
  const totalMatchesCount = Math.max(totalSeasonMatches, eloHistory.length);
  const leadingMissing = Math.max(0, totalMatchesCount - eloHistory.length);
  const firstLoadedDate = eloHistory[0]?.date ? timelineToDate(eloHistory[0].date) : new Date();
  const paddedHistory = [];
  for (let i = leadingMissing; i > 0; i--) {
    const padDate = new Date(firstLoadedDate.getTime() - i * 86400000);
    paddedHistory.push({
      date: padDate,
      elo: null,
      matchId: null,
      match: null,
      placeholder: true
    });
  }
  paddedHistory.push(...eloHistory);

  const fullHistory = paddedHistory;
  const visibleCount = Math.min(timeRange, fullHistory.length);
  // 不為尚未載入的佔位點生成日期，避免空白區域出現隨機日期
  const timelineDates = fullHistory.map(point => point.placeholder ? null : timelineToDate(point.date));
  const laneGap = 40;
  const bottomPad = laneGap + 80;
  // 準備圖表數據（labels 使用日期轉秒後格式化）
  const labels = timelineDates.map(date => date ? formatDate(Math.floor(date.getTime() / 1000)) : "");

  const eloData = fullHistory.map(point => point.elo);
  const initialSpan = Math.max(minZoomSpan, visibleCount - 1);
  const initialMaxIndex = labels.length - 1;
  const initialMinIndex = Math.max(0, initialMaxIndex - initialSpan);

  // 計算移動平均線
  const maData = showMA ? calculateMovingAverage(eloData, maPeriod) : null;

  // 保存 eloHistory 和 playerUuid 到 canvas 以便點擊事件和 tooltip 使用
  canvas._eloHistory = fullHistory;
  canvas._playerUuid = data?.uuid;

  console.log(`Elo trend chart: ${fullHistory.length} slots, ${eloHistory.length} loaded points from ${matches.length} matches`);

  // 創建數據集
  const datasets = [{
    label: "Elo",
    data: eloData,
    borderColor: "rgba(61, 187, 255, 0.8)",
    backgroundColor: chartType === "area" ? (context) => {
      const chart = context.chart;
      const { ctx, chartArea } = chart;
      if (!chartArea) {
        return "transparent";
      }
      // 創建從上到下的線性漸變，從線條顏色漸變到透明
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, "rgba(61, 187, 255, 0.4)");
      gradient.addColorStop(0.3, "rgba(61, 187, 255, 0.2)");
      gradient.addColorStop(0.7, "rgba(61, 187, 255, 0.08)");
      gradient.addColorStop(1, "rgba(61, 187, 255, 0)");
      return gradient;
    } : "transparent",
    borderWidth: 2,
    fill: chartType === "area",
    tension: 0.4,
    pointRadius: showPoints ? ((context) => {
      // 根據可見範圍內點的密度動態調整點的大小
      const chart = context.chart;
      const scale = chart.scales.x;
      const chartArea = chart.chartArea;

      if (!scale || !chartArea) {
        return 3; // 預設大小
      }

      // 獲取當前可見範圍
      const visibleMin = scale.min ?? 0;
      const visibleMax = scale.max ?? labels.length - 1;
      const visibleRange = visibleMax - visibleMin;

      // 計算可見範圍內的點數
      const visiblePointCount = Math.max(1, Math.ceil(visibleRange));

      // 獲取圖表寬度
      const chartWidth = chartArea.right - chartArea.left;

      // 計算點的密度（每像素多少個點）
      const pointsPerPixel = visiblePointCount / chartWidth;

      // 根據密度動態調整點的大小
      // 當點很密集時（pointsPerPixel > 0.5），點變小
      // 當點稀疏時（pointsPerPixel < 0.1），點可以變大
      let radius;
      if (pointsPerPixel > 0.5) {
        // 非常密集，點變很小
        radius = 1;
      } else if (pointsPerPixel > 0.2) {
        // 較密集，點較小
        radius = 2;
      } else if (pointsPerPixel > 0.1) {
        // 中等密度，點中等大小
        radius = 3;
      } else if (pointsPerPixel > 0.05) {
        // 較稀疏，點較大
        radius = 4;
      } else {
        // 很稀疏，點最大
        radius = 5;
      }

      return radius;
    }) : 0,
    pointHoverRadius: 6,
    pointBackgroundColor: (context) => {
      const index = context.dataIndex;
      const parsedElo = context.parsed.y;
      if (parsedElo === null || parsedElo === undefined) {
        return "rgba(61, 187, 255, 0.4)";
      }
      if (index === 0) return "rgba(61, 187, 255, 1)";
      const prevElo = eloData[index - 1];
      return parsedElo >= prevElo ? "rgba(70, 240, 176, 1)" : "rgba(255, 101, 132, 1)";
    },
    pointBorderColor: (context) => {
      const index = context.dataIndex;
      const parsedElo = context.parsed.y;
      if (parsedElo === null || parsedElo === undefined) {
        return "rgba(61, 187, 255, 0.4)";
      }
      if (index === 0) return "rgba(61, 187, 255, 1)";
      const prevElo = eloData[index - 1];
      return parsedElo >= prevElo ? "rgba(70, 240, 176, 1)" : "rgba(255, 101, 132, 1)";
    }
  }];

  // 添加移動平均線
  if (showMA && maData) {
    datasets.push({
      label: `MA${maPeriod}`,
      data: maData,
      borderColor: "rgba(255, 193, 7, 0.8)",
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderDash: [5, 5],
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
    });
  }

  // 創建圖表
  const ctx = canvas.getContext("2d");
  const xAxisLimits = { min: 0, max: labels.length - 1, minRange: minZoomSpan };

  // 註冊縮放插件（如果可用）
  const plugins = [];
  if (typeof Chart !== "undefined" && Chart.register) {
    try {
      // 嘗試註冊 zoom 插件
      if (typeof zoomPlugin !== "undefined") {
        Chart.register(zoomPlugin);
        plugins.push(zoomPlugin);
      }
    } catch (e) {
      console.log("Zoom plugin not available:", e);
    }
  }

  const tooltipColors = {
    positive: "rgba(70, 240, 176, 1)",
    negative: "rgba(255, 101, 132, 1)",
    base: "rgba(61, 187, 255, 1)",
  };

  const findPreviousElo = (index) => {
    for (let i = index - 1; i >= 0; i--) {
      const prev = canvas._eloHistory?.[i];
      if (prev && prev.elo !== null && prev.elo !== undefined) {
        return prev.elo;
      }
    }
    return null;
  };

  const getMatchNumberForPoint = (historyPoint) => {
    if (!historyPoint?.match) return null;

    const currentDate = timelineToDate(historyPoint.date);
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayMatches = (canvas._eloHistory || []).filter((point) => {
      if (!point?.match) return false;
      const pointDate = timelineToDate(point.date);
      return pointDate >= dayStart && pointDate <= dayEnd;
    });

    sameDayMatches.sort((a, b) => {
      const dateA = timelineToDate(a.date);
      const dateB = timelineToDate(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    const matchIndex = sameDayMatches.findIndex((p) => p.matchId === historyPoint.matchId);
    return matchIndex >= 0 ? matchIndex + 1 : null;
  };

  const getOrCreateGlassTooltip = (chart) => {
    const container = chart?.canvas?.parentNode;
    if (!container) return null;

    let tooltipEl = container.querySelector(".elo-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "elo-tooltip";
      const list = document.createElement("ul");
      tooltipEl.appendChild(list);
      container.appendChild(tooltipEl);
    } else if (!tooltipEl.querySelector("ul")) {
      tooltipEl.appendChild(document.createElement("ul"));
    }

    return tooltipEl;
  };

  const renderGlassTooltip = (context) => {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateGlassTooltip(chart);
    if (!tooltipEl) return;

    if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
      tooltipEl.classList.remove("visible");
      return;
    }

    const dataIndex = tooltip.dataPoints[0].dataIndex;
    const historyPoint = canvas._eloHistory?.[dataIndex];
    if (!historyPoint || historyPoint.elo === null || historyPoint.elo === undefined) {
      tooltipEl.classList.remove("visible");
      return;
    }

    const list = tooltipEl.querySelector("ul");
    if (!list) return;
    list.innerHTML = "";

    const prevElo = findPreviousElo(dataIndex);
    const eloChange = prevElo !== null && prevElo !== undefined ? historyPoint.elo - prevElo : null;
    const eloText = eloChange !== null
      ? `${historyPoint.elo.toLocaleString()} (${eloChange > 0 ? "+" : ""}${eloChange})`
      : historyPoint.elo.toLocaleString();
    const eloColor = eloChange !== null
      ? (eloChange > 0 ? tooltipColors.positive : eloChange < 0 ? tooltipColors.negative : tooltipColors.base)
      : tooltipColors.base;

    const playerUuid = canvas._playerUuid;
    let opponentName = null;
    if (historyPoint.match && historyPoint.match.players && playerUuid) {
      const opponent = historyPoint.match.players.find((p) => p.uuid !== playerUuid);
      if (opponent) {
        opponentName = opponent.nickname || opponent.uuid;
      }
    }

    const matchNumber = getMatchNumberForPoint(historyPoint);
    const date = timelineToDate(historyPoint.date);
    const dateStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

    const lines = [
      { text: eloText, color: eloColor, sub: false },
      opponentName ? { text: `Opponent: ${opponentName}`, color: null, sub: true } : null,
      { text: matchNumber ? `${dateStr} (No.${matchNumber})` : dateStr, color: null, sub: true },
    ].filter(Boolean);

    for (const line of lines) {
      const li = document.createElement("li");
      // 添加 MD 列点（使用 CSS 圆点，不需要文本）
      const bullet = document.createElement("span");
      bullet.className = "tooltip-bullet";
      li.appendChild(bullet);

      const textSpan = document.createElement("span");
      textSpan.textContent = line.text;
      if (line.color) {
        textSpan.style.color = line.color;
      }
      li.appendChild(textSpan);

      if (line.sub) {
        li.classList.add("elo-tooltip-sub");
      }
      list.appendChild(li);
    }

    const container = chart.canvas.parentNode;
    const containerRect = container?.getBoundingClientRect();
    const canvasRect = chart.canvas.getBoundingClientRect();
    const left = containerRect && canvasRect
      ? canvasRect.left - containerRect.left + tooltip.caretX
      : tooltip.caretX;
    const top = containerRect && canvasRect
      ? canvasRect.top - containerRect.top + tooltip.caretY
      : tooltip.caretY;

    const clampedLeft = container ? Math.max(12, Math.min(container.clientWidth - 12, left)) : left;

    tooltipEl.style.left = `${clampedLeft}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.classList.add("visible");
  };

  // 即時同步滑桿數字的插件：每次圖表更新都刷新可見場數顯示
  const syncDisplayPlugin = {
    id: "eloSyncVisibleRange",
    afterUpdate: () => {
      syncVisibleRangeDisplay();
    }
  };

  // 在 canvas 上設置拖動檢測，用於區分平移與點擊
  if (!canvas._panDetectionAttached) {
    canvas._panDetectionAttached = true;
    canvas._isDragging = false;
    canvas._dragMoved = false;
    canvas._dragStartX = 0;
    canvas._dragStartY = 0;

    const dragThreshold = 5; // 僅當移動距離超過 5px 才視為拖動

    const onMouseDown = (e) => {
      canvas._isDragging = true;
      canvas._dragMoved = false;
      canvas._dragStartX = e.clientX;
      canvas._dragStartY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!canvas._isDragging) return;
      const dx = e.clientX - canvas._dragStartX;
      const dy = e.clientY - canvas._dragStartY;
      if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
        canvas._dragMoved = true;
      }
    };

    const onMouseUp = () => {
      canvas._isDragging = false;
      // 保留 _dragMoved 標記到點擊事件處理之後
      setTimeout(() => {
        canvas._dragMoved = false;
      }, 0);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // 監聽滾輪縮小（往下滾）時嘗試延伸左側資料
  if (!canvas._wheelExtendAttached) {
    canvas._wheelExtendAttached = true;
    let wheelTimer = null;
    canvas.addEventListener("wheel", (e) => {
      if (e.deltaY <= 0) return; // 只處理縮小
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        requestMoreMatchesForChart("zoom-out");
      }, 120);
    });
  }

  const snapViewToLatest = (chartInstance) => {
    if (!chartInstance?.scales?.x) return;
    const xScale = chartInstance.scales.x;
    const currentSpan = Math.max(minZoomSpan, (xScale.max ?? labels.length - 1) - (xScale.min ?? 0));
    const newMax = labels.length - 1;
    const newMin = Math.max(0, newMax - currentSpan);
    xScale.options.min = newMin;
    xScale.options.max = newMax;
    chartInstance.options.scales.x.min = newMin;
    chartInstance.options.scales.x.max = newMax;
    chartInstance.update("none");
  };

  const getVisibleSpanInfo = () => {
    const chartInstance = canvas._chartInstance;
    const xScale = chartInstance?.scales?.x;
    if (!chartInstance || !xScale) return null;
    const labelsCount = chartInstance.data?.labels?.length ?? 0;
    const min = xScale.min ?? 0;
    const max = xScale.max ?? (labelsCount ? labelsCount - 1 : 0);
    return {
      min,
      max,
      span: Math.max(minZoomSpan, max - min)
    };
  };

  const syncVisibleRangeDisplay = () => {
    const chartInstance = canvas._chartInstance;
    const xScale = chartInstance?.scales?.x;
    if (!chartInstance || !xScale) return;
    const labelsCount = chartInstance.data?.labels?.length ?? 0;
    const min = xScale.min ?? 0;
    const max = xScale.max ?? (labelsCount ? labelsCount - 1 : 0);
    const visibleCount = Math.max(1, Math.round(max - min + 1));

    if (timeRangeSlider) {
      const sliderMax = parseInt(timeRangeSlider.max || `${visibleCount}`) || visibleCount;
      if (labelsCount > sliderMax) {
        timeRangeSlider.max = labelsCount.toString();
      }
      const clamped = Math.max(1, Math.min(visibleCount, parseInt(timeRangeSlider.max) || visibleCount));
      timeRangeSlider.value = clamped;
    }
    if (matchRangeValue) {
      matchRangeValue.textContent = visibleCount.toString();
    }
    let visibleMatches = visibleCount;
    if (Array.isArray(canvas._eloHistory) && canvas._eloHistory.length) {
      const startIndex = Math.max(0, Math.floor(min));
      const endIndex = Math.min(canvas._eloHistory.length - 1, Math.ceil(max));
      visibleMatches = 0;
      for (let i = startIndex; i <= endIndex; i++) {
        const point = canvas._eloHistory[i];
        // Count any real data point (including the initial pre-match point) as visible
        if (point && !point.placeholder) {
          visibleMatches++;
        }
      }
    }
    if (visibleMatchesValue) {
      visibleMatchesValue.textContent = visibleMatches.toString();
    }
  };
  const scheduleVisibleSync = () => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(syncVisibleRangeDisplay);
    } else {
      syncVisibleRangeDisplay();
    }
  };

  const requestMoreMatchesForChart = async (reason) => {
    const nickname = data?.nickname || modalBody?._playerData?.nickname;
    if (!nickname) return;

    const cache = getPlayerCache(nickname);
    const currentMatches = modalBody?._matchesList || matches || [];
    const sliderValue = timeRangeSlider ? parseInt(timeRangeSlider.value) : (canvas._eloHistory?.length ?? currentMatches.length);
    const sliderMax = timeRangeSlider ? parseInt(timeRangeSlider.max) : 0;
    const safeSliderValue = Number.isFinite(sliderValue) ? sliderValue : 0;
    const guessedTotal = Math.max(
      cache?.totalSeasonMatches || 0,
      sliderMax || 0,
      safeSliderValue || 0,
      currentMatches.length || 0,
      canvas._eloHistory?.length || 0
    );
    if (cache && guessedTotal > (cache.totalSeasonMatches || 0)) {
      cache.totalSeasonMatches = guessedTotal;
    }
    const totalSeasonMatches = guessedTotal;

    const totalMatchesCount = Math.max(totalSeasonMatches, canvas._eloHistory?.length ?? currentMatches.length);
    const loadedCount = modalBody?._matchesList?.length || currentMatches.length;
    const leadingMissingNow = Math.max(0, totalMatchesCount - loadedCount);

    const visibleSpan = getVisibleSpanInfo();
    const spanToKeep = visibleSpan?.span ?? Math.max(minZoomSpan, (canvas._eloHistory?.length ?? fullHistory.length) - 1);

    const xScale = canvas._chartInstance?.scales?.x;
    const labelsCount = canvas._chartInstance?.data?.labels?.length ?? fullHistory.length;
    const visibleCount = xScale
      ? Math.max(1, Math.round((xScale.max ?? labelsCount - 1) - (xScale.min ?? 0) + 1))
      : Math.max(minVisibleMatches, safeSliderValue || labelsCount);
    const bufferSize = Math.max(20, Math.ceil(visibleCount * 0.5));
    const renderedNeed = Math.min(totalSeasonMatches, visibleCount + bufferSize);

    if (!cache?.hasMoreMatches && loadedCount >= renderedNeed) {
      return;
    }

    if (loadedCount >= renderedNeed) {
      return;
    }

    if (canvas._autoLoadingMatches) return;
    canvas._autoLoadingMatches = true;

    try {
      let targetRange = Math.min(totalSeasonMatches, loadedCount);
      while (cache?.hasMoreMatches && targetRange < renderedNeed) {
        targetRange = Math.min(totalSeasonMatches, targetRange + 50);
        await ensureMatchesLoaded(nickname, targetRange);
      }

      if (!cache?.hasMoreMatches) {
        await ensureMatchesLoaded(nickname, renderedNeed);
      }

      if (modalBody && cache?.matches?.length) {
        modalBody._matchesList = cache.matches;
      }

      const updatedMatches = modalBody?._matchesList || cache?.matches || currentMatches;

      const viewOption = xScale ? {
        anchor: "fixed",
        min: Math.max(0, xScale.min ?? 0),
        max: Math.min(labelsCount - 1, xScale.max ?? labelsCount - 1)
      } : (reason === "pan-left"
        ? { anchor: "start", span: spanToKeep }
        : { anchor: "latest", span: spanToKeep });

      renderEloTrendChart(data, updatedMatches, { preserveView: viewOption, disableAnimation: true });
    } catch (error) {
      console.error("Error auto loading matches for chart:", error);
    } finally {
      canvas._autoLoadingMatches = false;
    }
  };

  canvas._chartInstance = new Chart(ctx, {
    type: chartType === "area" ? "line" : "line",
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      layout: { padding: { bottom: bottomPad } },
      animation: disableAnimation ? false : undefined,
      scales: {
        x: {
          type: 'category',
          min: initialMinIndex,
          max: initialMaxIndex,
          grid: {
            display: showGrid,
            drawTicks: false,
            color: "rgba(255, 255, 255, 0.05)"
          },
          ticks: {
            display: false,
          }
        },
        y: {
          grid: {
            display: showGrid,
            color: "rgba(255, 255, 255, 0.05)"
          },
          ticks: {
            color: "rgba(143, 160, 194, 0.8)",
            callback: function (value) {
              return value.toLocaleString();
            }
          }
        }
      },
      onClick: (event, elements) => {
        // 如果剛剛發生過拖動（平移），則不觸發點擊開啟比賽詳情
        const nativeEvent = event?.native;
        const target = nativeEvent?.target || canvas;
        if (target && target._dragMoved) {
          return;
        }

        if (elements.length > 0) {
          const element = elements[0];
          const dataIndex = element.index;
          const historyPoint = canvas._eloHistory[dataIndex];

          // 如果有對應的比賽，打開比賽詳情
          if (historyPoint && historyPoint.match) {
            try {
              openMatchModal(historyPoint.match, data.uuid);
            } catch (error) {
              console.error("Error opening match modal:", error);
            }
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'point'
      },
      plugins: {
        minimalTwoLaneTimeline: {
          dates: timelineDates,
          yOffset: 18,
          laneGap,
          hitY: 12,
          hitXPad: 8,
          dotRadius: 4,
          lineWidth: 4,
          labelPolicy: "skip",
          minLabelSpacing: 18,
          dayTextGap: 6,
          monthTextGap: 10,
          dayFmt: (d) => String(d.getDate()), // 個位數日期不補零
          monthFmt: (d) => d.toLocaleDateString("en-US", { month: "short" }), // 英文月份簡寫（如 Nov）
          hoverFmt: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          monthTextOnChange: true,
          crosshair: true,
        },
        legend: {
          display: false,
          labels: {
            display: false
          },
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          },
          onHover: () => { },
          onLeave: () => { }
        },
        tooltip: {
          enabled: false,
          displayColors: false,
          external: renderGlassTooltip,
        },
        zoom: {
          zoom: {
            // 滾輪縮放：在 X 軸方向放大 / 縮小
            wheel: {
              enabled: true,
              speed: 0.1,
              modifierKey: null  // 不需要按其他按鍵即可縮放
            },
            pinch: {
              enabled: true
            },
            drag: {
              enabled: false  // 不使用拉框縮放，只使用滾輪與手勢
            },
            mode: "x"
          },
          pan: {
            enabled: true,   // 開啟平移
            mode: "x",       // 僅限 X 軸平移（左右）
            threshold: 5,    // 拖曳超過 5px 才開始平移，避免太敏感
            limits: {
              x: xAxisLimits
            }
          },
          limits: {
            x: xAxisLimits
          },
          onZoom: () => {
            scheduleVisibleSync();
          },
          onZoomComplete: (context) => {
            const spanInfo = getVisibleSpanInfo();
            const prevSpan = canvas._lastVisibleSpan ?? spanInfo?.span ?? 0;
            const zoomedOut = spanInfo && spanInfo.span > prevSpan + 0.25;

            if (spanInfo?.span) {
              canvas._lastVisibleSpan = spanInfo.span;
            }

            if (zoomedOut) {
              requestMoreMatchesForChart("zoom-out");
            }
            scheduleVisibleSync();
          },
          onPan: () => {
            scheduleVisibleSync();
          },
          onPanComplete: (context) => {
            const xScale = context?.chart?.scales?.x;
            if (!xScale) return;
            const spanInfo = getVisibleSpanInfo();
            if (spanInfo?.span) {
              canvas._lastVisibleSpan = spanInfo.span;
            }
            if ((xScale.min ?? 0) <= 1) {
              requestMoreMatchesForChart("pan-left");
            }
            scheduleVisibleSync();
          }
        }
      }
    }
  });

  if (canvas._chartInstance) {
    const spanInfo = getVisibleSpanInfo();
    if (spanInfo?.span) {
      canvas._lastVisibleSpan = spanInfo.span;
    }

    const view = preserveView;
    if (view && canvas._chartInstance?.scales?.x) {
      const xScale = canvas._chartInstance.scales.x;
      const maxIndex = labels.length - 1;
      const span = Math.max(minZoomSpan, Math.min(maxIndex, view.span ?? maxIndex));

      if (view.anchor === "fixed" && view.min !== undefined && view.max !== undefined) {
        const newMin = Math.max(0, Math.min(maxIndex, view.min));
        const newMax = Math.max(newMin, Math.min(maxIndex, view.max));
        xScale.options.min = newMin;
        xScale.options.max = newMax;
        canvas._chartInstance.options.scales.x.min = newMin;
        canvas._chartInstance.options.scales.x.max = newMax;
        canvas._chartInstance.update("none");
      } else if (view.anchor === "start") {
        const newMin = 0;
        const newMax = Math.min(maxIndex, newMin + span);
        xScale.options.min = newMin;
        xScale.options.max = newMax;
        canvas._chartInstance.options.scales.x.min = newMin;
        canvas._chartInstance.options.scales.x.max = newMax;
        canvas._chartInstance.update("none");
      } else if (view.anchor === "latest") {
        const newMax = maxIndex;
        const newMin = Math.max(0, newMax - span);
        xScale.options.min = newMin;
        xScale.options.max = newMax;
        canvas._chartInstance.options.scales.x.min = newMin;
        canvas._chartInstance.options.scales.x.max = newMax;
        canvas._chartInstance.update("none");
      }
    }

    canvas._chartInstance.$snapToLatest = () => snapViewToLatest(canvas._chartInstance);
    syncVisibleRangeDisplay();
    // 如果可見場數低於滑桿需求且仍有未載入資料，主動補抓
    const desiredCount = Math.min(totalSeasonMatches, timeRange || totalSeasonMatches || 0);
    const loadedCountForGap = cache?.matches?.length || matches.length || 0;
    if (cache?.hasMoreMatches && loadedCountForGap < desiredCount && !canvas._autoLoadingMatches) {
      requestMoreMatchesForChart("visible-gap");
    }
    // 任何操作後立即同步可見場數；避免重複掛載
    if (!canvas._visibleSyncAttached) {
      canvas._visibleSyncAttached = true;
      canvas.addEventListener("wheel", scheduleVisibleSync, { passive: true });
      canvas.addEventListener("pointerup", scheduleVisibleSync, { passive: true });
      canvas.addEventListener("touchend", scheduleVisibleSync, { passive: true });
    }

    // 如果交叉線已啟用，重新設置
    const crosshairCanvas = document.getElementById("elo-chart-crosshair");
    const crosshairToggleBtn = document.getElementById("crosshair-toggle-btn");
    if (crosshairCanvas && crosshairToggleBtn && crosshairToggleBtn.classList.contains("active")) {
      // 清理舊的事件監聽器
      if (crosshairCanvas._cleanup) {
        crosshairCanvas._cleanup();
      }
      setupCrosshair(canvas, crosshairCanvas);
    }
  }
}

// 設置圖表控制選項
function setupChartControls(data, matches) {
  const chartTypeSelect = document.getElementById("chart-type-select");
  const chartTypeSegmented = document.getElementById("chart-type-segmented");
  const showGridCheckbox = document.getElementById("show-grid-checkbox");
  const showPointsCheckbox = document.getElementById("show-points-checkbox");
  const timeRangeSlider = document.getElementById("time-range-slider");
  const matchRangeValue = document.getElementById("match-range-value");
  const resetZoomBtn = document.getElementById("reset-zoom-btn");
  const crosshairToggleBtn = document.getElementById("crosshair-toggle-btn");

  if (!chartTypeSelect) return;

  // 從快取取得總場次
  const nickname = data?.nickname || modalBody?._playerData?.nickname;
  const cache = nickname ? getPlayerCache(nickname) : null;
  const totalSeasonMatches = cache?.totalSeasonMatches || matches.length;

  // 設定滑桿的最大值為本季總場次
  if (timeRangeSlider) {
    const maxValue = Math.max(20, totalSeasonMatches);
    timeRangeSlider.max = maxValue;
    // 初始值設為已載入的場次或 20（取較小值）
    const initialValue = Math.min(totalSeasonMatches || matches.length || 20, 20);
    timeRangeSlider.value = initialValue;
    if (matchRangeValue) {
      matchRangeValue.textContent = initialValue.toString();
    }
  }

  // 綁定事件：當選項改變時重新渲染圖表
  const rerenderChart = () => {
    // 使用 modalBody 中最新的 matches 資料
    const currentMatches = modalBody?._matchesList || matches;
    renderEloTrendChart(data, currentMatches);
  };

  // 設置 segmented control 事件
  if (chartTypeSegmented) {
    const options = chartTypeSegmented.querySelectorAll(".segmented-option");
    options.forEach((option) => {
      option.addEventListener("click", () => {
        const value = option.dataset.value;
        // 更新隱藏的select值
        if (chartTypeSelect) {
          chartTypeSelect.value = value;
        }
        // 更新按鈕狀態
        options.forEach((opt) => opt.classList.remove("active"));
        option.classList.add("active");
        // 重新渲染圖表
        rerenderChart();
      });
    });
  }

  if (chartTypeSelect) {
    chartTypeSelect.addEventListener("change", rerenderChart);
  }

  if (showGridCheckbox) {
    showGridCheckbox.addEventListener("change", rerenderChart);
  }

  if (showPointsCheckbox) {
    showPointsCheckbox.addEventListener("change", rerenderChart);
  }

  // 滑桿事件處理
  if (timeRangeSlider) {
    // 拖曳中：只更新顯示的數值，不打 API
    timeRangeSlider.addEventListener("input", (e) => {
      if (matchRangeValue) {
        matchRangeValue.textContent = e.target.value;
      }
    });

    // 放開滑桿時：按需載入並渲染圖表
    timeRangeSlider.addEventListener("change", async (e) => {
      const targetCount = parseInt(e.target.value);
      const currentMatches = modalBody?._matchesList || matches;

      // 如果需要的場次超過已載入的，先載入更多
      if (nickname && cache && targetCount > currentMatches.length && cache.hasMoreMatches) {
        // 顯示載入中狀態
        const canvas = document.getElementById("elo-trend-chart");
        if (canvas) {
          const container = canvas.parentElement;
          const originalContent = container.innerHTML;
          container.innerHTML = `<div class="loading-spinner">${t("ui.loadingMoreMatches")}</div>`;

          try {
            // 按需載入更多比賽
            await ensureMatchesLoaded(nickname, targetCount);

            // 更新 modalBody._matchesList
            if (modalBody) {
              modalBody._matchesList = cache.matches;
            }

            // 恢復原始容器並渲染
            container.innerHTML = originalContent;
            renderEloTrendChart(data, cache.matches);
          } catch (error) {
            console.error("Error loading matches for chart:", error);
            container.innerHTML = originalContent;
            renderEloTrendChart(data, currentMatches);
          }
        }
      } else {
        // 已有足夠資料，直接渲染
        rerenderChart();
      }
    });
  }

  // 重置縮放按鈕
  if (resetZoomBtn) {
    resetZoomBtn.addEventListener("click", () => {
      const canvas = document.getElementById("elo-trend-chart");
      if (canvas && canvas._chartInstance) {
        canvas._chartInstance.resetZoom();
        if (typeof canvas._chartInstance.$snapToLatest === "function") {
          canvas._chartInstance.$snapToLatest();
        }
        syncVisibleRangeDisplay();
      }
    });
  }

  // 交叉線工具按鈕
  if (crosshairToggleBtn) {
    let crosshairEnabled = false;

    crosshairToggleBtn.addEventListener("click", () => {
      crosshairEnabled = !crosshairEnabled;
      const canvas = document.getElementById("elo-trend-chart");
      const crosshairCanvas = document.getElementById("elo-chart-crosshair");

      if (crosshairCanvas) {
        if (crosshairEnabled) {
          crosshairCanvas.style.display = "block";
          crosshairToggleBtn.classList.add("active");
          setupCrosshair(canvas, crosshairCanvas);
        } else {
          crosshairCanvas.style.display = "none";
          crosshairToggleBtn.classList.remove("active");
          clearCrosshair(crosshairCanvas);
        }
      }
    });
  }
}

// 輔助函數：繪製圓角矩形
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 設置交叉線功能
function setupCrosshair(chartCanvas, crosshairCanvas) {
  if (!chartCanvas || !crosshairCanvas) return;

  const chart = chartCanvas._chartInstance;
  if (!chart) return;

  // 確保 overlay canvas 與主 canvas 尺寸一致
  const resizeCrosshairCanvas = () => {
    const rect = chartCanvas.getBoundingClientRect();
    crosshairCanvas.width = chartCanvas.width;
    crosshairCanvas.height = chartCanvas.height;
    crosshairCanvas.style.width = chartCanvas.style.width;
    crosshairCanvas.style.height = chartCanvas.style.height;
  };

  resizeCrosshairCanvas();

  // 監聽主 canvas 尺寸變化
  const resizeObserver = new ResizeObserver(() => {
    resizeCrosshairCanvas();
  });
  resizeObserver.observe(chartCanvas);

  crosshairCanvas._resizeObserver = resizeObserver;

  const ctx = crosshairCanvas.getContext("2d");

  const drawCrosshair = (event) => {
    if (!crosshairCanvas.style.display || crosshairCanvas.style.display === "none") return;

    const rect = chartCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 檢查是否在圖表區域內
    const chartArea = chart.chartArea;
    if (!chartArea) return;

    // 計算相對於 canvas 的座標（考慮 devicePixelRatio）
    const scaleX = chartCanvas.width / rect.width;
    const scaleY = chartCanvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // 檢查是否在圖表繪圖區域內（使用 canvas 座標）
    if (canvasX < chartArea.left || canvasX > chartArea.right ||
      canvasY < chartArea.top || canvasY > chartArea.bottom) {
      clearCrosshair();
      return;
    }

    // 檢測鼠標是否接近數據點
    let isNearPoint = false;
    try {
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const xValue = xScale.getValueForPixel(canvasX);

      if (xValue !== null && !isNaN(xValue)) {
        const dataIndex = Math.round(xValue);
        if (dataIndex >= 0 && dataIndex < chart.data.datasets[0].data.length) {
          const point = chart.data.datasets[0].data[dataIndex];
          if (point !== null && point !== undefined && typeof point === 'number') {
            // 獲取數據點的像素座標
            const pointX = xScale.getPixelForValue(dataIndex);
            const pointY = yScale.getPixelForValue(point);

            // 計算鼠標與數據點的距離
            const distance = Math.sqrt(
              Math.pow(canvasX - pointX, 2) + Math.pow(canvasY - pointY, 2)
            );

            // 如果距離小於 20 像素，認為接近數據點
            isNearPoint = distance < 20;
          }
        }
      }
    } catch (err) {
      // 忽略錯誤，繼續顯示標籤
    }

    // 獲取對應的數據值
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    // 格式化數據值
    let xLabel = '';
    let yLabel = '';

    try {
      const xValue = xScale.getValueForPixel(canvasX);
      const yValue = yScale.getValueForPixel(canvasY);

      // 獲取 x 軸標籤（日期）
      if (xValue !== null && xValue !== undefined && !isNaN(xValue)) {
        const dataIndex = Math.round(xValue);
        if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
          xLabel = chart.data.labels[dataIndex] || '';
        }
      }

      // 格式化 y 軸值（Elo）
      if (yValue !== null && yValue !== undefined && !isNaN(yValue)) {
        yLabel = Math.round(yValue).toLocaleString();
      }
    } catch (e) {
      // 如果獲取數據失敗，忽略錯誤
      console.debug('Crosshair data fetch error:', e);
    }

    // 清除並重繪
    ctx.clearRect(0, 0, crosshairCanvas.width, crosshairCanvas.height);

    // 設置樣式
    ctx.strokeStyle = "rgba(61, 187, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // 繪製垂直線（從圖表區域頂部到底部）
    ctx.beginPath();
    ctx.moveTo(canvasX, chartArea.top);
    ctx.lineTo(canvasX, chartArea.bottom);
    ctx.stroke();

    // 繪製水平線（從圖表區域左側到右側）
    ctx.beginPath();
    ctx.moveTo(chartArea.left, canvasY);
    ctx.lineTo(chartArea.right, canvasY);
    ctx.stroke();

    ctx.setLineDash([]);

    // 如果不在數據點附近，才顯示標籤
    if (!isNearPoint) {
      // 繪製數據標籤
      const labelPadding = 5;
      const labelMargin = 6;
      const fontSize = 10;
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 在頂部顯示 x 值（日期）
      if (xLabel) {
        const textMetrics = ctx.measureText(xLabel);
        const labelWidth = textMetrics.width + labelPadding * 2;
        const labelHeight = fontSize + labelPadding * 2;
        // 確保標籤不會超出圖表邊界，跟隨鼠標位置
        const labelX = Math.max(chartArea.left + labelWidth / 2 + 2,
          Math.min(canvasX, chartArea.right - labelWidth / 2 - 2));
        const labelY = Math.max(labelHeight / 2 + 2, chartArea.top - labelHeight / 2 - labelMargin);

        // 繪製背景（半透明深色背景）
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.strokeStyle = "rgba(61, 187, 255, 0.5)";
        ctx.lineWidth = 1;
        roundRect(ctx, labelX - labelWidth / 2, labelY - labelHeight / 2,
          labelWidth, labelHeight, 3);
        ctx.fill();
        ctx.stroke();

        // 繪製文字
        ctx.fillStyle = "rgba(244, 246, 252, 0.95)";
        ctx.fillText(xLabel, labelX, labelY);
      }

      // 在右側顯示 y 值（Elo）
      if (yLabel) {
        const textMetrics = ctx.measureText(yLabel);
        const labelWidth = textMetrics.width + labelPadding * 2;
        const labelHeight = fontSize + labelPadding * 2;
        // 計算標籤位置，確保不超出畫布
        const maxLabelX = crosshairCanvas.width - labelWidth / 2 - 2;
        const labelX = Math.min(chartArea.right + labelWidth / 2 + labelMargin, maxLabelX);
        // 確保標籤不會超出圖表邊界
        const labelY = Math.max(chartArea.top + labelHeight / 2 + 2,
          Math.min(canvasY, chartArea.bottom - labelHeight / 2 - 2));

        // 繪製背景（半透明深色背景）
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.strokeStyle = "rgba(61, 187, 255, 0.5)";
        ctx.lineWidth = 1;
        roundRect(ctx, labelX - labelWidth / 2, labelY - labelHeight / 2,
          labelWidth, labelHeight, 3);
        ctx.fill();
        ctx.stroke();

        // 繪製文字
        ctx.fillStyle = "rgba(244, 246, 252, 0.95)";
        ctx.fillText(yLabel, labelX, labelY);
      }
    }
  };

  const clearCrosshair = () => {
    ctx.clearRect(0, 0, crosshairCanvas.width, crosshairCanvas.height);
  };

  // 綁定事件
  chartCanvas.addEventListener("mousemove", drawCrosshair);
  chartCanvas.addEventListener("mouseleave", clearCrosshair);

  // 保存清理函數
  crosshairCanvas._cleanup = () => {
    chartCanvas.removeEventListener("mousemove", drawCrosshair);
    chartCanvas.removeEventListener("mouseleave", clearCrosshair);
    if (crosshairCanvas._resizeObserver) {
      crosshairCanvas._resizeObserver.disconnect();
    }
  };
}

// 清除交叉線
function clearCrosshair(crosshairCanvas) {
  if (!crosshairCanvas) return;
  const ctx = crosshairCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, crosshairCanvas.width, crosshairCanvas.height);
  }
}

function getAchievementBadgeUrl(id, level = null) {
  // 嘗試構建成就徽章圖片 URL
  // 使用多種可能的路徑格式
  const paths = [];

  // 如果有等級，優先嘗試等級特定的圖片
  if (level !== null && level !== undefined) {
    paths.push(
      `https://mcsrranked.com/images/achievements/${id}_${level}.png`,
      `https://mcsrranked.com/assets/achievements/${id}_${level}.png`,
      `https://mcsrranked.com/static/media/achievements/${id}_${level}.png`,
      `https://mcsrranked.com/achievements/${id}_${level}.png`
    );
  }

  // 嘗試基礎成就圖片
  paths.push(
    `https://mcsrranked.com/images/achievements/${id}.png`,
    `https://mcsrranked.com/assets/achievements/${id}.png`,
    `https://mcsrranked.com/static/media/achievements/${id}.png`,
    `https://mcsrranked.com/badges/${id}.png`,
    `https://mcsrranked.com/images/badges/${id}.png`,
    `https://mcsrranked.com/achievements/${id}.png`
  );

  return paths[0];
}

function getAchievementIcon(id) {
  // 為每個成就類型提供對應的圖標（作為備用）
  const icons = {
    bestTime: "⏱️",
    seasonResult: "🏆",
    playoffsResult: "🎯",
    netherite: "💎",
    ironHoe: "🪓",
    playedMatches: "🎮",
    highestWinStreak: "🔥",
    wins: "✅",
    playtime: "⏰",
    foodless: "🍖",
    classicRun: "🏃",
    armorless: "🛡️",
    ironPickless: "⛏️",
  };
  return icons[id] || "🏅";
}

function formatAchievementName(id) {
  return t(`achievement.${id}`) || id;
}

function formatSeedType(type) {
  return t(`seed.${type}`) || type;
}

function formatBastionType(type) {
  return t(`bastion.${type}`) || type;
}

// 取得比賽分段時間資料
async function getMatchSplits(matchId) {
  try {
    const m = await fetchMatchDetail(matchId);
    const players = {};

    (m.players || []).forEach((p) => {
      players[p.uuid] = {
        uuid: p.uuid,
        nickname: p.nickname,
        splits: [],
      };
    });

    (m.timelines || []).forEach((ev) => {
      const target = players[ev.uuid];
      if (!target) return;
      target.splits.push({
        type: ev.type,
        timeMs: ev.time,
        timeStr: formatFullMs(ev.time),
      });
    });

    Object.values(players).forEach((p) => {
      p.splits.sort((a, b) => a.timeMs - b.timeMs);
    });

    return {
      matchId,
      players,
    };
  } catch (error) {
    console.error("getMatchSplits failed", error);
    return null;
  }
}

// 精簡模式只顯示的事件類型
const COMPACT_MODE_EVENTS = [
  "story.enter_the_nether",
  "nether.find_bastion",
  "nether.find_fortress",
  "projectelo.timeline.blind_travel",
  "story.follow_ender_eye",
  "story.enter_the_end",
];

// 將分段資料渲染到三欄表格
async function loadAndRenderSplits(matchId, container, leftUuid, rightUuid, isCompact = true, match = null) {
  if (!container) return;
  const loadingRow = container.querySelector("#split-loading-row");

  const data = await getMatchSplits(matchId);
  if (!data) {
    if (loadingRow) {
      loadingRow.querySelector(".split-label-core").textContent =
        t("ui.splitsUnavailable");
    }
    return;
  }

  const left = data.players[leftUuid] || Object.values(data.players)[0];
  const right =
    (rightUuid && data.players[rightUuid]) ||
    Object.values(data.players).find((p) => p.uuid !== left.uuid) ||
    null;

  if (!left) {
    if (loadingRow) {
      loadingRow.querySelector(".split-label-core").textContent =
        t("ui.splitsUnavailable");
    }
    return;
  }

  // 構建所有事件類型的集合
  const eventsMap = new Map();

  (left.splits || []).forEach((s) => {
    // 精簡模式：只處理允許的事件類型
    if (isCompact && !COMPACT_MODE_EVENTS.includes(s.type)) return;
    if (!eventsMap.has(s.type)) eventsMap.set(s.type, { type: s.type });
    eventsMap.get(s.type).left = s;
  });

  if (right) {
    (right.splits || []).forEach((s) => {
      // 精簡模式：只處理允許的事件類型
      if (isCompact && !COMPACT_MODE_EVENTS.includes(s.type)) return;
      if (!eventsMap.has(s.type)) eventsMap.set(s.type, { type: s.type });
      eventsMap.get(s.type).right = s;
    });
  }

  const rows = Array.from(eventsMap.values()).sort((a, b) => {
    const ta = Math.min(
      a.left?.timeMs ?? Number.POSITIVE_INFINITY,
      a.right?.timeMs ?? Number.POSITIVE_INFINITY,
    );
    const tb = Math.min(
      b.left?.timeMs ?? Number.POSITIVE_INFINITY,
      b.right?.timeMs ?? Number.POSITIVE_INFINITY,
    );
    return ta - tb;
  });

  const formatTypeLabel = (type) => {
    // 映射事件類型到顯示名稱
    const map = {
      // 精簡模式的6個事件
      "story.enter_the_nether": "Entered Nether",
      "nether.find_bastion": "Entered Bastion",
      "nether.find_fortress": "Entered Fortress",
      "projectelo.timeline.blind_travel": "Finding Stronghold",
      "story.follow_ender_eye": "Found Stronghold",
      "story.enter_the_end": "Entered the End",
      // 舊格式（向後兼容）
      ENTERED_NETHER: "Entered Nether",
      ENTERED_BASTION: "Entered Bastion",
      ENTERED_FORTRESS: "Entered Fortress",
      ENTERED_STRONGHOLD: "Finding Stronghold",
      FOUND_STRONGHOLD: "Found Stronghold",
      ENTERED_END: "Entered The End",
    };
    return map[type] || type;
  };

  // 刪除 loading row（不需要 header row，名字已在頂部顯示）
  container.innerHTML = ``;

  rows.forEach((row) => {
    const l = row.left;
    const r = row.right;
    const hasBoth = l && r;
    let leftDiffHtml = "";
    let rightDiffHtml = "";

    if (hasBoth) {
      const diff = l.timeMs - r.timeMs; // <0: left faster
      const abs = Math.abs(diff);
      const diffStr = formatFullMs(abs);
      if (diff <= 0) {
        // left faster
        leftDiffHtml = `<span class="split-diff positive">(-${diffStr})</span>`;
        rightDiffHtml = `<span class="split-diff negative">(+${diffStr})</span>`;
      } else {
        // right faster
        leftDiffHtml = `<span class="split-diff negative">(+${diffStr})</span>`;
        rightDiffHtml = `<span class="split-diff positive">(-${diffStr})</span>`;
      }
    }

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="split-table-row">
        <div class="split-cell split-left">
          <span class="split-time">${l ? l.timeStr : "--"}</span>
          ${leftDiffHtml}
        </div>
        <div class="split-cell split-center-label">
          <span class="split-label-core">${formatTypeLabel(row.type)}</span>
        </div>
        <div class="split-cell split-right">
          <span class="split-time">${r ? r.timeStr : "--"}</span>
          ${rightDiffHtml}
        </div>
      </div>
    `,
    );
  });

  // 在所有事件行之後，添加 "Beat the game" 行（只有贏家顯示時間）
  if (match && match.result && match.result.uuid && match.result.time) {
    const winnerUuid = match.result.uuid;
    const completionTime = match.result.time;
    const isLeftWinner = winnerUuid === leftUuid;
    const isRightWinner = rightUuid && winnerUuid === rightUuid;

    const leftTime = isLeftWinner ? formatFullMs(completionTime) : "--";
    const rightTime = isRightWinner ? formatFullMs(completionTime) : "--";

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="split-table-row">
        <div class="split-cell split-left">
          <span class="split-time">${leftTime}</span>
        </div>
        <div class="split-cell split-center-label">
          <span class="split-label-core">Beat the game</span>
        </div>
        <div class="split-cell split-right">
          <span class="split-time">${rightTime}</span>
        </div>
      </div>
    `,
    );
  }
}

// 打開比賽詳情子模態框
function openMatchModal(match, playerUuid) {
  console.log("openMatchModal called", { match, playerUuid });
  const container = document.querySelector("#player-modal .modal-content");
  if (!container) {
    console.error("Cannot find player modal container");
    return;
  }

  // 如果已存在，先移除
  const existing = document.getElementById("match-details-modal");
  if (existing) existing.remove();

  const player1 = match.players?.find(p => p.uuid === playerUuid);
  const player2 = match.players?.find(p => p.uuid !== playerUuid);
  const isPlayer1Winner = match.result?.uuid === playerUuid;
  const eloChange1 = match.changes?.find(c => c.uuid === playerUuid);
  const eloChange2 = match.changes?.find(c => c.uuid !== playerUuid);
  const vod1 = match.vod?.find(v => v.uuid === playerUuid);
  const vod2 = match.vod?.find(v => v.uuid !== playerUuid);

  // 目前 API 只提供獲勝玩家的總時間，沒有分段時間與敗方時間
  // 因此這裡的版面主要模仿視覺風格，而不是一模一樣的數據內容
  const winnerUuid = match.result?.uuid;
  const totalTimeMs = match.result?.time ?? null;
  const time1 = player1 && player1.uuid === winnerUuid ? totalTimeMs : null;
  const time2 = player2 && player2.uuid === winnerUuid ? totalTimeMs : null;

  const formatTimeOrDash = (ms) => (ms || ms === 0 ? formatTime(ms) : "--");

  // 定義 isCompact 變數（預設為精簡模式）
  let isCompact = true;

  const html = `
  <div id="match-details-modal" class="match-modal">
    <div class="match-modal-overlay" data-close="1"></div>
    <div class="match-modal-content match-details-full">
      <div class="match-header-top-bar">
        <div class="match-mode-tabs">
          <button class="mode-tab ${isCompact ? "active" : ""}" data-mode="compact">${t("ui.detailCompact")}</button>
          <button class="mode-tab ${!isCompact ? "active" : ""}" data-mode="full">${t("ui.detailFull")}</button>
        </div>
        <button class="match-modal-close" aria-label="${t("ui.close")}" data-close="1">×</button>
      </div>
      <div class="match-modal-header match-split-header">
        <div class="match-player-head match-player-left">
          <div class="match-player-name-row">
            <img src="${getPlayerAvatar(player1?.uuid || "", 32)}" alt="${player1?.nickname || ""}" class="player-avatar-compare" />
            <span class="match-player-name">${player1?.nickname || t("ui.unknown")}</span>
          </div>
          <div class="match-player-elo">
            ${player1?.eloRate?.toLocaleString?.() ?? "--"} Elo
            ${eloChange1 ? ` (${eloChange1.change > 0 ? "+" : ""}${eloChange1.change})` : ""}
          </div>
        </div>
        <div class="match-center-label">
          <div class="match-vs-text">${t("ui.vs")}</div>
          <div class="match-time-display">${formatDateTime(match.date)}</div>
          <div class="match-seed-badges">
            ${match.seedType ? `<span class="seed-badge">${formatSeedType(match.seedType)}</span>` : ""}
            ${match.bastionType ? `<span class="seed-badge">${formatBastionType(match.bastionType)}</span>` : ""}
          </div>
        </div>
        <div class="match-player-head match-player-right">
          <div class="match-player-name-row match-player-name-row-right">
            <span class="match-player-name">${player2?.nickname || t("ui.unknown")}</span>
            <img src="${getPlayerAvatar(player2?.uuid || "", 32)}" alt="${player2?.nickname || ""}" class="player-avatar-compare" />
          </div>
          <div class="match-player-elo">
            ${player2?.eloRate?.toLocaleString?.() ?? "--"} Elo
            ${eloChange2 ? ` (${eloChange2.change > 0 ? "+" : ""}${eloChange2.change})` : ""}
          </div>
        </div>
      </div>
      <div class="match-modal-body match-comparison">
        <div class="split-table">
          <div class="split-table-row" id="split-loading-row">
            <div class="split-cell split-center-label">
              <span class="split-label-core">${t("ui.loadingSplits")}</span>
            </div>
          </div>
        </div>

        ${match.id ? `
        <div class="match-external-link">
          <a href="https://mcsrranked.com/matches/${match.id}" target="_blank" rel="noopener">
            ${t("ui.openOnMCSR")} →
          </a>
        </div>
        ` : ""}
      </div>
    </div>
  </div>`;

  container.insertAdjacentHTML("beforeend", html);

  const modal = document.getElementById("match-details-modal");
  if (!modal) return;

  // 詳細 / 精簡 切換
  const modalContent = modal.querySelector(".match-details-full");
  const modeTabs = modal.querySelectorAll(".mode-tab");

  // 載入分段資料並渲染
  const reloadSplits = () => {
    if (match.id) {
      const splitTable = modal.querySelector(".split-table");
      loadAndRenderSplits(match.id, splitTable, playerUuid, player2?.uuid, isCompact, match);
    } else {
      const loadingRow = modal.querySelector("#split-loading-row");
      if (loadingRow) {
        loadingRow.querySelector(".split-label-core").textContent = t("ui.splitsUnavailable");
      }
    }
  };

  // 詳細 / 精簡 切換時重新載入分段資料
  const updateDetailMode = () => {
    if (!modalContent) return;
    modalContent.classList.toggle("compact", isCompact);
    // 更新標籤頁狀態
    modeTabs.forEach(tab => {
      const mode = tab.dataset.mode;
      if ((mode === "compact" && isCompact) || (mode === "full" && !isCompact)) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });
    // 重新載入分段資料以應用過濾
    reloadSplits();
  };

  // 綁定標籤頁點擊事件
  modeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      isCompact = mode === "compact";
      updateDetailMode();
    });
  });

  // 初始化時載入分段資料（精簡模式）
  reloadSplits();
  updateDetailMode();

  modal.addEventListener("click", (e) => {
    if (e.target.dataset.close) {
      modal.remove();
    }
  });
}

// 初始化語言和地區名稱
updateRegionNames();
setLanguage();

initAutoRefresh();
loadLeaderboard();

// ---------------------------------------------------------------------------
// Minimalist two-lane timeline plugin (day lane + month lane under x-axis)
// ---------------------------------------------------------------------------
const timelineToDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const timelineDayKey = (d) => {
  const dd = timelineToDate(d);
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
};

const timelineMonthKey = (d) => {
  const dd = timelineToDate(d);
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
};

function groupConsecutive(values, keyFn) {
  // 將 null/undefined 視為斷點，避免為尚未載入的佔位點繪製日期
  const groups = [];
  let start = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      if (start !== null) {
        groups.push({ start, end: i - 1, date: timelineToDate(values[start]) });
        start = null;
      }
      continue;
    }
    if (start === null) {
      start = i;
      continue;
    }
    const prev = values[i - 1];
    const prevKey = prev == null ? null : keyFn(prev);
    const currKey = keyFn(v);
    if (prev == null || currKey !== prevKey) {
      groups.push({ start, end: i - 1, date: timelineToDate(values[start]) });
      start = i;
    }
  }
  if (start !== null) {
    groups.push({ start, end: values.length - 1, date: timelineToDate(values[start]) });
  }
  return groups;
}

const minimalTwoLaneTimeline = {
  id: "minimalTwoLaneTimeline",
  afterEvent(chart, args, opts) {
    const e = args.event;
    if (!e || !chart.chartArea) return;
    const hitY = opts.hitY ?? 12;
    const hitXPad = opts.hitXPad ?? 8;
    const dotR = opts.dotRadius ?? 4;
    const yDay = chart.chartArea.bottom + (opts.yOffset ?? 22);
    const laneGap = opts.laneGap ?? 44;
    const yMonth = yDay + laneGap;
    const dayGroupsPx = chart.$dayGroupsPx || [];
    const monthGroupsPx = chart.$monthGroupsPx || [];
    const tryHit = (groupsPx, y) => {
      for (const g of groupsPx) {
        const withinY = Math.abs(e.y - y) <= hitY + dotR;
        const withinX = e.x >= (g.x1 - dotR - hitXPad) && e.x <= (g.x2 + dotR + hitXPad);
        if (withinX && withinY) return g;
      }
      return null;
    };
    let hover = null;
    let lane = "day";
    const hDay = tryHit(dayGroupsPx, yDay);
    if (hDay) {
      hover = hDay;
      lane = "day";
    } else {
      const hMon = tryHit(monthGroupsPx, yMonth);
      if (hMon) {
        hover = hMon;
        lane = "month";
      }
    }
    const prev = chart.$timelineHover;
    const changed =
      (!prev && hover) ||
      (prev && !hover) ||
      (prev && hover && (prev.key !== hover.key || prev.lane !== lane));
    chart.$timelineHover = hover ? { ...hover, lane, mouseX: e.x } : null;
    chart.canvas.style.cursor = hover ? "pointer" : "default";
    if (changed) chart.draw();
  },
  afterDraw(chart, args, opts) {
    const dates = opts?.dates;
    if (!dates?.length) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales.x;
    if (!x || !chartArea) return;
    const yDay = chartArea.bottom + (opts.yOffset ?? 22);
    const laneGap = opts.laneGap ?? 44;
    const yMonth = yDay + laneGap;
    const dotR = opts.dotRadius ?? 4;
    const lineWidth = opts.lineWidth ?? 4;
    const labelPolicy = opts.labelPolicy ?? "showAll"; // showAll | skip
    const minSpacing = opts.minLabelSpacing ?? 18;
    const dayTextGap = opts.dayTextGap ?? 6;
    const monthTextGap = opts.monthTextGap ?? 8;
    const dayFmt = opts.dayFmt ?? ((d) => String(d.getDate())); // 個位數日期不補零
    const monthFmt = opts.monthFmt ?? ((d) => d.toLocaleDateString("en-US", { month: "short" })); // 英文月份簡寫（如 Nov）
    const hoverFmt = opts.hoverFmt ?? ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    const monthTextOnChange = opts.monthTextOnChange ?? true;
    const dayGroups = groupConsecutive(dates, timelineDayKey);
    const monthGroups = groupConsecutive(dates, timelineMonthKey);

    const xFor = (idx) => (typeof x.getPixelForValue === "function" ? x.getPixelForValue(idx) : x.getPixelForTick(idx));
    const dayGroupsPx = dayGroups.map((g) => ({
      ...g,
      key: `d:${g.start}-${g.end}`,
      x1: xFor(g.start),
      x2: xFor(g.end),
    }));
    const monthGroupsPx = monthGroups.map((g) => ({
      ...g,
      key: `m:${g.start}-${g.end}`,
      x1: xFor(g.start),
      x2: xFor(g.end),
    }));
    chart.$dayGroupsPx = dayGroupsPx;
    chart.$monthGroupsPx = monthGroupsPx;
    const hover = chart.$timelineHover;
    const crosshair = !!opts.crosshair;
    // 簡約配色：低飽和度、低對比，避免喧賓奪主
    const cDay = "rgba(100, 116, 139, 0.5)"; // 柔和的灰藍色線條
    const cMonth = "rgba(148, 163, 184, 0.6)"; // 月份線更明顯
    const cDot = "rgba(148, 163, 184, 0.6)"; // 半透明圓圈
    const cDotBorder = "rgba(148, 163, 184, 0.3)"; // 細邊框
    const cText = "rgba(203, 213, 225, 0.9)"; // 更清楚的日期文字
    const cText2 = "rgba(203, 213, 225, 0.95)"; // 更清楚的月份文字（更亮）
    const leftBound = chartArea.left; // 永遠保持在紅線右端，不超出
    const rightBound = chartArea.right; // 永遠不超過右邊界
    const mergeThreshold = dotR * 2; // 當兩個圓圈距離小於直徑時合併
    // 使用更小的圓圈，降低視覺重量
    const actualDotR = Math.max(2, dotR * 0.75);
    function drawDot(cx, cy) {
      // 確保圓圈不會超出左右邊界
      if (cx < leftBound || cx > rightBound) return;
      // 繪製細邊框
      ctx.beginPath();
      ctx.arc(cx, cy, actualDotR, 0, Math.PI * 2);
      ctx.strokeStyle = cDotBorder;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // 繪製半透明填充
      ctx.beginPath();
      ctx.arc(cx, cy, actualDotR - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = cDot;
      ctx.fill();
    }
    function drawSegment(g, y, color, segmentWidth) {
      // 裁剪線段，確保不超出左邊界
      // 如果線段完全在左邊界外，不繪製
      if (g.x2 < leftBound) return;
      // 如果線段完全在右邊界外，不繪製
      if (g.x1 > rightBound) return;
      // 裁剪到可見區域
      let x1 = Math.max(g.x1, leftBound);
      let x2 = Math.min(g.x2, rightBound);
      // 使用指定的線寬，如果未指定則使用預設的細線條
      ctx.strokeStyle = color;
      ctx.lineWidth = segmentWidth ?? Math.max(1.5, lineWidth * 0.6);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
    function drawLabel(text, xMid, y, color, fontSize) {
      // 確保標籤不超出邊界
      if (xMid < leftBound || xMid > rightBound) return;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // 使用指定的字體大小，如果未指定則使用預設的11px
      ctx.font = `${fontSize ?? 11}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillText(text, xMid, y);
    }
    // 繪製更明顯的月份圓圈（用於合併時）
    function drawMonthDot(cx, cy) {
      // 確保圓圈不會超出左右邊界
      if (cx < leftBound || cx > rightBound) return;
      // 月份圓圈更大、更明顯
      const monthDotR = Math.max(3, dotR * 0.9);
      // 繪製外層邊框（更明顯）
      ctx.beginPath();
      ctx.arc(cx, cy, monthDotR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(203, 213, 225, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // 繪製內層填充（更不透明）
      ctx.beginPath();
      ctx.arc(cx, cy, monthDotR - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(203, 213, 225, 0.8)";
      ctx.fill();
    }

    // 繪製線段和合併的圓圈
    function drawSegmentsWithMergedDots(groupsPx, y, color, segmentWidth, isMonth = false) {
      // 先繪製所有線段
      for (const g of groupsPx) {
        if (g.x2 < leftBound || g.x1 > rightBound) continue;
        drawSegment(g, y, color, segmentWidth);
      }

      // 標記哪些端點需要合併
      const merged = new Set(); // 記錄已合併的端點索引 "i-left" 或 "i-right"
      const mergePositions = []; // 合併後的圓圈位置

      // 第一遍：找出需要合併的相鄰端點
      for (let i = 0; i < groupsPx.length - 1; i++) {
        const g1 = groupsPx[i];
        const g2 = groupsPx[i + 1];
        if (g1.x2 < leftBound || g1.x1 > rightBound) continue;
        if (g2.x2 < leftBound || g2.x1 > rightBound) continue;

        const distance = g2.x1 - g1.x2;
        if (distance < mergeThreshold) {
          // 標記這兩個端點為已合併
          merged.add(`${i}-right`);
          merged.add(`${i + 1}-left`);
          // 記錄合併位置
          mergePositions.push((g1.x2 + g2.x1) / 2);
        }
      }

      // 第二遍：繪製所有圓圈
      for (let i = 0; i < groupsPx.length; i++) {
        const g = groupsPx[i];
        if (g.x2 < leftBound || g.x1 > rightBound) continue;

        // 繪製左端點（如果沒有被合併）
        if (!merged.has(`${i}-left`)) {
          if (isMonth) {
            drawMonthDot(g.x1, y);
          } else {
            drawDot(g.x1, y);
          }
        }

        // 繪製右端點（如果沒有被合併）
        if (g.end !== g.start && !merged.has(`${i}-right`)) {
          if (isMonth) {
            drawMonthDot(g.x2, y);
          } else {
            drawDot(g.x2, y);
          }
        }
      }

      // 繪製合併的圓圈（確保不超出左右邊界）
      // 月份線的合併圓圈需要更明顯
      for (const x of mergePositions) {
        if (x >= leftBound && x <= rightBound) {
          if (isMonth) {
            drawMonthDot(x, y);
          } else {
            drawDot(x, y);
          }
        }
      }
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = lineWidth;

    // 日期線：使用細線條
    drawSegmentsWithMergedDots(dayGroupsPx, yDay, cDay, Math.max(1.5, lineWidth * 0.6), false);
    // 月份線：使用更粗的線條，讓它更突出，並使用更明顯的圓圈
    drawSegmentsWithMergedDots(monthGroupsPx, yMonth, cMonth, Math.max(2.5, lineWidth * 0.9), true);
    // 標籤字體已在 drawLabel 函數中設置
    let lastDayX = -Infinity;
    for (const g of dayGroupsPx) {
      if (g.x2 < leftBound || g.x1 > rightBound) continue;
      // 計算可見部分的中點
      const visibleX1 = Math.max(g.x1, leftBound);
      const visibleX2 = Math.min(g.x2, rightBound);
      const xMid = (visibleX1 + visibleX2) / 2;
      // 確保標籤不超出右邊界
      if (xMid > rightBound) continue;
      const ok = labelPolicy === "showAll" || xMid - lastDayX >= minSpacing;
      if (ok) {
        drawLabel(dayFmt(g.date), xMid, yDay + dayTextGap, cText);
        lastDayX = xMid;
      }
    }
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    let lastMonthX = -Infinity;
    let lastMonthKeyShown = null;
    for (const g of monthGroupsPx) {
      if (g.x2 < leftBound || g.x1 > rightBound) continue;
      // 計算可見部分的中點
      const visibleX1 = Math.max(g.x1, leftBound);
      const visibleX2 = Math.min(g.x2, rightBound);
      const xMid = (visibleX1 + visibleX2) / 2;
      // 確保標籤不超出右邊界
      if (xMid > rightBound) continue;
      const okSpacing = labelPolicy === "showAll" || xMid - lastMonthX >= minSpacing;
      const okChange = !monthTextOnChange || g.key !== lastMonthKeyShown;
      if (okSpacing && okChange) {
        drawLabel(monthFmt(g.date), xMid, yMonth + monthTextGap, cText2, 12); // 月份文字更大
        lastMonthX = xMid;
        lastMonthKeyShown = g.key;
      }
    }
    if (hover) {
      if (hover.x2 < leftBound || hover.x1 > rightBound) {
        ctx.restore();
        return;
      }
      // 月份 hover 顯示 "Nov 2025" 格式
      const label = hover.lane === "month"
        ? `${hover.date.toLocaleDateString("en-US", { month: "short" })} ${hover.date.getFullYear()}`
        : hoverFmt(hover.date);
      const px = hover.mouseX;
      const y = hover.lane === "month" ? yMonth : yDay;
      ctx.save();
      // 簡約的 hover 提示框：更小、更淡
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto";
      const padX = 8;
      const padY = 5;
      const w = ctx.measureText(label).width;
      const boxW = Math.ceil(w + padX * 2);
      const boxH = 11 + padY * 2;
      let bx = px - boxW / 2;
      bx = Math.max(chartArea.left + 8, Math.min(chartArea.right - boxW - 8, bx));
      const by = Math.max(chartArea.top + 6, y - 14 - boxH);
      const r = 6;
      // 簡約的背景：半透明，低對比
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r);
      ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
      ctx.arcTo(bx, by + boxH, bx, by, r);
      ctx.arcTo(bx, by, bx + boxW, by, r);
      ctx.closePath();
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // 清楚的文字顏色
      ctx.fillStyle = "rgba(203, 213, 225, 0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + boxW / 2, by + boxH / 2);
      ctx.restore();
      if (crosshair) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  },
};

if (typeof Chart !== "undefined" && Chart.register) {
  Chart.register(minimalTwoLaneTimeline);

  // 註冊 tooltip 毛玻璃效果 plugin
  const tooltipGlassPlugin = {
    id: "tooltipGlass",
    afterDraw: function (chart) {
      const tooltip = chart.tooltip;
      if (!tooltip || !tooltip.opacity || tooltip.opacity === 0) return;

      const tooltipEl = tooltip.el;
      if (!tooltipEl) return;

      // 應用毛玻璃效果
      tooltipEl.style.backdropFilter = "blur(10px)";
      tooltipEl.style.webkitBackdropFilter = "blur(10px)";
      tooltipEl.style.backgroundColor = "rgba(15, 23, 42, 0.75)";
      tooltipEl.style.borderRadius = "12px";
      tooltipEl.style.border = "1px solid rgba(148, 163, 184, 0.2)";
      tooltipEl.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
    }
  };

  Chart.register(tooltipGlassPlugin);
}
