#!/usr/bin/env python3
"""把 Excel/CSV 转换为 go_web_tools 表单 YAML（支持参数覆盖，便于交互迭代）。

示例:
  python3 excel_to_yaml.py 考核表.xlsx --title 2026Q3绩效考核 --category hr
  python3 excel_to_yaml.py 考核表.xlsx --header-row 3 --required "姓名,邮箱" \
      --type "得分:number:0:100" --text "部门" --output forms/jixiao.yaml
"""

from __future__ import annotations

import argparse
import json
import re
import sys

import lib_excel as lib


def quote(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def emit_yaml(form: dict) -> str:
    lines = ["forms:"]
    lines.append(f"  - name: {quote(form['name'])}")
    lines.append(f"    title: {quote(form['title'])}")
    if form.get("description"):
        lines.append(f"    description: {quote(form['description'])}")
    lines.append(f"    category: {quote(form.get('category') or 'general')}")
    lines.append(f"    status: {quote(form.get('status') or 'published')}")
    if form.get("weight_sum_total_limit") is not None:
        lines.append(f"    weight_sum_total_limit: {_num(form['weight_sum_total_limit'])}")
    if form.get("scoring"):
        sc = form["scoring"]
        lines.append("    scoring:")
        if sc.get("mode"):
            lines.append(f"      mode: {quote(sc['mode'])}")
        lines.append(f"      group: {quote(sc.get('group', ''))}")
        if sc.get("score_field"):
            lines.append(f"      score_field: {quote(sc['score_field'])}")
        if sc.get("weight_field"):
            lines.append(f"      weight_field: {quote(sc['weight_field'])}")
    lines.append("    fields:")
    for f in form["fields"]:
        lines.extend(emit_field_lines(f, "      "))
    return "\n".join(lines) + "\n"


def emit_field_lines(f: dict, indent: str) -> list[str]:
    lines = [f"{indent}- name: {quote(f['name'])}"]
    lines.append(f"{indent}  label: {quote(f['label'])}")
    lines.append(f"{indent}  type: {quote(f['type'])}")
    if f.get("placeholder"):
        lines.append(f"{indent}  placeholder: {quote(f['placeholder'])}")
    lines.append(f"{indent}  required: {'true' if f.get('required') else 'false'}")
    if f.get("options"):
        lines.append(f"{indent}  options:")
        for o in f["options"]:
            lines.append(f"{indent}    - {quote(o)}")
    if f.get("min") is not None:
        lines.append(f"{indent}  min: {_num(f['min'])}")
    if f.get("max") is not None:
        lines.append(f"{indent}  max: {_num(f['max'])}")
    if f.get("type") == "repeated_group":
        if f.get("default_rows"):
            lines.append(f"{indent}  default_rows: {f['default_rows']}")
        if f.get("min_rows"):
            lines.append(f"{indent}  min_rows: {f['min_rows']}")
        if f.get("max_rows"):
            lines.append(f"{indent}  max_rows: {f['max_rows']}")
        if f.get("weight_sum_field"):
            lines.append(f"{indent}  weight_sum_field: {quote(f['weight_sum_field'])}")
        if f.get("weight_sum_limit") is not None:
            lines.append(f"{indent}  weight_sum_limit: {_num(f['weight_sum_limit'])}")
        lines.append(f"{indent}  group_fields:")
        for g in f.get("group_fields", []):
            lines.extend(emit_field_lines(g, indent + "    "))
    return lines


def _num(v) -> str:
    return str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)


def placeholder_for(ftype: str, label: str) -> str:
    if ftype == "select":
        return "请选择" + label
    if ftype == "checkbox":
        return ""
    if ftype == "date":
        return "请选择日期"
    if ftype == "time":
        return "请选择时间"
    return "请输入" + label


def parse_type_override(spec: str):
    """'label:type' 或 'label:number:min:max' -> (label, type, min, max)。"""
    parts = [x.strip() for x in spec.split(":")]
    label = parts[0]
    ftype = parts[1] if len(parts) > 1 else "text"
    fmin = float(parts[2]) if len(parts) > 2 and parts[2] else None
    fmax = float(parts[3]) if len(parts) > 3 and parts[3] else None
    return label, ftype, fmin, fmax


def generate(
    path: str,
    title: str | None,
    category: str | None,
    status: str | None,
    form_name: str | None,
    sheet: str | None,
    header_row: int | None,
    required: list[str],
    optional: list[str],
    type_overrides: list[str],
    select_labels: list[str],
    text_labels: list[str],
    label_map: dict[str, str],
    no_info_fields: bool = False,
):
    sheets, active, rows, merged = lib.load_rows(path, sheet)

    if header_row is not None:
        idx = header_row - 1
        if idx < 0 or idx >= len(rows):
            raise ValueError(f"--header-row {header_row} 超出范围（共 {len(rows)} 行）")
        header = {
            "title": "",
            "groups": [],
            "header_row": rows[idx],
            "header_idx": idx,
        }
    else:
        header = lib.detect_header(rows)
        if header is None:
            raise ValueError("未识别到表头行，请用 --header-row 指定（1 起）")

    # 表头上方的「标签：值」信息行（部门/岗位/姓名等）→ 前置字段
    info_fields = [] if no_info_fields else lib.detect_info_fields(rows, header["header_idx"])

    file_title = lib.title_from_filename(path)
    form_title = lib.first_non_empty(title, header["title"], file_title, "Excel 导入表单")
    name = form_name or lib.slugify(form_title)
    if not name or name[0].isdigit():
        name = "form_" + name if name else "excel_form"

    # 覆盖参数（按标签精确匹配）
    forced = {label: ("select", None, None, None) for label in select_labels}
    forced.update({label: ("text", None, None, None) for label in text_labels})
    for spec in type_overrides:
        label, ftype, fmin, fmax = parse_type_override(spec)
        forced[label] = (ftype, None, fmin, fmax)
    required_set = {x.strip() for x in required if x.strip()}
    optional_set = {x.strip() for x in optional if x.strip()}
    label_override_by_col = {}
    for col_ref, new_label in label_map.items():
        if col_ref.isdigit():
            label_override_by_col[int(col_ref)] = new_label
        else:
            col_num = 0
            for ch in col_ref.upper():
                col_num = col_num * 26 + (ord(ch) - 64)
            label_override_by_col[col_num] = new_label

    data_start = header["header_idx"] + 1
    ncols = len(header["header_row"])
    for g in header["groups"]:
        ncols = max(ncols, len(g["row"]))

    fields = []
    seen_names = {}
    warnings = []
    for info in info_fields:
        fields.append(
            {
                "name": info["name"],
                "label": info["label"],
                "type": "text",
                "placeholder": "请输入" + info["label"],
                "required": False,
                "options": None,
                "min": None,
                "max": None,
                "samples": [info["value"]],
            }
        )
        seen_names[info["name"]] = 1

    for c in range(ncols):
        label, source = lib.resolve_label(header, merged, c)
        raw_label = label
        if (c + 1) in label_override_by_col:
            label = label_override_by_col[c + 1]
            raw_label = label
            source = "header"
            if lib.REQUIRED_RE.search(label) or label.endswith("*"):
                is_required_override = True
            else:
                is_required_override = None
        else:
            is_required_override = None
        if not label:
            warnings.append(f"第 {c + 1} 列表头为空，已跳过")
            continue
        if source in ("merged", "group"):
            warnings.append(
                f"第 {c + 1} 列表头为空，使用分组标签「{label}」；"
                f"可用 --label '{c + 1}:新名称' 或 --label '{_col_letter(c)}:新名称' 指定"
            )
        elif source == "header":
            # 与 Go 解析器一致：去掉必填标记后再作为字段标签
            cleaned = lib.REQUIRED_RE.sub("", label).strip(" ：: ")
            if cleaned:
                label = cleaned
        samples = lib.sample_values(rows, data_start, c, header_row=header["header_row"])
        ftype, opts, fmin, fmax = lib.infer_type(label, samples)

        # 应用覆盖
        base = label
        if base in forced:
            ftype, _, fmin, fmax = forced[base]
            opts = None
        if is_required_override is True:
            is_required = True
        elif is_required_override is False:
            is_required = False
        elif base in required_set:
            is_required = True
        elif base in optional_set:
            is_required = False
        else:
            is_required = bool(lib.REQUIRED_RE.search(raw_label))

        fname = lib.slugify(label)
        if not fname:
            fname = f"field_{c + 1}"
        if fname in seen_names:
            seen_names[fname] += 1
            fname = f"{fname}_{seen_names[fname]}"
        else:
            seen_names[fname] = 1

        fields.append(
            {
                "name": fname,
                "label": label,
                "type": ftype,
                "placeholder": placeholder_for(ftype, label),
                "required": is_required,
                "options": opts,
                "min": fmin,
                "max": fmax,
                "samples": samples[:5],
            }
        )

    if not fields:
        raise ValueError("没有识别到任何字段")

    form = {
        "name": name,
        "title": form_title,
        "description": f"由 Excel 模板自动生成：{form_title}",
        "category": category or "general",
        "status": status or "published",
        "fields": fields,
    }
    yaml_text = emit_yaml(form)
    return yaml_text, form, warnings, sheets, active, header


def _col_index(col_ref: str, header, merged: dict) -> int:
    """把列引用（字母/数字/标签）解析为 0 起列下标。"""
    ref = col_ref.strip()
    if ref.isdigit():
        idx = int(ref) - 1
        if 0 <= idx < len(header["header_row"]):
            return idx
        raise ValueError(f"列号超出范围: {col_ref}")
    if ref.isascii() and ref.isalpha():
        n = 0
        for ch in ref.upper():
            n = n * 26 + (ord(ch) - 64)
        idx = n - 1
        if 0 <= idx < len(header["header_row"]):
            return idx
        raise ValueError(f"列号超出范围: {col_ref}")
    for c in range(len(header["header_row"])):
        label, _ = lib.resolve_label(header, merged, c)
        if label and (ref in label or label in ref):
            return c
    raise ValueError(f"无法解析列引用: {col_ref}")


def generate_repeated(
    path: str,
    title: str | None,
    category: str | None,
    status: str | None,
    form_name: str | None,
    sheet: str | None,
    header_row: int | None,
    required: list[str],
    optional: list[str],
    type_overrides: list[str],
    select_labels: list[str],
    text_labels: list[str],
    label_map: dict[str, str],
    no_info_fields: bool,
    group_by: str,
    table_names: list[str],
    default_rows: int,
    min_rows: int,
    max_rows: int,
    weight_field: str | None,
    weight_limit: float | None,
    weight_total_limit: float | None,
    drop_cols: list[str],
):
    """按分组列把数据行分成多个 repeated_group 表格，生成表单 YAML。"""
    sheets, active, rows, merged = lib.load_rows(path, sheet)

    if header_row is not None:
        idx = header_row - 1
        if idx < 0 or idx >= len(rows):
            raise ValueError(f"--header-row {header_row} 超出范围（共 {len(rows)} 行）")
        header = {"title": "", "groups": [], "header_row": rows[idx], "header_idx": idx}
    else:
        header = lib.detect_header(rows)
        if header is None:
            raise ValueError("未识别到表头行，请用 --header-row 指定（1 起）")

    warnings = []
    info_fields = [] if no_info_fields else lib.detect_info_fields(rows, header["header_idx"])

    file_title = lib.title_from_filename(path)
    form_title = lib.first_non_empty(title, header["title"], file_title, "Excel 导入表单")
    name = form_name or lib.slugify(form_title)
    if not name or name[0].isdigit():
        name = "form_" + name if name else "excel_form"

    forced = {label: ("select", None, None, None) for label in select_labels}
    forced.update({label: ("text", None, None, None) for label in text_labels})
    for spec in type_overrides:
        label, ftype, fmin, fmax = parse_type_override(spec)
        forced[label] = (ftype, None, fmin, fmax)
    required_set = {x.strip() for x in required if x.strip()}
    optional_set = {x.strip() for x in optional if x.strip()}
    label_override_by_col = {}
    for col_ref, new_label in label_map.items():
        if col_ref.isdigit():
            label_override_by_col[int(col_ref)] = new_label
        else:
            col_num = 0
            for ch in col_ref.upper():
                col_num = col_num * 26 + (ord(ch) - 64)
            label_override_by_col[col_num] = new_label

    group_col = _col_index(group_by, header, merged)
    drop_cols_idx = set()
    for ref in drop_cols:
        try:
            drop_cols_idx.add(_col_index(ref, header, merged))
        except ValueError as e:
            warnings.append(str(e))

    # 收集数据行（跳过空行/页脚/重复表头行）
    data_start = header["header_idx"] + 1
    data_rows = []
    for i in range(data_start, len(rows)):
        if lib._skip_sample_row(rows[i], header["header_row"]):
            continue
        data_rows.append((i, rows[i]))

    # 按分组列值分组（优先合并单元格的区块标签）
    sections = {}
    order = []
    for i, row in data_rows:
        sec = merged.get((i + 1, group_col + 1))
        if not sec and group_col < len(row):
            sec = row[group_col]
        sec = re.sub(r"\s+", "", sec or "").strip()
        if not sec:
            sec = "其他"
        if sec not in sections:
            sections[sec] = []
            order.append(sec)
        sections[sec].append(row)

    table_name_map = {}
    for spec in table_names:
        k, _, v = spec.partition(":")
        if k.strip() and v.strip():
            table_name_map[k.strip()] = v.strip()

    ncols = len(header["header_row"])
    for g in header["groups"]:
        ncols = max(ncols, len(g["row"]))

    fields = []
    seen_names = {}
    for info in info_fields:
        fields.append(
            {
                "name": info["name"],
                "label": info["label"],
                "type": "text",
                "placeholder": "请输入" + info["label"],
                "required": False,
                "options": None,
                "min": None,
                "max": None,
                "samples": [info["value"]],
            }
        )
        seen_names[info["name"]] = 1

    for sec in order:
        rows_sec = sections[sec]
        fname = table_name_map.get(sec) or lib.slugify(sec)
        if not fname:
            fname = "table_" + str(len(fields) + 1)
        if fname in seen_names:
            seen_names[fname] += 1
            fname = f"{fname}_{seen_names[fname]}"
        else:
            seen_names[fname] = 1

        group_fields = []
        seen_group_names = {}
        for c in range(ncols):
            if c == group_col or c in drop_cols_idx:
                continue
            label, source = lib.resolve_label(header, merged, c)
            if (c + 1) in label_override_by_col:
                label = label_override_by_col[c + 1]
                source = "header"
            if not label:
                warnings.append(f"第 {c + 1} 列表头为空，已跳过")
                continue
            raw_label = label
            if source == "header":
                cleaned = lib.REQUIRED_RE.sub("", label).strip(" ：: ")
                if cleaned:
                    label = cleaned

            samples = lib.sample_values(rows_sec, 0, c, header_row=header["header_row"])
            ftype, opts, fmin, fmax = lib.infer_type(label, samples)
            base = label
            if base in forced:
                ftype, _, fmin, fmax = forced[base]
                opts = None
            if base in required_set:
                is_required = True
            elif base in optional_set:
                is_required = False
            else:
                is_required = bool(lib.REQUIRED_RE.search(raw_label))

            gname = lib.slugify(label)
            if not gname:
                gname = f"field_{c + 1}"
            if gname in seen_group_names:
                seen_group_names[gname] += 1
                gname = f"{gname}_{seen_group_names[gname]}"
            else:
                seen_group_names[gname] = 1

            group_fields.append(
                {
                    "name": gname,
                    "label": label,
                    "type": ftype,
                    "placeholder": placeholder_for(ftype, label),
                    "required": is_required,
                    "options": opts,
                    "min": fmin,
                    "max": fmax,
                    "samples": samples[:5],
                }
            )

        table_field = {
            "name": fname,
            "label": sec,
            "type": "repeated_group",
            "required": False,
            "options": None,
            "min": None,
            "max": None,
            "default_rows": default_rows,
            "min_rows": min_rows,
            "max_rows": max_rows,
            "group_fields": group_fields,
        }
        if weight_field:
            table_field["weight_sum_field"] = lib.slugify(weight_field)
        if weight_limit is not None:
            table_field["weight_sum_limit"] = float(weight_limit)
        fields.append(table_field)

    if not fields:
        raise ValueError("没有生成任何字段")

    form = {
        "name": name,
        "title": form_title,
        "description": f"由 Excel 模板自动生成：{form_title}",
        "category": category or "general",
        "status": status or "published",
        "fields": fields,
    }
    if weight_total_limit is not None:
        form["weight_sum_total_limit"] = float(weight_total_limit)
    return emit_yaml(form), form, warnings, sheets, active, header


def _col_letter(idx: int) -> str:
    s = ""
    idx += 1
    while idx:
        idx, rem = divmod(idx - 1, 26)
        s = chr(65 + rem) + s
    return s


def detect_scoring(form: dict) -> dict | None:
    """自动识别评分字段：repeated_group 内含『得分/评分/分值』与『权重/比例/占比』列。"""
    rgs = [f for f in form.get("fields", []) if f.get("type") == "repeated_group"]
    if not rgs:
        return None
    sf = None
    wf = None
    for g in rgs:
        for gf in g.get("group_fields", []):
            label = (gf.get("label") or "").lower()
            name = gf.get("name") or ""
            if re.search(r"得分|评分|分值", label) and gf.get("type") == "number":
                if not sf:
                    sf = name
            if re.search(r"权重|比例|占比", label):
                if not wf:
                    wf = name
    if not sf:
        return None
    mode = "item_weighted" if wf else "item_avg"
    return {"mode": mode, "group": "", "score_field": sf, "weight_field": wf or ""}


def apply_scoring(form: dict, args) -> dict:
    """叠加 scoring：优先用户 `--scoring-*` 覆盖，否则用自动识别结果。"""
    detected = None if args.no_scoring else detect_scoring(form)
    overrides = {
        "mode": getattr(args, "scoring_mode", None),
        "group": getattr(args, "scoring_group", None),
        "score_field": getattr(args, "scoring_score_field", None),
        "weight_field": getattr(args, "scoring_weight_field", None),
    }
    has_override = any(v is not None for v in overrides.values())
    if args.no_scoring:
        return form
    if has_override:
        d = detected or {}
        sc = {
            "mode": overrides["mode"] or d.get("mode", "single"),
            "group": overrides["group"] if overrides["group"] is not None else d.get("group", ""),
            "score_field": overrides["score_field"] if overrides["score_field"] is not None else d.get("score_field", ""),
            "weight_field": overrides["weight_field"] if overrides["weight_field"] is not None else d.get("weight_field", ""),
        }
        form["scoring"] = {k: v for k, v in sc.items() if v not in ("", None)}
    elif detected:
        form["scoring"] = detected
    return form


def main() -> None:
    p = argparse.ArgumentParser(description="Excel/CSV -> 表单 YAML")
    p.add_argument("file")
    p.add_argument("--title")
    p.add_argument("--category", default="general")
    p.add_argument("--status", default="published", choices=["published", "draft", "archived"])
    p.add_argument("--name", dest="form_name", help="表单 name（默认拼音标题）")
    p.add_argument("--sheet")
    p.add_argument("--header-row", type=int, help="表头行号（1 起），缺省自动识别")
    p.add_argument("--required", help="必填字段标签，逗号分隔")
    p.add_argument("--optional", help="可选字段标签，逗号分隔（覆盖必填推断）")
    p.add_argument("--type", dest="type_overrides", action="append", default=[], metavar="LABEL:TYPE[:MIN:MAX]")
    p.add_argument("--select", help="强制为下拉的字段标签，逗号分隔")
    p.add_argument("--text", help="强制为文本的字段标签，逗号分隔")
    p.add_argument("--label", dest="label_map", action="append", default=[], metavar="COL:NAME",
                   help="按列号指定列名，如 --label 'D:项目名称' 或 --label '4:项目名称'")
    p.add_argument("--output", help="写入 YAML 文件（默认输出到 stdout）")
    p.add_argument("--json", action="store_true", help="输出 JSON（含 yaml/fields/warnings）")
    p.add_argument("--no-info-fields", action="store_true", help="不生成表头上方「标签：值」信息字段")
    p.add_argument("--repeated-group", action="store_true", help="按分组列生成 repeated_group 表格表单")
    p.add_argument("--group-by", help="分组列（列字母/数字/标签），如 B 或 类别")
    p.add_argument("--table-name", dest="table_names", action="append", default=[], metavar="LABEL:NAME",
                   help="分组标签→表格字段名，如 '重点（专项）工作任务:key_tasks'，可重复")
    p.add_argument("--default-rows", type=int, default=3, help="repeated_group 默认行数")
    p.add_argument("--min-rows", type=int, default=1)
    p.add_argument("--max-rows", type=int, default=100)
    p.add_argument("--weight-field", help="权重合计字段标签（写入每个表格的 weight_sum_field）")
    p.add_argument("--weight-limit", type=float, help="每个表格权重上限（weight_sum_limit）")
    p.add_argument("--weight-total-limit", type=float, help="表单级权重合计上限（weight_sum_total_limit）")
    p.add_argument("--drop", dest="drop_cols", action="append", default=[], metavar="COL",
                   help="跳过的列（字母/数字/标签），可重复")
    p.add_argument("--no-scoring", action="store_true", help="不自动生成 scoring 评分声明")
    p.add_argument("--scoring-mode", choices=["single", "item_avg", "item_weighted"],
                   help="评分模式（默认自动：有得分+权重→item_weighted，仅得分→item_avg）")
    p.add_argument("--scoring-group", help="评分项 repeated_group 字段名（留空=所有含 score_field 的表格）")
    p.add_argument("--scoring-score-field", help="每项得分字段名（自动取 得分/评分/分值 列）")
    p.add_argument("--scoring-weight-field", help="每项权重字段名（自动取 权重/比例/占比 列）")
    args = p.parse_args()

    try:
        common = dict(
            title=args.title,
            category=args.category,
            status=args.status,
            form_name=args.form_name,
            sheet=args.sheet,
            header_row=args.header_row,
            required=[x for x in (args.required or "").split(",") if x],
            optional=[x for x in (args.optional or "").split(",") if x],
            type_overrides=args.type_overrides,
            select_labels=[x for x in (args.select or "").split(",") if x],
            text_labels=[x for x in (args.text or "").split(",") if x],
            label_map={k.strip(): v.strip() for k, v in (spec.split(":", 1) for spec in args.label_map) if k.strip() and v.strip()},
            no_info_fields=args.no_info_fields,
        )
        if args.repeated_group:
            yaml_text, form, warnings, sheets, active, header = generate_repeated(
                args.file,
                **common,
                group_by=args.group_by or "类别",
                table_names=args.table_names,
                default_rows=args.default_rows,
                min_rows=args.min_rows,
                max_rows=args.max_rows,
                weight_field=args.weight_field,
                weight_limit=args.weight_limit,
                weight_total_limit=args.weight_total_limit,
                drop_cols=args.drop_cols,
            )
        else:
            yaml_text, form, warnings, sheets, active, header = generate(args.file, **common)
    except Exception as e:
        print(f"生成失败: {e}", file=sys.stderr)
        sys.exit(1)

    # 评分声明：自动识别 得分/权重 列，或按 --scoring-* 覆盖
    apply_scoring(form, args)
    yaml_text = emit_yaml(form)

    # 决策摘要（stderr，便于与 YAML 分开阅读）
    print(f"工作表: {active}（共 {len(sheets)} 个）  表头行: {header['header_idx'] + 1}", file=sys.stderr)
    for f in form["fields"]:
        if f.get("type") == "repeated_group":
            cols = "、".join(g["label"] for g in f.get("group_fields", []))
            print(f"  {f['label']} -> {f['name']} [repeated_group] 列: {cols}", file=sys.stderr)
            continue
        opts = f" 选项={','.join(f['options'])}" if f.get("options") else ""
        req = " 必填" if f["required"] else ""
        print(f"  {f['label']} -> {f['name']} [{f['type']}]{req}{opts}", file=sys.stderr)
    for w in warnings:
        print(f"  警告: {w}", file=sys.stderr)
    if form.get("scoring"):
        sc = form["scoring"]
        print(f"  评分声明: mode={sc.get('mode')} group={sc.get('group') or '(所有含score_field)'} "
              f"score_field={sc.get('score_field')} weight_field={sc.get('weight_field') or '(无)'}", file=sys.stderr)

    if args.json:
        print(json.dumps({"yaml": yaml_text, "form": form, "warnings": warnings}, ensure_ascii=False, indent=2))
    elif args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(yaml_text)
        print(f"已写入 {args.output}")
    else:
        sys.stdout.write(yaml_text)


if __name__ == "__main__":
    main()
