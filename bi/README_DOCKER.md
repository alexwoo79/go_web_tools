Bi Docker / docker-compose 使用说明

快速开始

1) 本地构建并运行（使用根目录 docker-compose）:

```bash
# 在项目根目录
docker-compose build bi
docker-compose up -d bi
# 查看日志
docker-compose logs -f bi
```

2) 直接在 bi 目录构建镜像并运行（开发快速迭代）:

```bash
cd bi
docker build -t go_form_bi:local .
docker run -p 8501:8501 -v "$PWD":/app -v ../data:/app/data --rm go_form_bi:local \
  streamlit run app.py --server.port 8501 --server.address 0.0.0.0
```

3) 发布镜像到 Docker Hub（示例）

替换下面的 `DOCKERHUB_USER`/`IMAGE_NAME` 为你的仓库：

```bash
# 登录
docker login -u DOCKERHUB_USER
# 标记并推送
docker tag go_form_bi:local DOCKERHUB_USER/go_form_bi:latest
docker push DOCKERHUB_USER/go_form_bi:latest
```

4) CI/CD（GitHub Actions）

仓库中包含一个 workflow 模板：`.github/workflows/build-and-publish-bi.yml`。
要启用向 Docker Hub 的推送，请在仓库 Secrets 中添加：
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

或者调整 workflow 以推送到 GitHub Container Registry（GHCR）。

注意
- `bi/requirements.txt` 列出运行所需的 Python 包。
- 若需在容器中写入持久化输出，请挂载宿主目录到容器（如示例中的 `../data`）。
