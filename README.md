# 泉游记

泉游记是一个面向移动端的济南 72 名泉导览 H5。产品以“先选路线、现场看泉、边走边记”为核心体验，提供经典路线、72 名泉图鉴、手绘地图、VR 实景入口、拍照引导和“游泉哇”AI 旅游搭子。

当前版本：`p2v-visual-system-refresh-20260628`

## 功能概览

- 推荐路线：以经典路线为主入口，适合第一次到济南看泉的用户直接跟着走。
- 智能组线：根据时间、出发地、同行人和兴趣生成今日路线。
- 72 名泉图鉴：支持搜索、片区、等级、场景和状态筛选。
- 手绘地图：鸟瞰 72 名泉分布，支持片区展开和泉点详情跳转。
- 泉点详情：包含现场看泉卡、值不值得去、现场导览、图集、VR 实景和附近下一站。
- 拍照引导：提供样张、九宫格、构图提示和拍摄任务。
- 游泉哇：悬浮式 AI 旅游搭子，提供路线、现场、地图、拍照相关问答。

## 目录结构

```text
quanyouji-h5-final/
  index.html          # H5 入口
  app.js              # 页面、路由和交互逻辑
  styles.css          # UI 样式
  data.js             # 72 名泉与路线数据
  image-assets.js     # 本地图片资源映射
  assets/             # 泉点图片、游泉哇形象等素材
  favicon.svg
  favicon.ico
  start.ps1           # Windows 本地启动脚本
  package.json        # 可选 npm 启动脚本
  .gitignore
```

## 本地运行

本项目是纯静态 H5，不需要后端服务。

### 方式一：Windows 启动脚本

在项目目录中执行：

```powershell
.\start.ps1
```

如果 PowerShell 阻止脚本执行，可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

启动后打开：

```text
http://127.0.0.1:4188/?v=p2v-visual-system-refresh-20260628#/routes
```

### 方式二：Python 静态服务

在项目目录中执行：

```powershell
python -m http.server 4188
```

然后打开：

```text
http://127.0.0.1:4188/?v=p2v-visual-system-refresh-20260628#/routes
```

### 方式三：npm 脚本

如果本机安装了 Node.js 和 Python，可以执行：

```powershell
npm start
```

## 上传 GitHub

在项目目录中执行：

```powershell
git init
git add .
git commit -m "Initial release of Quanyouji H5"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

## GitHub Pages 部署

本项目使用 hash 路由，例如：

```text
#/routes
#/springs
#/map
```

因此适合部署到 GitHub Pages 这类静态托管服务。上传后可在仓库 `Settings -> Pages` 中选择 `main` 分支作为发布来源。

## 素材说明

项目包含泉点真实图片和游泉哇形象素材。公开发布前建议确认图片和素材的授权情况；如授权尚未完全确认，建议先使用私有仓库，或替换为自有/授权素材后再公开。

## 开发说明

这是一个无构建步骤的静态 H5：

- 修改页面逻辑：编辑 `app.js`
- 修改样式：编辑 `styles.css`
- 修改泉点和路线数据：编辑 `data.js`
- 修改图片映射：编辑 `image-assets.js`
- 替换图片素材：更新 `assets/` 下文件，并同步调整图片映射

