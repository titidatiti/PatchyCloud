# 浮动Web助手

一个基于Electron的跨平台桌面应用，提供隐藏式浮动Web浏览器功能。当鼠标移动到屏幕底部边缘时，应用会从屏幕外滑入显示指定网站内容，不使用时自动隐藏，不影响其他软件的正常使用。

## 功能特点

- 🖱️ **智能触发** - 鼠标靠近屏幕底部边缘时自动显示
- 🚀 **无边框设计** - 现代化的浮动窗口界面
- ⚙️ **灵活配置** - 自定义网站地址、窗口大小、触发范围
- 🔧 **系统托盘** - 便捷的设置和退出选项
- 🌐 **跨平台支持** - Windows和macOS兼容
- 💾 **自动保存** - 配置自动保存，重启后保持设置

## 安装和运行

### 开发环境运行

1. **克隆项目**
```bash
git clone <项目地址>
cd floating-web-app
```

2. **安装依赖**
```bash
npm install
```

3. **运行应用**
```bash
npm start
```

### 构建可执行文件

**构建Windows版本:**
```bash
npm run build-win
```

**构建macOS版本:**
```bash
npm run build-mac
```

**构建所有平台:**
```bash
npm run build
```

构建完成后，可执行文件将保存在`dist`目录中。

## 使用说明

### 首次运行

1. 运行应用后会自动弹出设置窗口
2. 配置以下选项：
   - **默认网站地址**: 设置要显示的网站（默认：https://weibo.com/titidatiti）
   - **窗口大小**: 以百分比设置宽度和高度（默认：50% x 50%）
   - **触发范围**: 鼠标距离底部多少像素时触发显示（默认：10px）
3. 点击"保存设置"完成配置

### 日常使用

- **显示应用**: 将鼠标移动到屏幕底部边缘
- **隐藏应用**: 鼠标移出应用窗口区域，应用自动隐藏
- **打开设置**: 右键点击系统托盘图标，选择"设置"
- **退出应用**: 右键点击系统托盘图标，选择"退出"

### 系统托盘

应用运行时会在系统托盘显示图标，提供：
- **设置** - 重新打开设置窗口修改配置
- **退出** - 完全退出应用

## 项目结构

```
floating-web-app/
├── src/
│   ├── main.js          # Electron主进程
│   ├── preload.js       # 预加载脚本
│   └── settings.html    # 设置界面
├── assets/
│   ├── icon.ico         # Windows图标
│   ├── icon.icns        # macOS图标
│   └── icon.png         # 通用图标
├── package.json         # 项目配置
└── README.md           # 说明文档
```

## 配置文件

应用配置自动保存在用户数据目录：
- **Windows**: `%APPDATA%/floating-web-app/config.json`
- **macOS**: `~/Library/Application Support/floating-web-app/config.json`

配置格式：
```json
{
  "url": "https://weibo.com/titidatiti",
  "width": 50,
  "height": 50,
  "triggerDistance": 10
}
```

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Node.js** - 后端运行时
- **HTML/CSS/JavaScript** - 前端界面
- **Electron Builder** - 应用打包工具

## 系统要求

- **Windows**: Windows 10或更高版本
- **macOS**: macOS 10.14或更高版本
- **内存**: 最少512MB可用内存
- **硬盘**: 100MB可用空间

## 开发说明

### 关键特性实现

1. **鼠标位置监测**: 使用`screen.getCursorScreenPoint()`持续监测鼠标位置
2. **无边框窗口**: 设置`frame: false`和`transparent: true`
3. **窗口动画**: 通过改变窗口位置实现滑入滑出效果
4. **系统托盘**: 使用`Tray`类创建托盘图标和菜单
5. **配置持久化**: 使用JSON文件保存用户配置

### 主要模块

- `createMainWindow()`: 创建主浮动窗口
- `createSettingsWindow()`: 创建设置窗口
- `createTray()`: 创建系统托盘
- `startMouseTracking()`: 开始鼠标位置监控
- `showMainWindow()`/`hideMainWindow()`: 窗口显示/隐藏动画

## 自定义图标

将你的图标文件放置在`assets`目录：
- `icon.ico` - Windows图标（建议256x256）
- `icon.icns` - macOS图标
- `icon.png` - 通用PNG图标

## 故障排除

### 常见问题

**Q: 应用无法显示网站内容**
A: 检查网站地址是否正确和网络连接。某些网站可能不允许在iframe中显示。

**Q: 鼠标触发不灵敏**
A: 在设置中调整触发范围，增大数值可提高触发灵敏度。

**Q: 应用无法启动**
A: 确保已正确安装所有依赖