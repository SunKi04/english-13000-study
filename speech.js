/* Clear English playback. Dictionary audio for vocabulary; screened device voices for longer text. */
(() => {
  const badVoice = /Albert|Bad News|Good News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Zarvox|Grandma|Grandpa|Ralph|Fred|Rocko/i;
  const synth = window.speechSynthesis;
  let request = 0, activeAudio = null, activeUtterance = null, timer = null, last = null;
  const lang = value => String(value || '').replace(/_/g, '-').toLowerCase();
  function voices() { return (synth?.getVoices() || []).filter(v => /^en(?:-|$)/.test(lang(v.lang)) && !badVoice.test(v.name)); }
  function choose(options) {
    const list = voices(), target = lang(options.accent || 'en-GB');
    if (options.voice) { const selected = list.find(v => v.voiceURI === options.voice); if (selected && lang(selected.lang) === target) return selected; }
    const score = v => (lang(v.lang) === target ? 1000 : 0) + (/Natural|Neural|Premium|Enhanced/i.test(v.name) ? 300 : 0) + (/Google.*English|Microsoft.*(Sonia|Jenny|Aria|Ryan|Guy)|Samantha|Daniel/i.test(v.name) ? 150 : 0) + (!v.localService ? 20 : 0);
    return list.sort((a, b) => score(b) - score(a))[0] || null;
  }
  function status(message, playing = true) {
    const el = document.querySelector('#speech-player'), label = document.querySelector('#speech-status');
    if (el) el.hidden = false;
    if (label) { label.textContent = message; label.setAttribute('data-playing', String(playing)); }
    const stopButton = document.querySelector('#speech-stop'); if (stopButton) stopButton.disabled = !playing;
  }
  function stop(show = true) {
    request++; clearTimeout(timer); timer = null;
    if (activeAudio) { activeAudio.onended = activeAudio.onerror = activeAudio.onplaying = null; activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null; }
    synth?.cancel(); activeUtterance = null;
    if (show) status('已停止 · 可点击重听', false);
  }
  function split(text) {
    const sentences = text.match(/[^.!?]+[.!?]*|[.!?]+/g) || [text], chunks = [];
    for (const sentence of sentences) {
      let part = '';
      for (const word of sentence.trim().split(/\s+/)) {
        if ((part + ' ' + word).length > 180 && part) { chunks.push(part); part = ''; }
        part += (part ? ' ' : '') + word;
      }
      if (part) chunks.push(part);
    }
    return chunks;
  }
  async function waitVoices() {
    if (voices().length || !synth) return;
    await new Promise(resolve => {
      let timeout;
      const done = () => { clearTimeout(timeout); synth.removeEventListener('voiceschanged', done); resolve(); };
      synth.addEventListener('voiceschanged', done); timeout = setTimeout(done, 1500);
    });
  }
  async function device(text, options, id, fallback = false) {
    if (!synth) { if (id === request) status('设备不支持长文朗读，可继续使用词典单词发音', false); return; }
    await waitVoices(); if (id !== request) return;
    const voice = choose(options);
    if (!voice) { status('未找到清晰英语音色，请安装英语语音包；单词可用词典发音', false); return; }
    const chunks = split(text), label = voice.name.replace(/Microsoft |Google /g, '');
    let index = 0;
    const next = () => {
      if (id !== request) return;
      if (index >= chunks.length) { activeUtterance = null; status('朗读完成 · 可重听或慢速重听', false); return; }
      const u = new SpeechSynthesisUtterance(chunks[index++]); activeUtterance = u;
      u.voice = voice; u.lang = voice.lang; u.rate = Math.max(.8, Math.min(1, Number(options.rate) || .9)); u.pitch = 1; u.volume = 1;
      u.onstart = () => { if (id === request) status(`${fallback ? '词典暂不可用 · ' : ''}${label} · ${index}/${chunks.length} · ${u.rate}×`); };
      u.onend = next;
      u.onerror = e => { if (id === request && !['canceled', 'interrupted'].includes(e.error)) status('语音播放失败，请点击重听或在设置中更换音色', false); };
      synth.speak(u);
    };
    next();
  }
  function play(text, options = {}) {
    text = String(text || '').replace(/[\u4e00-\u9fff]/g, ' ').replace(/…+|\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    stop(false); const id = request; last = {text, options: {...options}};
    const short = /^[A-Za-z\s'’,.?!()/-]+$/.test(text) && text.length <= 80 && text.split(/\s+/).length <= 6;
    if (options.speechMode !== 'device' && short) {
      const audio = new Audio(); activeAudio = audio;
      audio.preload = 'auto'; audio.volume = 1; audio.playbackRate = Math.max(.8, Math.min(1, Number(options.rate) || .9)); audio.preservesPitch = true;
      const british = options.accent !== 'en-US';
      audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text.replace(/[.!?]+$/,''))}&type=${british ? 1 : 2}`;
      status('正在加载清晰词典发音…');
      const fail = () => {
        if (id !== request || activeAudio !== audio) return;
        clearTimeout(timer); audio.onended = audio.onerror = audio.onplaying = null; audio.pause(); activeAudio = null;
        device(text, options, id, true);
      };
      timer = setTimeout(fail, 8000);
      audio.onplaying = () => { if (id === request) { clearTimeout(timer); status(`词典${british ? '英式' : '美式'}发音 · ${audio.playbackRate}× · 保持原音调`); } };
      audio.onerror = fail;
      audio.onended = () => { if (id === request) { clearTimeout(timer); activeAudio = null; status('播放完成 · 可重听或慢速重听', false); } };
      audio.play().catch(error => { if (id !== request) return; if (error.name === 'NotAllowedError') {clearTimeout(timer); status('请再次点击发音按钮，允许浏览器播放声音', false);} else fail(); });
    } else { status('正在选择清晰英语音色…'); device(text, options, id); }
  }
  function bind() {
    document.querySelector('#speech-repeat')?.addEventListener('click', () => { if (last) play(last.text, last.options); });
    document.querySelector('#speech-slow')?.addEventListener('click', () => { if (last) play(last.text, {...last.options, rate: .8}); });
    document.querySelector('#speech-stop')?.addEventListener('click', () => stop());
    window.addEventListener('pagehide', () => stop(false));
  }
  window.ClearSpeech = {play, stop, voices, choose, split, bind}; bind();
})();
