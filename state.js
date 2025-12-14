export const state = {
  users: [],
  recordUsers: [],
  filtered: [],
  timer: null,
  currentSeasonNumber: null, // current season number for match queries
  leaderboardPage: 1,
  leaderboardPageSize: 50, // show 50 per page; top 150 => 3 pages
  leaderboardType: "elo",
  recordLoading: false,
  lastError: false,
};
