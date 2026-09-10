# 音效系统

游戏使用 Web Audio 采样混音。武器挥击与命中分别触发；元素伤害、怪物死亡、角色受伤、喝药、物品拾取、开箱、装备、界面、升级与传送各有事件。脚步按实际移动距离触发，传送与撞墙不产生连续脚步。方位按等距摄像机计算，28 单位之外不创建声音。

设置中可调总音量、战斗与动作、环境声音、物品与界面。设置独立保存在 `eclipse-audio-v1`，不改角色存档；静音后恢复之前的音量。暂停时环境声降低，切换区域交叉淡化，切到后台停止声音。最多同时播放 24 个事件；高优先级反馈可替换低优先级声音，结束后断开节点并释放引用。

## 本机原生音效

有本机资源包时优先播放原生录音，不对它叠加合成音色或随机变调。缺失项使用仓库随附的 CC0 拟音与程序生成的音效。当前导入器读取 D2R 的 `sounds.txt`，选择经典音效行，不跟随 HD Redirect；经典行中为空的怪物使用相近种类的声音，例如冰川恶兽使用雪人。

Windows x64 安装 Python 3，并准备兼容当前游戏版本的 CascLib 3.x DLL 后运行：

```powershell
python scripts/import-d2-audio.py --game 'F:\D4\Diablo II Resurrected' --casc-dll 'C:\Tools\CascLib.dll'
```

导入器仅从游戏安装目录读取选定文件，将音频及包含来源、大小和 SHA-256 的清单写入 `public/audio/local/`。该目录被 Git 忽略。重新运行可更新原生素材；不会清理其他文件或修改游戏安装。已有 Vite 服务会发现新增清单；浏览器刷新后启用。其他检出目录不需要这些文件也能运行。

注意：Vite 构建会将本机 `public/audio/local/` 一并复制到 `dist/`。含原版素材的本机构建不作为可自由再发布的素材包；分享代码和 CC0 版本时应在没有本机原版素材的独立检出目录构建。游戏购买与本机提取并不自动赋予重新发布原始资源的授权。

原生文件通过本机静态路径播放，没有第三方音频请求。`src/audio-native.ts` 自动发现本机清单。技能可以通过 `nativeKey: 'cast:fireBall'` 指定原生录音；没有专用录音时使用元素事件。映射在导入脚本的 `MAPPING` / `SKILLS` 中维护。

## 素材与验证

- [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) 与 [Impact Sounds](https://kenney.nl/assets/impact-sounds)：CC0，原始许可位于各素材目录的 `License.txt`。只包含实际使用的 72 个 OGG 文件。
- [CascLib](https://github.com/ladislav-zezula/CascLib)：CASC 读取库；本次验证使用 [D2RExtractor](https://github.com/levinium/D2RExtractor) 提供的兼容 DLL，工具本身不纳入仓库。
- [OpenDiablo2](https://github.com/OpenDiablo2/OpenDiablo2)：读取玩家本机游戏资产的参考项目。
- [暴雪 Legal FAQ](https://www.blizzard.com/en-us/legal/28d5ebbf-c245-4408-8ba9-043dd5f056bf/legal-faq)：素材使用说明，不能将社区下载链接视为再发布许可。

`npm test` 检查事件分类、空间衰减、素材完整性、后备波形与循环边界。`npm run test:audio` 在实际浏览器检查音频解码、事件触发、原版优先、静音持久化、环境切换、并发限制与资源回收。无本机原版资源时同一套验证自动检查后备音库。
