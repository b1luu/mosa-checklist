(function () {
    const AUTH_STORAGE_KEY = "mosa:pinAuth";
    const REDIRECT_PARAM = "redirect";
    const DEFAULT_REMEMBER_HOURS = 12;

    function getConfig() {
        const rootConfig = window.MOSA_SHARED_CONFIG || {};
        const authConfig = rootConfig.auth || {};
        const pinCodes = Array.isArray(authConfig.pinCodes)
            ? authConfig.pinCodes
            : authConfig.pinCode
                ? [authConfig.pinCode]
                : [];

        return {
            enabled: authConfig.enabled !== false,
            rememberHours: Number(authConfig.rememberHours) > 0
                ? Number(authConfig.rememberHours)
                : DEFAULT_REMEMBER_HOURS,
            pinCodes: pinCodes
                .map((code) => String(code).trim())
                .filter((code) => /^\d{4}$/.test(code))
        };
    }

    function nowMs() {
        return Date.now();
    }

    function loadAuthRecord() {
        const rawRecord = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!rawRecord) {
            return null;
        }

        try {
            const parsedRecord = JSON.parse(rawRecord);
            if (!parsedRecord || typeof parsedRecord !== "object") {
                return null;
            }

            if (typeof parsedRecord.expiresAt !== "number") {
                return null;
            }

            return parsedRecord;
        } catch {
            return null;
        }
    }

    function saveAuthRecord(rememberHours) {
        const currentMs = nowMs();
        const expiresAt = currentMs + (rememberHours * 60 * 60 * 1000);

        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            grantedAt: currentMs,
            expiresAt
        }));
    }

    function clearAuthRecord() {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    function isAuthenticated() {
        const config = getConfig();
        if (!config.enabled) {
            return true;
        }

        const authRecord = loadAuthRecord();
        if (!authRecord) {
            return false;
        }

        if (authRecord.expiresAt <= nowMs()) {
            clearAuthRecord();
            return false;
        }

        return true;
    }

    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get(REDIRECT_PARAM) || "index.html";

        // Prevent external redirect targets.
        if (!redirect.startsWith("/") && !redirect.endsWith(".html") && !redirect.includes(".html?")) {
            return "index.html";
        }

        return redirect;
    }

    function goToLogin() {
        const currentPathWithSearch = `${window.location.pathname.split("/").pop()}${window.location.search}`;
        const redirectParam = encodeURIComponent(currentPathWithSearch || "index.html");
        window.location.replace(`login.html?${REDIRECT_PARAM}=${redirectParam}`);
    }

    function wireLogoutButtons() {
        const logoutButtons = Array.from(document.querySelectorAll("[data-logout-btn]"));

        logoutButtons.forEach((button) => {
            button.addEventListener("click", () => {
                logout();
            });
        });
    }

    function requireAccess() {
        const config = getConfig();
        if (!config.enabled) {
            wireLogoutButtons();
            return true;
        }

        if (isAuthenticated()) {
            wireLogoutButtons();
            return true;
        }

        goToLogin();
        return false;
    }

    function verifyPin(pinValue) {
        const config = getConfig();
        if (!config.enabled) {
            return true;
        }

        return config.pinCodes.includes(pinValue);
    }

    function setError(errorElement, message) {
        if (!errorElement) {
            return;
        }

        errorElement.textContent = message;
        errorElement.classList.toggle("is-visible", Boolean(message));
    }

    function initLoginPage() {
        const config = getConfig();
        const form = document.querySelector("#pinLoginForm");
        const pinInput = document.querySelector("#pinInput");
        const errorElement = document.querySelector("#pinError");

        if (!form || !pinInput) {
            return;
        }

        if (!config.enabled) {
            window.location.replace(getRedirectUrl());
            return;
        }

        if (config.pinCodes.length === 0) {
            setError(errorElement, "No PIN configured yet. Update shared-config.js.");
            return;
        }

        if (isAuthenticated()) {
            window.location.replace(getRedirectUrl());
            return;
        }

        pinInput.addEventListener("input", () => {
            const onlyDigits = pinInput.value.replace(/\D/g, "").slice(0, 4);
            pinInput.value = onlyDigits;

            if (errorElement && errorElement.classList.contains("is-visible")) {
                setError(errorElement, "");
            }
        });

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const pin = pinInput.value.trim();

            if (!/^\d{4}$/.test(pin)) {
                setError(errorElement, "Enter a valid 4-digit PIN.");
                pinInput.focus();
                return;
            }

            if (!verifyPin(pin)) {
                setError(errorElement, "Incorrect PIN. Try again.");
                pinInput.focus();
                return;
            }

            saveAuthRecord(config.rememberHours);
            window.location.replace(getRedirectUrl());
        });
    }

    function logout() {
        clearAuthRecord();
        window.location.replace("login.html");
    }

    window.MosaPinAuth = {
        isAuthenticated,
        requireAccess,
        initLoginPage,
        logout
    };
})();
