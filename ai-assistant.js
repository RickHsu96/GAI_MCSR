// ============================================================================
// AI Assistant Module - MCSR Ranked 資料分析助手
// ============================================================================

/**
 * AI 助手狀態
 */
const aiState = {
    isOpen: false,
    isLoading: false,
    messages: [],
};

/**
 * DOM 元素快取
 */
let aiElements = null;

/**
 * 初始化 DOM 元素快取
 */
function cacheElements() {
    aiElements = {
        fab: document.getElementById("ai-fab"),
        panel: document.getElementById("ai-panel"),
        closeBtn: document.getElementById("ai-close-btn"),
        messagesContainer: document.getElementById("ai-messages"),
        input: document.getElementById("ai-input"),
        sendBtn: document.getElementById("ai-send-btn"),
    };
}

/**
 * 建立 AI 助手的 HTML 結構
 */
function createAIAssistantHTML() {
    const container = document.createElement("div");
    container.id = "ai-assistant-container";
    container.innerHTML = `
    <!-- 懸浮按鈕 -->
    <button id="ai-fab" class="ai-fab" aria-label="開啟 AI 分析助手" title="AI 分析助手">
      <svg class="ai-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
        <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="13" r="1.5" fill="currentColor"/>
        <path d="M9 17h6" stroke-linecap="round"/>
      </svg>
      <span class="ai-fab-pulse"></span>
    </button>

    <!-- 對話視窗 -->
    <div id="ai-panel" class="ai-panel" aria-hidden="true">
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <svg class="ai-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="13" r="1.5" fill="currentColor"/>
            <path d="M9 17h6" stroke-linecap="round"/>
          </svg>
          <span>AI 分析助手</span>
        </div>
        <button id="ai-close-btn" class="ai-close-btn" aria-label="關閉">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <div id="ai-messages" class="ai-messages">
        <div class="ai-message ai-message-assistant">
          <div class="ai-message-content">
            👋 你好！我是 MCSR 分析助手。
            <br><br>
            我可以幫你分析任何玩家的數據，例如：
            <ul>
              <li>「分析 Couriway 的數據」</li>
              <li>「他最近 20 場的勝率如何？」</li>
              <li>「比較 A 和 B 的表現」</li>
            </ul>
            請輸入你想分析的內容！
          </div>
        </div>
      </div>
      
      <div class="ai-input-container">
        <input 
          type="text" 
          id="ai-input" 
          class="ai-input" 
          placeholder="輸入你想分析的內容..."
          autocomplete="off"
        />
        <button id="ai-send-btn" class="ai-send-btn" aria-label="送出">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(container);
}

/**
 * 切換對話視窗開關
 */
function togglePanel() {
    aiState.isOpen = !aiState.isOpen;

    if (aiState.isOpen) {
        aiElements.panel.classList.add("open");
        aiElements.panel.setAttribute("aria-hidden", "false");
        aiElements.fab.classList.add("active");
        // 自動聚焦輸入框
        setTimeout(() => aiElements.input.focus(), 300);
    } else {
        aiElements.panel.classList.remove("open");
        aiElements.panel.setAttribute("aria-hidden", "true");
        aiElements.fab.classList.remove("active");
    }
}

/**
 * 新增訊息到對話視窗
 * @param {string} content - 訊息內容
 * @param {'user' | 'assistant'} role - 訊息角色
 */
function addMessage(content, role) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `ai-message ai-message-${role}`;
    messageDiv.innerHTML = `<div class="ai-message-content">${content}</div>`;

    aiElements.messagesContainer.appendChild(messageDiv);

    // 滾動到底部
    aiElements.messagesContainer.scrollTop = aiElements.messagesContainer.scrollHeight;

    // 儲存到歷史
    aiState.messages.push({ role, content });
}

/**
 * 顯示載入動畫
 * @returns {HTMLElement} 載入動畫元素（用於後續移除）
 */
function showTypingIndicator() {
    const typingDiv = document.createElement("div");
    typingDiv.className = "ai-message ai-message-assistant ai-typing";
    typingDiv.innerHTML = `
    <div class="ai-message-content">
      <span class="ai-typing-dot"></span>
      <span class="ai-typing-dot"></span>
      <span class="ai-typing-dot"></span>
    </div>
  `;

    aiElements.messagesContainer.appendChild(typingDiv);
    aiElements.messagesContainer.scrollTop = aiElements.messagesContainer.scrollHeight;

    return typingDiv;
}

/**
 * 送出訊息
 */
async function sendMessage() {
    const message = aiElements.input.value.trim();
    if (!message || aiState.isLoading) return;

    // 清空輸入框
    aiElements.input.value = "";

    // 顯示使用者訊息
    addMessage(message, "user");

    // 設定載入狀態
    aiState.isLoading = true;
    aiElements.sendBtn.disabled = true;
    aiElements.input.disabled = true;

    // 顯示打字動畫
    const typingIndicator = showTypingIndicator();

    try {
        // 呼叫 API
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // 移除打字動畫
        typingIndicator.remove();

        // 顯示 AI 回應
        addMessage(data.reply || "抱歉，我無法處理這個請求。", "assistant");

    } catch (error) {
        console.error("AI Assistant Error:", error);

        // 移除打字動畫
        typingIndicator.remove();

        // 顯示錯誤訊息
        addMessage(
            "⚠️ 抱歉，發生了錯誤。請稍後再試。<br><small>（提示：請確認 API 已正確設定）</small>",
            "assistant"
        );
    } finally {
        // 重置載入狀態
        aiState.isLoading = false;
        aiElements.sendBtn.disabled = false;
        aiElements.input.disabled = false;
        aiElements.input.focus();
    }
}

/**
 * 綁定事件監聽器
 */
function bindEvents() {
    // 懸浮按鈕點擊
    aiElements.fab.addEventListener("click", togglePanel);

    // 關閉按鈕點擊
    aiElements.closeBtn.addEventListener("click", togglePanel);

    // 送出按鈕點擊
    aiElements.sendBtn.addEventListener("click", sendMessage);

    // 輸入框 Enter 鍵
    aiElements.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ESC 鍵關閉
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && aiState.isOpen) {
            togglePanel();
        }
    });
}

/**
 * 初始化 AI 助手
 */
export function initAIAssistant() {
    // 建立 HTML
    createAIAssistantHTML();

    // 快取 DOM 元素
    cacheElements();

    // 綁定事件
    bindEvents();

    console.log("AI Assistant initialized");
}
