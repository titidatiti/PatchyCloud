# PatchyCloud - 啪唧云菜单
![PatchyCloud - 啪唧云菜单](./assets/icon.png)
一个基于Electron的跨平台桌面应用，提供隐藏式浮动Web浏览器功能。当鼠标移动到屏幕底部边缘时，应用会从屏幕外滑入显示指定网站内容，不使用时自动隐藏，不影响其他软件的正常使用。

推荐用于配合开源项目MacroDeck使用，从而获得一个快捷面板：
https://github.com/Macro-Deck-App/Macro-Deck

也可以自己创建一个本地的HTML，通过多个iframe组合你喜欢的工具，然后引用你的本地地址。

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
git clone https://github.com/titidatiti/PatchyCloud.git
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
   - **默认网站地址**: 设置要显示的网站（默认：https://github.com/titidatiti/PatchyCloud）
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

## 配置文件

应用配置自动保存在用户数据目录：
- **Windows**: `%APPDATA%/PatchyCloud/config.json`
- **macOS**: `~/Library/Application Support/PatchyCloud/config.json`

配置格式：
```json
{
  "url": "你想要设定的网址",
  "width": 50,
  "height": 50,
  "triggerDistance": 10,
  "displayId": "显示器ID"
}
```
## 故障排除

### 常见问题

**Q: 应用无法显示网站内容**
A: 检查网站地址是否正确和网络连接。某些网站可能不允许在iframe中显示。

**Q: 展开啪唧云窗口后，窗口下的其他软件窗口会遮住开始菜单**
A: 这是Windows平台下自带的BUG，当有置顶应用出现时，开始菜单会自动降级，导致层级低于其他普通窗口，目前暂无解决方法。