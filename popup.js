const partsEl = document.getElementById('parts');
const newPartEl = document.getElementById('newPart');
const addPartBtn = document.getElementById('addPart');
const concatenateBtn = document.getElementById('concatenate');
const copyBtn = document.getElementById('copy');
const sendBtn = document.getElementById('sendChatGPT');
const finalPromptEl = document.getElementById('finalPrompt');
const separatorEl = document.getElementById('separator');

// New elements for slots
const slotsEl = document.getElementById('slots');
const slotNameEl = document.getElementById('slotName');
const saveCurrentToSlotBtn = document.getElementById('saveCurrentToSlot');

let parts = []; // Array of {text: string, locked: boolean}
let savedPrompts = []; // up to 5 items { name: string, parts: array }

function saveParts(){
    chrome.storage.local.set({promptParts: parts});
}

function loadParts(){
    chrome.storage.local.get(['promptParts'], res => {
        parts = res.promptParts || [];
        // Migrate old format (strings) to new format (objects)
        parts = parts.map(p => typeof p === 'string' ? {text: p, locked: false} : p);
        renderParts();
    });
}

// Load saved prompts (slots)
function loadSavedPrompts(){
    chrome.storage.local.get(['savedPrompts'], res => {
        savedPrompts = Array.isArray(res.savedPrompts) ? res.savedPrompts : [];
        renderSlots();
    });
}

function saveSavedPrompts(){
    chrome.storage.local.set({savedPrompts});
}

function renderParts(){
    partsEl.innerHTML = '';
    parts.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'part';
        const isLocked = p.locked || false;
        const lockIcon = isLocked ? '🔒' : '🔓';
        const bgColor = isLocked ? '#f5f5f5' : '';
        div.innerHTML = `
      <textarea data-idx="${idx}" ${isLocked ? 'readonly' : ''} style="background-color: ${bgColor}">${escapeHtml(p.text)}</textarea>
      <div class="btns">
        <button data-action="lock" data-idx="${idx}" title="Bloquear/Desbloquear edição">${lockIcon}</button>
        <button data-action="up" data-idx="${idx}">▲</button>
        <button data-action="down" data-idx="${idx}">▼</button>
        <button data-action="remove" data-idx="${idx}">✕</button>
      </div>
    `;
        partsEl.appendChild(div);
    });
}

function renderSlots(){
    slotsEl.innerHTML = '';
    const info = document.createElement('div');
    info.className = 'slots-info';
    info.textContent = `Slots usados: ${savedPrompts.length}/5`;
    slotsEl.appendChild(info);

    savedPrompts.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'slot';
        const name = item.name || `Prompt ${idx+1}`;
        const partsArray = item.parts || [];
        const preview = partsArray.map(p => typeof p === 'string' ? p : p.text).join(' ').slice(0, 80);
        div.innerHTML = `
      <strong>${escapeHtml(name)}</strong>
      <div class="slot-preview">${escapeHtml(preview)}${preview.length===80?'…':''}</div>
      <div class="slot-btns">
        <button data-action="load-slot" data-idx="${idx}">Carregar</button>
        <button data-action="copy-slot" data-idx="${idx}">Copiar</button>
        <button data-action="delete-slot" data-idx="${idx}">Excluir</button>
      </div>
    `;
        slotsEl.appendChild(div);
    });

    // If less than 5, show hint
    if (savedPrompts.length < 5) {
        const hint = document.createElement('small');
        hint.textContent = 'Você ainda pode salvar mais prompts.';
        slotsEl.appendChild(hint);
    }
}

function escapeHtml(s){
    return s;
}

partsEl.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.idx);
    if (action === 'lock'){
        const part = btn.closest('.part');
        const textarea = part.querySelector('textarea');
        const isLocked = textarea.readOnly;
        textarea.readOnly = !isLocked;
        btn.textContent = isLocked ? '🔓' : '🔒';
        textarea.style.backgroundColor = isLocked ? '' : '#f5f5f5';
        // Save the locked state
        parts[idx].locked = !isLocked;
        saveParts();
        return;
    }
    if (action === 'up' && idx > 0){
        [parts[idx-1], parts[idx]] = [parts[idx], parts[idx-1]];
    } else if (action === 'down' && idx < parts.length - 1){
        [parts[idx+1], parts[idx]] = [parts[idx], parts[idx+1]];
    } else if (action === 'remove'){
        parts.splice(idx,1);
    }
    saveParts();
    renderParts();
});

partsEl.addEventListener('input', e => {
    const ta = e.target.closest('textarea');
    if (!ta) return;
    const idx = Number(ta.dataset.idx);
    parts[idx].text = ta.value;
    saveParts();
});

addPartBtn.addEventListener('click', () => {
    const v = newPartEl.value.trim();
    if (!v) return;
    parts.push({text: v, locked: false});
    newPartEl.value = '';
    saveParts();
    renderParts();
});

concatenateBtn.addEventListener('click', () => {
    const sep = interpretSeparator(separatorEl.value);
    finalPromptEl.value = parts.map(p => p.text).join(sep);
});

copyBtn.addEventListener('click', async () => {
    const text = finalPromptEl.value || parts.map(p => p.text).join(interpretSeparator(separatorEl.value));
    if (!text) return alert('Nada para copiar.');
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copiado ✓';
        setTimeout(()=> copyBtn.textContent = 'Copiar', 1000);
    } catch(err){
        alert('Erro ao copiar: ' + err);
    }
});

// Envia mensagem para content script / injeta texto na página do ChatGPT
sendBtn.addEventListener('click', async () => {
    const text = finalPromptEl.value || parts.map(p => p.text).join(interpretSeparator(separatorEl.value));
    if (!text) return alert('Nada para enviar.');
    // Tenta ativar a aba atual (poderá ser chat.openai.com)
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    if (!tab) return alert('Nenhuma aba ativa encontrada.');

    // executa script que insere texto (content script listener)
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content-script.js']
    }, () => {
        // depois envia a mensagem para o content script
        chrome.tabs.sendMessage(tab.id, {action:'insertPrompt', text});
    });
});

function interpretSeparator(s){
    // convert escapes like \n to actual newlines
    return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

// Handle slot actions
slotsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.idx);
    if (Number.isNaN(idx)) return;

    if (action === 'load-slot'){
        const item = savedPrompts[idx];
        if (!item) return;
        parts = Array.isArray(item.parts) ? [...item.parts] : [];
        saveParts();
        renderParts();
    } else if (action === 'copy-slot'){
        const item = savedPrompts[idx];
        if (!item) return;
        const partsArray = item.parts || [];
        const text = partsArray.map(p => typeof p === 'string' ? p : p.text).join(interpretSeparator(separatorEl.value));
        try {
            await navigator.clipboard.writeText(text);
        } catch(err){
            alert('Erro ao copiar: ' + err);
        }
    } else if (action === 'delete-slot'){
        savedPrompts.splice(idx,1);
        saveSavedPrompts();
        renderSlots();
    }
});

saveCurrentToSlotBtn.addEventListener('click', () => {
    const sep = interpretSeparator(separatorEl.value);
    const text = finalPromptEl.value || parts.map(p => p.text).join(sep);
    if (!text) return alert('Nada para salvar.');

    const name = (slotNameEl.value || '').trim();
    const entry = { name, parts: [...parts] };

    // If we already have 5, replace the oldest (FIFO)
    if (savedPrompts.length >= 5){
        savedPrompts.shift();
    }
    savedPrompts.push(entry);
    saveSavedPrompts();
    renderSlots();

    // feedback
    saveCurrentToSlotBtn.textContent = 'Salvo ✓';
    setTimeout(()=> saveCurrentToSlotBtn.textContent = 'Salvar o atual em um slot', 1000);
});

loadParts();
loadSavedPrompts();
