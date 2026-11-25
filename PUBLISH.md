# 首次发布到 GitHub Pages

读者看到的是一个可直接打开的网站。你作为维护者需要一个 GitHub 账号。公开仓库可以使用 GitHub Free 的 Pages 服务。项目仓库的默认网址是 `https://用户名.github.io/awesome-micro-theory/`。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 第一次上线

1. 在要维护本站的账号下创建名为 `awesome-micro-theory` 的空白公开仓库。用 GitHub Desktop 等 Git 客户端，将本项目目录里的内容提交并推送到仓库的 `main` 分支，包括 `.github/workflows/pages.yml`。仓库根目录应能看到本文件及 `src`、`scripts` 和 `data` 三个目录。
2. 在仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。到 **Actions → Publish Awesome Micro Theory → Run workflow** 手动运行一次。首次可以关闭刷新选项，以仓库自带的快照上线。
3. 在运行记录中确认 **build** 和 **deploy** 都是绿色。点 **github-pages** 环境给出的公开网址；复制这个地址发给读者。页面左上角应显示 Awesome Micro Theory，首页可切换中英文。
4. 试开「使用说明」的两篇论文对读示例，再从「近期论文」进入美国 JMP。复制对读页地址，重新打开同一地址，确认仍是原来的两篇论文。

GitHub Pages 的地址随仓库名变化，构建会采用平台返回的路径。使用 Actions 发布的具体要求见 [GitHub 官方部署指南](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 定期更新

工作流在北京时间每日 **09:37** 计划启动，GitHub 繁忙时可能延迟。每次定时运行读取原公共网站的数据，再生成并校验网页以及地图和引文索引，全部通过后才替换上一版。访问者搜索、点论文、展开关系图时，读取的都是本次部署的静态文件。

项目维护者仍在原维护服务核验公开来源、修订书目。GitHub Pages 提供读者网站。来源故障时，**Actions** 会显示失败记录，线上继续保留最近一次成功部署。首次推送使用仓库自带的快照；需要把最新快照保存进源仓库时，可在本地执行 `node scripts/sync-public.mjs`，核对改动后提交。GitHub 对长期无活动的公开仓库可能停用定时任务，可在 **Actions** 中查看和恢复。[GitHub 定时任务说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 本地检验

需要 Node.js 22 或更新的版本。在项目根目录运行：

```sh
node scripts/build.mjs --base /
node scripts/verify-release.mjs /
python3 -m http.server 8000 --directory _site
```

然后打开 `http://localhost:8000/`。日常构建使用仓库快照，可以离线完成。
