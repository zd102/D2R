# 音效系统

游戏使用 Web Audio 采样混音。武器挥击与命中分别触发；元素伤害、怪物死亡、角色受伤、喝药、物品拾取、开箱、装备、界面、升级与传送各有事件。脚步按实际移动距离触发，传送与撞墙不产生连续脚步。方位按等距摄像机计算，28 单位之外不创建声音。

设置中可调总音量、战斗与动作、环境声音、物品与界面。设置独立保存在 `eclipse-audio-v1`，不改角色存档；静音后恢复之前的音量。暂停时环境声降低，切换区域交叉淡化，切到后台停止声音。最多同时播放 24 个事件；高优先级反馈可替换低优先级声音，结束后断开节点并释放引用。

## 本机原生音效

发布安装包已附带原版资源包，优先播放原生录音，不叠加合成音色、随机变调或程序混响；保留录音声道，仍应用游戏音量、方位和总线限幅。导入器默认读取 D2R 的 `sounds.txt`，跟随 `Redirect`（名称或 Index），展开 `Group Size`，优先提取 `hd/global/sfx/` 高清资源；缺失时回退经典录音，再由播放器回退 CC0 拟音与程序音效。每个事件最多保留 8 个变体。

七个职业均配置受伤与死亡映射。若安装包提供 `skills.txt`，额外按稳定技能 ID 导入死灵法师、野蛮人、德鲁伊、刺客及装备技能的 `stsound`。只有明确的施法音效才接入，不把命中声当成施法声。怪物映射仍有近似，例如冰川恶兽使用雪人。

Windows x64 安装 Python 3，并准备兼容当前游戏版本的 CascLib 3.x DLL 后运行：

```powershell
python scripts/import-d2-audio.py --game 'F:\D4\Diablo II Resurrected' --casc-dll 'C:\Tools\CascLib.dll'
```

也可以读取已提取的 `Data` 目录，不需要 CascLib：

```powershell
python scripts/import-d2-audio.py --extracted 'D:\D2R-extracted\Data'
```

该目录需要 `global/excel/sounds.txt` 和对应的 `hd/global/sfx/` 音频；`global/sfx/` 提供经典回退，`global/excel/skills.txt` 提供扩展职业映射。需要旧版音色时加 `--quality classic`。导入结果输出高清／经典事件数量和缺失列表，清单的 `coverage`、`missing` 和 `files` 可核对实际来源与 SHA-256；无法导入任何音频时不会覆盖已有清单。高清来源只表示使用了高清素材，不代表完整复刻 D2R 的混音、环境事件、循环技能或 7.1 输出。

导入器仅从游戏安装目录读取选定文件，将音频及包含来源、大小和 SHA-256 的清单写入 `public/audio/local/`。发布清单及其引用的 321 个原版音频文件已纳入 Git，提供 172 个事件映射；当前录音来自经典资源。该目录的其他导入文件继续被忽略。重新运行可更新原生素材；不会清理其他文件或修改游戏安装。更新清单后应将新增引用文件显式加入 Git，并运行验证。资源清单在构建时发现，生产部署需在导入后重新构建，并一并部署生成的音频文件。

Vite 构建会将 `public/audio/local/` 一并复制到 `dist/`，双平台安装包再包含完整 `dist/`。`npm run build` 和 `npm run package:server` 会核对原版素材清单、文件大小与 SHA-256；缺失或损坏时直接失败。素材许可仍分别适用，原版录音不属于 CC0 素材。

原生文件通过本机静态路径播放，没有第三方音频请求。`src/audio-native.ts` 自动发现本机清单。技能可以通过 `nativeKey: 'cast:fireBall'` 指定原生录音；没有专用录音时使用元素事件。映射在导入脚本的 `MAPPING` / `SKILLS` 中维护。

## 素材与验证

- 高清重定向与分组字段参考 [D2R 数据表说明](https://locbones.github.io/D2R_DataGuide/#soundstxt)；实际录音以本机安装数据为准。
- [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) 与 [Impact Sounds](https://kenney.nl/assets/impact-sounds)：CC0，原始许可位于各素材目录的 `License.txt`。只包含实际使用的 72 个 OGG 文件。
- [CascLib](https://github.com/ladislav-zezula/CascLib)：CASC 读取库；本次验证使用 [D2RExtractor](https://github.com/levinium/D2RExtractor) 提供的兼容 DLL，工具本身不纳入仓库。
- [OpenDiablo2](https://github.com/OpenDiablo2/OpenDiablo2)：读取玩家本机游戏资产的参考项目。
- [暴雪 Legal FAQ](https://www.blizzard.com/en-us/legal/28d5ebbf-c245-4408-8ba9-043dd5f056bf/legal-faq)：素材使用说明，不能将社区下载链接视为再发布许可。

`npm test` 检查事件分类、空间衰减、素材完整性、后备波形与循环边界。`npm run test:audio` 在实际浏览器检查音频解码、事件触发、原版优先、静音持久化、环境切换、并发限制与资源回收。浏览器回归还会独立检查后备音库。`npm run test:package` 验证发布包的本地与在线模式实际播放原版营地录音，避免仅检查文件存在而漏掉播放回退。

导入器回归：`python -B tests/audio-import.test.py`。使用合成夹具检查高清重定向、分组、经典回退、循环引用、路径检查、扩展职业映射与空导入保护；浏览器回归另用双声道 WAV 夹具检查原速、声道和不叠加混响，不依赖本机原版素材。
