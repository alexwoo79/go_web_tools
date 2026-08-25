# 多配置文件合并

仓库支持把表单拆到多个 YAML 文件里，通过主配置的 `includes` 自动合并。

## 基本写法

主配置 `config.yaml`：

```yaml
server:
  port: 8080
  host: "localhost"

database:
  path: "data/data.db"
  type: "sqlite"

includes:
  - "marketing_forms.yaml"
  - "hr_forms.yaml"
  - "survey_forms.yaml"
  - "*.yaml"
```

子配置文件只需要提供 `forms`：

```yaml
forms:
  - name: "feedback"
    title: "用户反馈表单"
    model:
      table_name: "marketing_feedback"
    fields:
      - name: "name"
        label: "姓名"
        type: "text"
        required: true
```

## 当前行为

- `includes` 既支持文件名，也支持 glob
- 路径按主配置所在目录解析
- 同名表单会跳过后加载项，主配置优先
- 系统会在表单元数据里记录来源文件名
- 表单数据统一写入 SQLite，不再依赖独立 JSON 目录

## 推荐约定

- 主配置放公共设置，分表单文件放业务模块
- 每个表单都写 `model.table_name`
- 选项型字段优先用 `options_from` 读取用户、部门或角色
- 独立文件名尽量表达业务范围，例如 `hr_forms.yaml`

## 适用场景

- 按部门拆分：`hr_forms.yaml`、`marketing_forms.yaml`
- 按业务线拆分：`survey_*.yaml`、`project_*.yaml`
- 按环境拆分：`dev_forms.yaml`、`prod_forms.yaml`

## 验证方式

```bash
make api
```

启动日志里能看到已加载的配置文件；首页表单列表和管理后台会合并展示所有表单。
