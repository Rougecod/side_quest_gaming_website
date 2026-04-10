const CONFIG = {
    API_BASE: (() => {
        const deployedApiBase = "https://your-backend-url.com";
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        return isLocal ? "http://localhost:3000" : deployedApiBase;
    })(),
    PS5_RATE: 150,
    POOL_RATE: 200,
    PS5_CAPACITY: 8,
    POOL_CAPACITY: 4
};
