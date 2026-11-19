// 내 문장 모음 - 팝업 화면 로직
// 역할: 저장된 문장을 불러와 보여주고, 검색·복사·삭제를 처리한다.

const STORAGE_KEY = "sentences";

// 확장 프로그램 밖(일반 브라우저에서 popup.html을 직접 연 경우)에서는
// 화면 디자인 확인용 예시 데이터를 메모리에서만 사용한다.
const hasChromeStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
let demoStore = [
  { id: "d1", text: "가장 어두운 밤도 끝나고 해는 떠오른다.", url: "https://example.com/hugo", savedAt: Date.now() - 3600e3 },
  { id: "d2", text: "우리가 무엇을 반복적으로 하느냐가 곧 우리 자신이다. 그러므로 탁월함은 행동이 아니라 습관이다.", url: "https://example.org/essay/habits", savedAt: Date.now() - 86400e3 * 2 },
  { id: "d3", text: "천천히 가는 것을 두려워하지 말고, 멈춰 서는 것을 두려워하라.", url: "https://blog.example.net/post/42", savedAt: Date.now() - 86400e3 * 9 }
];

const storage = {
  async get() {
    if (!hasChromeStorage) return demoStore.slice();
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  },
  async set(list) {
    if (!hasChromeStorage) { demoStore = list; return; }
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }
};

const $list = document.getElementById("list");
const $empty = document.getElementById("empty");
const $emptyMsg = document.getElementById("emptyMsg");
const $count = document.getElementById("count");
const $search = document.getElementById("search");
const $clearAll = document.getElementById("clearAll");
const $toast = document.getElementById("toast");
const emptyDefaultHTML = $emptyMsg.innerHTML;

let all = [];

function formatDate(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// 클립보드에 복사. 최신 방식(navigator.clipboard)이 막힌 환경에서는
// 숨긴 입력칸에 넣고 선택해서 복사하는 예전 방식으로 한 번 더 시도한다.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 아래 예비 방법으로 넘어감 */ }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

// 알림 띄우기. onUndo를 넘기면 "되돌리기" 버튼이 함께 나오고 더 오래 머문다.
function showToast(msg, onUndo) {
  $toast.replaceChildren();
  const label = document.createElement("span");
  label.textContent = msg;
  $toast.append(label);

  if (onUndo) {
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "undo";
    undoBtn.textContent = "되돌리기";
    undoBtn.addEventListener("click", async () => {
      clearTimeout(showToast.t);
      $toast.classList.remove("show");
      await onUndo();
    });
    $toast.append(undoBtn);
  }

  $toast.classList.toggle("has-undo", !!onUndo);
  $toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => $toast.classList.remove("show"), onUndo ? 5000 : 1400);
}

// 검색용으로 글자를 맞춘다.
// 웹페이지 문장에는 눈에 안 보이는 특수 공백(&nbsp; 등)이나 줄바꿈이 섞여 있어서
// 입력한 글자와 겉보기엔 같아도 일치하지 않는 경우가 많다.
// 그래서 한글 조합 방식을 통일하고(NFC), 모든 공백을 빼고, 소문자로 바꿔서 비교한다.
function normalize(str) {
  return (str || "")
    .normalize("NFC")
    .replace(/[\s​‌‍﻿]+/g, "")
    .toLowerCase();
}

function render() {
  const q = normalize($search.value);
  const items = q ? all.filter((s) => normalize(s.text).includes(q)) : all;

  $count.innerHTML = `<b>${all.length}</b> LINES`;
  $clearAll.hidden = all.length === 0;
  $list.replaceChildren();

  if (items.length === 0) {
    $empty.hidden = false;
    if (q) $emptyMsg.textContent = `"${$search.value.trim()}"와(과) 맞는 문장이 없어요.`;
    else $emptyMsg.innerHTML = emptyDefaultHTML;
    return;
  }
  $empty.hidden = true;

  for (const s of items) {
    const li = document.createElement("li");
    li.className = "item";

    const p = document.createElement("p");
    p.className = "text";
    p.textContent = s.text;
    if (s.text.length > 120) {
      p.classList.add("clamped");
      p.title = "눌러서 펼치기";
      p.addEventListener("click", () => p.classList.toggle("clamped"));
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const src = document.createElement("a");
    src.className = "source";
    const host = hostOf(s.url);
    src.textContent = `${host || "출처 없음"} · ${formatDate(s.savedAt)}`;
    if (host) {
      src.href = s.url;
      src.target = "_blank";
      src.rel = "noopener";
      src.title = s.url;
    }

    const actions = document.createElement("div");
    actions.className = "actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn";
    copyBtn.type = "button";
    copyBtn.textContent = "복사";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(s.text);
      showToast(ok ? "문장을 복사했어요" : "복사하지 못했어요");
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn del";
    delBtn.type = "button";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      const index = all.findIndex((x) => x.id === s.id);
      all = all.filter((x) => x.id !== s.id);
      await storage.set(all);
      render();
      showToast("삭제했어요", async () => {
        if (all.some((x) => x.id === s.id)) return;
        all.splice(Math.min(Math.max(index, 0), all.length), 0, s);
        await storage.set(all);
        render();
        showToast("되살렸어요");
      });
    });

    actions.append(copyBtn, delBtn);
    meta.append(src, actions);
    li.append(p, meta);
    $list.append(li);
  }
}

$search.addEventListener("input", render);
// 한글 입력이 끝나는 순간과 엔터를 눌렀을 때도 한 번 더 검색
$search.addEventListener("compositionend", render);
$search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); render(); }
});

$clearAll.addEventListener("click", async () => {
  if (!confirm(`저장한 문장 ${all.length}개를 모두 삭제할까요?`)) return;
  const backup = all;
  all = [];
  await storage.set(all);
  render();
  showToast(`${backup.length}개를 삭제했어요`, async () => {
    // 그 사이 새로 저장된 문장이 있으면 앞에 두고, 지운 문장들을 뒤에 붙인다
    const ids = new Set(all.map((x) => x.id));
    all = all.concat(backup.filter((x) => !ids.has(x.id)));
    await storage.set(all);
    render();
    showToast("모두 되살렸어요");
  });
});

// 팝업이 열려 있는 동안 다른 곳에서 저장/삭제되면 바로 반영
if (hasChromeStorage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      all = changes[STORAGE_KEY].newValue || [];
      render();
    }
  });
}

storage.get().then((list) => {
  all = list;
  render();
});
