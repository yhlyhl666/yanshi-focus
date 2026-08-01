# 研时移动端

研时的 React Native + Expo 移动端应用。当前第一版面向 iOS，同时保留 Android 扩展能力。

## 已实现

- 专注与休息计时，支持暂停、重置、跳过、后台恢复及本地提醒
- 倒计时结束只发送提醒，必须手动确认后才写入专注记录和统计
- 四科切换及具体学习任务关联
- 学习任务新建、完成和删除
- 累计时长、科目分布、最近七天柱状图
- 专注记录补录、减少、编辑和删除
- 自定义考研日期、计时长度、每日目标和严格模式
- AsyncStorage 本地数据持久化

## 本地运行

```bash
npm install
npm start
```

在 iPhone 安装 Expo Go，然后扫描终端中显示的二维码。Windows 无法运行 Xcode 模拟器，但不影响使用真实 iPhone 测试。

## 检查

```bash
npm run typecheck
npm run export:ios
```

## 当前限制

- 桌面端和移动端尚未实现数据同步
- 尚未接入账号、云端和数据导入导出
- 提交 App Store 前仍需 Apple Developer 账号、应用图标、隐私信息和真机构建验证
