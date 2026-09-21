# D2R 服务端安装包

## v1.2.0 更新内容

- 修复移动端双击缩放、背包长按拖拽与触摸滚动冲突，优化生命/法力条和战斗通知显示。
- 普通难度通关后解锁拉苏克付费打孔与安雅赌博商店；赌博稀有品质概率提升至 20%。
- 赌博商店支持直接管理背包，商品卡片展示基础等级；背包支持 Ctrl + 右键快速出售。
- 调整营地商人位置与商店商品布局，优化高清音效导入并保留原始录音。

从 [GitHub Releases](https://github.com/zd102/D2R/releases/latest) 下载对应平台的安装包。程序内置 Node.js 和生产依赖，安装时无需 npm、Git 或下载运行环境。仅提供 x64；Windows 10 / Server 2019 及以上，Linux 需要 systemd、glibc 2.28+（推荐 Ubuntu 22.04/24.04）。

## Windows

以管理员身份运行 `D2R-Server-版本-windows-x64-setup.exe`，完成后 `D2RServer` 系统服务自动启动并随系统开机运行。没有桌面快捷方式，也不会打开浏览器。服务包装器使用系统自带的 .NET Framework 4.6.1+（Windows 10 / Server 2019 及以上通常已内置）。

静默部署：

```powershell
Start-Process .\D2R-Server-1.2.0-windows-x64-setup.exe -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait
Get-Service D2RServer
```

- 程序：`C:\Program Files\D2R Server`
- 配置：`C:\ProgramData\D2RServer\server.env`
- 账号和在线存档：`C:\ProgramData\D2RServer\data\online.sqlite`
- 日志：`C:\ProgramData\D2RServer\logs`
- 配置修改后：管理员 PowerShell 执行 `Restart-Service D2RServer`。
- 更新：关闭安装目录中的管理工具，运行新版本安装包；安装器停止旧服务、替换程序并启动服务，保留配置与数据库。
- 卸载：Windows“已安装的应用”中卸载 D2R Server；移除服务和程序，保留 ProgramData 下的数据。

## Linux

下载并解压后执行一次安装命令：

```bash
mkdir d2r-server
tar -xzf D2R-Server-1.2.0-linux-x64.tar.gz -C d2r-server
cd d2r-server
sudo bash install.sh
systemctl status d2r-server
```

- 程序：`/opt/d2r-server/current`，指向每次安装的新版本目录，旧版本保留供回退。
- 配置：`/etc/d2r-server/server.env`
- 账号和在线存档：`/var/lib/d2r-server/online.sqlite`
- 日志：`journalctl -u d2r-server -f`
- 配置修改后：`sudo systemctl restart d2r-server`。
- 更新：解压新包，再运行 `sudo bash install.sh`；配置和数据库保留。
- 停用：`sudo systemctl disable --now d2r-server`；这不会删除程序、配置或数据库。
- 回退程序：停止服务，将 `/opt/d2r-server/current` 链接指向保留的旧目录，再启动服务。跨数据库结构版本回退时同时恢复对应备份。

## 访问与配置

安装完成后，客户端访问 `http://服务器IP:5173`。页面与 `/api` 由同一服务提供；无需另开 3001 端口。健康检查：`http://服务器IP:5173/api/health`。

默认监听所有 IPv4 网卡。按部署范围放行防火墙 TCP 5173；安装器不自动修改防火墙规则。Windows 示例：

```powershell
New-NetFirewallRule -DisplayName 'D2R Server LAN' -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private -RemoteAddress LocalSubnet
```

`server.env` 支持 `D2R_HOST`、`D2R_PORT`、`D2R_SECURE_COOKIES`、`D2R_ORIGINS`、`D2R_LOCAL_ORIGIN`。公网部署应在前面配置 HTTPS 反向代理，保留原始 Host，设 `D2R_SECURE_COOKIES=true` 和 `D2R_LOCAL_ORIGIN=https://你的域名`；需要允许额外来源时设置逗号分隔的 `D2R_ORIGINS`。HTTP 内网部署保持 `D2R_SECURE_COOKIES=false`。数据库路径由服务定义固定在上述数据目录。

在线模式的账号与角色保存在服务器；本地模式角色仍保存在各客户端浏览器中。服务端安装包不会迁移开发目录的已有数据库；迁移时先停止旧、新服务，再复制旧数据库和相关 WAL 文件到新数据目录，并确认服务账户可读写。备份时停止服务后复制整个数据目录，完成后再启动。

安装包暂未做 Windows 代码签名。可使用同一 Release 中的 `SHA256SUMS.txt` 检查下载完整性。

## CI 与后续发布

发布安装包直接包含 `public/audio/local/manifest.json` 引用的 D2R 原版音效，无需在服务器另行导入。当前随包提供的是经典原版录音；未覆盖的事件仍使用后备音效。构建和打包会核对每个原版文件的大小与 SHA-256，缺失或损坏时终止发布，避免悄悄退回默认音效。已有安装需更新到包含此修复的新安装包。

`main` 推送、Pull Request 和手动触发运行双平台测试、构建、打包及真实服务安装/升级检查；通过后的包可在 Actions artifacts 下载。推送与 `package.json` 版本一致的 `v版本号` 标签（例如 `v1.2.0`），两平台成功后自动创建 Release，附带安装包、本文档和 SHA-256 清单。失败不会发布只有一端产物的 Release。

本地验证：`npm ci`、`npm test`、`npm run test:server`、`npm run build`、`npm run package:server`、`npm run test:package`。浏览器测试需要 `npx playwright install chromium`；也可指定 `BROWSER_CHANNEL=msedge` 使用本机 Edge。打包目录默认 `release/package`，必须是尚不存在的目录，避免覆盖既有产物。
