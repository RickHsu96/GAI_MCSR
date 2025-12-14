// Elo rank definitions
const eloRanks = [
  { name: "Netherite", tier: "", min: 2000, color: "#4A4A4A", icon: "💎", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/netherite_ingot.png" },
  { name: "Diamond", tier: "III", min: 1800, color: "#55FFFF", icon: "💠", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/diamond.png" },
  { name: "Diamond", tier: "II", min: 1650, color: "#55FFFF", icon: "💠", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/diamond.png" },
  { name: "Diamond", tier: "I", min: 1500, color: "#55FFFF", icon: "💠", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/diamond.png" },
  { name: "Emerald", tier: "III", min: 1400, color: "#00FF00", icon: "💚", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/emerald.png" },
  { name: "Emerald", tier: "II", min: 1300, color: "#00FF00", icon: "💚", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/emerald.png" },
  { name: "Emerald", tier: "I", min: 1200, color: "#00FF00", icon: "💚", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/emerald.png" },
  { name: "Gold", tier: "III", min: 1100, color: "#FFD700", icon: "🟨", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/gold_ingot.png" },
  { name: "Gold", tier: "II", min: 1000, color: "#FFD700", icon: "🟨", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/gold_ingot.png" },
  { name: "Gold", tier: "I", min: 900, color: "#FFD700", icon: "🟨", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/gold_ingot.png" },
  { name: "Iron", tier: "III", min: 800, color: "#D8D8D8", icon: "⚙️", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/iron_ingot.png" },
  { name: "Iron", tier: "II", min: 700, color: "#D8D8D8", icon: "⚙️", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/iron_ingot.png" },
  { name: "Iron", tier: "I", min: 600, color: "#D8D8D8", icon: "⚙️", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/iron_ingot.png" },
  { name: "Coal", tier: "III", min: 500, color: "#2F2F2F", icon: "⚫", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/coal.png" },
  { name: "Coal", tier: "II", min: 400, color: "#2F2F2F", icon: "⚫", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/coal.png" },
  { name: "Coal", tier: "I", min: 0, color: "#2F2F2F", icon: "⚫", iconUrl: "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/coal.png" },
];

export function getEloRank(elo) {
  if (!elo || elo < 0) return eloRanks[eloRanks.length - 1];
  for (const rank of eloRanks) {
    if (elo >= rank.min) {
      return rank;
    }
  }
  return eloRanks[eloRanks.length - 1];
}

export function formatEloWithRank(elo) {
  if (!elo && elo !== 0) return "--";
  const rank = getEloRank(elo);
  const displayName = rank.tier ? `${rank.name} ${rank.tier}` : rank.name;
  return {
    value: elo.toLocaleString(),
    rank: rank,
    displayName: displayName,
  };
}

export function getPlayerAvatar(uuid, size = 32) {
  return `https://mc-heads.net/avatar/${uuid}/${size}`;
}

export function formatDate(seconds) {
  if (!seconds) return "--";
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(seconds) {
  if (!seconds) return "--";
  const date = new Date(seconds * 1000);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms) {
  if (!ms) return "--";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatFullMs(ms) {
  if (ms === null || ms === undefined) return "--";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
