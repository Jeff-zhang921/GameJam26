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
5. 使用 `A / D` 或方向键移动、`Space` 跳跃、`E` 交互、`F` 使用技能。在线模式每人只能控制自己的角色，不能用 `Tab` 换人。Still 也可以直接用鼠标点击场景放置 Freeze Area。需要重来时使用暂停菜单中的 **Restart Level**（会触发 4 秒时间倒流，见下文）。

### Freeze Area（Still）

Still 不再选中单个物体，而是点击 / 触摸场景中的任意位置，以该点为中心生成圆形 **Freeze Area**：

- 半径 **130** 世界单位；施放距离 **380**（从 Still 身体中心算起，即脚下上方 30 处），场景外的点无效。超出距离会显示虚线范围圈并提示，不扣次数。
- 区域内除两名玩家以外的所有对象（箱子、种子、蘑菇、移动平台、生物、飞镖、光球等）的本地时间变为 **0.2×**（`src/enemies.js` 的 `FROZEN_RATE`，`meta.freeze.rate`），生物的攻击节奏也一起变慢。对象进入区域开始减速，离开或区域消失后恢复正常。玩家的移动、跳跃和重力不受影响。
- 区域持续 **600 tick（10 秒）**，有淡出提示；范围内的对象显示霜冻减速效果。参数都在 `src/logic.js` 的 `meta.freeze` 中。
- Still 再次点击或轻触圆圈可提前取消，次数不变。区域重叠时只取消最上层的一圈，仍被其他区域覆盖的物体继续减速。联机时由服务器验证施法者并同步取消。
- 键盘 `F` 以 Still 范围内最近的对象为中心施放，附近没有对象时放在 Still 面前；鼠标指向场景时显示预览圈。
- Bloom 的唤醒和逐次加速至 3× 保持不变（不再有“释放冻结物体”这一操作）。

### Freeze 次数（Charges）

每关初始次数在 `src/levels/*.js` 的 `freezeCharges` 中配置，额外的霜晶（`freezePickups`）被任一玩家碰到即 +1，只能拾取一次：

| 关卡 | 初始次数 | 霜晶 |
| --- | --- | --- |
| 1 A Moment Held | 2 | 1 |
| 2 Rising Rings | 1 | 0 |
| 3 Past the Prime | 1 | 1 |
| 4 Walking with Time | 2 | 1 |
| 5 The Trial Garden | 2 | 2 |

每次成功施放消耗 1 次，HUD 显示 `Freeze × N`；为 0 时禁止施放并提示去找霜晶。重新开始或切换关卡会恢复初始次数和全部霜晶。在线模式下次数、区域和霜晶状态都由服务器管理并同步。

`Esc` 或右上角暂停按钮打开暂停菜单：**Resume**、**Restart Level**、**Leave Room / Main Menu**，以及提示（Courtyard Whisper）、操作说明、设置和声音。单人和同机双人模式下暂停会停住本地模拟。在线模式下暂停菜单只覆盖自己的屏幕，共享世界继续运行，打开菜单时会松开所有按住的输入。在线重置关卡只有主机可以操作，需要二次确认，并由服务器同时重置两边。离开房间后，另一名玩家会回到等待大厅。原有单人及同机双人入口继续保留。

暂停菜单里可以选择关卡。单人和同机模式立即切换；在线模式只有主机能选，确认后由服务器让两人同时进入同一关。

过关条件是 **Still 和 Bloom 两人都到达月门**。只有一人到达时，月门上方显示 “Waiting for Still / Bloom”，并弹出提示等待另一人。在线模式由服务器检查两人的位置。

### 失败提示（可关闭）

失败检测（`src/logic.js` 的 `assessFailure`）只使用各关明确的规则，不按时间或静止判断。箱子和掉落的种子总会回到原位，所以只有两种资源会真正耗尽：

- `exitNeedsPlant`（第 2、3 关）：出口高台只能借助蘑菇上去。场上已没有任何种子或蘑菇、且仍有人在高台下方时，提示 `stranded`。
- `crossingNeedsFreeze`（第 1、4 关）：过裂谷必须用 Freeze。只有当次数为 0、没有未拾取的霜晶、也没有仍在生效的 Freeze Area，且仍有人没过去时，才提示 `freeze`。单纯次数为 0 不会提示。
- 有人在空中时结果视为“未知”，不提示。

判断为可能无法完成时，不结束游戏也不自动重开，而是弹出可关闭的提示（文案在 `public/strings.js` 的 `warningTitle`），提供 **Restart · Rewind Time** 和 × / **Keep Trying**。关闭后游戏状态不变；同一原因只提示一次（`failureSeq`），失败条件恢复后清除，出现新原因才再次提示。在线模式由服务器判断，两边收到相同提示、各自关闭；只有主机能从提示里重新开始。

### Restart Level：4 秒时间倒流

暂停菜单的 **Restart Level** 和失败提示里的重新开始都会触发 4 秒倒流，而不是直接跳回开头：

- 客户端用 `public/rewind.js` 记录本关历史：每隔 `stride` tick 存一帧精简画面（玩家、物体、Freeze Area、霜晶、坑、碎片、月灯）。缓冲区达到 **180 帧** 时隔帧丢弃并把间隔翻倍，所以无论玩多久，历史都覆盖从第 0 tick 到当前，内存上限为 180 帧（第 5 关连续玩约 8 分钟的测试中，序列化后的历史始终小于 1 MB）。服务器不保存历史。
- 倒流按缓入缓出的进度在固定 4 秒内从当前帧回放到第一帧，相邻帧之间插值，并加入冷色画面、倒转的时钟指针、横向时间流线和玩家残影。
- 倒流期间禁止移动、跳跃、技能和交互输入，也不能再次触发重开；结束后清空输入，载入关卡初始状态（位置、物体、次数、霜晶、机关），不会残留旧的 Freeze Area。
- 历史缓冲区与在线模式的预测、校正和重连缓冲完全分开。
- 在线模式：主机发出重开（仍需主机权限），服务器生成初始状态并向两边广播 `replay`，两边用各自记录的历史同步播放 4 秒；服务器在 4 秒后统一安装初始状态并恢复模拟。房间、身份和角色分配保持不变。
- 本地模式下切到后台标签页时倒流暂停，回到前台后从原处继续；在线模式跟随服务器时间，回到前台时直接结束（服务器已完成重开）。

触屏设备（包括 iPadOS 桌面模式的 Safari 和已安装的 PWA）使用专门的触控布局：

- 左下角的半透明摇杆只控制左右移动。其右上方有独立的 **Jump** 按钮。轻按小跳，按住可跳到原有的最大高度，松开后才能再跳。可以一根手指保持移动，同时用另一根手指跳跃。
- 右下角是同样大小的 **Ability** 和交互按钮。**Ability** 使用当前角色的默认瞄准；交互按钮按状态显示 **Pick Up / Throw / Plant / Drop**。本地模式还可用小圆钮切换角色。
- Still 仍可直接点场景放置或取消 Freeze Area。Bloom 可直接点 300 个世界单位以内的花、平台或生物，唤醒或加速它们。在线时服务器判定施放、取消及其物体状态。
- 桌面仍可使用 `F` / `L`，也可用鼠标放置或取消 Still 的区域。
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

`tests/online.playtest.js` 和 `tests/pwa.playtest.js` 是供 Playwright 浏览器驱动执行的函数，不是 Bun 单元测试，仓库里没有安装 Playwright，需要在外部浏览器驱动中运行。它们检查共享 Freeze Area 是否两边同步；失败提示和倒流目前没有浏览器自动化脚本。Freeze、次数、失败检测和倒流历史的单元测试在 `tests/gameplay.test.js`、`tests/charges.test.js`、`tests/rewind.test.js`。后者默认测试 `http://127.0.0.1:4180`，创建四个独立会话，检查双房间、移动加跳跃、技能交接、离线重连和静态缓存。它保留测试页面，便于继续验证跨标签页更新；完成后关闭这些页面。截图保存在忽略的 `.audit/` 目录。

浏览器模拟不能替代实体手机测试。正式开放前仍需在 Android Chrome 和 iPhone Safari 上完成安装、独立窗口、触控、刘海安全区和锁屏恢复测试，并通过公开 HTTPS 域名验证跨网络 WSS。

`bun tests/entry.playtest.js` 验证主菜单排版与离线背景、本地通关演出及联机换关。先运行 `bun run build`，并准备 Chrome 与 Playwright。可用环境变量 `MOONCLOCK_PLAYWRIGHT` 指定外部 Playwright 的 `index.mjs` 绝对路径。脚本自行启动本机临时服务，截图写入 `.audit/`。

图标由 `scripts/generate-icons.py` 在本地生成，没有调用付费素材服务。需要重新生成时运行 `python scripts/generate-icons.py`，然后重新构建。

## PWA 与部署相关文件

- 前端接入：`public/index.html`、`public/client.js`、`public/network.js`、`public/strings.js`、`public/mobile.css`。
- PWA：`public/manifest.webmanifest`、`public/sw.js`、`public/pwa.js`、`public/offline.html`，以及 `public/icons/` 中的 192、512、maskable 和 Apple Touch PNG 图标。
- 生产服务：`server.js`、`src/rooms.js`、`package.json`、`scripts/build.js`、`scripts/start-production.js`、`scripts/check-dependencies.js`。
- 图标工具：`scripts/generate-icons.py`。
- 部署：`Dockerfile`、`.dockerignore`、`railway.json`。
- 检查：`tests/network.test.js`、`tests/production.test.js`、`tests/pwa.test.js`、`tests/pwa.playtest.js`。
