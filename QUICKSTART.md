# 快速开始

## 1. 安装依赖

```bash
go mod download
cd vue-form && npm ci
```

## 2. 启动方式

最常用的是分离启动：

```bash
# 终端 1
make api

# 终端 2
make web
```

如果你想看热重载：

```bash
make air
make web
```

如果你想直接跑接近发布态的本机二进制：

```bash
make dev
```

## 3. 访问地址

- 首页：`http://localhost:8080`
- 表单页：`http://localhost:8080/forms/<form-name>`
- 管理后台：`http://localhost:8080/admin`

## 4. 配置表单

把表单写进 `config.yaml` 或单独的 `*.yaml` 文件：

```yaml
forms:
  - name: "contact"
    title: "联系我们"
    description: "填写联系方式"
    model:
      table_name: "contact"
    fields:
      - name: "name"
        label: "姓名"
        type: "text"
        required: true
```

如果要引用用户、部门或角色列表，直接用：

```yaml
type: select
options_from: users
```

## 5. 常用命令

```bash
make build      # 构建本机二进制
make windows    # 构建 Windows 二进制
make all        # 同时构建本机和 Windows 版本
make test       # 运行测试
make demo       # 使用 .demo/config.yaml 运行独立演示库
```

## 6. 数据保存

当前提交数据写入 SQLite，数据库路径由 `database.path` 决定。  
如果你在开发时看不到最新表单，先确认配置文件是否被 `includes` 合并进来，再重启或用热重载刷新。
