const CONFIG = {
    API_BASE: (() => {
        const configuredApiBase = window.VITE_API_BASE || "";
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        if (isLocal) return "http://localhost:3000";
        if (configuredApiBase) return configuredApiBase.replace(/\/$/, "");
        console.warn("VITE_API_BASE is not configured. API requests will use the current origin.");
        return window.location.origin;
    })(),
    PS5_RATE: 150,
    POOL_RATE: 200,
    PS5_CAPACITY: 8,
    POOL_CAPACITY: 4
};

window.CONFIG = CONFIG;
