(() => {
  const $ = selector => document.querySelector(selector);
  const setId = new URLSearchParams(location.search).get("set") || "";
  const session = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, "0")).join("");
  const intro = $("#intro"), trialSection = $("#trial"), done = $("#done");
  const videoA = $("#video-a"), videoB = $("#video-b");
  let config = null;
  let trials = [];
  let index = 0;
  let experience = "";
  const responses = {};
  const coverage = { A: 0, B: 0 };

  function checksum(text) {
    let h = 2166136261;
    for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function setError(message) {
    $("#set-error").textContent = message;
    $("#set-error").classList.remove("hidden");
    $("#understood").disabled = true;
  }

  async function load() {
    try {
      const response = await fetch("config.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`設定ファイルを取得できませんでした (${response.status})`);
      config = await response.json();
      if (!/^\d{2}$/.test(setId) || !config.assignments[setId]) {
        setError("有効な評価URLではありません。ランサーズに記載された専用URLを開き直してください。");
        return;
      }
      trials = config.assignments[setId];
      if (trials.length !== config.questions_per_assignment) throw new Error("設問数が一致しません");
      const updateEligibility = () => {
        experience = $("#experience").value;
        const knowsRules = experience && experience !== "X";
        $("#start").disabled = !($("#understood").checked && knowsRules);
        $("#experience-note").textContent = experience === "X"
          ? "本評価はスマブラのルールを知っている方のみ対象です。ランサーズの作業をキャンセルしてください。"
          : "本評価は、スマブラのルールを知っている方が対象です。";
        $("#experience-note").classList.toggle("error", experience === "X");
      };
      $("#understood").addEventListener("change", updateEligibility);
      $("#experience").addEventListener("change", updateEligibility);
      $("#start").addEventListener("click", start);
    } catch (error) {
      setError(`評価ページを読み込めませんでした。再読み込みしてください。${error.message}`);
    }
  }

  function start() {
    intro.classList.add("hidden");
    trialSection.classList.remove("hidden");
    showTrial();
  }

  function showTrial() {
    const current = trials[index];
    $("#progress").textContent = `進捗 ${index + 1} / ${trials.length}`;
    $("#trial-title").textContent = `比較 ${index + 1} / ${trials.length}`;
    coverage.A = 0;
    coverage.B = 0;
    videoA.src = current.video_a;
    videoB.src = current.video_b;
    videoA.load();
    videoB.load();
    $("#watch-a").textContent = "未視聴";
    $("#watch-b").textContent = "未視聴";
    $("#watch-a").classList.remove("ready");
    $("#watch-b").classList.remove("ready");
    document.querySelectorAll('#rating input[type="radio"]').forEach(input => { input.checked = false; });
    document.querySelectorAll("#rating fieldset").forEach(fieldset => { fieldset.disabled = true; });
    $("#next").disabled = true;
    $("#watch-note").textContent = "動画Aと動画Bをそれぞれ80%以上再生すると回答できます。";
  }

  function updateCoverage(label, video, status) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    coverage[label] = Math.max(coverage[label], video.currentTime / video.duration);
    if (coverage[label] >= config.minimum_watch_fraction) {
      status.textContent = "視聴済み";
      status.classList.add("ready");
    }
    const ready = coverage.A >= config.minimum_watch_fraction && coverage.B >= config.minimum_watch_fraction;
    if (ready) {
      document.querySelectorAll("#rating fieldset").forEach(fieldset => { fieldset.disabled = false; });
      $("#watch-note").textContent = "回答できます。2項目の両方に回答してください。";
    }
  }

  videoA.addEventListener("play", () => videoB.pause());
  videoB.addEventListener("play", () => videoA.pause());
  videoA.addEventListener("timeupdate", () => updateCoverage("A", videoA, $("#watch-a")));
  videoB.addEventListener("timeupdate", () => updateCoverage("B", videoB, $("#watch-b")));
  videoA.addEventListener("ended", () => { coverage.A = 1; updateCoverage("A", videoA, $("#watch-a")); });
  videoB.addEventListener("ended", () => { coverage.B = 1; updateCoverage("B", videoB, $("#watch-b")); });

  function allAnswered() {
    return ["information", "following"].every(name => document.querySelector(`input[name="${name}"]:checked`));
  }
  document.querySelectorAll('#rating input[type="radio"]').forEach(input => input.addEventListener("change", () => {
    $("#next").disabled = !allAnswered();
  }));

  $("#next").addEventListener("click", () => {
    if (!allAnswered() || coverage.A < config.minimum_watch_fraction || coverage.B < config.minimum_watch_fraction) return;
    const current = trials[index];
    responses[current.trial_id] = {
      information: document.querySelector('input[name="information"]:checked').value,
      following: document.querySelector('input[name="following"]:checked').value,
    };
    index += 1;
    if (index < trials.length) showTrial(); else finish();
  });

  function finish() {
    trialSection.classList.add("hidden");
    done.classList.remove("hidden");
    $("#progress").textContent = "完了";
    const ratings = Object.keys(responses).sort().map(id => `${id}:${responses[id].information}.${responses[id].following}`).join(",");
    const body = `${config.version}|set:${setId}|session:${session}|smash:${experience}|ratings:${ratings}`;
    $("#completion").value = `${body}|check:${checksum(body)}`;
  }

  $("#copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#completion").value);
      $("#copy-status").textContent = "コピーしました。ランサーズの回答欄へ貼り付けてください。";
    } catch (_) {
      $("#completion").select();
      $("#copy-status").textContent = "完了コードを選択しました。コピーしてランサーズへ貼り付けてください。";
    }
  });

  load();
})();
