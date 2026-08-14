#!/usr/bin/env python3
"""交互式 Excel 结构分析器：输出表格结构、表头候选、合并单元格与每列推断，
供 Codex 与用户共同确认字段映射。用法见 --help。"""

from __future__ import annotations

import argparse
import json
import sys

import lib_excel as lib


def col_letter(idx: int) -> str:
    s = ""
    idx += 1
    while idx:
        idx, rem = divmod(idx - 1, 26)
        s = chr(65 + rem) + s
    return s


def analyze(path: str, sheet: str | None, max_rows: int, json_out: bool) -> str:
    sheets, active, rows, merged = lib.load_rows(path, sheet)
    header = lib.detect_header(rows)
    report = {
        "file": path,
        "sheets": sheets,
        "active_sheet": active,
        "merged_ranges": _merged_ranges_text(merged),
        "rows": [],
        "columns": [],
        "info_fields": [],
    }

    if header:
        report["info_fields"] = lib.detect_info_fields(rows, header["header_idx"])

    if header:
        data_start = header["header_idx"] + 1
    else:
        data_start = 1

    # 逐行 dump（表头区域 + 前 max_rows 数据行）
    shown = set()
    for r in range(min(max_rows + 4, len(rows))):
        row = rows[r]
        cnt, cells, _ = lib.row_stats(row)
        if cnt == 0 and r >= header["header_idx"] + 1:
            continue
        line = []
        for c, v in enumerate(cells):
            if not v:
                continue
            line.append(f"{col_letter(c)}{r + 1}={v}")
        report["rows"].append({"row": r + 1, "cells": line, "role": _row_role(r, header)})
        shown.add(r)

    # 每列分析
    if header:
        ncols = len(header["header_row"])
        for g in header["groups"]:
            ncols = max(ncols, len(g["row"]))
        for c in range(ncols):
            label, source = lib.resolve_label(header, merged, c)
            if not label:
                continue
            samples = lib.sample_values(rows, data_start, c, header_row=header["header_row"])
            ftype, opts, fmin, fmax = lib.infer_type(label, samples)
            col = {
                "column": col_letter(c),
                "label": label,
                "label_source": source,
                "name": lib.slugify(label),
                "required_hint": bool(lib.REQUIRED_RE.search(label)),
                "type": ftype,
                "options": opts,
                "min": fmin,
                "max": fmax,
                "sample_values": samples[:12],
                "sample_count": len(samples),
                "numeric": [s for s in samples[:12] if lib.is_numeric(s)],
                "percent": [s for s in samples[:12] if lib.is_percent(s)],
            }
            report["columns"].append(col)

    if json_out:
        return json.dumps(report, ensure_ascii=False, indent=2)

    lines = []
    lines.append(f"文件: {path}")
    lines.append(f"工作表: {active}  共 {len(sheets)} 个: {', '.join(sheets)}")
    if report["merged_ranges"]:
        lines.append(f"合并单元格: {report['merged_ranges']}")
    if header:
        lines.append(
            f"表头: 第 {header['header_idx'] + 1} 行"
            + (f"（标题: {header['title']}）" if header["title"] else "")
            + (f"，分组行: {[g['idx'] + 1 for g in header['groups']]}" if header["groups"] else "")
        )
        lines.append("表头内容: " + " | ".join(v for v in header["header_row"] if v))
    else:
        lines.append("未识别到表头行！")

    lines.append("\n--- 单元格明细（前几行）---")
    for r in report["rows"][:max_rows + 2]:
        if r["cells"]:
            lines.append(f"第{r['row']}行 [{r['role']}] " + "  ".join(r["cells"][:24]))

    lines.append("\n--- 每列推断 ---")
    for col in report["columns"]:
        opts = "、".join(col["options"]) if col["options"] else "-"
        bounds = f" min={col['min']} max={col['max']}" if col["min"] is not None or col["max"] is not None else ""
        req = "必填" if col["required_hint"] else ""
        samples = "、".join(col["sample_values"][:5]) or "-"
        src = {"merged": "（表头为空，回退合并分组标题）", "group": "（表头为空，回退分组行）"}.get(col["label_source"], "")
        lines.append(
            f"{col['column']}列 {col['label']} {src}-> {col['name']} [{col['type']}]{bounds} {req}"
            f"\n    选项: {opts}\n    样例: {samples}"
        )
    if report["info_fields"]:
        lines.append("\n--- 表头上方信息字段 ---")
        for info in report["info_fields"]:
            lines.append(f"  {info['label']} -> {info['name']}（模板样例值: {info['value']}）")
    return "\n".join(lines)


def _merged_ranges_text(merged: dict) -> str:
    groups = {}
    for (r, c), v in merged.items():
        groups.setdefault(v, []).append((r, c))
    parts = []
    for v, cells in groups.items():
        rs = [x[0] for x in cells]
        cs = [x[1] for x in cells]
        parts.append(f"「{v}」覆盖 {min(rs)}-{max(rs)} 行, {min(cs)}-{max(cs)} 列")
    return "; ".join(parts)


def _row_role(r: int, header) -> str:
    if not header:
        return "?"
    if r == header["header_idx"]:
        return "表头"
    if any(g["idx"] == r for g in header["groups"]):
        return "分组"
    if r < header["header_idx"]:
        return "标题/说明"
    return "数据"


def main() -> None:
    p = argparse.ArgumentParser(description="交互式分析 Excel 表格结构")
    p.add_argument("file", help="xlsx/csv 文件路径")
    p.add_argument("--sheet", help="指定工作表名（默认第一个）")
    p.add_argument("--max-rows", type=int, default=30, help="最多展示的数据行数")
    p.add_argument("--json", action="store_true", help="输出 JSON 供程序使用")
    args = p.parse_args()
    try:
        print(analyze(args.file, args.sheet, args.max_rows, args.json))
    except Exception as e:
        print(f"分析失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
