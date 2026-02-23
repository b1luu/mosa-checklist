window.MOSA_SHARED_CONFIG = {
    // Keep false for local-only mode.
    enabled: false,
    provider: "firebase",
    auth: {
        // Keep true to require PIN login on index/opening/closing pages.
        enabled: true,
        // Map each 4-digit clock-in PIN to a worker display name.
        // Example:
        // pinUsers: {
        //     "1234": "Alex",
        //     "5678": "Jamie"
        // }
        pinUsers: {
            "0000": "Mosa Worker"
        },
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
