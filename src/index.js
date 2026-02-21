const checkboxInputs = document.querySelectorAll('input[type="checkbox"][name]');
const pageStoragePrefix = `mosa:${window.location.pathname}:checkbox:`;

function loadCheckboxState() {
    checkboxInputs.forEach((checkbox) => {
        const savedValue = localStorage.getItem(`${pageStoragePrefix}${checkbox.name}`);
        if (savedValue !== null) {
            checkbox.checked = savedValue === "true";
        }
    });
}

function saveCheckboxState() {
    checkboxInputs.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            localStorage.setItem(`${pageStoragePrefix}${checkbox.name}`, String(checkbox.checked));
            updateChunkStatus();
        });
    });
}

const chunkSections = Array.from(document.querySelectorAll(".checklist-group[data-chunk]"));
const chunkTabs = Array.from(document.querySelectorAll(".chunk-tab"));
const completeChunkButton = document.querySelector('[data-chunk-action="complete-next"]');
const chunkStatus = document.querySelector(".chunk-status");
const chunkNumbers = [...new Set(chunkSections.map((section) => Number(section.dataset.chunk)))].sort((a, b) => a - b);
const chunkStorageKey = `mosa:${window.location.pathname}:activeChunk`;
let activeChunk = chunkNumbers[0] || 1;

function getChunkProgress(chunkNumber) {
    const chunkCheckboxes = chunkSections
        .filter((section) => Number(section.dataset.chunk) === chunkNumber)
        .flatMap((section) => Array.from(section.querySelectorAll('input[type="checkbox"]')));
    const total = chunkCheckboxes.length;
    const completed = chunkCheckboxes.filter((checkbox) => checkbox.checked).length;
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
        completeChunkButton.textContent = "All Chunks Completed";
        completeChunkButton.disabled = true;
        return;
    }

    if (isChunkDone) {
        completeChunkButton.textContent = isLastChunk ? "Finish Checklist" : "Go to Next Chunk";
        completeChunkButton.disabled = false;
        return;
    }

    completeChunkButton.textContent = isLastChunk ? "Complete Final Chunk" : "Complete This Chunk";
    completeChunkButton.disabled = false;
}

function renderActiveChunk() {
    if (chunkNumbers.length === 0) {
        return;
    }

    chunkSections.forEach((section) => {
        section.classList.toggle("chunk-hidden", Number(section.dataset.chunk) !== activeChunk);
    });

    chunkTabs.forEach((tab) => {
        tab.classList.toggle("is-active", Number(tab.dataset.chunkTarget) === activeChunk);
    });

    updateChunkStatus();
    updateCompleteChunkButton();
}

function setActiveChunk(nextChunk, shouldScroll = true) {
    if (!chunkNumbers.includes(nextChunk)) {
        return;
    }

    activeChunk = nextChunk;
    localStorage.setItem(chunkStorageKey, String(activeChunk));
    renderActiveChunk();

    if (shouldScroll) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function wireChunkControls() {
    if (chunkNumbers.length === 0) {
        return;
    }

    const savedChunk = Number(localStorage.getItem(chunkStorageKey));
    if (chunkNumbers.includes(savedChunk)) {
        activeChunk = savedChunk;
    }

    chunkTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            setActiveChunk(Number(tab.dataset.chunkTarget));
        });
    });

    if (completeChunkButton) {
        completeChunkButton.addEventListener("click", () => {
            const visibleChunkSections = chunkSections.filter((section) => Number(section.dataset.chunk) === activeChunk);
            const visibleChunkCheckboxes = visibleChunkSections.flatMap((section) =>
                Array.from(section.querySelectorAll('input[type="checkbox"][name]'))
            );

            const total = visibleChunkCheckboxes.length;
            const completed = visibleChunkCheckboxes.filter((checkbox) => checkbox.checked).length;
            const isChunkDone = total > 0 && completed === total;
            const currentIndex = chunkNumbers.indexOf(activeChunk);
            const nextChunk = chunkNumbers[currentIndex + 1];

            if (!isChunkDone) {
                visibleChunkCheckboxes.forEach((checkbox) => {
                    checkbox.checked = true;
                    localStorage.setItem(`${pageStoragePrefix}${checkbox.name}`, "true");
                });
            }

            if (nextChunk) {
                setActiveChunk(nextChunk);
            } else {
                renderActiveChunk();
            }
        });
    }

    renderActiveChunk();
}

loadCheckboxState();
saveCheckboxState();
wireChunkControls();
