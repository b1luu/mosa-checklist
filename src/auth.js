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

    function closeMenu(menuRoot) {
        const trigger = menuRoot.querySelector("[data-menu-trigger]");
        const panel = menuRoot.querySelector("[data-menu-panel]");

        if (panel) {
            panel.hidden = true;
        }

        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
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

            if (trigger && panel) {
                trigger.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const shouldOpen = panel.hidden;

                    closeAllMenus();

                    panel.hidden = !shouldOpen;
                    trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
                });

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
            return true;
        }

        if (isAuthenticated()) {
            wireMenuControls();
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
