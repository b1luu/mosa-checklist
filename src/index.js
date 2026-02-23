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
    const sessionIdText = document.querySelector('#sessionIdText');
    const syncStatusText = document.querySelector('#syncStatusText');
    const checklistType = window.location.pathname.includes('opening') ? 'opening' : 'closing';
    const checklistTypeTitle = checklistType.charAt(0).toUpperCase() + checklistType.slice(1);

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

    function getCheckboxLabelText(checkbox) {
        const checkboxLabel = checkbox.closest('label');
        if (!checkboxLabel) {
            return checkbox.name;
        }

        return checkboxLabel.textContent.replace(/\s+/g, ' ').trim();
    }

    chunkSections.forEach((section) => {
        const chunkNumber = Number(section.dataset.chunk);
        const sectionCheckboxes = Array.from(section.querySelectorAll('input[type="checkbox"][name]'));
        const sectionHeading = section.querySelector('h2');
        const sectionTitle = sectionHeading ? sectionHeading.textContent.trim() : '';
        const hasSectionComplete = Boolean(section.querySelector('.section-complete input[type="checkbox"][name]'));

        if (sectionCheckboxes.length === 0) {
            return;
        }

        if (!chunkItemNamesByChunk[chunkNumber]) {
            chunkItemNamesByChunk[chunkNumber] = [];
        }

        sectionCheckboxes.forEach((checkbox) => {
            const itemTitle = hasSectionComplete ? sectionTitle : getCheckboxLabelText(checkbox);

            chunkItemNamesByChunk[chunkNumber].push(checkbox.name);
            sectionDetailsByName[checkbox.name] = {
                sectionTitle: itemTitle,
                chunkNumber,
                chunkLabel: chunkLabelByNumber[chunkNumber] || sectionTitle
            };
        });
    });

    checkboxInputs.forEach((checkbox) => {
        if (!sectionDetailsByName[checkbox.name]) {
            const parentGroup = checkbox.closest('.checklist-group');
            const parentHeading = parentGroup ? parentGroup.querySelector('h2') : null;
            const parsedChunkNumber = parentGroup && parentGroup.dataset.chunk
                ? Number(parentGroup.dataset.chunk)
                : NaN;

            sectionDetailsByName[checkbox.name] = {
                sectionTitle: getCheckboxLabelText(checkbox),
                chunkNumber: Number.isFinite(parsedChunkNumber) ? parsedChunkNumber : '',
                chunkLabel: parentHeading ? parentHeading.textContent.trim() : ''
            };
        }

        let metaElement = null;
        const sectionLabel = checkbox.closest('.section-complete');
        if (sectionLabel) {
            metaElement = document.createElement('p');
            metaElement.className = 'section-meta';
            sectionLabel.insertAdjacentElement('afterend', metaElement);
        } else {
            const checkboxLabel = checkbox.closest('label');
            if (checkboxLabel) {
                metaElement = document.createElement('p');
                metaElement.className = 'item-meta';
                checkboxLabel.insertAdjacentElement('afterend', metaElement);
            }
        }

        if (metaElement) {
            metaElement.dataset.metaFor = checkbox.name;
            sectionMetaByName[checkbox.name] = metaElement;
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
    const MASTER_ROWS_STORAGE_KEY = `mosa:${window.location.pathname}:master-rows`;
    const MASTER_ROWS_UPDATED_AT_KEY = `mosa:${window.location.pathname}:master-updated-at`;

    const sharedConfig = window.MOSA_SHARED_CONFIG || {};
    const firebaseConfig = sharedConfig.firebase || {};

    let workerName = (localStorage.getItem(WORKER_NAME_KEY) || '').trim();
    let activeChunk = defaultChunk;
    let dbRef = null;
    let masterRowsRef = null;
    let hasSeededSharedMasterRows = false;

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

    function loadLocalMasterRows() {
        const raw = localStorage.getItem(MASTER_ROWS_STORAGE_KEY);
        if (!raw) {
            return {};
        }

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }

            return parsed;
        } catch {
            return {};
        }
    }

    function saveLocalMasterRows(masterRows) {
        localStorage.setItem(MASTER_ROWS_STORAGE_KEY, JSON.stringify(masterRows));
    }

    function createMasterRow(itemName) {
        const item = checklistState.items[itemName] || {
            checked: false,
            checkedBy: null,
            checkedAt: null
        };
        const sectionDetails = sectionDetailsByName[itemName] || {
            sectionTitle: '',
            chunkNumber: '',
            chunkLabel: ''
        };

        return {
            sessionId,
            sectionKey: itemName,
            sectionTitle: sectionDetails.sectionTitle,
            chunkNumber: sectionDetails.chunkNumber,
            chunkLabel: sectionDetails.chunkLabel,
            completed: Boolean(item.checked),
            checkedBy: item.checkedBy || '',
            checkedAt: item.checkedAt || '',
            lastUpdatedBy: checklistState.updatedBy || '',
            lastUpdatedAt: checklistState.updatedAt || ''
        };
    }

    function upsertLocalMasterRows(itemNames = []) {
        if (itemNames.length === 0) {
            return;
        }

        const masterRows = loadLocalMasterRows();
        const sessionRows = masterRows[sessionId] && typeof masterRows[sessionId] === 'object'
            ? masterRows[sessionId]
            : {};

        itemNames.forEach((itemName) => {
            sessionRows[itemName] = createMasterRow(itemName);
        });

        masterRows[sessionId] = sessionRows;
        saveLocalMasterRows(masterRows);

        const updatedAtIso = new Date().toISOString();
        localStorage.setItem(MASTER_ROWS_UPDATED_AT_KEY, updatedAtIso);
        setArchiveStatus(`Master CSV: updated at ${formatCheckedAt(updatedAtIso)}`);
    }

    function pushSharedMasterRows(itemNames = []) {
        if (!masterRowsRef || itemNames.length === 0) {
            return;
        }

        const updates = {};
        itemNames.forEach((itemName) => {
            updates[`${sessionId}/${itemName}`] = createMasterRow(itemName);
        });

        masterRowsRef.update(updates).catch(() => {
            setArchiveStatus('Master CSV: shared sync failed, local rows still updated');
        });
    }

    function syncMasterRows(itemNames = [], { includeShared = true } = {}) {
        if (itemNames.length === 0) {
            return;
        }

        upsertLocalMasterRows(itemNames);

        if (includeShared) {
            pushSharedMasterRows(itemNames);
        }
    }

    function normalizeMasterRows(rawRows) {
        if (!rawRows || typeof rawRows !== 'object' || Array.isArray(rawRows)) {
            return {};
        }

        return rawRows;
    }

    function buildMasterCsvContent(masterRowsSnapshot, exportedAtIso) {
        const header = [
            'exported_at',
            'session_id',
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

        const sessionIds = Object.keys(masterRowsSnapshot).sort();
        const rows = [];

        sessionIds.forEach((rowSessionId) => {
            const sessionRows = masterRowsSnapshot[rowSessionId];
            if (!sessionRows || typeof sessionRows !== 'object' || Array.isArray(sessionRows)) {
                return;
            }

            Object.keys(sessionRows)
                .sort()
                .forEach((itemName) => {
                    const row = sessionRows[itemName] || {};
                    rows.push([
                        exportedAtIso,
                        row.sessionId || rowSessionId,
                        row.sectionKey || itemName,
                        row.sectionTitle || '',
                        row.chunkNumber || '',
                        row.chunkLabel || '',
                        row.completed ? 'TRUE' : 'FALSE',
                        row.checkedBy || '',
                        row.checkedAt || '',
                        row.lastUpdatedBy || '',
                        row.lastUpdatedAt || ''
                    ]);
                });
        });

        return [header, ...rows]
            .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
            .join('\n');
    }

    function downloadMasterCsvFromRows(masterRowsSnapshot, sourceLabel) {
        const rowsBySession = normalizeMasterRows(masterRowsSnapshot);
        if (Object.keys(rowsBySession).length === 0) {
            setArchiveStatus('Master CSV: no rows yet');
            return;
        }

        const exportedAtIso = new Date().toISOString();
        const csvContent = buildMasterCsvContent(rowsBySession, exportedAtIso);
        downloadCsv(csvContent, `mosa-${checklistType}-master.csv`);
        setArchiveStatus(`Master CSV: downloaded (${sourceLabel}) at ${formatCheckedAt(exportedAtIso)}`);
    }

    function downloadMasterCsvNow() {
        if (masterRowsRef) {
            masterRowsRef.once('value')
                .then((snapshot) => {
                    const sharedRows = normalizeMasterRows(snapshot.val());
                    if (Object.keys(sharedRows).length > 0) {
                        downloadMasterCsvFromRows(sharedRows, 'shared');
                        return;
                    }

                    downloadMasterCsvFromRows(loadLocalMasterRows(), 'local');
                })
                .catch(() => {
                    downloadMasterCsvFromRows(loadLocalMasterRows(), 'local fallback');
                });
            return;
        }

        downloadMasterCsvFromRows(loadLocalMasterRows(), 'local');
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
                if (element.classList.contains('item-meta')) {
                    element.textContent = '';
                } else {
                    element.textContent = 'Not completed';
                }
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
        syncMasterRows(changedItemNames);

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
                const enteredName = getWorkerName();

                if (!enteredName) {
                    workerName = '';
                    localStorage.removeItem(WORKER_NAME_KEY);

                    if (workerNameInput.classList.contains('is-invalid')) {
                        setWorkerNameError('Enter your name before checking tasks.');
                    }
                    return;
                }

                if (validateWorkerName(enteredName)) {
                    setWorkerName(enteredName);
                    return;
                }

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

                if (!validateWorkerName(enteredName, { showError: true })) {
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
            downloadMasterCsvNow();
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
            dbRef = db.ref(`checklists/${checklistType}/${sessionId}`);
            masterRowsRef = db.ref(`reports/${checklistType}/masterRows`);
            setSyncStatus(`Mode: Connecting to shared ${checklistTypeTitle} session...`);

            dbRef.on('value', (snapshot) => {
                const remoteValue = snapshot.val();

                if (!remoteValue) {
                    checklistState.updatedAt = new Date().toISOString();
                    checklistState.updatedBy = getWorkerName() || null;
                    checklistState.activeChunk = activeChunk;
                    dbRef.set(checklistState);
                    if (!hasSeededSharedMasterRows) {
                        syncMasterRows(checkboxInputs.map((checkbox) => checkbox.name), { includeShared: true });
                        hasSeededSharedMasterRows = true;
                    }
                    setSyncStatus('Mode: Shared live');
                    return;
                }

                checklistState = normalizeState(remoteValue);
                saveLocalState();
                applyStateToUI();
                syncMasterRows(checkboxInputs.map((checkbox) => checkbox.name), { includeShared: false });
                if (!hasSeededSharedMasterRows) {
                    pushSharedMasterRows(checkboxInputs.map((checkbox) => checkbox.name));
                    hasSeededSharedMasterRows = true;
                }
                setSyncStatus('Mode: Shared live');
            }, () => {
                setSyncStatus('Mode: Shared sync error. Using local cache.');
            });
        } catch {
            setSyncStatus('Mode: Shared sync failed. Using local cache.');
        }
    }

    window.MosaChecklistActions = window.MosaChecklistActions || {};
    window.MosaChecklistActions.downloadMasterCsv = downloadMasterCsvNow;

    if (sessionIdText) {
        sessionIdText.textContent = sessionId;
    }

    wireWorkerControls();
    wireCsvControls();
    wireCheckboxControls();
    wireChunkControls();
    applyStateToUI();
    syncMasterRows(checkboxInputs.map((checkbox) => checkbox.name), { includeShared: false });
    initSharedSync();
}
