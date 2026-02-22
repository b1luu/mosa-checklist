window.MOSA_SHARED_CONFIG = {
    // Keep false for local-only mode.
    enabled: false,
    provider: "firebase",
    auth: {
        // Keep true to require PIN login on index/opening/closing pages.
        enabled: true,
        // Add one or more 4-digit clock-in PIN codes.
        // Example: ["1234", "5678"]
        pinCodes: ["0000"],
        // How long PIN access remains valid in this browser.
        rememberHours: 12
    },
    firebase: {
        apiKey: "",
        authDomain: "",
        databaseURL: "",
        projectId: "",
        appId: ""
    }
};
