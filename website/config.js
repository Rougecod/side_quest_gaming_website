const CONFIG = {
    API_BASE: (() => {
        const configuredApiBase = window.VITE_API_BASE || "https://side-quest-backend.onrender.com";
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        if (isLocal) return "http://localhost:3000";
        if (configuredApiBase) return configuredApiBase.replace(/\/$/, "");
        return "https://side-quest-backend.onrender.com";
    })(),
    PS5_RATE: 150,
    POOL_RATE: 200,
    PS5_CAPACITY: 8,
    POOL_CAPACITY: 4
};

window.CONFIG = CONFIG;
