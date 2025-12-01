// Conteúdo que será injetado na página ativa (ex.: chat.openai.com)
(function(){
    if (window.__prompt_builder_injected) return;
    window.__prompt_builder_injected = true;

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.action === 'insertPrompt' && typeof msg.text === 'string') {
            insertIntoChatInput(msg.text);
            sendResponse({ok:true});
        }
    });

    function insertIntoChatInput(text){
        // Tenta alguns seletores usados pelo ChatGPT e outros sites:
        const selectors = [
            'textarea', // fallback
            'textarea[tabindex="0"]',
            'div[contenteditable="true"][role="textbox"]', // chat.openai.com costuma usar contenteditable
            'form textarea',
            'textarea[name="prompt"]'
        ];

        let el = null;
        for (const sel of selectors){
            const found = document.querySelector(sel);
            if (found) { el = found; break; }
        }

        // Se encontrarmos um contenteditable (div), precisamos inserir texto de forma diferente
        if (!el) {
            alert('Não achei um campo de entrada na página. Seletores testados falharam.');
            return;
        }

        // Caso seja textarea/input:
        if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
            el.focus();
            // set value and trigger input events so site notices
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeInputValueSetter.call(el, text);
            el.dispatchEvent(new Event('input', {bubbles: true}));
        } else {
            // contenteditable
            el.focus();
            // seleção / replace
            const sel = window.getSelection();
            if (!sel) return;
            sel.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.deleteContents();
            const node = document.createTextNode(text);
            range.insertNode(node);
            range.setStartAfter(node);
            sel.addRange(range);
            // dispatch input
            el.dispatchEvent(new InputEvent('input', {bubbles: true}));
        }

        // opcional: rolar para o campo e notificar o usuário
        el.scrollIntoView({behavior:'smooth', block:'center'});
    }
})();
