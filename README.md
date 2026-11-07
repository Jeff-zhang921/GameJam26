# GameJam26
this is a tests

## 本地启动

安装 [Bun](https://bun.sh/docs/installation)，在包含 `package.json` 的目录运行：

```powershell
bun run dev
```

打开 http://127.0.0.1:4173 。目前没有第三方运行依赖。

## 在线双人

1. 两名玩家打开同一个服务器地址，使用两个独立浏览器会话。
2. 主机点击 **Create Room**，复制六位房间码；另一名玩家点击 **Join Room** 并输入房间码。
3. 分别选择 Stillkeeper 和 Bloomkeeper，两人都点击 **Ready**。
4. 主机点击 **Start Game**，等待共享的三秒倒计时。
5. 各自用 `A / D` 或方向键移动、`Space` 跳跃、`E` 交互、`F` 使用技能、`R` 回溯。在线模式不能用 `Tab` 换角色。

Still 保留冻结与释放；Bloom 保留唤醒、逐次加速至 3×，以及释放冻结物体。关卡和技能规则不变。

`Esc` 打开共享暂停。主机可重置关卡或在共同过关后进入下一关；双方都可离开房间。单人及同机双人入口继续保留。

刷新页面会尝试重新加入原来的角色。重连身份保存在当前标签页的 `sessionStorage` 中，与公开房间码分离。掉线期间世界暂停，30 秒内可以恢复；超过期限可返回大厅。不要清除当前标签页数据，否则无法证明原来的身份。

## 局域网与外网

默认服务器只监听本机。要让同一局域网设备访问，在 PowerShell 中运行：

```powershell
$env:HOST = "0.0.0.0"
bun run dev
```

另一台设备使用这台电脑的局域网 IP 和端口 `4173`，并确保本机防火墙允许该端口。房间码只负责找到房间，不会自动建立公网连接。

跨网络联机需要把同一个 Bun 服务部署到可公网访问的主机，使用 HTTPS，并让反向代理支持 `/ws` 的 WebSocket Upgrade；网页与 WebSocket 保持同源。此改动不包含部署，也不依赖 Higgsfield 付费服务。

## 验证与架构

```powershell
bun test
bun run build
```

现有服务器同时提供网页和 Bun 原生 WebSocket。服务器以固定 60Hz 推进现有六函数游戏规则，以 20Hz 发送共享状态；客户端插值远端角色，并用同一控制器预测本地移动，收到状态后校正。角色动画使用服务器的动画名称、开始 tick 和事件标识，不传输图片。

房间和状态保存在单个进程内，等待大厅 30 分钟过期，服务器重启会清空房间。不支持多实例跨进程房间或关闭标签页后的永久恢复。

`tests/rooms.test.js` 覆盖房间与身份生命周期，`tests/websocket.test.js` 使用真实 WebSocket 验证双客户端同步，`tests/network.test.js` 验证显示插值；原有玩法测试继续运行。

`tests/online.playtest.js` 是供 Playwright 浏览器驱动执行的函数，创建两个独立浏览器上下文，验证大厅、输入、技能、掉线恢复、真实过关及下一关的共享对象。运行它之前启动本地服务器；它会在 `.audit/` 保存大厅和游戏截图。
