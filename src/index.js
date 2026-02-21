const checkboxInputs = Array.from(document.querySelectorAll('input[type="checkbox"][name]'));

if (checkboxInputs.length === 0) {
    // No checklist on this page.
} else {
    const chunkSections = Array.from(document.querySelectorAll('.checklist-group[data-chunk]'));
    const chunkTabs = Array.from(document.querySelectorAll('.chunk-tab'));
    const completeChunkButton = document.querySelector('[data-chunk-action="complete-next"]');
    const chunkStatus = document.querySelector('.chunk-status');
    const workerNameInput = document.querySelector('#workerNameInput');
    const workerNameError = document.querySelector('#workerNameError');
    const downloadCsvButton = document.querySelector('#downloadCsvButton');
    const archiveStatusText = document.querySelector('#archiveStatusText');
    const saveWorkerNameButton = document.querySelector('#saveWorkerNameButton');
    const sessionIdText = document.querySelector('#sessionIdText');
    const syncStatusText = document.querySelector('#syncStatusText');

    const chunkNumbers = [...new Set(chunkSections.map((section) => Number(section.dataset.chunk)))].sort((a, b) => a - b);
    const defaultChunk = chunkNumbers[0] || 1;
    const chunkItemNamesByChunk = {};
    const sectionMetaByName = {};
    const sectionDetailsByName = {};
    const chunkLabelByNumber = {};

    chunkTabs.forEach((tab) => {
        const chunkNumber = Number(tab.dataset.chunkTarget);
        const chunkLabel = tab.textContent.trim();
        if (chunkNumber) {
            chunkLabelByNumber[chunkNumber] = chunkLabel;
        }
    });

    chunkSections.forEach((section) => {
        const chunkNumber = Number(section.dataset.chunk);
        const checkbox = section.querySelector('input[type="checkbox"][name]');
        const sectionHeading = section.querySelector('h2');
        const sectionTitle = sectionHeading ? sectionHeading.textContent.trim() : checkbox ? checkbox.name : '';

        if (!checkbox) {
            return;
        }

        if (!chunkItemNamesByChunk[chunkNumber]) {
            chunkItemNamesByChunk[chunkNumber] = [];
        }

        chunkItemNamesByChunk[chunkNumber].push(checkbox.name);
        sectionDetailsByName[checkbox.name] = {
            sectionTitle,
            chunkNumber,
            chunkLabel: chunkLabelByNumber[chunkNumber] || ''
        };

        const sectionLabel = checkbox.closest('.section-complete');
        if (sectionLabel) {
            const sectionMeta = document.createElement('p');
            sectionMeta.className = 'section-meta';
            sectionMeta.dataset.metaFor = checkbox.name;
            sectionLabel.insertAdjacentElement('afterend', sectionMeta);
            sectionMetaByName[checkbox.name] = sectionMeta;
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const todaySessionId = new Date().toISOString().slice(0, 10);
    const sessionId = (urlParams.get('session') || todaySessionId).trim();

    if (!urlParams.get('session')) {
        urlParams.set('session', sessionId);
        const nextUrl = `${window.location.pathname}?${urlParams.toString()}`;
        window.history.replaceState({}, '', nextUrl);
    }

    const WORKER_NAME_KEY = 'mosa:workerName';
    const STATE_STORAGE_KEY = `mosa:${window.location.pathname}:state:${sessionId}`;
    const WORKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 .'-]*$/;
    const CSV_EXPORTED_AT_KEY = `mosa:${window.location.pathname}:csv-exported-at:${sessionId}`;
    const CSV_ARCHIVE_KEY = `mosa:${window.location.pathname}:csv-archive:${sessionId}`;
    const SESSION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

    const sharedConfig = window.MOSA_SHARED_CONFIG || {};
    const firebaseConfig = sharedConfig.firebase || {};

    let workerName = (localStorage.getItem(WORKER_NAME_KEY) || '').trim();
    let activeChunk = defaultChunk;
    let dbRef = null;

    function setSyncStatus(message) {
        if (syncStatusText) {
            syncStatusText.textContent = message;
        }
    }

    function setArchiveStatus(message) {
        if (archiveStatusText) {
            archiveStatusText.textContent = message;
        }
    }

    function escapeCsvValue(rawValue) {
        const value = rawValue == null ? '' : String(rawValue);
        const escapedValue = value.replace(/"/g, '""');
        return `"${escapedValue}"`;
    }

    function buildCsvContent(stateSnapshot, exportedAtIso) {
        const header = [
            'session_id',
            'exported_at',
            'section_key',
            'section_title',
            'chunk_number',
            'chunk_label',
            'completed',
            'checked_by',
            'checked_at',
            'last_updated_by',
            'last_updated_at'
        ];

        const rows = checkboxInputs.map((checkbox) => {
            const itemName = checkbox.name;
            const item = stateSnapshot.items[itemName] || {
                checked: false,
                checkedBy: null,
                checkedAt: null
            };
            const sectionDetails = sectionDetailsByName[itemName] || {
                sectionTitle: '',
                chunkNumber: '',
                chunkLabel: ''
            };

            return [
                sessionId,
                exportedAtIso,
                itemName,
                sectionDetails.sectionTitle,
                sectionDetails.chunkNumber,
                sectionDetails.chunkLabel,
                item.checked ? 'TRUE' : 'FALSE',
                item.checkedBy || '',
                item.checkedAt || '',
                stateSnapshot.updatedBy || '',
                stateSnapshot.updatedAt || ''
            ];
        });

        return [header, ...rows]
            .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
            .join('\n');
    }

    function downloadCsv(csvContent, fileName) {
        const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const anchor = document.createElement('a');
        anchor.href = csvUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(csvUrl);
    }

    function parseSessionDate(value) {
        if (!SESSION_DATE_PATTERN.test(value)) {
            return null;
        }

        const [year, month, day] = value.split('-').map((part) => Number(part));
        const date = new Date(year, month - 1, day);

        if (
            Number.isNaN(date.getTime()) ||
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        return date;
    }

    function getSessionCutoffDate() {
        const sessionDate = parseSessionDate(sessionId);
        if (!sessionDate) {
            return null;
        }

        return new Date(
            sessionDate.getFullYear(),
            sessionDate.getMonth(),
            sessionDate.getDate() + 1,
            0,
            0,
            0,
            0
        );
    }

    function getExportedAtTimestamp() {
        return localStorage.getItem(CSV_EXPORTED_AT_KEY);
    }

    function isCsvAlreadyExported() {
        return Boolean(getExportedAtTimestamp());
    }

    function archiveChecklistToCsv(triggerLabel, { force = false } = {}) {
        if (isCsvAlreadyExported() && !force) {
            return;
        }

        const exportedAtIso = new Date().toISOString();
        const csvContent = buildCsvContent(checklistState, exportedAtIso);
        const csvFileName = `mosa-closing-${sessionId}.csv`;

        downloadCsv(csvContent, csvFileName);

        if (!isCsvAlreadyExported()) {
            try {
                localStorage.setItem(CSV_ARCHIVE_KEY, csvContent);
                localStorage.setItem(CSV_EXPORTED_AT_KEY, exportedAtIso);
            } catch {
                // Fallback still works because download already happened.
            }
        }

        setArchiveStatus(`CSV export: completed (${triggerLabel}) at ${formatCheckedAt(exportedAtIso)}`);
    }

    function scheduleCsvMidnightExport() {
        const cutoffDate = getSessionCutoffDate();
        if (!cutoffDate) {
            setArchiveStatus('CSV export: invalid session id format.');
            return;
        }

        const existingExport = getExportedAtTimestamp();
        if (existingExport) {
            setArchiveStatus(`CSV export: already completed at ${formatCheckedAt(existingExport)}`);
            return;
        }

        const now = new Date();
        if (now.getTime() >= cutoffDate.getTime()) {
            archiveChecklistToCsv('auto');
            return;
        }

        setArchiveStatus(`CSV export: scheduled for ${cutoffDate.toLocaleString()}`);
        const oneMinuteMs = 60 * 1000;

        window.setInterval(() => {
            if (isCsvAlreadyExported()) {
                return;
            }

            if (Date.now() >= cutoffDate.getTime()) {
                archiveChecklistToCsv('auto');
            }
        }, oneMinuteMs);
    }

    function setWorkerNameError(message = '') {
        if (workerNameInput) {
            const hasError = Boolean(message);
            workerNameInput.classList.toggle('is-invalid', hasError);
            workerNameInput.setAttribute('aria-invalid', hasError ? 'true' : 'false');
        }

        if (workerNameError) {
            workerNameError.textContent = message;
            workerNameError.classList.toggle('is-visible', Boolean(message));
        }
    }

    function validateWorkerName(rawValue, { showError = false } = {}) {
        const name = rawValue.trim();
        let message = '';

        if (!name) {
            message = 'Enter your name before checking tasks.';
        } else if (name.length < 2) {
            message = 'Name must be at least 2 characters.';
        } else if (!WORKER_NAME_PATTERN.test(name)) {
            message = 'Use letters, numbers, spaces, apostrophes, periods, or hyphens.';
        }

        if (showError) {
            setWorkerNameError(message);
        }

        return !message;
    }

    function createDefaultState() {
        const items = {};

        checkboxInputs.forEach((checkbox) => {
            items[checkbox.name] = {
                checked: false,
                checkedBy: null,
                checkedAt: null
            };
        });

        return {
            sessionId,
            activeChunk: defaultChunk,
            items,
            updatedAt: null,
            updatedBy: null
        };
    }

    function normalizeItem(rawItem) {
        return {
            checked: Boolean(rawItem && rawItem.checked),
            checkedBy: rawItem && rawItem.checkedBy ? String(rawItem.checkedBy) : null,
            checkedAt: rawItem && rawItem.checkedAt ? String(rawItem.checkedAt) : null
        };
    }

    function normalizeState(rawState) {
        const normalized = createDefaultState();

        if (rawState && typeof rawState === 'object') {
            if (chunkNumbers.includes(Number(rawState.activeChunk))) {
                normalized.activeChunk = Number(rawState.activeChunk);
            }

            if (rawState.updatedAt) {
                normalized.updatedAt = String(rawState.updatedAt);
            }

            if (rawState.updatedBy) {
                normalized.updatedBy = String(rawState.updatedBy);
            }

            if (rawState.items && typeof rawState.items === 'object') {
                Object.keys(normalized.items).forEach((name) => {
                    normalized.items[name] = normalizeItem(rawState.items[name]);
                });
            }
        }

        return normalized;
    }

    function loadLocalState() {
        const raw = localStorage.getItem(STATE_STORAGE_KEY);
        if (!raw) {
            return createDefaultState();
        }

        try {
            const parsed = JSON.parse(raw);
            return normalizeState(parsed);
        } catch {
            return createDefaultState();
        }
    }

    let checklistState = loadLocalState();
    activeChunk = checklistState.activeChunk;

    function saveLocalState() {
        checklistState.activeChunk = activeChunk;
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(checklistState));
    }

    function formatCheckedAt(isoString) {
        if (!isoString) {
            return '';
        }

        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function renderSectionMeta() {
        Object.entries(sectionMetaByName).forEach(([name, element]) => {
            const item = checklistState.items[name];

            if (!item || !item.checked) {
                element.textContent = 'Not completed';
                return;
            }

            const checkedByText = item.checkedBy ? ` by ${item.checkedBy}` : '';
            const checkedAtText = item.checkedAt ? ` at ${formatCheckedAt(item.checkedAt)}` : '';
            element.textContent = `Checked${checkedByText}${checkedAtText}`;
        });
    }

    function getChunkProgress(chunkNumber) {
        const itemNames = chunkItemNamesByChunk[chunkNumber] || [];
        const total = itemNames.length;
        const completed = itemNames.filter((name) => checklistState.items[name] && checklistState.items[name].checked).length;

        return { completed, total };
    }

    function updateChunkStatus() {
        if (!chunkStatus || chunkNumbers.length === 0) {
            return;
        }

        const currentChunkIndex = chunkNumbers.indexOf(activeChunk);
        const { completed, total } = getChunkProgress(activeChunk);
        chunkStatus.textContent = `Chunk ${currentChunkIndex + 1} of ${chunkNumbers.length} - Completed ${completed}/${total}`;
    }

    function updateCompleteChunkButton() {
        if (!completeChunkButton || chunkNumbers.length === 0) {
            return;
        }

        const currentChunkIndex = chunkNumbers.indexOf(activeChunk);
        const { completed, total } = getChunkProgress(activeChunk);
        const isChunkDone = total > 0 && completed === total;
        const isLastChunk = currentChunkIndex === chunkNumbers.length - 1;

        if (isLastChunk && isChunkDone) {
            completeChunkButton.textContent = 'All Chunks Completed';
            completeChunkButton.disabled = true;
            return;
        }

        if (isChunkDone) {
            completeChunkButton.textContent = isLastChunk ? 'Finish Checklist' : 'Go to Next Chunk';
            completeChunkButton.disabled = false;
            return;
        }

        completeChunkButton.textContent = isLastChunk ? 'Complete Final Chunk' : 'Complete This Chunk';
        completeChunkButton.disabled = false;
    }

    function renderActiveChunk() {
        chunkSections.forEach((section) => {
            section.classList.toggle('chunk-hidden', Number(section.dataset.chunk) !== activeChunk);
        });

        chunkTabs.forEach((tab) => {
            tab.classList.toggle('is-active', Number(tab.dataset.chunkTarget) === activeChunk);
        });

        updateChunkStatus();
        updateCompleteChunkButton();
    }

    function applyStateToUI() {
        checkboxInputs.forEach((checkbox) => {
            const item = checklistState.items[checkbox.name];
            checkbox.checked = Boolean(item && item.checked);
        });

        activeChunk = chunkNumbers.includes(checklistState.activeChunk) ? checklistState.activeChunk : defaultChunk;

        renderSectionMeta();
        renderActiveChunk();
    }

    function getWorkerName() {
        if (workerNameInput) {
            return workerNameInput.value.trim();
        }

        return workerName;
    }

    function setWorkerName(nextName) {
        workerName = nextName.trim();

        if (workerNameInput) {
            workerNameInput.value = workerName;
        }

        setWorkerNameError('');

        if (workerName) {
            localStorage.setItem(WORKER_NAME_KEY, workerName);
        } else {
            localStorage.removeItem(WORKER_NAME_KEY);
        }
    }

    function requireWorkerName() {
        const currentName = getWorkerName();

        if (validateWorkerName(currentName, { showError: true })) {
            setWorkerName(currentName);
            return currentName.trim();
        }

        if (workerNameInput) {
            workerNameInput.focus();
        }

        return null;
    }

    function hasFirebaseConfig() {
        const requiredKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
        return requiredKeys.every((key) => Boolean(firebaseConfig[key]));
    }

    function pushStateUpdate(changedItemNames = [], includeChunk = false) {
        checklistState.updatedAt = new Date().toISOString();
        checklistState.updatedBy = getWorkerName() || null;

        saveLocalState();

        if (!dbRef) {
            return;
        }

        const updates = {
            updatedAt: checklistState.updatedAt,
            updatedBy: checklistState.updatedBy
        };

        if (includeChunk) {
            updates.activeChunk = activeChunk;
        }

        changedItemNames.forEach((name) => {
            updates[`items/${name}`] = checklistState.items[name];
        });

        dbRef.update(updates).catch(() => {
            setSyncStatus('Mode: Shared sync error. Using local cache.');
        });
    }

    function setActiveChunk(nextChunk, shouldScroll = true, shouldPersist = true) {
        if (!chunkNumbers.includes(nextChunk)) {
            return;
        }

        activeChunk = nextChunk;
        checklistState.activeChunk = nextChunk;

        renderActiveChunk();

        if (shouldPersist) {
            pushStateUpdate([], true);
        }

        if (shouldScroll) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function wireWorkerControls() {
        if (workerNameInput) {
            workerNameInput.value = workerName;
            workerNameInput.addEventListener('input', () => {
                if (workerNameInput.classList.contains('is-invalid')) {
                    validateWorkerName(workerNameInput.value, { showError: true });
                }
            });
            workerNameInput.addEventListener('blur', () => {
                const enteredName = getWorkerName();

                if (!enteredName) {
                    setWorkerNameError('Enter your name before checking tasks.');
                    return;
                }

                validateWorkerName(enteredName, { showError: true });
            });
        }

        if (saveWorkerNameButton) {
            saveWorkerNameButton.addEventListener('click', () => {
                const enteredName = getWorkerName();

                if (!validateWorkerName(enteredName, { showError: true })) {
                    if (workerNameInput) {
                        workerNameInput.focus();
                    }
                    return;
                }

                setWorkerName(enteredName);
            });
        }
    }

    function wireCsvControls() {
        if (!downloadCsvButton) {
            return;
        }

        downloadCsvButton.addEventListener('click', () => {
            archiveChecklistToCsv('manual', { force: true });
        });
    }

    function wireCheckboxControls() {
        checkboxInputs.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                const itemName = checkbox.name;
                const isChecked = checkbox.checked;

                if (isChecked) {
                    const actor = requireWorkerName();
                    if (!actor) {
                        checkbox.checked = false;
                        return;
                    }

                    checklistState.items[itemName] = {
                        checked: true,
                        checkedBy: actor,
                        checkedAt: new Date().toISOString()
                    };
                } else {
                    checklistState.items[itemName] = {
                        checked: false,
                        checkedBy: null,
                        checkedAt: null
                    };
                }

                renderSectionMeta();
                updateChunkStatus();
                updateCompleteChunkButton();
                pushStateUpdate([itemName], false);
            });
        });
    }

    function wireChunkControls() {
        chunkTabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                setActiveChunk(Number(tab.dataset.chunkTarget));
            });
        });

        if (completeChunkButton) {
            completeChunkButton.addEventListener('click', () => {
                const currentChunkItemNames = chunkItemNamesByChunk[activeChunk] || [];
                const uncheckedNames = currentChunkItemNames.filter((name) => !checklistState.items[name].checked);
                const changedItemNames = [];

                if (uncheckedNames.length > 0) {
                    const actor = requireWorkerName();
                    if (!actor) {
                        return;
                    }

                    const checkedAt = new Date().toISOString();

                    uncheckedNames.forEach((name) => {
                        checklistState.items[name] = {
                            checked: true,
                            checkedBy: actor,
                            checkedAt
                        };
                        changedItemNames.push(name);
                    });
                }

                const currentIndex = chunkNumbers.indexOf(activeChunk);
                const nextChunk = chunkNumbers[currentIndex + 1];

                if (nextChunk) {
                    activeChunk = nextChunk;
                    checklistState.activeChunk = nextChunk;
                }

                renderSectionMeta();
                renderActiveChunk();
                pushStateUpdate(changedItemNames, true);

                if (nextChunk) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }
    }

    function initSharedSync() {
        if (!sharedConfig.enabled || sharedConfig.provider !== 'firebase') {
            setSyncStatus('Mode: Local only (shared sync disabled)');
            return;
        }

        if (!window.firebase || !hasFirebaseConfig()) {
            setSyncStatus('Mode: Shared config incomplete. Using local only');
            return;
        }

        try {
            const appName = 'mosa-checklist-shared';
            let firebaseApp;

            try {
                firebaseApp = window.firebase.app(appName);
            } catch {
                firebaseApp = window.firebase.initializeApp(firebaseConfig, appName);
            }

            const db = firebaseApp.database();
            dbRef = db.ref(`checklists/closing/${sessionId}`);
            setSyncStatus('Mode: Connecting to shared session...');

            dbRef.on('value', (snapshot) => {
                const remoteValue = snapshot.val();

                if (!remoteValue) {
                    checklistState.updatedAt = new Date().toISOString();
                    checklistState.updatedBy = getWorkerName() || null;
                    checklistState.activeChunk = activeChunk;
                    dbRef.set(checklistState);
                    setSyncStatus('Mode: Shared live');
                    return;
                }

                checklistState = normalizeState(remoteValue);
                saveLocalState();
                applyStateToUI();
                setSyncStatus('Mode: Shared live');
            }, () => {
                setSyncStatus('Mode: Shared sync error. Using local cache.');
            });
        } catch {
            setSyncStatus('Mode: Shared sync failed. Using local cache.');
        }
    }

    if (sessionIdText) {
        sessionIdText.textContent = sessionId;
    }

    wireWorkerControls();
    wireCsvControls();
    wireCheckboxControls();
    wireChunkControls();
    applyStateToUI();
    initSharedSync();
    scheduleCsvMidnightExport();
}
