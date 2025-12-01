// Mantemos arquivo vazio ou com log — necessário pois manifest pede service_worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Prompt Builder instalado');
});
