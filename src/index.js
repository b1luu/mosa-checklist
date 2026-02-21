const modeButtons = document.querySelectorAll('.mode-btn');
const checklistSections = document.querySelectorAll('.checklist-section');

function setActiveChecklist(targetId) {
    checklistSections.forEach((section) => {
        section.classList.toggle('is-hidden', section.id !== targetId);
    });

    modeButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.target === targetId);
    });
}

modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setActiveChecklist(button.dataset.target);
    });
});
