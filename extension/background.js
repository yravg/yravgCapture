// Toolbar click / shortcut: inject the bar once, then tell it what to do.
// Both are user gestures, so activeTab covers injection and captureVisibleTab for this tab.
const ensure = async (tabId) => {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!window.__yravgCap });
  if (!result) await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/orca-format.js', 'content.js'] });
  return !result; // true = freshly injected (bar already visible)
};
const send = async (tab, msg) => {
  if (!tab?.id) return;
  try { const fresh = await ensure(tab.id); if (!(fresh && msg.type === 'toggle')) await chrome.tabs.sendMessage(tab.id, msg); } catch (e) { /* chrome:// pages, Web Store */ }
};

chrome.action.onClicked.addListener((tab) => send(tab, { type: 'toggle' }));
chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  send(tab, { type: 'mode', mode: cmd.replace('mode-', '') });
});

const run = (reply, p) => p.then((r) => reply({ ok: true, ...r }), (e) => reply({ ok: false, error: String(e) }));
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  if (msg.type === 'arm') {
    run(reply, chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/orca-main.js'], world: 'MAIN' }).then(() => ({})));
    return true;
  }
  if (msg.type === 'robo') {
    run(reply, chrome.scripting.executeScript({ target: { tabId }, files: ['robo.js'] }).then(() => ({})));
    return true;
  }
  if (msg.type === 'shot') {
    run(reply, chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }).then((dataUrl) => ({ dataUrl })));
    return true;
  }
});
