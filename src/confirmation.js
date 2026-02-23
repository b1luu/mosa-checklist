(function () {
    const titleElement = document.querySelector('#confirmationTitle');
    const messageElement = document.querySelector('#confirmationMessage');
    const typeElement = document.querySelector('#confirmationType');
    const sessionElement = document.querySelector('#confirmationSession');
    const byElement = document.querySelector('#confirmationBy');
    const atElement = document.querySelector('#confirmationAt');
    const returnLink = document.querySelector('#confirmationReturnLink');

    const params = new URLSearchParams(window.location.search);
    const type = (params.get('type') || '').trim().toLowerCase();
    const sessionId = (params.get('session') || '').trim();
    const submittedBy = (params.get('by') || '').trim();
    const submittedAt = (params.get('at') || '').trim();

    const checklistLabel = type === 'opening'
        ? 'Opening'
        : type === 'closing'
            ? 'Closing'
            : 'Checklist';

    function formatSubmissionTime(isoString) {
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
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    if (titleElement) {
        titleElement.textContent = `${checklistLabel} Submitted`;
    }

    if (messageElement) {
        messageElement.textContent = 'Submission recorded successfully.';
    }

    if (typeElement) {
        typeElement.textContent = `Type: ${checklistLabel}`;
    }

    if (sessionElement) {
        sessionElement.textContent = sessionId ? `Session: ${sessionId}` : '';
    }

    if (byElement) {
        byElement.textContent = submittedBy ? `Submitted by: ${submittedBy}` : '';
    }

    if (atElement) {
        const formattedTime = formatSubmissionTime(submittedAt);
        atElement.textContent = formattedTime ? `Submitted at: ${formattedTime}` : '';
    }

    if (returnLink) {
        if ((type === 'opening' || type === 'closing') && sessionId) {
            returnLink.href = `${type}.html?session=${encodeURIComponent(sessionId)}`;
        } else if (type === 'opening' || type === 'closing') {
            returnLink.href = `${type}.html`;
        }
    }
})();
