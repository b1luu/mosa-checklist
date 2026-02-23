(function () {
    const AUTH_STORAGE_KEY = "mosa:pinAuth";
    const REDIRECT_PARAM = "redirect";
    const DEFAULT_REMEMBER_HOURS = 12;
    const WORKER_NAME_KEY = "mosa:workerName";
    const WORKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 .'-]*$/;

    function getConfig() {
        const rootConfig = window.MOSA_SHARED_CONFIG || {};
        const authConfig = rootConfig.auth || {};
        const pinCodes = Array.isArray(authConfig.pinCodes)
            ? authConfig.pinCodes
            : authConfig.pinCode
                ? [authConfig.pinCode]
                : [];
        const pinUsers = {};

        if (authConfig.pinUsers && typeof authConfig.pinUsers === "object") {
            Object.entries(authConfig.pinUsers).forEach(([rawPin, rawName]) => {
                const pin = String(rawPin || "").trim();
                const name = String(rawName || "").trim();

                if (!/^\d{4}$/.test(pin)) {
                    return;
                }

                if (!isValidWorkerName(name)) {
                    return;
                }

                pinUsers[pin] = name;
            });
        }

        // Backward compatibility: allow pinCodes array without names.
        if (Object.keys(pinUsers).length === 0) {
            pinCodes
                .map((code) => String(code).trim())
                .filter((code) => /^\d{4}$/.test(code))
                .forEach((pin) => {
                    pinUsers[pin] = `Worker ${pin}`;
                });
        }

        return {
            enabled: authConfig.enabled !== false,
            rememberHours: Number(authConfig.rememberHours) > 0
                ? Number(authConfig.rememberHours)
                : DEFAULT_REMEMBER_HOURS,
            pinUsers
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

    function loadWorkerName() {
        return (localStorage.getItem(WORKER_NAME_KEY) || "").trim();
    }

    function saveWorkerName(name) {
        const trimmedName = String(name || "").trim();
        if (trimmedName) {
            localStorage.setItem(WORKER_NAME_KEY, trimmedName);
            return;
        }

        localStorage.removeItem(WORKER_NAME_KEY);
    }

    function getWorkerNameValidationMessage(name) {
        const trimmedName = String(name || "").trim();
        if (!trimmedName) {
            return "Enter your name.";
        }

        if (trimmedName.length < 2) {
            return "Name must be at least 2 characters.";
        }

        if (!WORKER_NAME_PATTERN.test(trimmedName)) {
            return "Use letters, numbers, spaces, apostrophes, periods, or hyphens.";
        }

        return "";
    }

    function isValidWorkerName(name) {
        return getWorkerNameValidationMessage(name) === "";
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

    function getWorkerInitials(name) {
        const normalizedName = String(name || "").trim();
        if (!normalizedName) {
            return "";
        }

        const nameParts = normalizedName.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        if (nameParts.length === 0) {
            return "";
        }

        if (nameParts.length === 1) {
            return nameParts[0].slice(0, 2).toUpperCase();
        }

        return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    }

    function renderMenuTriggerIdentity(name) {
        const normalizedName = String(name || "").trim();
        const initials = getWorkerInitials(normalizedName);
        const triggerLabel = initials || "⚙";
        const triggers = Array.from(document.querySelectorAll("[data-menu-trigger]"));

        triggers.forEach((trigger) => {
            trigger.textContent = triggerLabel;
            trigger.classList.toggle("is-initials", Boolean(initials));
            trigger.setAttribute(
                "aria-label",
                initials ? `Open menu for ${normalizedName}` : "Open menu"
            );
        });
    }

    function escapeCsvValue(rawValue) {
        const value = rawValue == null ? "" : String(rawValue);
        return `"${value.replace(/"/g, '""')}"`;
    }

    function downloadCsvFile(fileName, content) {
        const csvBlob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const csvUrl = URL.createObjectURL(csvBlob);
        const anchor = document.createElement("a");
        anchor.href = csvUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(csvUrl);
    }

    function getChecklistTypeFromStorageKey(storageKey) {
        const keyMatch = storageKey.match(/^mosa:(.+):master-rows$/);
        if (!keyMatch) {
            return "";
        }

        const pathPart = keyMatch[1];
        if (pathPart.includes("opening")) {
            return "opening";
        }

        if (pathPart.includes("closing")) {
            return "closing";
        }

        return "unknown";
    }

    function collectLocalMasterRows() {
        const rows = [];

        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (!storageKey || !storageKey.endsWith(":master-rows")) {
                continue;
            }

            const checklistType = getChecklistTypeFromStorageKey(storageKey);

            try {
                const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                    continue;
                }

                Object.keys(parsed).forEach((sessionId) => {
                    const sessionRows = parsed[sessionId];
                    if (!sessionRows || typeof sessionRows !== "object" || Array.isArray(sessionRows)) {
                        return;
                    }

                    Object.keys(sessionRows).forEach((sectionKey) => {
                        const row = sessionRows[sectionKey] || {};
                        rows.push({
                            checklistType,
                            sessionId: row.sessionId || sessionId,
                            sectionKey: row.sectionKey || sectionKey,
                            sectionTitle: row.sectionTitle || "",
                            chunkNumber: row.chunkNumber || "",
                            chunkLabel: row.chunkLabel || "",
                            completed: row.completed ? "TRUE" : "FALSE",
                            checkedBy: row.checkedBy || "",
                            checkedAt: row.checkedAt || "",
                            lastUpdatedBy: row.lastUpdatedBy || "",
                            lastUpdatedAt: row.lastUpdatedAt || ""
                        });
                    });
                });
            } catch {
                // Skip malformed local storage records.
            }
        }

        rows.sort((a, b) => {
            return a.checklistType.localeCompare(b.checklistType)
                || a.sessionId.localeCompare(b.sessionId)
                || a.sectionKey.localeCompare(b.sectionKey);
        });

        return rows;
    }

    function buildMasterCsvContent(rows, exportedAtIso) {
        const header = [
            "exported_at",
            "checklist_type",
            "session_id",
            "section_key",
            "section_title",
            "chunk_number",
            "chunk_label",
            "completed",
            "checked_by",
            "checked_at",
            "last_updated_by",
            "last_updated_at"
        ];

        const csvRows = rows.map((row) => ([
            exportedAtIso,
            row.checklistType,
            row.sessionId,
            row.sectionKey,
            row.sectionTitle,
            row.chunkNumber,
            row.chunkLabel,
            row.completed,
            row.checkedBy,
            row.checkedAt,
            row.lastUpdatedBy,
            row.lastUpdatedAt
        ]));

        return [header, ...csvRows]
            .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
            .join("\n");
    }

    function downloadMasterCsvFallback() {
        const rows = collectLocalMasterRows();

        if (rows.length === 0) {
            window.alert("No master CSV data yet.");
            return;
        }

        const exportedAtIso = new Date().toISOString();
        const csvContent = buildMasterCsvContent(rows, exportedAtIso);
        downloadCsvFile("mosa-master.csv", csvContent);
    }

    function downloadMasterCsv() {
        if (
            window.MosaChecklistActions
            && typeof window.MosaChecklistActions.downloadMasterCsv === "function"
        ) {
            window.MosaChecklistActions.downloadMasterCsv();
            return;
        }

        downloadMasterCsvFallback();
    }

    function setMenuOpen(menuRoot, shouldOpen) {
        const trigger = menuRoot.querySelector("[data-menu-trigger]");
        menuRoot.classList.toggle("is-open", shouldOpen);

        if (trigger) {
            trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        }
    }

    function closeMenu(menuRoot) {
        setMenuOpen(menuRoot, false);
    }

    function closeAllMenus() {
        const menuRoots = Array.from(document.querySelectorAll("[data-menu-root]"));
        menuRoots.forEach((menuRoot) => closeMenu(menuRoot));
    }

    function wireMenuControls() {
        const menuRoots = Array.from(document.querySelectorAll("[data-menu-root]"));

        menuRoots.forEach((menuRoot) => {
            const trigger = menuRoot.querySelector("[data-menu-trigger]");
            const panel = menuRoot.querySelector("[data-menu-panel]");
            const downloadButton = menuRoot.querySelector("[data-menu-download]");
            const logoutButton = menuRoot.querySelector("[data-logout-btn]");

            if (trigger) {
                trigger.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const shouldOpen = !menuRoot.classList.contains("is-open");

                    closeAllMenus();
                    setMenuOpen(menuRoot, shouldOpen);
                });
            }

            if (panel) {
                panel.addEventListener("click", (event) => {
                    event.stopPropagation();
                });
            }

            if (downloadButton) {
                downloadButton.addEventListener("click", () => {
                    closeMenu(menuRoot);
                    downloadMasterCsv();
                });
            }

            if (logoutButton) {
                logoutButton.addEventListener("click", () => {
                    closeMenu(menuRoot);
                    logout();
                });
            }
        });

        document.addEventListener("click", () => {
            closeAllMenus();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeAllMenus();
            }
        });
    }

    function requireAccess() {
        const config = getConfig();
        if (!config.enabled) {
            wireMenuControls();
            const workerName = loadWorkerName();
            if (isValidWorkerName(workerName)) {
                renderMenuTriggerIdentity(workerName);
            } else {
                renderMenuTriggerIdentity("");
            }
            return true;
        }

        if (isAuthenticated()) {
            const workerName = loadWorkerName();
            if (!isValidWorkerName(workerName)) {
                clearAuthRecord();
                goToLogin();
                return false;
            }

            wireMenuControls();
            renderMenuTriggerIdentity(workerName);
            return true;
        }

        goToLogin();
        return false;
    }

    function getWorkerNameFromPin(pinValue) {
        const config = getConfig();
        if (!config.enabled) {
            return "";
        }

        return config.pinUsers[pinValue] || "";
    }

    function verifyPin(pinValue) {
        return Boolean(getWorkerNameFromPin(pinValue));
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
        let isRedirecting = false;

        if (!form || !pinInput) {
            return;
        }

        if (!config.enabled) {
            window.location.replace(getRedirectUrl());
            return;
        }

        if (Object.keys(config.pinUsers).length === 0) {
            setError(errorElement, "No PIN mapping configured. Update shared-config.js.");
            return;
        }

        if (isAuthenticated()) {
            const savedWorkerName = loadWorkerName();
            if (isValidWorkerName(savedWorkerName)) {
                window.location.replace(getRedirectUrl());
                return;
            }

            clearAuthRecord();
            saveWorkerName("");
        }

        function completeLogin(pin) {
            if (isRedirecting) {
                return true;
            }

            const workerName = getWorkerNameFromPin(pin);
            if (!workerName || !verifyPin(pin)) {
                return false;
            }

            isRedirecting = true;
            saveWorkerName(workerName);
            saveAuthRecord(config.rememberHours);
            window.location.replace(getRedirectUrl());
            return true;
        }

        pinInput.addEventListener("input", () => {
            const onlyDigits = pinInput.value.replace(/\D/g, "").slice(0, 4);
            pinInput.value = onlyDigits;

            if (errorElement && errorElement.classList.contains("is-visible")) {
                setError(errorElement, "");
            }

            if (onlyDigits.length === 4) {
                if (!completeLogin(onlyDigits)) {
                    setError(errorElement, "Incorrect PIN. Try again.");
                }
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

            if (!completeLogin(pin)) {
                setError(errorElement, "Incorrect PIN. Try again.");
                pinInput.focus();
                return;
            }
        });
    }

    function logout() {
        clearAuthRecord();
        saveWorkerName("");
        window.location.replace("login.html");
    }

    window.MosaPinAuth = {
        isAuthenticated,
        requireAccess,
        initLoginPage,
        logout
    };
})();
