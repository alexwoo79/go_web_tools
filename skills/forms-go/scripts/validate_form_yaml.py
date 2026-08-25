#!/usr/bin/env python3
"""校验 YAML 表单定义是否符合 go_web_tools schema。

用法:
  python3 validate_form_yaml.py forms.yaml

校验通过 exit 0，否则列出全部错误并 exit 1。
自然语言生成或手工编写的 YAML 交付前都应先跑一遍本脚本。
"""

from __future__ import annotations

import argparse
import re
import sys

import yaml


SUPPORTED_TYPES = {
    "text", "email", "tel", "password", "number", "textarea",
    "select", "checkbox", "radio", "date", "time", "range", "repeated_group",
}
STATUSES = {"draft", "published", "archived"}
OPTION_TYPES = {"select", "checkbox", "radio"}
OPTIONS_FROM = {"users", "departments", "roles"}
SCORING_MODES = {"single", "item_avg", "item_weighted"}
NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def validate_field(f, path: str) -> list[str]:
    errors = []
    if not isinstance(f, dict):
        return [f"{path} 不是对象"]

    name = f.get("name")
    label = f.get("label")
    ftype = f.get("type")

    if not name:
        errors.append(f"{path} 缺少 name")
    elif not NAME_RE.match(name):
        errors.append(f"{path} name 不合法: {name!r}（须以字母开头，仅含字母/数字/下划线）")
    if not label:
        errors.append(f"{path} 缺少 label")
    if not ftype:
        errors.append(f"{path} 缺少 type")
    elif ftype not in SUPPORTED_TYPES:
        errors.append(f"{path} type 不支持: {ftype!r}（支持: {', '.join(sorted(SUPPORTED_TYPES))}）")

    if ftype in OPTION_TYPES and not f.get("options") and not f.get("options_from"):
        errors.append(f"{path} 类型 {ftype} 需要 options 或 options_from")
    if f.get("options_from") and f["options_from"] not in OPTIONS_FROM:
        errors.append(f"{path} options_from 不合法: {f['options_from']!r}（支持 {', '.join(sorted(OPTIONS_FROM))}）")
    if ftype == "number" or ftype == "range":
        mn, mx = f.get("min"), f.get("max")
        if mn is not None and mx is not None and mx < mn:
            errors.append(f"{path} max({mx}) < min({mn})")

    if ftype == "repeated_group":
        gf = f.get("group_fields")
        if not isinstance(gf, list) or not gf:
            errors.append(f"{path} repeated_group 缺少 group_fields")
        gnames = []
        for j, g in enumerate(gf or []):
            errors.extend(validate_field(g, f"{path}.group_fields[{j}]"))
            if isinstance(g, dict) and g.get("name"):
                gnames.append(g["name"])
        wf = f.get("weight_sum_field")
        if wf and wf not in gnames:
            errors.append(f"{path} weight_sum_field {wf!r} 不在 group_fields 中")
        if f.get("weight_sum_limit") is not None and not isinstance(f.get("weight_sum_limit"), (int, float)):
            errors.append(f"{path} weight_sum_limit 须为数字")

    return errors


def validate_scoring(form, path: str) -> list[str]:
    errors = []
    sc = form.get("scoring")
    if sc is None:
        return errors
    if not isinstance(sc, dict):
        return [f"{path} scoring 不是对象"]

    mode = sc.get("mode") or "single"
    if mode not in SCORING_MODES:
        errors.append(f"{path} scoring.mode 不支持: {mode!r}（支持 {', '.join(sorted(SCORING_MODES))}）")

    fields = form.get("fields") or []
    rg_by_name = {}
    for f in fields:
        if isinstance(f, dict) and f.get("name") and f.get("type") == "repeated_group":
            rg_by_name[f["name"]] = f

    group = sc.get("group")
    if group:
        if group not in rg_by_name:
            errors.append(f"{path} scoring.group {group!r} 不是 repeated_group 字段")

    # 仅逐项打分的模式需要 score_field；校验其是否在评分项表格的 group_fields 中
    if mode in ("item_avg", "item_weighted"):
        sf = sc.get("score_field") or ""
        if not sf:
            errors.append(f"{path} 评分模式 {mode} 需要 score_field")
        wf = sc.get("weight_field") or ""

        if group:
            candidates = [rg_by_name[group]] if group in rg_by_name else []
        else:
            candidates = [f for f in fields if isinstance(f, dict) and f.get("type") == "repeated_group"]
        if not candidates:
            errors.append(f"{path} 找不到用于逐项打分的 repeated_group")

        has_sf, has_wf = False, False
        for g in candidates:
            gnames = [gg.get("name") for gg in g.get("group_fields", []) if isinstance(gg, dict)]
            if sf and sf in gnames:
                has_sf = True
            if wf and wf in gnames:
                has_wf = True
        if sf and not has_sf:
            errors.append(f"{path} score_field {sf!r} 不在评分项表格的 group_fields 中")
        if mode == "item_weighted" and wf and not has_wf:
            errors.append(f"{path} weight_field {wf!r} 不在评分项表格的 group_fields 中")
    return errors


def validate_form(form, path: str) -> list[str]:
    errors = []
    if not isinstance(form, dict):
        return [f"{path} 不是对象"]

    name = form.get("name")
    if not name:
        errors.append(f"{path} 缺少 name")
    elif not NAME_RE.match(name):
        errors.append(f"{path} name 不合法: {name!r}（须以字母开头，仅含字母/数字/下划线）")
    if not form.get("title"):
        errors.append(f"{path} 缺少 title")
    if form.get("status", "published") not in STATUSES:
        errors.append(f"{path} status 不合法: {form.get('status')!r}")
    if not form.get("category"):
        errors.append(f"{path} 缺少 category")
    if form.get("weight_sum_total_limit") is not None and not isinstance(form.get("weight_sum_total_limit"), (int, float)):
        errors.append(f"{path} weight_sum_total_limit 须为数字")
    errors.extend(validate_scoring(form, path))

    fields = form.get("fields")
    if not isinstance(fields, list) or not fields:
        errors.append(f"{path} 缺少 fields 列表")
        return errors

    seen = set()
    for i, f in enumerate(fields):
        errors.extend(validate_field(f, f"{path}.fields[{i}]"))
        if isinstance(f, dict) and f.get("name"):
            if f["name"] in seen:
                errors.append(f"{path} 字段 name 重复: {f['name']!r}")
            seen.add(f["name"])
    return errors


def main() -> None:
    p = argparse.ArgumentParser(description="校验 go_web_tools 表单 YAML")
    p.add_argument("file", help="YAML 文件路径（可含多个 forms 项）")
    args = p.parse_args()

    try:
        with open(args.file, encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"❌ 读取/解析失败: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, dict) or "forms" not in data:
        print("❌ 根结构必须是 forms 列表", file=sys.stderr)
        sys.exit(1)

    all_errors = []
    for i, form in enumerate(data["forms"]):
        all_errors.extend(validate_form(form, f"forms[{i}]"))

    if all_errors:
        print(f"❌ 校验失败，共 {len(all_errors)} 个问题:")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(1)

    names = [f.get("name") for f in data["forms"]]
    print(f"✅ 校验通过: {len(data['forms'])} 个表单 {names}")


if __name__ == "__main__":
    main()
