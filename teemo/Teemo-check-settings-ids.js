const fs = require('fs');
const h = fs.readFileSync('D:/Teemo助手/Teemo机器人项目/Teemo-source/Teemo-chat-window/Teemo-chat-window.html', 'utf8');
const ids = ['apiConnectionList', 'TeemoApprovalModeStatus', 'audioAnalysisEnabled', 'imageApiLabel', 'comfyEnabled', 'skillList', 'chatFontSize', 'appVersionLabel', 'settingsView', 'TeemoSettingsNav', 'memoryButton', 'saveApiButton', 'saveComfyButton', 'settingsBackButton'];
for (const id of ids) {
  const n = h.split(`id="${id}"`).length - 1;
  console.log(id, n);
}
console.log('overlay class', h.includes('teemo-settings-overlay'));
console.log('panels', (h.match(/data-panel="/g) || []).length);
