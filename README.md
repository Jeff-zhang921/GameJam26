# Moonclock

Moonclock 是使用 Bun、Canvas 和原生 WebSocket 的时间协作解谜游戏。在线模式每个房间支持两人，本版本预期同时运行两个房间、共四名玩家。房间保存在单个服务进程内，无需数据库。

## 本地运行

安装 [Bun 1.3.11](https://bun.sh/docs/installation)，在包含 `package.json`、`server.js` 和 `Dockerfile` 的仓库根目录运行：

```powershell
bun run dev
```

打开 `http://127.0.0.1:4173`。当前项目没有第三方包依赖。开发模式直接提供源码，不注册 Service Worker。

让同一局域网的设备访问时，先设置监听地址，再运行：

```powershell
$env:HOST = "0.0.0.0"
bun run dev
```

手机使用电脑的局域网 IP 和端口 `4173`，电脑防火墙需允许该端口。普通局域网 HTTP 可以测试联机，但不能验证 PWA 安装和 Service Worker，后两者需要 HTTPS 或 localhost。

## 构建并运行生产服务

```powershell
bun run build
bun run start:production
```

构建输出为 `dist/`。生产服务默认监听 `0.0.0.0:4173`，同时提供静态页面和 `/ws` WebSocket。生产模式不暴露 `src/`。要更换本地端口：

```powershell
$env:PORT = "4180"
bun run start:production
```

访问 `/health` 可检查进程是否就绪。客户端根据当前页面地址选择 `ws://` 或 `wss://`，生产环境无需修改客户端地址。

使用 Docker 验证同一个生产入口：

```powershell
docker build -t moonclock:local .
docker run --rm -p 4181:8080 -e PORT=8080 -e PUBLIC_ORIGIN=http://localhost:4181 moonclock:local
```

打开 `http://localhost:4181`。镜像使用 Bun 1.3.11、以非 root 用户运行，只包含运行所需的服务端代码、包信息和构建产物。

当前依赖安装通过 `scripts/check-dependencies.js` 检查 `package.json` 与 `package-lock.json` 均为零依赖。Bun 会删除空锁文件，因此镜像不使用空的 Bun 锁文件。以后添加依赖时，需同步更新此检查、提交有效的 Bun 锁文件并改为冻结锁文件安装。

## 两人在线游戏

1. 两名玩家打开同一服务地址，使用独立的浏览器会话或设备。
2. 主机点击 **Create Room**，复制六位房间码。另一名玩家点击 **Join Room** 并输入房间码。
3. 分别选择 Stillkeeper 和 Bloomkeeper，双方点击 **Ready**。
4. 主机点击 **Start Game**，等待服务器控制的共享倒计时。
5. 使用 `A / D` 或方向键移动、`Space` 跳跃、`E` 交互、`F` 使用技能。在线模式每人只能控制自己的角色，不能用 `Tab` 换人。回溯功能已移除，需要重来时使用暂停菜单中的 **Restart Level**。

Still 保留冻结与释放，Bloom 保留唤醒、逐次加速至 3×，以及释放冻结物体。关卡、角色素材和技能规则保持原样。

`Esc` 或右上角暂停按钮打开暂停菜单：**Resume**、**Restart Level**、**Leave Room / Main Menu**，以及提示（Courtyard Whisper）、操作说明、设置和声音。单人和同机双人模式下暂停会停住本地模拟。在线模式下暂停菜单只覆盖自己的屏幕，共享世界继续运行，打开菜单时会松开所有按住的输入。在线重置关卡只有主机可以操作，需要二次确认，并由服务器同时重置两边。离开房间后，另一名玩家会回到等待大厅。原有单人及同机双人入口继续保留。

触屏设备（包括 iPadOS 桌面模式的 Safari 和已安装的 PWA）使用专门的触控布局：
- 左下角是半透明虚拟摇杆，左右推动移动，向左上或右上推动时移动并跳跃，正上方只跳跃。进入跳跃区只触发一次，按住保持满跳，回到阈值以下才能再次跳。死区、角度和力度阈值在 `public/joystick.js` 中配置。
- 时间能力不再用按钮：直接点击场景里的箱子、花、移动平台或生物，就会对它使用当前角色的能力（Still 冻结/释放，Bloom 唤醒/加速，没有冷却）。点击会作为带目标的 Ability 动作发送，在线时仍由服务器判断是否生效。
- 能力作用距离为 300 个世界单位（原为 420，键盘和联机也一样）。当前角色够得着的对象会显示角标，最近的一个标注 “Tap · Freeze” 等提示。点得太远时会显示虚线范围圈并提示走近；点了当前角色不能作用的对象（例如 Bloom 点未冻结的箱子）会说明原因；点空白处没有反应。
- 右下角是正常大小的圆形交互按钮，按当前状态显示 **Pick Up / Throw / Plant / Drop**；单人模式在它上方显示一个小的切换角色按钮。
- 桌面端不开启触控布局时，鼠标点击场景不会触发能力，仍然使用 `F` / `L` 键。
- 摇杆和各按钮分别跟踪自己的手指，可以一边移动一边放技能或搬箱子。手指被系统打断、切到后台或窗口失焦时，所有输入都会松开。
- 游戏区域禁止长按选字、系统菜单、图片拖拽、双击缩放和双指缩放。房间码输入、复制等对话框不受影响。
- 顶栏和右侧提示面板在触屏布局中隐藏。关卡目标保留在左上角，状态显示在顶部中间的小胶囊里，提示移到了暂停菜单中。

设置中的 **Show touch controls** 可以在其他设备上手动开启触控布局。推荐横屏；竖屏仍可操作，并提示旋转设备。画布缩放不改变游戏坐标或碰撞规则。

## 安装 PWA

先通过公开 HTTPS 地址访问游戏：

- Android：在支持 PWA 的 Chrome 等浏览器中，使用游戏内安装按钮或浏览器菜单中的安装应用选项。
- iPhone：使用 Safari 打开页面，点击分享，再选择 **添加到主屏幕**。游戏会在适用时显示操作提示。
- 桌面：Chrome 或 Edge 可使用地址栏安装入口或游戏内安装按钮。

支持的系统会以独立窗口打开安装后的游戏，并从主菜单开始。普通浏览器仍可直接游玩，无需注册或安装。

Service Worker 缓存页面、版本化脚本和样式、图标以及游戏静态资源。导航优先获取新页面，断网时使用已缓存版本。房间请求、健康检查、WebSocket 和实时游戏状态不进入缓存。离线时会显示提示，不能创建或加入在线房间；本版本不提供离线多人游戏。

发现新版本后，界面提供更新按钮。正在进行游戏或处于在线房间时不能激活更新。即使从另一个空闲标签页更新，也会检查所有已打开的 Moonclock 标签页。所有页面空闲后，点击更新才会切换版本并刷新页面。不要在更新时保留需要继续进行的本地游戏。

## 断线与后台恢复

页面进入后台会释放移动输入。重新打开时会检查连接，并使用当前标签页 `sessionStorage` 中的私有凭据恢复原角色和服务器状态，房间码本身不能用于冒充原玩家。

断线期间共享模拟暂停，现有重连宽限期为 30 秒。超时或服务器重启后会显示错误，并允许返回菜单。手机系统可能暂停或关闭后台 WebSocket，不能保证锁屏期间保持连接。不要清除当前标签页数据后再尝试恢复身份。

## 部署到 Railway

本仓库已包含 `Dockerfile`、`.dockerignore` 和 `railway.json`，尚未部署。部署时使用一个 Railway Service：

1. 从 GitHub 仓库 `Jeff-zhang921/GameJam26` 创建服务。
2. 将 **Root Directory 设置为 `/`**。当前 Git 仓库根目录直接包含 `Dockerfile`、`package.json` 和 `server.js`，不要填写本机路径 `moonclock/app`。
3. 使用仓库里的 Dockerfile 构建。保留镜像的启动命令 `bun server.js`，无需 Vite Preview 或单独的前端服务。
4. 只启用 **1 个副本、1 个区域**，关闭按请求唤醒的休眠功能，不要横向扩容。
5. 为该服务生成一个公开 HTTPS 域名。将 `PUBLIC_ORIGIN` 设置为完整来源，例如 `https://moonclock-production.up.railway.app`，不要包含路径或末尾斜线。
6. 保留 Railway 注入的 `PORT`。`/health` 是健康检查路径，超时为 60 秒，重启策略为失败时重试、最多 10 次。后两项已写入 `railway.json`。
7. 部署后按下方检查步骤验证 HTTP、WSS 和双房间联机。

运行环境变量：

| 变量 | 生产设置 |
| --- | --- |
| `PORT` | Railway 自动提供，服务读取此端口 |
| `HOST` | `0.0.0.0`，Docker 镜像已设置 |
| `NODE_ENV` | `production`，Docker 镜像已设置 |
| `PUBLIC_ORIGIN` | 设置为该服务的实际公开 HTTPS 来源，用于校验 WebSocket Origin |

前端与 `/ws` 使用同一 HTTPS 域名，无需另配 CORS。不要添加数据库、Redis、第二个后端或单独静态托管。房间使用内存，一个副本是必要条件。

Railway 配置说明见 [Dockerfile 构建](https://docs.railway.com/guides/dockerfiles)、[配置文件](https://docs.railway.com/reference/config-as-code) 和 [健康检查](https://docs.railway.com/guides/healthchecks)。

## 部署检查与回滚

1. 访问 `https://你的域名/health`，确认 HTTP 200。
2. 打开主菜单，确认脚本、角色、声音、清单和图标正常加载，浏览器控制台没有资源错误。
3. 在网络面板确认连接地址为当前域名的 `wss://.../ws`。
4. 使用两个独立设备或会话完成建房、选人、准备、开始、移动、跳跃和技能交接。
5. 再创建第二个房间，用四个独立客户端同时游玩，确认两房间状态互不影响。
6. 测试断网后 30 秒内恢复、返回前台、离开房间，以及 Android 与 iPhone 的安装和横竖屏操作。
7. 有旧版本缓存时，在一页进行游戏、另一页尝试更新，确认不会中断游戏；所有页面退出游戏后再更新。

需要回滚时，在 Railway 的 Deployments 中选择先前成功的部署并使用 Rollback，或重新部署已确认正常的旧 Git 提交。更新和回滚前先结束正在进行的房间：服务进程替换会清空内存房间，Service Worker 的更新保护无法保留重启后的服务器状态。

等待大厅默认 30 分钟过期。服务器重启、重新部署和回滚都会清空房间，不支持跨进程房间或永久恢复。本版本按四名玩家、两个房间进行验证，不代表更高并发容量保证。

## 运行检查

```powershell
bun test
bun run build
```

自动化覆盖现有玩法、房间权限与隔离、真实 WebSocket 同步、重连身份、生产静态服务与 Origin 校验、限流，以及 PWA 缓存和更新策略。

`tests/online.playtest.js` 和 `tests/pwa.playtest.js` 是供 Playwright 浏览器驱动执行的函数，不是 Bun 单元测试。后者默认测试 `http://127.0.0.1:4180`，创建四个独立会话，检查双房间、移动加跳跃、技能交接、离线重连和静态缓存。它保留测试页面，便于继续验证跨标签页更新；完成后关闭这些页面。截图保存在忽略的 `.audit/` 目录。

浏览器模拟不能替代实体手机测试。正式开放前仍需在 Android Chrome 和 iPhone Safari 上完成安装、独立窗口、触控、刘海安全区和锁屏恢复测试，并通过公开 HTTPS 域名验证跨网络 WSS。

图标由 `scripts/generate-icons.py` 在本地生成，没有调用付费素材服务。需要重新生成时运行 `python scripts/generate-icons.py`，然后重新构建。

## PWA 与部署相关文件

- 前端接入：`public/index.html`、`public/client.js`、`public/network.js`、`public/strings.js`、`public/mobile.css`。
- PWA：`public/manifest.webmanifest`、`public/sw.js`、`public/pwa.js`、`public/offline.html`，以及 `public/icons/` 中的 192、512、maskable 和 Apple Touch PNG 图标。
- 生产服务：`server.js`、`src/rooms.js`、`package.json`、`scripts/build.js`、`scripts/start-production.js`、`scripts/check-dependencies.js`。
- 图标工具：`scripts/generate-icons.py`。
- 部署：`Dockerfile`、`.dockerignore`、`railway.json`。
- 检查：`tests/network.test.js`、`tests/production.test.js`、`tests/pwa.test.js`、`tests/pwa.playtest.js`。
