/**
 * Embed Teemo capability pages into settings panels (no third-level fullscreen pages).
 * Run once against Teemo-chat-window.html
 */
const fs = require('fs');
const path = 'D:/Teemo助手/Teemo机器人项目/Teemo-source/Teemo-chat-window/Teemo-chat-window.html';
let html = fs.readFileSync(path, 'utf8');

html = html.replace(
  /<div class="teemo-settings-nav-group">\s*<span class="teemo-settings-nav-label">能力中心<\/span>[\s\S]*?<\/div>\s*<\/nav>/,
  `<div class="teemo-settings-nav-group">
                <span class="teemo-settings-nav-label">能力中心</span>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="memory"><span class="teemo-settings-nav-dot memory" aria-hidden="true"></span>Teemo 对我的了解</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="creative"><span class="teemo-settings-nav-dot creative" aria-hidden="true"></span>Teemo 的设计判断</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="inspiration"><span class="teemo-settings-nav-dot inspiration" aria-hidden="true"></span>我的灵感</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="runtime"><span class="teemo-settings-nav-dot runtime" aria-hidden="true"></span>运行环境</button>
              </div>
            </nav>`
);

// Hide back buttons in capability heads (settings shell already has back)
html = html.replace(/id="memoryBackButton"[^>]*>← 返回设置<\/button>/, 'id="memoryBackButton" class="teemo-back-button" type="button" hidden>← 返回</button>');
html = html.replace(/id="TeemoCreativeBackButton"[^>]*>← 返回设置<\/button>/, 'id="TeemoCreativeBackButton" class="teemo-back-button" type="button" hidden>← 返回</button>');
html = html.replace(/id="TeemoInspirationBackButton"[^>]*>← 返回设置<\/button>/, 'id="TeemoInspirationBackButton" class="teemo-back-button" type="button" hidden>← 返回</button>');
html = html.replace(/id="TeemoRuntimeBackButton"[^>]*>← 返回设置<\/button>/, 'id="TeemoRuntimeBackButton" class="teemo-back-button" type="button" hidden>← 返回</button>');

fs.writeFileSync(path, html);
console.log('nav + back buttons updated');
