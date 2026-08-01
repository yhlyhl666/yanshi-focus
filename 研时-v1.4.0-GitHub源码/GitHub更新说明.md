# GitHub 更新说明

这个文件夹已经排除了依赖、构建缓存和安装包，可以直接作为 GitHub 仓库源码使用。

## 第一次上传

在本文件夹打开终端，依次运行：

```bash
git init
git add .
git commit -m "release: 研时 v1.4.0"
git branch -M main
git remote add origin 你的仓库地址
git push -u origin main
```

## 更新已有仓库

如果桌面文件夹已关联你的 GitHub 仓库：

```bash
git add .
git commit -m "feat: add recovery history and undo"
git push
```

## 发布安装包

安装依赖并生成 Windows 安装包：

```bash
npm install
npm run desktop:dist
```

生成的 `release/Yanshi-Setup-1.4.0.exe` 可以上传到 GitHub Releases。

不要把 `node_modules/`、`dist/`、`release/` 或本地用户数据提交到 GitHub；这些路径已写入 `.gitignore`。
