const { app, BrowserWindow, BrowserView ,Tray, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let view;
let settingsWindow;
let tray;
let config = {};
let isMouseTracking = false;

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
  url: 'https://weibo.com/titidatiti',
  width: 50, // 百分比
  height: 50, // 百分比
  triggerDistance: 10, // 像素
  displayId: 'primary' // 显示器ID，'primary'表示主显示器
};

// 配置文件路径
const configPath = path.join(app.getPath('userData'), 'config.json');

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      config = { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
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

function CreateView(){
  const targetDisplay = getTargetDisplay();
  const { width: screenWidth, height: screenHeight } = targetDisplay.workAreaSize;
  
  const {width:windowWidth, height:windowHeight} = getWindowConfigSize();
  // 使用BrowserView加载第三方页面，避免页面影响到mainWindow的尺寸
  view = new BrowserView({
    webPreferences: {
      transparent: true,
      preload: path.join(__dirname, 'preload.js'), // 预加载脚本
      contextIsolation: false
    }
  })
  
  mainWindow.setBrowserView(view)
  view.setBounds({ 
    x: 0,  // 左侧透明留空
    y: 0,  // 顶部透明留空
    width: windowWidth, 
    height: windowHeight 
  })
  
  // 加载第三方页面
  view.webContents.loadURL(config.url)
}

// 创建主窗口
function createMainWindow() {
  const targetDisplay = getTargetDisplay();
  const { width: screenWidth, height: screenHeight } = targetDisplay.workAreaSize;
  const { x: screenX /*unused*/, y: screenY /*unused*/ } = targetDisplay.bounds;
  const workArea = targetDisplay.workArea;
  const { width:windowWidth, height:windowHeight} = getWindowConfigSize();
  
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: true,
    // 使用 workArea 保证不覆盖任务栏
    x: workArea.x + Math.floor((workArea.width - windowWidth) / 2),
    // 初始位置放到屏幕外（使用 bounds 以便完全移出屏幕）
    y: targetDisplay.bounds.y + targetDisplay.bounds.height + hiddenOffset,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 保证始终在上层（使用 floating，不使用 screen-saver）
  mainWindow.setAlwaysOnTop(true, 'floating');

  CreateView();

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  mainWindow.on('blur', () => {
    hideMainWindow();
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    hideMainWindow();
  });
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
  const workArea = targetDisplay.workArea;
  const bounds = targetDisplay.bounds;
  const {width:windowWidth, height:windowHeight} = getWindowConfigSize();
  
  // 使用 workArea 计算显示位置，避免覆盖任务栏
  const centerX = workArea.x + Math.floor((workArea.width - windowWidth) / 2);
  const targetY = workArea.y + workArea.height - windowHeight; // 在工作区底部显示（不遮挡任务栏）
  const hiddenY = bounds.y + bounds.height + hiddenOffset; // 隐藏位置（屏幕外）
  
  if (!mainWindow.isVisible()) {
    mainWindow.setPosition(centerX, hiddenY);
    mainWindow.show();
  }
  // 再次确保置顶（防止被其他窗口覆盖）
  mainWindow.setAlwaysOnTop(true, 'floating');
  
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.y == targetY) {
    return;
  }
  
  const startY = currentBounds.y;
  
  isAnimating = true;
  const startTime = Date.now();
  const distance = startY - targetY;
  
  showAnimation = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / ANIMATION_CONFIG.duration, 1);
    const easing = easingFunctions[ANIMATION_CONFIG.easing] || easingFunctions.easeOutCubic;
    const easedProgress = easing(progress);
    const currentY = Math.round(startY - distance * easedProgress);
    mainWindow.setPosition(centerX, currentY);
    if (progress >= 1) {
      clearInterval(showAnimation);
      showAnimation = null;
      isAnimating = false;
      mainWindow.setPosition(centerX, targetY);
      mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }, 1000 / ANIMATION_CONFIG.fps);
}

// 隐藏主窗口（带动画）- 移动到屏幕外而不是hide
function hideMainWindow() {
  if (!mainWindow || isAnimating) return;
  
  const targetDisplay = getTargetDisplay();
  const bounds = targetDisplay.bounds;
  const hiddenY = bounds.y + bounds.height + hiddenOffset;
  const currentBounds = mainWindow.getBounds();
  
  if (currentBounds.y == hiddenY) {
    return;
  }
  
  if (showAnimation) {
    clearInterval(showAnimation);
    showAnimation = null;
  }
  
  const startY = currentBounds.y;
  const targetY = hiddenY;
  
  isAnimating = true;
  const startTime = Date.now();
  const distance = targetY - startY;
  
  hideAnimation = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / ANIMATION_CONFIG.duration, 1);
    const easing = easingFunctions.easeInOutCubic;
    const easedProgress = easing(progress);
    const currentY = Math.round(startY + distance * easedProgress);
    mainWindow.setPosition(currentBounds.x, currentY);
    if (progress >= 1) {
      clearInterval(hideAnimation);
      hideAnimation = null;
      isAnimating = false;
      const {width:windowWidth, height:windowHeight} = getWindowConfigSize();
      mainWindow.setBounds(currentBounds.x, targetY, windowWidth, windowHeight);
      // 隐藏在屏幕外仍然置顶（不影响任务栏）
      mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }, 1000 / ANIMATION_CONFIG.fps);
}

// 立即显示窗口（无动画，用于调试或特殊情况）
function showMainWindowInstant() {
  if (!mainWindow) return;
  if (showAnimation) {
    clearInterval(showAnimation);
    showAnimation = null;
  }
  if (hideAnimation) {
    clearInterval(hideAnimation);
    hideAnimation = null;
  }
  isAnimating = false;
  
  const targetDisplay = getTargetDisplay();
  const workArea = targetDisplay.workArea;
  const {width:windowWidth, height:windowHeight} = getWindowConfigSize();
  mainWindow.setPosition(
    workArea.x + Math.floor((workArea.width - mainWindow.getBounds().width) / 2),
    workArea.y + workArea.height - windowHeight
  );
  
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.setAlwaysOnTop(true, 'floating');
}

function getWindowConfigSize(){
  const targetDisplay = getTargetDisplay();
  const { width: screenWidth, height: screenHeight } = targetDisplay.workAreaSize;
  const windowHeight = Math.floor(screenHeight * config.height / 100);
  const windowWidth = Math.floor(screenWidth * config.width / 100);
  return {
    width: windowWidth,
    height: windowHeight
  };
}

// 立即隐藏窗口（无动画）- 移动到屏幕外
function hideMainWindowInstant() {
  if (!mainWindow) return;
  if (showAnimation) {
    clearInterval(showAnimation);
    showAnimation = null;
  }
  if (hideAnimation) {
    clearInterval(hideAnimation);
    hideAnimation = null;
  }
  isAnimating = false;
  
  const targetDisplay = getTargetDisplay();
  const { y: screenY, height: screenHeight } = targetDisplay.bounds;
  const currentBounds = mainWindow.getBounds();
  
  mainWindow.setPosition(currentBounds.x, screenY + screenHeight);
  mainWindow.setAlwaysOnTop(true, 'floating');
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
  isAnimating = false;
}

// 创建设置窗口
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
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

  const contextMenu = Menu.buildFromTemplate([
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

// 检查窗口是否在可见区域
function isWindowVisible() {
  if (!mainWindow) return false;
  
  const targetDisplay = getTargetDisplay();
  const { y: screenY, height: screenHeight } = targetDisplay.bounds;
  const windowBounds = mainWindow.getBounds();
  
  // 如果窗口底部在屏幕底部以上，认为是可见的
  return windowBounds.y < screenY + screenHeight;
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
    
    // 检查是否在触发区域（使用工作区域底部）
    const inTriggerZone = mouseOnTargetDisplay && 
                         (workArea.y + screenHeight - mousePos.y) <= config.triggerDistance;
    
    if (inTriggerZone && !isAnimating) {
      // 清除隐藏计时器
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      
      // 延迟显示，避免误触发
      if (!isWindowVisible() && !showTimer) {
        showTimer = setTimeout(() => {
          showMainWindow();
          showTimer = null;
        }, 100); // 减少延迟，因为动画本身有过渡效果
      }
    } else if (isWindowVisible() && !isAnimating) {
      // 清除显示计时器
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      
      // 检查鼠标是否离开了窗口区域
      const windowBounds = mainWindow.getBounds();
      const buffer = 20; // 缓冲区域
      const mouseOutsideWindow = mousePos.x < windowBounds.x - buffer || 
                                mousePos.x > windowBounds.x + windowBounds.width + buffer ||
                                mousePos.y < windowBounds.y - buffer || 
                                mousePos.y > windowBounds.y + windowBounds.height + buffer;

      if (mouseOutsideWindow) {
        // 延迟隐藏，给用户时间移回窗口
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideMainWindow();
            hideTimer = null;
          }, 200); // 稍微增加延迟，配合动画效果
        }
      }
    }
    mouseCheckTimer = setTimeout(checkMouse, 100); // 提高检测频率以获得更流畅的体验
  };
  
  checkMouse();
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
  if (mouseCheckTimer){
    clearTimeout(mouseCheckTimer);
    mouseCheckTimer = null;
  }
  isAnimating = false;
}

// 停止鼠标位置监控
function stopMouseTracking() {
  isMouseTracking = false;
}

// IPC事件处理
ipcMain.handle('get-config', () => config);

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  
  // 重新加载主窗口
  if (mainWindow) {
    // 重新设置窗口大小
    const targetDisplay = getTargetDisplay();
    const { width: screenWidth, height: screenHeight } = targetDisplay.workAreaSize;
    const { x: screenX, y: screenY } = targetDisplay.bounds;
    const {width:windowWidth, height:windowHeight} = getWindowConfigSize();
    
    // 计算位置
    const centerX = screenX + Math.floor((screenWidth - windowWidth) / 2);
    const targetY = screenY + screenHeight - windowHeight; // 目标位置（显示状态）
    const hiddenY = screenY + screenHeight + hiddenOffset; // 隐藏位置

    mainWindow.setBounds(centerX, hiddenY, windowWidth, windowHeight);
    CreateView();
    console.log(`窗口大小已更新: ${windowWidth}x${windowHeight}`);
  }
  
  return true;
});

// 应用事件
app.whenReady().then(() => {
  loadConfig();
  
  if (!fs.existsSync(configPath)) {
    createSettingsWindow();
  }
  
  createMainWindow();
  createTray();
  startMouseTracking();

  // 额外保护：当系统上其他窗口创建或获得焦点时，重新申明置顶，防止被覆盖
  app.on('browser-window-created', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(true, 'floating');
  });
  app.on('browser-window-focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(true, 'floating');
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault(); // 阻止应用退出
});

app.on('before-quit', () => {
  stopMouseTracking();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});