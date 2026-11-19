// 내 문장 모음 - 백그라운드 서비스 워커
// 역할: 오른쪽 클릭 메뉴를 만들고, 선택한 문장을 chrome.storage.local에 저장한다.

const MENU_ID = "save-sentence";
const STORAGE_KEY = "sentences";

// 확장 프로그램 설치/업데이트 시 오른쪽 클릭 메뉴 등록
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "내 문장 모음에 저장: \"%s\"",
      contexts: ["selection"]
    });
  });
});

// 메뉴 클릭 시 선택한 문장 저장
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return;

  // 웹페이지의 특수 공백(&nbsp; 등)은 일반 공백으로 바꿔서 저장
  const text = (info.selectionText || "")
    .normalize("NFC")
    .replace(/[  -   　]/g, " ")
    .replace(/[​‌‍﻿]/g, "")
    .trim();
  if (!text) return;

  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];

  // 같은 페이지에서 같은 문장을 이미 저장했다면 중복 저장하지 않음
  const exists = list.some((s) => s.text === text && s.url === info.pageUrl);
  if (!exists) {
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      url: info.pageUrl || "",
      savedAt: Date.now()
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }

  // 아이콘 위에 잠깐 표시 (별도 권한 필요 없음)
  chrome.action.setBadgeBackgroundColor({ color: "#3d5a40" });
  chrome.action.setBadgeText({ text: exists ? "있음" : "+1" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
});
