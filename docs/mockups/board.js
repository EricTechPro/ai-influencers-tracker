// Pick handling — persists across pages via localStorage, shows all pages' picks in the bottom bar.
const PAGES = [
  ["home", "home.html", "/ home"],
  ["leaderboard", "leaderboard.html", "/leaderboard"],
  ["topic-leaf", "topic-leaf.html", "/topics leaf"],
  ["topic-parent", "topic-parent.html", "/topics parent"],
  ["channel", "channel.html", "/channels"],
  ["own-channel", "own-channel.html", "reply queue"],
  ["compare", "compare.html", "/compare"],
];

// Mirror picks to picks.json via serve.py so the picks survive outside the browser.
function syncPicks() {
  if (location.protocol !== "http:") return; // file:// has no server to talk to
  const all = {};
  for (const [key] of PAGES) {
    const v = localStorage.getItem("ait-pick-" + key);
    if (v) all[key] = v;
  }
  fetch("/save", { method: "POST", body: JSON.stringify(all) }).catch(() => {});
}

function renderPicks() {
  const bar = document.getElementById("picks");
  if (!bar) return;
  bar.innerHTML = '<span class="lbl">picks</span>';
  for (const [key, file, label] of PAGES) {
    const v = localStorage.getItem("ait-pick-" + key);
    const s = document.createElement("a");
    s.href = file;
    s.className = v ? "pick" : "pending";
    s.textContent = label + ": " + (v || "?");
    bar.appendChild(s);
  }
  const clear = document.createElement("a");
  clear.href = "#";
  clear.className = "pending";
  clear.textContent = "reset";
  clear.onclick = (e) => {
    e.preventDefault();
    for (const [key] of PAGES) localStorage.removeItem("ait-pick-" + key);
    document.querySelectorAll(".pageframe").forEach((f) => f.classList.remove("selected"));
    renderPicks();
    syncPicks();
  };
  bar.appendChild(clear);
}

document.querySelectorAll(".pageframe").forEach((frame) => {
  const group = frame.dataset.group;
  const v = frame.dataset.v;
  if (localStorage.getItem("ait-pick-" + group) === v) frame.classList.add("selected");
  const btn = frame.querySelector(".pickbtn");
  if (btn)
    btn.addEventListener("click", () => {
      localStorage.setItem("ait-pick-" + group, v);
      document
        .querySelectorAll('.pageframe[data-group="' + group + '"]')
        .forEach((f) => f.classList.remove("selected"));
      frame.classList.add("selected");
      renderPicks();
      syncPicks();
    });
});
renderPicks();
syncPicks();
