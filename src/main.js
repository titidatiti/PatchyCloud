const { app, BrowserWindow, BrowserView, Tray, Menu, screen, ipcMain, shell, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

let blocker; // Global blocker instance

let mainWindow;
let contentViews = []; // Currently displayed content views
let pageViewCache = new Map(); // Cache of all page views: Map<index, BrowserView[]>
let settingsWindow;
let tray;
let config = {};

let isMouseTracking = false;
let activePageIndex = 0; // Current active page index

// 动画控制变量
let showAnimation = null;
let hideAnimation = null;
let isAnimating = false;
let hiddenOffset = 50;

// 动画配置
const ANIMATION_CONFIG = {
  duration: 250,        // 动画持续时间（毫秒）
  fps: 60,             // 帧率
  easing: 'easeOutCubic' // 缓动函数
};

// 默认配置
const defaultConfig = {
  // Config migration: urls -> pages
  // New structure: pages: [ { urls: [...] }, ... ]
  pages: [
    { items: [{ url: 'https://github.com/titidatiti/PatchyCloud', width: 100 }] }
  ],
  width: 50, // 百分比
  height: 50, // 百分比
  triggerDistance: 10, // 像素
  displayId: 'primary', // 显示器ID，'primary'表示主显示器
  enableNetworkAdBlock: false, // 默认关闭网络层广告拦截 (不稳定)
  enableYouTubeAdSkip: true // 默认开启 JS 脚本跳过广告 (更稳定)
};

// 配置文件路径
const configPath = path.join(app.getPath('userData'), 'config.json');

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...defaultConfig, ...savedConfig };

      // Configuration Migration
      if (!config.pages) {
        config.pages = [];

        // Migrate 'urls' (previous version)
        if (savedConfig.urls && Array.isArray(savedConfig.urls)) {
          config.pages.push({ urls: savedConfig.urls });
        }
        // Migrate 'url' (very old version)
        else if (savedConfig.url) {
          config.pages.push({ urls: [savedConfig.url] });
        }
      }

      // Ensure at least one page exists
      if (config.pages.length === 0) {
        config.pages.push(JSON.parse(JSON.stringify(defaultConfig.pages[0])));
      }

    } else {
      config = { ...defaultConfig };
    }
  } catch (error) {
    console.error('加载配置失败:', error);
    config = { ...defaultConfig };
  }
}

// 保存配置
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

function forceAlwaysOnTop() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    /*
    // 临时取消置顶再重新设置，确保刷新置顶状态
    mainWindow.setAlwaysOnTop(false);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, 'floating', 1);
        // 在某些系统上，focus() 可以帮助确保置顶
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        }
      }
    }, 10);*/
    mainWindow.setAlwaysOnTop(true, 'pop-menu');
    //mainWindow.moveTop();
  }
}

// 获取目标显示器
function getTargetDisplay() {
  const displays = screen.getAllDisplays();

  if (config.displayId === 'primary') {
    return screen.getPrimaryDisplay();
  }

  // 根据显示器ID查找
  const targetDisplay = displays.find(display => display.id.toString() === config.displayId);
  return targetDisplay || screen.getPrimaryDisplay();
}

let toolbarView;
let isPinned = false;
const TOOLBAR_WIDTH = 56; // 工具栏宽度

// 创建主窗口
function createMainWindow() {
  const targetDisplay = getTargetDisplay();
  const { width: screenWidth, height: screenHeight } = targetDisplay.bounds;
  const { x: screenX, y: screenY } = targetDisplay.bounds;

  mainWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: screenX,
    y: screenY,
    frame: false,
    transparent: true,
    hasShadow: false, // 全屏透明窗口不需要自带阴影，由内容自行实现
    roundedCorners: false, // 全屏窗口不需要圆角
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: true,
    enableLargerThanScreen: true,
    type: 'toolbar', // 尝试使用工具栏类型以获得更好的置顶效果
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 初始设置为穿透
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  CreateView();

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 确保窗口大小正确
  mainWindow.setBounds({
    x: screenX,
    y: screenY,
    width: screenWidth,
    height: screenHeight
  });

  mainWindow.on('blur', () => {
    // 只有当鼠标不在内容区域时才隐藏
    // 这里由 checkMouse 逻辑处理，blur 事件可能不准确因为点击view也会导致window blur? 
    // BrowserView 点击通常不会导致 BrowserWindow blur，除非焦点切换到其他应用
    /*
    setTimeout(() => {
      if (!isPinned) {
        hideMainWindow();
      }
    }, 100);
    */
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault(); // 退出时通过 quitApp 清理
    hideMainWindow();
  });
}

function updateViewBounds(y) {
  if (!toolbarView || !mainWindow) return;

  const targetDisplay = getTargetDisplay();
  const screenWidth = targetDisplay.bounds.width;
  const { width: contentWidth, height: contentHeight } = getWindowConfigSize();

  // 计算水平居中位置
  const startX = Math.floor((screenWidth - contentWidth) / 2);

  try {
    toolbarView.setBounds({
      x: startX,
      y: y,
      width: TOOLBAR_WIDTH,
      height: contentHeight
    });

    if (contentViews.length > 0) {
      const totalContentWidth = contentWidth - TOOLBAR_WIDTH;

      // Get widths from active page config
      const activePage = config.pages[activePageIndex];
      let items = []; /* activePage.items or derived */
      if (activePage) {
        if (activePage.items) items = activePage.items;
        else if (activePage.urls) items = activePage.urls.map(u => ({ width: 0 }));
      }

      // If we don't have enough width info, fallback to equal split
      // But CreateView ensures items match views usually

      let currentX = startX + TOOLBAR_WIDTH;

      contentViews.forEach((view, index) => {
        // Calculate width based on percentage
        let percentage = 0;
        if (items[index] && items[index].width) {
          percentage = items[index].width;
        } else {
          // Fallback: distribute remaining or equal?
          // If completely missing, 100 / count
          percentage = 100 / contentViews.length;
        }

        let widthPx = Math.floor(totalContentWidth * percentage / 100);

        // Adjust last view width to fill remaining space
        if (index === contentViews.length - 1) {
          widthPx = (startX + TOOLBAR_WIDTH + totalContentWidth) - currentX;
          // Protect against negative width
          if (widthPx < 0) widthPx = 0;
        }

        view.setBounds({
          x: currentX,
          y: y,
          width: widthPx,
          height: contentHeight
        });

        currentX += widthPx;
      });
    }
  } catch (e) {
    console.error('Update bounds failed:', e);
  }
}

// Helper to clean up all cached views (e.g. on config change)
function destroyAllCachedViews() {
  pageViewCache.forEach(views => {
    views.forEach(v => {
      // Important: Destroying webContents stops the renderer process
      try { if (!v.webContents.isDestroyed()) v.webContents.destroy(); } catch (e) { }
    });
  });
  pageViewCache.clear();
  contentViews = [];
}

function CreateView() {
  const targetDisplay = getTargetDisplay();
  const screenHeight = targetDisplay.bounds.height;

  // 1. Detach current content views (do not destroy, just remove from window)
  contentViews.forEach(v => {
    if (mainWindow) {
      try { mainWindow.removeBrowserView(v); } catch (e) { }
    }
  });
  contentViews = [];

  // 2. Manage Toolbar View (Ensure it exists and is attached)
  // We don't cache/destroy toolbar view on page switch, it stays alive.
  if (!toolbarView || toolbarView.webContents.isDestroyed()) {
    toolbarView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'toolbar-preload.js')
      }
    });
    toolbarView.webContents.loadFile(path.join(__dirname, 'toolbar.html'));
  }

  // Ensure toolbar is attached (it might have been removed if we are strict, 
  // but let's just add it back to be safe or check if attached? 
  // Electron doesn't have 'isAttached', so setBrowserView overwrites? 
  // mainWindow.setBrowserView(toolbarView) sets ONE view. 
  // We use addBrowserView. 
  // Best practice: remove all, add all.
  if (mainWindow) {
    // Determine if we need to re-add toolbar. 
    // Simplest is to remove it and add it back to ensure Z-order or just ensure it is in the list.
    // However, removing toolbar might flicker. 
    // Let's try to NOT remove toolbar if possible.
    // But we need to ensure content views are managed.
    // Let's just re-add it.
    try { mainWindow.addBrowserView(toolbarView); } catch (e) { }
  }

  // 3. Get or Create Content Views for Active Page
  if (pageViewCache.has(activePageIndex)) {
    // Use cached views
    contentViews = pageViewCache.get(activePageIndex);
  } else {
    // Create new views
    const activePage = config.pages[activePageIndex];
    // Handle both items (new) and urls (old)
    let pageItems = [];
    if (activePage) {
      if (activePage.items) {
        pageItems = activePage.items;
      } else if (activePage.urls) {
        // Migration / Fallback
        pageItems = activePage.urls.map(u => ({ url: u, width: 100 / activePage.urls.length }));
      }
    }

    const newViews = [];

    pageItems.forEach(item => {
      const url = (typeof item === 'string') ? item : item.url;
      if (!url) return;

      const v = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          webSecurity: false,
          preload: path.join(__dirname, 'preload.js')
        }
      });
      v.setBackgroundColor('#1a1a1a');


      // Inject custom script if available
      if (config.customScript && config.customScript.trim() !== '') {
        const script = config.customScript;
        v.webContents.on('did-finish-load', () => {
          v.webContents.executeJavaScript(script).catch(err => {
            console.error('Failed to execute custom script:', err);
          });
        });
      }

      // Explicit YouTube AdSkip Script
      if (config.enableYouTubeAdSkip && url.includes('youtube.com')) {
        const adSkipScript = `
          (() => {
            console.log('YouTube AdSkip Active');
            setInterval(() => {
              // Click 'Skip Ads' button
              const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
              if (skipBtn) { skipBtn.click(); console.log('Skipped Ad'); }
              
              // Click Overlay Ad Close button
              const overlayClose = document.querySelector('.ytp-ad-overlay-close-button');
              if (overlayClose) { overlayClose.click(); console.log('Closed Overlay'); }
              
              // Try to speed up video if ad is playing (experimental)
              const video = document.querySelector('video');
              const adElement = document.querySelector('.ad-showing');
              if (adElement && video && !isNaN(video.duration)) {
                 // video.playbackRate = 16; 
                 // video.muted = true;
              }
            }, 500);
          })();
        `;
        v.webContents.on('did-finish-load', () => {
          v.webContents.executeJavaScript(adSkipScript).catch(e => console.error('AdSkip Error', e));
        });
      }

      v.webContents.loadURL(url);
      newViews.push(v);
    });

    // Fallback?

    pageViewCache.set(activePageIndex, newViews);
    contentViews = newViews;
  }

  // 4. Attach Content Views
  if (mainWindow) {
    // Note: setBrowserView destroys others? No, it replaces 'the' browser view. 
    // We should use addBrowserView for multiple. 
    // But historically we might have used setBrowserView for toolbar?
    // Let's use setBrowserView(null) to clear? No.
    // We just add them.
    contentViews.forEach(v => mainWindow.addBrowserView(v));

    // Send page info to toolbar
    // Check if toolbar is ready?
    if (toolbarView.webContents && !toolbarView.webContents.isLoading()) {
      toolbarView.webContents.send('update-pages', {
        count: config.pages.length,
        active: activePageIndex,
        pages: config.pages // Send full pages config
      });
    } else if (toolbarView.webContents) {
      toolbarView.webContents.once('did-finish-load', () => {
        toolbarView.webContents.send('update-pages', {
          count: config.pages.length,
          active: activePageIndex,
          pages: config.pages // Send full pages config
        });
      });
    }
  }

  // 5. Initial Position (Hidden)
  // Only update bounds if this is a fresh creation or force update?
  // We usually call updateViewBounds immediately after this.
  // const hiddenY = screenHeight + hiddenOffset;
  // updateViewBounds(hiddenY); 
  // No, let caller handle visibility to avoid flickering?
  // Original code did updateViewBounds(hiddenY).
  // Let's do it to be safe, but we might want to keep it visible if we are just switching pages and window is open.
  // We'll let the switch handler decide.
}

// 缓动函数
const easingFunctions = {
  linear: t => t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutQuart: t => 1 - Math.pow(1 - t, 4),
  easeOutBack: t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
};

// 显示主窗口（带动画）
function showMainWindow() {
  if (!mainWindow || isAnimating) return;

  if (hideAnimation) {
    clearInterval(hideAnimation);
    hideAnimation = null;
  }

  const targetDisplay = getTargetDisplay();
  const screenHeight = targetDisplay.bounds.height;
  const { height: contentHeight, taskBarHeight } = getWindowConfigSize();

  // 目标Y坐标：屏幕高度 - 内容高度 - 任务栏高度 (相对于全屏窗口)
  // 注意：全屏窗口的坐标系原点是屏幕左上角
  const workArea = targetDisplay.workArea;
  // 计算相对坐标
  // 假设全屏窗口覆盖整个 display.bounds
  // 也就是 y=0 是 display.bounds.y
  // 底部是 y = screenHeight

  // 通常任务栏在底部，workArea.height < bounds.height
  const targetY = screenHeight - contentHeight - taskBarHeight;

  // 当前Y坐标
  let currentY = screenHeight + hiddenOffset;
  if (toolbarView) {
    currentY = toolbarView.getBounds().y;
  }

  if (Math.abs(currentY - targetY) < 1) return;

  isAnimating = true;
  const startY = currentY;
  const startTime = Date.now();
  const distance = startY - targetY;

  showAnimation = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / ANIMATION_CONFIG.duration, 1);
    const easing = easingFunctions[ANIMATION_CONFIG.easing] || easingFunctions.easeOutCubic;
    const easedProgress = easing(progress);

    const newY = Math.round(startY - distance * easedProgress);
    updateViewBounds(newY);

    if (progress >= 1) {
      clearInterval(showAnimation);
      showAnimation = null;
      isAnimating = false;
      updateViewBounds(targetY);
      // 动画结束，强制置顶一次
      forceAlwaysOnTop();
    }
  }, 1000 / ANIMATION_CONFIG.fps);
}

// 隐藏主窗口（带动画）
function hideMainWindow() {
  if (!mainWindow || isAnimating) return;

  const targetDisplay = getTargetDisplay();
  const screenHeight = targetDisplay.bounds.height;
  const hiddenY = screenHeight + hiddenOffset;

  let currentY = hiddenY;
  if (toolbarView) {
    currentY = toolbarView.getBounds().y;
  }

  if (Math.abs(currentY - hiddenY) < 1) return;

  if (showAnimation) {
    clearInterval(showAnimation);
    showAnimation = null;
  }

  const startY = currentY;
  const targetY = hiddenY;

  isAnimating = true;
  const startTime = Date.now();
  const distance = targetY - startY;

  hideAnimation = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / ANIMATION_CONFIG.duration, 1);
    const easing = easingFunctions.easeInOutCubic;
    const easedProgress = easing(progress);
    // 隐藏时向下移动
    const newY = Math.round(startY + distance * easedProgress);

    updateViewBounds(newY);

    if (progress >= 1) {
      clearInterval(hideAnimation);
      hideAnimation = null;
      isAnimating = false;
      updateViewBounds(targetY);
    }
  }, 1000 / ANIMATION_CONFIG.fps);
}

function getWindowConfigSize() {
  // 不知道为什么，副屏上workarea一会儿扣除任务栏高度，一会儿不扣，我服了，之前写的从主屏获取任务栏的处理现在暂时注释掉

  const targetDisplay = getTargetDisplay();
  //const primaryDisplay = screen.getPrimaryDisplay();
  //const isPrimary = targetDisplay.id === primaryDisplay.id;

  const workArea = targetDisplay.workArea;
  const screenWidth = targetDisplay.bounds.width;
  const screenHeight = targetDisplay.bounds.height;

  const taskBarHeight = screenHeight - workArea.height; //primaryDisplay.bounds.height - primaryDisplay.workArea.height

  let windowWidth = Math.floor(workArea.width * config.width / 100);
  let windowHeight = Math.floor(workArea.height * config.height / 100);

  // console.log(`计算窗口大小: ${windowWidth}x${windowHeight} (屏幕: ${screenWidth}x${screenHeight}, 工作区: ${workArea.width}x${workArea.height}, 任务栏高度: ${taskBarHeight})`);

  return {
    width: windowWidth,
    height: windowHeight,
    taskBarHeight: taskBarHeight
  };
}

// 检查窗口是否正在动画中
function isWindowAnimating() {
  return isAnimating;
}

// 设置动画配置
function setAnimationConfig(newConfig) {
  Object.assign(ANIMATION_CONFIG, newConfig);
}

// 获取当前动画配置
function getAnimationConfig() {
  return { ...ANIMATION_CONFIG };
}

// 清理函数（在应用退出时调用）
function cleanupAnimations() {
  if (showAnimation) {
    clearInterval(showAnimation);
    showAnimation = null;
  }
  if (hideAnimation) {
    clearInterval(hideAnimation);
    hideAnimation = null;
  }
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (mouseCheckTimer) {
    clearTimeout(mouseCheckTimer);
    mouseCheckTimer = null;
  }
  isAnimating = false;
}

// 创建设置窗口
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 720,
    frame: false, // 无边框
    roundedCorners: true,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // 发送当前配置到设置窗口
  settingsWindow.webContents.once('dom-ready', () => {
    const displays = screen.getAllDisplays().map(display => ({
      id: display.id.toString(),
      label: display.label || `显示器 ${display.id}`,
      bounds: display.bounds,
      primary: display.id === screen.getPrimaryDisplay().id,
      selected: display.id === getTargetDisplay().id
    }));

    settingsWindow.webContents.send('load-config', config);
    settingsWindow.webContents.send('load-displays', displays);
  });
}

// 创建系统托盘
function createTray() {
  // 使用简单的图标，你可以替换为自己的图标文件
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../assets/icon.ico')
    : path.join(__dirname, '../assets/icon.png');

  // 如果图标文件不存在，创建一个简单的
  if (!fs.existsSync(iconPath)) {
    const iconDir = path.dirname(iconPath);
    if (!fs.existsSync(iconDir)) {
      fs.mkdirSync(iconDir, { recursive: true });
    }
    // 这里应该放置实际的图标文件
    console.log(`请在 ${iconPath} 放置应用图标`);
  }

  try {
    tray = new Tray(iconPath);
  } catch (error) {
    // 如果图标加载失败，使用系统默认图标
    tray = new Tray(path.join(__dirname, '../assets/default-icon.png'));
  }

  const menuIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '啪唧云菜单 PatchyCloud',
      icon: menuIcon,
      click: () => {
        shell.openExternal('https://github.com/titidatiti/PatchyCloud');
      }
    },
    {
      label: `版本号: ${app.getVersion()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '自定义设置',
      click: () => {
        createSettingsWindow();
      }
    },
    {
      label: '退出软件',
      click: () => {
        quitApp();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('PatchyCloud - 啪唧云菜单');
}

function quitApp() {
  // 1. 销毁所有窗口
  cleanupAnimations();
  BrowserWindow.getAllWindows().forEach(win => win.destroy())

  // 2. 清理系统托盘
  tray.destroy()

  // 3. macOS 额外处理
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  // 4. 强制退出
  process.nextTick(() => app.exit(0))
}

// 改进的鼠标追踪逻辑（配合动画使用）
let hideTimer = null;
let showTimer = null;
let mouseCheckTimer = null;

// 检查内容是否可见
function isContentVisible() {
  if (!toolbarView) return false;
  const bounds = toolbarView.getBounds();
  const targetDisplay = getTargetDisplay();
  const screenHeight = targetDisplay.bounds.height;

  // 只要由于 visible region 在屏幕内
  // bounds.y 是相对于窗口(即相对于屏幕)的顶部的距离
  // 如果 bounds.y < screenHeight，说明至少露出了一点
  return bounds.y < screenHeight;
}

function startMouseTracking() {
  if (isMouseTracking) return;

  isMouseTracking = true;

  const checkMouse = () => {
    if (!isMouseTracking) return;

    const mousePos = screen.getCursorScreenPoint();
    const targetDisplay = getTargetDisplay();
    const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = targetDisplay.bounds;
    const workArea = targetDisplay.workArea;

    // 检查鼠标是否在目标显示器上
    const mouseOnTargetDisplay = mousePos.x >= screenX &&
      mousePos.x < screenX + screenWidth &&
      mousePos.y >= screenY &&
      mousePos.y < screenY + screenHeight;

    // 计算相对鼠标位置（相对于目标显示器左上角）
    const relMouseX = mousePos.x - screenX;
    const relMouseY = mousePos.y - screenY;

    // --- 穿透逻辑处理 ---
    let shouldIgnoreMouse = true;
    if (mouseOnTargetDisplay && toolbarView) {
      const tbBounds = toolbarView.getBounds();
      let isInContent = (
        relMouseX >= tbBounds.x && relMouseX <= tbBounds.x + tbBounds.width &&
        relMouseY >= tbBounds.y && relMouseY <= tbBounds.y + tbBounds.height
      );

      if (!isInContent) {
        for (const v of contentViews) {
          const vBounds = v.getBounds();
          if (relMouseX >= vBounds.x && relMouseX <= vBounds.x + vBounds.width &&
            relMouseY >= vBounds.y && relMouseY <= vBounds.y + vBounds.height) {
            isInContent = true;
            break;
          }
        }
      }

      if (isInContent) {
        shouldIgnoreMouse = false;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        // 只有当状态改变时才调用，避免频繁 IPC
        // Electron 没有直接获取当前 ignore状态的API，所以直接设置，但可以优化频率
        // 实际上频繁设置开销不大，但为保险起见，每帧设置也可以
        // setIgnoreMouseEvents(ignore, options)
        // ignore: true 表示穿透
        mainWindow.setIgnoreMouseEvents(shouldIgnoreMouse, { forward: true });
      } catch (e) {
        // ignore
      }
    }
    // -------------------

    // 检查是否在触发区域（使用工作区域底部）
    const inTriggerZone = mouseOnTargetDisplay &&
      (workArea.y + screenHeight - mousePos.y) <= config.triggerDistance;

    const visible = isContentVisible();

    if (inTriggerZone && !isAnimating) {
      // 清除隐藏计时器
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      // 延迟显示，避免误触发
      if (!visible && !showTimer) {
        showTimer = setTimeout(() => {
          showMainWindow();
          showTimer = null;
        }, 100);
      }
    } else if (visible && !isAnimating) {
      // 清除显示计时器
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }

      // 检查鼠标是否离开了内容区域
      // 使用上面的 shouldIgnoreMouse 逻辑的反义：if shouldIgnoreMouse is true, then we are outside content
      const mouseOutsideContent = shouldIgnoreMouse;

      // 检查鼠标是否在任务栏区域（在屏幕内但不在工作区内）
      const isMouseInTaskbar = mouseOnTargetDisplay && !(
        mousePos.x >= workArea.x &&
        mousePos.x < workArea.x + workArea.width &&
        mousePos.y >= workArea.y &&
        mousePos.y < workArea.y + workArea.height
      );

      // 如果鼠标在内容区域外，且不在任务栏区域，才隐藏
      if (mouseOutsideContent && !isMouseInTaskbar) {
        // 延迟隐藏，给用户时间移回窗口
        if (!hideTimer && !isPinned) {
          hideTimer = setTimeout(() => {
            hideMainWindow();
            hideTimer = null;
          }, 300); // 增加一点延迟
        }
      } else {
        // 鼠标在内容内或在任务栏，清除隐藏计时器
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      }
    }
    mouseCheckTimer = setTimeout(checkMouse, 50); // 50ms 频率，保证穿透切换灵敏
  };

  checkMouse();
}

// 停止鼠标位置监控
function stopMouseTracking() {
  isMouseTracking = false;
}

// IPC事件处理
ipcMain.handle('get-config', () => {
  // Merge runtime 'openAtLogin' status
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
  return { ...config, openAtLogin };
});

// 新增：在主进程处理 open-external，使用 shell.openExternal 打开系统浏览器
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('openExternal error:', err);
    return false;
  }
});

ipcMain.handle('save-config', (event, newConfig) => {
  // Handle start on boot
  if (typeof newConfig.openAtLogin === 'boolean') {
    app.setLoginItemSettings({
      openAtLogin: newConfig.openAtLogin,
      path: app.getPath('exe') // Optional, but good practice
    });
    // Don't save this to config.json as it's a system setting, or do?
    // Usually good to keep config.json pure if we use file sync, 
    // but here we just return it in get-config.
    // We can strip it from config object before saving to file.
  }

  // Create clean config for file
  const configToSave = { ...newConfig };
  delete configToSave.openAtLogin;

  config = { ...config, ...configToSave };
  saveConfig();

  // Re-configure AdBlocker (async but no need to wait)
  setupAdBlocker().catch(err => console.error('Error reconfiguring adblocker:', err));

  // 重新加载主窗口
  if (mainWindow) {
    // 重新设置窗口大小
    const targetDisplay = getTargetDisplay();
    // 使用 bounds 确保全屏覆盖
    const { width: screenWidth, height: screenHeight } = targetDisplay.bounds;
    const { x: screenX, y: screenY } = targetDisplay.bounds;

    // 获取新的内容配置尺寸
    const { width: contentWidth, height: contentHeight, taskBarHeight } = getWindowConfigSize();

    // 全屏设置主窗口
    mainWindow.setBounds({ x: screenX, y: screenY, width: screenWidth, height: screenHeight });

    // Validate activePageIndex
    if (activePageIndex >= config.pages.length) {
      activePageIndex = 0;
    }

    // Clear cache because config (URLs) might have changed
    destroyAllCachedViews();

    // Recreate views to reflect new configuration (especially if URL count or display changed)
    CreateView();

    // 更新内容 View 大小和位置 (CreateView internally calls updateViewBounds with hiddenY, so we might need to force update if it should be visible)
    // Actually CreateView resets to hidden position. If we want to keep it visible if it was visible, we need extra logic.
    // For simplicity, let's just reset to hidden state or show it if it should be shown?
    // Users probably expect it to update in place.
    // But CreateView makes them hidden.
    // Let's force update.

    if (isContentVisible()) {
      const targetY = screenHeight - contentHeight - taskBarHeight;
      updateViewBounds(targetY);
    } else {
      // If it was hidden, CreateView already set it to hiddenY
    }

    console.log(`配置更新: 全屏窗口 ${screenWidth}x${screenHeight}, 内容区域 ${contentWidth}x${contentHeight}`);
  }

  return true;
});

ipcMain.handle('toolbar-switch-page', (event, index) => {
  if (index >= 0 && index < config.pages.length) {
    const wasVisible = isContentVisible();

    activePageIndex = index;

    // Recreate content views for the new page
    CreateView();

    // Update visibility
    const targetDisplay = getTargetDisplay();
    const screenHeight = targetDisplay.bounds.height;
    const { height: contentHeight, taskBarHeight } = getWindowConfigSize();

    // Force update if it was visible OR if we just clicked the toolbar (sanity check)
    // Since user clicked toolbar, it MUST have been visible. 
    // But relying on wasVisible is safer if CreateView messes up isContentVisible.
    if (wasVisible || true) {
      const targetY = screenHeight - contentHeight - taskBarHeight;
      updateViewBounds(targetY);
    } else {
      // Keep hidden
    }
    return true;
  }
  return false;
});

ipcMain.handle('toolbar-toggle-pin', () => {
  isPinned = !isPinned;
  return isPinned;
});

ipcMain.handle('toolbar-get-pin', () => {
  return isPinned;
});

ipcMain.handle('toolbar-open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('toolbar-refresh-page', () => {
  if (contentViews && contentViews.length > 0) {
    contentViews.forEach(view => {
      // Check if view and webContents exist to avoid errors
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.reload();
      }
    });
  }
});

ipcMain.handle('toolbar-quit', () => {
  quitApp();
});




async function setupAdBlocker() {
  if (config.enableNetworkAdBlock) {
    try {
      blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      blocker.enableBlockingInSession(session.defaultSession);
      console.log('Network AdBlocker enabled!');
    } catch (e) {
      console.error('Failed to enable AdBlocker:', e);
    }
  } else {
    // If we had a blocker, we might want to disable it, but the API 
    // doesn't have a simple disable mechanism other than not enabling it.
    // If toggling at runtime is needed, we need to keep track.
    // blocker.disableBlockingInSession(session.defaultSession);
    if (blocker) {
      blocker.disableBlockingInSession(session.defaultSession);
      console.log('AdBlocker disabled!');
    }
  }
}

// 应用事件
app.whenReady().then(async () => {
  loadConfig();

  // Setup AdBlocker
  await setupAdBlocker();

  if (!fs.existsSync(configPath)) {
    createSettingsWindow();
  }

  createMainWindow();
  createTray();
  startMouseTracking();
  forceAlwaysOnTop();
});

// 全局变量控制退出状态
let isQuitting = false;

app.on('window-all-closed', (event) => {
  // 如果不是正在退出（例如系统关机），则阻止默认退出行为
  // 这样可以保持应用在后台运行（如果需要的话，虽然当前逻辑主要依赖 mainWindow 的 hide）
  if (!isQuitting) {
    event.preventDefault();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopMouseTracking();
});