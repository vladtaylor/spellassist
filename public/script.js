(function() {
  // Explicit Firebase Configuration
  const firebaseConfig = {
    apiKey: "AIzaSyBscTlnrLdopeSCLTqJIimDtRrhhh47GFg",
    authDomain: "spellassist-9b0c4.firebaseapp.com",
    projectId: "spellassist-9b0c4",
    storageBucket: "spellassist-9b0c4.firebasestorage.app",
    messagingSenderId: "1041458803409",
    appId: "1:1041458803409:web:d43a07201e0814e6830bf0"
  };
  
  // Initialize Firebase
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // ====== Constants & Storage keys ======
  const LS_WORDS = "spellingGameV7.customWords";
  const LS_SCORES = "spellingGameV7.highScores";
  const LS_NAME = "spellingGameV7.publicName";
  const BANNED_WORDS = ["fuck", "shit", "piss", "cunt", "nigger", "faggot", "dick", "bitch"];
  const EMOJI_REGEX = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;

  const BUILT_IN_WORDS = [
    "accommodate","accompany","according","achieve","aggressive","amateur","ancient","apparent",
    "appreciate","attached","available","average","awkward","bargain","bruise","category",
    "cemetery","committee","communicate","community","competition","conscience","conscious",
    "controversy","convenience","correspond","criticise","curiosity","definite","desperate",
    "determined","develop","dictionary","disastrous","embarrass","environment","equip",
    "especially","exaggerate","excellent","existence","explanation","familiar","foreign",
    "forty","frequently","government","guarantee","harass","hindrance","identity","immediate",
    "individual","interfere","interrupt","language","leisure","lightning","marvellous",
    "mischievous","muscle","necessary","neighbour","nuisance","occupy","occur","opportunity",
    "parliament","persuade","physical","prejudice","privilege","profession","programme",
    "pronunciation","queue","recognise","recommend","relevant","restaurant","rhyme","rhythm",
    "sacrifice","secretary","shoulder","signature","sincere","soldier","stomach","sufficient",
    "suggest","symbol","system","temperature","thorough","twelfth","variety","vegetable",
    "vehicle","yacht"
  ];

  // ====== Centralized UI Object ======
  const UI = {
    startMenu: document.getElementById("startMenu"),
    gameArea: document.getElementById("gameArea"),
    resultArea: document.getElementById("resultArea"),
    customWords: document.getElementById("customWords"),
    uploadWords: document.getElementById("uploadWords"),
    useBuiltInBtn: document.getElementById("useBuiltInBtn"),
    wordCountSelect: document.getElementById("wordCountSelect"),
    guessCountSelect: document.getElementById("guessCountSelect"),
    voiceSpeed: document.getElementById("voiceSpeed"),
    autoAdvance: document.getElementById("autoAdvance"),
    practiceMissed: document.getElementById("practiceMissed"),
    boxesContainer: document.getElementById("boxes"),
    correctBoxes: document.getElementById("correctBoxes"),
    correctSpellingArea: document.getElementById("correctSpellingArea"),
    starRow: document.getElementById("starRow"),
    wordCounter: document.getElementById("wordCounter"),
    attemptCounter: document.getElementById("attemptCounter"),
    streakCounter: document.getElementById("streakCounter"),
    bestStreakCounter: document.getElementById("bestStreakCounter"),
    feedback: document.getElementById("feedback"),
    resultsList: document.getElementById("resultsList"),
    guessInput: document.getElementById("guessInput"),
    submitBtn: document.getElementById("submitBtn"),
    nextBtn: document.getElementById("nextBtn"),
    highScoresArea: document.getElementById("highScoresArea"),
    clearScoresBtn: document.getElementById("clearScoresBtn"),
    sessionSummary: document.getElementById("sessionSummary"),
    globalHighScoresArea: document.getElementById("globalHighScoresArea"),
    publicName: document.getElementById("publicName"),
    publicAge: document.getElementById("publicAge"),
    publicScoreStatus: document.getElementById("publicScoreStatus"),
    submitPublicScoreBtn: document.getElementById("submitPublicScoreBtn")
  };

  // ====== Game state ======
  let TOTAL_WORDS = 10;
  let MAX_ATTEMPTS = 3;
  let sourceWords = [...BUILT_IN_WORDS];
  let gameWords = [];
  let currentIndex = 0;
  let currentWord = "";
  let attemptsLeft = 3;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let results = [];
  let wordCompleted = false;

  // ====== Validation & Moderation ======
  function hasProfanity(text) {
    const low = text.toLowerCase();
    return BANNED_WORDS.some(w => low.includes(w));
  }
  function hasEmojis(text) {
    return EMOJI_REGEX.test(text);
  }

  // ====== Firebase Global Scores ======
  let db;
  try {
    db = firebase.firestore();
  } catch(e) { console.error("Firebase not initialized", e); }

  async function loadGlobalScores(retries = 2) {
    if (!db) {
      UI.globalHighScoresArea.innerHTML = '<div class="hint">Global scores unavailable.</div>';
      return;
    }

    try {
      const snap = await db.collection("scores")
        .orderBy("score", "desc")
        .orderBy("timestamp", "asc")
        .limit(10)
        .get();

      if (snap.empty) {
        UI.globalHighScoresArea.innerHTML = '<div class="hint">No global scores yet. Be the first!</div>';
        return;
      }

      const rows = snap.docs.map((doc, i) => {
        const s = doc.data();
        const date = s.timestamp ? new Date(s.timestamp.seconds * 1000).toLocaleDateString() : "---";
        return `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.score}</td><td>${s.age}</td><td class="right">${date}</td></tr>`;
      }).join("");

      UI.globalHighScoresArea.innerHTML = `
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Score</th><th>Age</th><th class="right">Date</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        console.log(`Retrying loadGlobalScores... (${retries} left)`);
        setTimeout(() => loadGlobalScores(retries - 1), 1000);
      } else {
        UI.globalHighScoresArea.innerHTML = '<div class="hint">Failed to load global scores.</div>';
      }
    }
  }

  async function submitPublicScore() {
    const name = UI.publicName.value.trim();
    const age = parseInt(UI.publicAge.value);

    if (!name || name.length > 20) {
      UI.publicScoreStatus.textContent = "⚠️ Name must be 1-20 characters.";
      return;
    }
    if (isNaN(age) || age < 1 || age > 120) {
      UI.publicScoreStatus.textContent = "⚠️ Please enter a valid age.";
      return;
    }
    if (hasEmojis(name)) {
      UI.publicScoreStatus.textContent = "⚠️ No emojis allowed in name.";
      return;
    }
    if (hasProfanity(name)) {
      UI.publicScoreStatus.textContent = "⚠️ Please use a more appropriate name.";
      return;
    }

    UI.submitPublicScoreBtn.disabled = true;
    UI.publicScoreStatus.textContent = "⏳ Posting...";

    try {
      await db.collection("scores").add({
        name: name,
        age: age,
        score: score,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      localStorage.setItem(LS_NAME, name);
      UI.publicScoreStatus.textContent = "✅ Score posted!";
      UI.publicName.disabled = true;
      UI.publicAge.disabled = true;
      loadGlobalScores();
    } catch (err) {
      console.error(err);
      UI.publicScoreStatus.textContent = "❌ Error posting score.";
      UI.submitPublicScoreBtn.disabled = false;
    }
  }

  // ====== Sounds (Web Audio) ======
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }
  function tone({type="sine", start=440, end=null, duration=0.15, gain=0.2}) {
    ensureAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, audioCtx.currentTime);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(end, audioCtx.currentTime + duration);
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }
  function playCorrectSound() {
    tone({type:"sine", start:800, end:1200, duration:0.12, gain:0.22});
    setTimeout(() => tone({type:"sine", start:1200, end:900, duration:0.10, gain:0.18}), 90);
  }
  function playWrongSound() {
    tone({type:"sawtooth", start:160, end:110, duration:0.34, gain:0.14});
    setTimeout(() => tone({type:"square", start:130, end:95, duration:0.20, gain:0.08}), 110);
  }

  // ====== Speech engine improvements ======
  function safeSpeak(utterance) {
    speechSynthesis.cancel();
    // Tiny delay to improve reliability on mobile
    setTimeout(() => {
      speechSynthesis.speak(utterance);
    }, 50);
  }

  // ====== Helpers ======
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function parseWordList(text) {
    const words = text
      .split(/\r?\n/)
      .map(w => w.trim())
      .filter(Boolean)
      .map(w => w.replace(/[^a-zA-Z\-']/g, ""))
      .filter(Boolean)
      .map(w => w.toLowerCase());
    return [...new Set(words)];
  }

  function setFeedback(text, kind="") {
    UI.feedback.textContent = text;
    UI.feedback.className = "status" + (kind ? " " + kind : "");
  }

  function shakeBoxes() {
    UI.boxesContainer.classList.remove("shake");
    void UI.boxesContainer.offsetWidth;
    UI.boxesContainer.classList.add("shake");
  }

  function updateStars() {
    UI.starRow.innerHTML = "";
    for (let i = 0; i < TOTAL_WORDS; i++) {
      const span = document.createElement("span");
      span.className = "star";
      if (results[i] === undefined) { span.textContent = "⭐"; span.style.opacity = "0.3"; }
      else if (results[i].correct) span.textContent = "🌟";
      else span.textContent = "🔴";
      UI.starRow.appendChild(span);
    }
  }

  function updateStreak() {
    UI.streakCounter.textContent = String(streak);
    bestStreak = Math.max(bestStreak, streak);
    UI.bestStreakCounter.textContent = String(bestStreak);
  }

  function renderBoxes(guess = "", colours = [], animate = true) {
    UI.boxesContainer.innerHTML = "";
    for (let i = 0; i < currentWord.length; i++) {
      const box = document.createElement("div");
      box.classList.add("box");
      box.textContent = guess[i] ? guess[i].toUpperCase() : "";
      if (colours[i]) box.classList.add(colours[i]);
      UI.boxesContainer.appendChild(box);

      if (animate) {
        requestAnimationFrame(() => {
          box.classList.add("pop");
          setTimeout(() => box.classList.remove("pop"), 130);
        });
      }
    }
  }

  function renderCorrectBoxes(word, container) {
    container.innerHTML = "";
    word.split("").forEach(letter => {
      const b = document.createElement("div");
      b.classList.add("box", "green");
      b.textContent = letter.toUpperCase();
      container.appendChild(b);
    });
  }

  function speakWord() {
    const u = new SpeechSynthesisUtterance(currentWord);
    u.rate = parseFloat(UI.voiceSpeed.value);
    safeSpeak(u);
  }

  function speakSpelling(word) {
    speechSynthesis.cancel();
    const letters = word.toUpperCase().split("");
    const rate = parseFloat(UI.voiceSpeed.value);
    
    letters.forEach(letter => {
      const u = new SpeechSynthesisUtterance(letter);
      u.rate = rate;
      speechSynthesis.speak(u);
    });
    
    const pause = new SpeechSynthesisUtterance(".");
    pause.rate = 0.1;
    pause.volume = 0;
    speechSynthesis.speak(pause);
    
    const whole = new SpeechSynthesisUtterance(word);
    whole.rate = rate;
    speechSynthesis.speak(whole);
  }

  // ====== High scores ======
  function loadScores() {
    try {
      const raw = localStorage.getItem(LS_SCORES);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveScores(scores) {
    localStorage.setItem(LS_SCORES, JSON.stringify(scores));
  }
  function addScoreEntry(entry) {
    const scores = loadScores();
    scores.push(entry);
    scores.sort((a,b) => {
      const ar = a.score / a.total;
      const br = b.score / b.total;
      if (br !== ar) return br - ar;
      if ((b.bestStreak||0) !== (a.bestStreak||0)) return (b.bestStreak||0) - (a.bestStreak||0);
      return (b.ts||0) - (a.ts||0);
    });
    saveScores(scores.slice(0, 10));
    renderScores();
  }
  function renderScores() {
    const scores = loadScores();
    if (!scores.length) {
      UI.highScoresArea.innerHTML = '<div class="hint">No scores saved yet.</div>';
      return;
    }
    const rows = scores.map((s, i) => {
      const d = new Date(s.ts);
      const when = isNaN(d.getTime()) ? '' : d.toLocaleString();
      return `<tr><td>${i+1}</td><td>${s.score}/${s.total}</td><td>${s.bestStreak ?? 0}</td><td class="right">${when}</td></tr>`;
    }).join('');

    UI.highScoresArea.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Score</th><th>Best streak</th><th class="right">When</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ====== Word list persistence ======
  function loadSavedWordsIntoTextarea() {
    const raw = localStorage.getItem(LS_WORDS);
    if (raw && raw.trim()) UI.customWords.value = raw;
  }
  function setBuiltInList() {
    UI.customWords.value = BUILT_IN_WORDS.join('\n');
  }
  function saveWordListFromTextarea() {
    localStorage.setItem(LS_WORDS, UI.customWords.value.trim());
    const parsed = parseWordList(UI.customWords.value);
    sourceWords = parsed.length ? parsed : [...BUILT_IN_WORDS];
  }

  // ====== Game flow ======
  function startGame() {
    ensureAudio();
    const parsed = parseWordList(UI.customWords.value);
    sourceWords = parsed.length ? parsed : [...BUILT_IN_WORDS];

    TOTAL_WORDS = parseInt(UI.wordCountSelect.value);
    MAX_ATTEMPTS = parseInt(UI.guessCountSelect.value);

    let pool = [...sourceWords];
    if (UI.practiceMissed.checked) {
      const all = loadScores().filter(s => Array.isArray(s.missedWords) && s.missedWords.length);
      const newest = all.sort((a,b)=> (b.ts||0)-(a.ts||0))[0];
      if (newest && newest.missedWords.length) pool = [...new Set(newest.missedWords.map(w=>w.toLowerCase()))];
    }

    shuffle(pool);
    if (pool.length < TOTAL_WORDS) {
      const padded = [];
      while (padded.length < TOTAL_WORDS) padded.push(...pool);
      pool = padded;
    }

    gameWords = pool.slice(0, TOTAL_WORDS);
    currentIndex = 0; score = 0; streak = 0; bestStreak = 0; results = [];

    updateStars();
    updateStreak();

    UI.startMenu.classList.add("hidden");
    UI.resultArea.classList.add("hidden");
    UI.gameArea.classList.remove("hidden");

    loadWord();
  }

  function loadWord() {
    currentWord = String(gameWords[currentIndex] || "").toLowerCase();
    attemptsLeft = MAX_ATTEMPTS;
    wordCompleted = false;

    UI.guessInput.disabled = false;
    UI.submitBtn.disabled = false;
    UI.submitBtn.classList.remove("hidden");
    UI.nextBtn.classList.add("hidden");

    UI.wordCounter.textContent = `Word ${currentIndex + 1} of ${TOTAL_WORDS}`;
    UI.attemptCounter.textContent = `Attempt 1 of ${MAX_ATTEMPTS}`;

    setFeedback("", "");
    UI.guessInput.value = "";
    UI.guessInput.maxLength = currentWord.length;

    UI.correctSpellingArea.classList.add("hidden");
    renderBoxes("", [], false);

    speakWord();
    UI.guessInput.focus();
  }

  function checkGuess() {
    if (wordCompleted) return;
    ensureAudio();
    const guess = UI.guessInput.value.trim().toLowerCase();
    if (!guess) return;

    attemptsLeft--;
    UI.attemptCounter.textContent = `Attempt ${MAX_ATTEMPTS - attemptsLeft} of ${MAX_ATTEMPTS}`;

    const colours = Array(currentWord.length).fill("red");
    const used = Array(currentWord.length).fill(false);

    for (let i = 0; i < Math.min(guess.length, currentWord.length); i++) {
      if (guess[i] === currentWord[i]) { colours[i] = "green"; used[i] = true; }
    }
    for (let i = 0; i < Math.min(guess.length, currentWord.length); i++) {
      if (colours[i] === "green") continue;
      const letter = guess[i];
      const idx = currentWord.split("").findIndex((c, j) => c === letter && !used[j]);
      if (idx !== -1) { colours[i] = "amber"; used[idx] = true; }
    }

    renderBoxes(guess, colours, true);

    if (guess === currentWord) {
      wordCompleted = true; UI.submitBtn.disabled = true;
      playCorrectSound();
      score++; streak++; updateStreak();
      results[currentIndex] = { word: currentWord, correct: true, attemptsUsed: (MAX_ATTEMPTS - attemptsLeft) };
      updateStars();
      setFeedback(streak >= 3 ? `Correct! 🔥 Streak ${streak}!` : "Correct!", "good");
      showCorrectSpelling();
    } else if (attemptsLeft === 0) {
      wordCompleted = true; UI.submitBtn.disabled = true;
      playWrongSound(); shakeBoxes();
      streak = 0; updateStreak();
      results[currentIndex] = { word: currentWord, correct: false, attemptsUsed: MAX_ATTEMPTS };
      updateStars();
      setFeedback("Unlucky — out of attempts.", "bad");
      showCorrectSpelling();
    } else {
      playWrongSound(); shakeBoxes();
      setFeedback("Try again!", "neutral");
      UI.guessInput.focus();
    }
  }

  function showCorrectSpelling() {
    UI.guessInput.disabled = true;
    renderCorrectBoxes(currentWord, UI.correctBoxes);
    UI.correctSpellingArea.classList.remove("hidden");

    document.getElementById("hearSpellingBtn").onclick = () => speakSpelling(currentWord);
    UI.submitBtn.classList.add("hidden");
    UI.nextBtn.classList.remove("hidden");
    UI.nextBtn.textContent = currentIndex === TOTAL_WORDS - 1 ? "Finish" : "Next word";
    UI.nextBtn.focus();

    if (UI.autoAdvance.checked) {
      setTimeout(() => {
        if (!wordCompleted) return;
        if (!UI.nextBtn.classList.contains("hidden")) nextWord();
      }, 3000);
    }
  }

  function nextWord() {
    currentIndex++;
    if (currentIndex >= TOTAL_WORDS) endGame();
    else loadWord();
  }

  function endGame() {
    speechSynthesis.cancel();
    UI.gameArea.classList.add("hidden");
    UI.resultArea.classList.remove("hidden");

    const missedWords = results.filter(r => r && !r.correct).map(r => r.word);
    document.getElementById("finalScore").textContent = `Your score: ${score} out of ${TOTAL_WORDS}`;

    const msg = score === TOTAL_WORDS ? "Perfect score — amazing! 🌟" :
                score >= Math.ceil(TOTAL_WORDS * 0.8) ? "Great work — nearly there! 💪" :
                score >= Math.ceil(TOTAL_WORDS * 0.5) ? "Good effort — keep practising! 🙂" :
                "Nice try — give it another go! 🚀";

    const finalMessage = document.getElementById("finalMessage");
    finalMessage.textContent = msg;
    finalMessage.className = "status" + (score === TOTAL_WORDS ? " good" : "");
    UI.sessionSummary.textContent = `Best streak: ${bestStreak}. Missed words: ${missedWords.length ? missedWords.join(', ') : 'None'}.`;

    UI.publicName.disabled = false; UI.publicAge.disabled = false;
    UI.publicScoreStatus.textContent = ""; UI.submitPublicScoreBtn.disabled = false;

    addScoreEntry({ ts: Date.now(), score, total: TOTAL_WORDS, bestStreak, missedWords });

    UI.resultsList.innerHTML = "";
    results.forEach(r => {
      const row = document.createElement("div");
      row.style.margin = "12px 0";
      const status = r.correct ? "🌟" : "🔴";
      row.innerHTML = `<div style="font-size:1.05rem; font-weight:900;">${status} ${r.word}</div>`;
      const boxRow = document.createElement("div");
      boxRow.classList.add("boxes");
      r.word.split("").forEach(letter => {
        const b = document.createElement("div");
        b.classList.add("box"); b.textContent = letter.toUpperCase();
        boxRow.appendChild(b);
      });
      const btn = document.createElement("button");
      btn.textContent = "🔊 Hear spelling"; btn.classList.add("small-btn");
      btn.onclick = () => speakSpelling(r.word);
      const meta = document.createElement("div");
      meta.className = "hint"; meta.textContent = r.correct ? `Solved in ${r.attemptsUsed} attempt(s).` : "Not solved.";
      row.appendChild(meta); row.appendChild(boxRow); row.appendChild(btn);
      UI.resultsList.appendChild(row);
    });
  }

  // ====== UI wire-up ======
  UI.startBtn.onclick = startGame;
  UI.submitBtn.onclick = checkGuess;
  UI.nextBtn.onclick = nextWord;
  UI.repeatBtn.onclick = () => { ensureAudio(); speakWord(); };
  UI.submitPublicScoreBtn.onclick = submitPublicScore;

  UI.playAgainBtn.onclick = () => {
    speechSynthesis.cancel();
    UI.resultArea.classList.add("hidden");
    UI.startMenu.classList.remove("hidden");
    renderScores();
    loadGlobalScores();
  };

  UI.guessInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      if (!wordCompleted) {
        checkGuess();
      } else if (!UI.nextBtn.classList.contains("hidden")) {
        nextWord();
      }
    }
    // "R" to repeat word
    if (e.key.toLowerCase() === "r" && !UI.gameArea.classList.contains("hidden")) {
      ensureAudio();
      speakWord();
    }
  });

  // Global "R" key for convenience if not in input
  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "r" && !UI.gameArea.classList.contains("hidden") && document.activeElement !== UI.guessInput) {
      ensureAudio();
      speakWord();
    }
  });

  UI.guessInput.addEventListener("input", () => {
    if (wordCompleted) return;
    const val = UI.guessInput.value.toLowerCase();
    renderBoxes(val, [], false);
  });

  UI.useBuiltInBtn.onclick = () => {
    setBuiltInList();
    localStorage.setItem(LS_WORDS, UI.customWords.value.trim());
    setFeedback("Using built-in list.", "neutral");
    setTimeout(() => setFeedback("", ""), 900);
  };

  UI.uploadWords.addEventListener("change", async () => {
    const file = UI.uploadWords.files && UI.uploadWords.files[0];
    if (!file) return;
    const text = await file.text();
    UI.customWords.value = text.trim();
    saveWordListFromTextarea();
    setFeedback("Uploaded and saved word list.", "good");
    setTimeout(() => setFeedback("", ""), 900);
  });

  UI.clearScoresBtn.onclick = () => {
    localStorage.removeItem(LS_SCORES);
    renderScores();
  };

  ["pointerdown","keydown","touchstart"].forEach(evt => {
    window.addEventListener(evt, ensureAudio, { once: true, passive: true });
  });

  // Initial load
  loadSavedWordsIntoTextarea();
  if (!UI.customWords.value.trim()) setBuiltInList();
  
  // Restore public name if saved
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) UI.publicName.value = savedName;

  renderScores();
  loadGlobalScores();
  updateStars();
  updateStreak();
})();
