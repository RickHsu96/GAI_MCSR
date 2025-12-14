import { API_URL, RECORD_API_URL } from "./config.js";

async function requestJson(url, options = {}) {
  const resp = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function fetchLeaderboard() {
  const payload = await requestJson(`${API_URL}&t=${Date.now()}`);
  if (payload.status !== "success" || !payload.data?.users) {
    throw new Error("API response format error");
  }
  return payload;
}

export async function fetchRecordLeaderboard() {
  const payload = await requestJson(`${RECORD_API_URL}?t=${Date.now()}`);
  if (payload.status !== "success" || !Array.isArray(payload.data)) {
    throw new Error("Record API response format error");
  }
  return payload;
}

export async function fetchUserProfile(nickname, signal) {
  const payload = await requestJson(`https://mcsrranked.com/api/users/${nickname}?t=${Date.now()}`, {
    signal,
  });
  if (payload.status !== "success" || !payload.data) {
    if (payload.status === "error" && payload.data === "not found") {
      throw new Error("not found");
    }
    throw new Error("User API response format error");
  }
  return payload.data;
}

export async function fetchUserMatches({ nickname, season = null, count = 50, before = null, type = 2, signal } = {}) {
  let url = `https://mcsrranked.com/api/users/${nickname}/matches?sort=newest&count=${count}&t=${Date.now()}`;
  if (type !== null && type !== undefined) {
    url += `&type=${type}`;
  }
  if (season !== null && season !== undefined) {
    url += `&season=${season}`;
  }
  if (before) {
    url += `&before=${before}`;
  }
  const payload = await requestJson(url, { signal });
  if (payload.status !== "success" || !Array.isArray(payload.data)) {
    return [];
  }
  return payload.data;
}

export async function fetchMatchDetail(matchId, signal) {
  const payload = await requestJson(`https://api.mcsrranked.com/matches/${matchId}`, {
    signal,
  });
  if (payload.status !== "success" || !payload.data) {
    throw new Error("Match API response format error");
  }
  return payload.data;
}
