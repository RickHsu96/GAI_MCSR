// Vercel Serverless Function for AI Chat
// POST /api/chat

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MCSR_API_BASE = "https://mcsrranked.com/api";

// System prompt that restricts AI to only analyze MCSR data
const SYSTEM_PROMPT = `你是 MCSR Ranked 資料分析專家。你的任務是根據提供的 Minecraft 速通排名賽資料，為使用者提供專業的分析與建議。

## 規則
1. 你只能分析提供給你的 MCSR 資料
2. 如果使用者問的問題與 MCSR Ranked 無關，請禮貌地說：「抱歉，我只能分析 MCSR Ranked 的資料。請問一個關於玩家數據、比賽紀錄或排名的問題。」
3. 分析時請具體引用數據（例如：勝率 65%、平均完成時間 12:34）
4. 給出有建設性的觀察和建議
5. 使用繁體中文回應
6. 保持友善、專業的語調

## 你可以分析的資料類型
- 玩家 Elo 分數和排名
- 比賽紀錄（勝敗、完成時間、對手）
- Elo 趨勢變化
- Seed 類型表現（Village, Desert Temple, Shipwreck 等）
- 賽季統計（勝場、敗場、完成率、棄賽率）
- 玩家對戰紀錄

## 回應格式
- 使用簡潔清晰的格式
- 適當使用 emoji 增加可讀性
- 可以使用列表呈現數據
- 控制回應長度在 400 字以內
- 如果資料不足，誠實說明並給出可能的解釋`;

/**
 * Extract player name from user message
 * @param {string} message - User's message
 * @returns {string|null} Extracted player name or null
 */
function extractPlayerName(message) {
    // Common patterns for player name extraction
    const patterns = [
        /分析\s*[「「]?(\w+)[」」]?/,
        /(\w+)\s*的(?:數據|資料|統計|表現|戰績)/,
        /查(?:詢|看|找)\s*(\w+)/,
        /player\s*[:：]?\s*(\w+)/i,
        /^(\w+)$/,  // If message is just a player name
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    // Try to find a word that looks like a Minecraft username (3-16 chars, alphanumeric + underscore)
    const words = message.split(/\s+/);
    for (const word of words) {
        if (/^[a-zA-Z0-9_]{3,16}$/.test(word)) {
            return word;
        }
    }

    return null;
}

/**
 * Fetch player profile from MCSR API
 * @param {string} nickname - Player nickname
 * @returns {Promise<object|null>} Player data or null if not found
 */
async function fetchPlayerProfile(nickname) {
    try {
        const response = await fetch(`${MCSR_API_BASE}/users/${nickname}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.status !== "success" || !data.data) return null;

        return data.data;
    } catch (error) {
        console.error("Failed to fetch player profile:", error);
        return null;
    }
}

/**
 * Fetch player matches from MCSR API
 * @param {string} nickname - Player nickname
 * @param {number} count - Number of matches to fetch
 * @returns {Promise<array>} Array of matches
 */
async function fetchPlayerMatches(nickname, count = 20) {
    try {
        const response = await fetch(
            `${MCSR_API_BASE}/users/${nickname}/matches?count=${count}&type=2`
        );
        if (!response.ok) return [];

        const data = await response.json();
        if (data.status !== "success" || !Array.isArray(data.data)) return [];

        return data.data;
    } catch (error) {
        console.error("Failed to fetch player matches:", error);
        return [];
    }
}

/**
 * Format player data for AI context
 * @param {object} profile - Player profile data
 * @param {array} matches - Player matches
 * @returns {string} Formatted data string
 */
function formatPlayerDataForAI(profile, matches) {
    if (!profile) return "無法取得玩家資料。";

    const stats = profile.statistics?.season || {};
    const totalStats = profile.statistics?.total || {};
    const seasonResult = profile.seasonResult || {};

    let dataStr = `## 玩家資料：${profile.nickname}\n`;
    dataStr += `- UUID: ${profile.uuid}\n`;
    dataStr += `- Elo 分數: ${profile.eloRate || "N/A"}\n`;
    dataStr += `- 排名: #${profile.eloRank || "N/A"}\n`;
    dataStr += `- 國家/地區: ${profile.country || "未知"}\n\n`;

    dataStr += `## 本賽季統計\n`;
    dataStr += `- 比賽場數: ${stats.playedMatches?.ranked || 0}\n`;
    dataStr += `- 勝場: ${stats.wins?.ranked || 0}\n`;
    dataStr += `- 敗場: ${stats.loses?.ranked || 0}\n`;
    dataStr += `- 完成場數: ${stats.completions?.ranked || 0}\n`;
    dataStr += `- 棄賽場數: ${stats.forfeits?.ranked || 0}\n`;

    const wins = stats.wins?.ranked || 0;
    const total = stats.playedMatches?.ranked || 0;
    if (total > 0) {
        dataStr += `- 勝率: ${((wins / total) * 100).toFixed(1)}%\n`;
    }

    if (stats.bestTime?.ranked) {
        const ms = stats.bestTime.ranked;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        dataStr += `- 最佳時間: ${minutes}:${seconds.toString().padStart(2, "0")}\n`;
    }

    dataStr += `\n## 賽季 Elo 變化\n`;
    dataStr += `- 最高 Elo: ${seasonResult.highest || "N/A"}\n`;
    dataStr += `- 最低 Elo: ${seasonResult.lowest || "N/A"}\n`;

    if (matches && matches.length > 0) {
        dataStr += `\n## 最近 ${matches.length} 場比賽\n`;

        let recentWins = 0;
        let recentLosses = 0;

        matches.slice(0, 10).forEach((match, i) => {
            const isWin = match.result?.uuid === profile.uuid;
            if (isWin) recentWins++;
            else recentLosses++;

            const result = isWin ? "勝" : "敗";
            const eloChange = match.eloChange || 0;
            const changeStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;

            // Get opponent info
            const opponent = match.players?.find(p => p.uuid !== profile.uuid);
            const opponentName = opponent?.nickname || "未知";

            dataStr += `${i + 1}. ${result} vs ${opponentName} (Elo ${changeStr})\n`;
        });

        dataStr += `\n最近 10 場戰績: ${recentWins} 勝 ${recentLosses} 敗\n`;
    }

    return dataStr;
}

/**
 * Call OpenAI API
 * @param {string} userMessage - User's message
 * @param {string} context - Data context for AI
 * @returns {Promise<string>} AI response
 */
async function callOpenAI(userMessage, context) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
    ];

    if (context) {
        messages.push({
            role: "user",
            content: `以下是 MCSR Ranked 的資料：\n\n${context}`,
        });
        messages.push({
            role: "assistant",
            content: "好的，我已經收到資料了。請問你想了解什麼？",
        });
    }

    messages.push({ role: "user", content: userMessage });

    const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.7,
            max_tokens: 800,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI API error:", error);
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "抱歉，我無法生成回應。";
}

/**
 * Main handler for the API endpoint
 */
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight request
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // Only accept POST requests
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { message } = req.body;

        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "Message is required" });
        }

        // Extract player name from message
        const playerName = extractPlayerName(message);

        let context = "";
        let playerData = null;

        if (playerName) {
            console.log(`Fetching data for player: ${playerName}`);

            // Fetch player data
            const [profile, matches] = await Promise.all([
                fetchPlayerProfile(playerName),
                fetchPlayerMatches(playerName, 20),
            ]);

            if (profile) {
                playerData = { profile, matches };
                context = formatPlayerDataForAI(profile, matches);
            } else {
                context = `找不到玩家「${playerName}」的資料。請確認玩家 ID 是否正確。`;
            }
        }

        // Call OpenAI
        const reply = await callOpenAI(message, context);

        return res.status(200).json({
            reply,
            playerFound: !!playerData,
            playerName: playerName || null,
        });

    } catch (error) {
        console.error("API Error:", error);

        // Handle specific errors
        if (error.message.includes("OPENAI_API_KEY")) {
            return res.status(500).json({
                error: "AI 服務尚未設定，請稍後再試。",
                reply: "⚠️ AI 服務尚可能還沒成功設定（需要設定環境變數） <br><small>（開發中：請確認 Vercel 環境變數已設定 OPENAI_API_KEY）</small>",
            });
        }

        return res.status(500).json({
            error: "Internal server error",
            reply: "⚠️ 抱歉，發生了錯誤。請稍後再試。",
        });
    }
}
