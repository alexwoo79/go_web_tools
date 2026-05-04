// src-tauri/src/commands.rs
//
// 后端核心逻辑 (Backend Core Logic)
//
// All heavy data-processing logic lives here so that `lib.rs` stays a clean
// Tauri wiring layer.  Each `*_impl` function is a pure Rust function that
// receives a reference to a Polars `DataFrame` and returns a transformed
// `DataFrame` (or an error).
//
// Sections
// ────────
//   1. File loading     – CSV / Excel via Polars
//   2. Chart data       – column selection, sorting, TopN filtering
//   3. Pivot table      – multi-dimensional aggregation via Polars pivot
//   4. Data cleaning    – fillna, dedup, trim, find/replace, type-cast
//   5. GroupBy          – groupby + aggregation
//
// All functions return `anyhow::Result<DataFrame>` for ergonomic `?` chaining.

use anyhow::{anyhow, bail, Context, Result};
use polars::prelude::*;
use std::path::Path;

// ─────────────────────────────────────────────────────────────────────────────
// 1. File loading
// ─────────────────────────────────────────────────────────────────────────────

/// Load a CSV or Excel file from `path`.
///
/// - Rows `[0, skip_head)` are dropped from the top.
/// - Rows `[len - skip_tail, len)` are dropped from the bottom.
/// - If `header_row >= 0`, that (0-based, post-skip) row is promoted to header.
pub fn load_file_impl(
    path: &str,
    skip_head: usize,
    skip_tail: usize,
    header_row: i64,
) -> Result<DataFrame> {
    let p = Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut df = match ext.as_str() {
        "csv" => {
            // Read without a header so we can honour skip/header_row ourselves.
            CsvReadOptions::default()
                .with_has_header(false)
                .with_skip_rows(skip_head)
                .try_into_reader_with_file_path(Some(p.to_path_buf()))
                .context("Failed to open CSV")?
                .finish()
                .context("Failed to parse CSV")?
        }
        "xlsx" | "xls" | "xlsm" => {
            // NOTE: Full Excel reading requires the `calamine` crate (not yet bundled).
            // To add real support, add `calamine = "0.25"` to Cargo.toml and
            // implement a sheet→DataFrame converter using calamine's Reader trait.
            bail!(
                "Excel file detected ('{}').\n\
                Direct Excel reading is not yet enabled in this build.\n\
                Please convert your file to CSV format first and re-upload it.",
                path
            );
        }
        other => bail!("Unsupported file extension: .{other}"),
    };

    // Drop trailing rows
    if skip_tail > 0 && skip_tail < df.height() {
        df = df.slice(0, df.height() - skip_tail);
    }

    // Promote header row
    if header_row >= 0 {
        let hr = header_row as usize;
        if hr < df.height() {
            // Extract the header row values as strings
            let new_names: Vec<String> = df
                .get_row(hr)
                .map_err(|e| anyhow!("{e}"))?
                .0
                .iter()
                .map(|v| format!("{v}"))
                .collect();
            // Drop the header row from data
            df = df.slice(hr as i64 + 1, df.height() - hr - 1);
            // Rename columns
            for (i, name) in new_names.into_iter().enumerate() {
                df.rename(&format!("column_{i}"), name.as_str().into())
                    .map_err(|e| anyhow!("{e}"))?;
            }
        }
    }

    // Drop fully-null rows and columns
    let df = drop_all_null_cols(df);
    Ok(df)
}

/// Drop columns that are entirely null.
fn drop_all_null_cols(df: DataFrame) -> DataFrame {
    let keep: Vec<&str> = df
        .get_columns()
        .iter()
        .filter(|s| s.null_count() < s.len())
        .map(|s| s.name())
        .collect();
    df.select(keep).unwrap_or(df)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Chart data
// ─────────────────────────────────────────────────────────────────────────────

/// Prepare DataFrame for chart rendering.
///
/// Pipeline: column-filter → sort → topN
#[allow(clippy::too_many_arguments)]
pub fn fetch_chart_data_impl(
    df: &DataFrame,
    x_col: &str,
    y_col: &str,
    color_col: Option<&str>,
    sort_by: &str,    // "x" | "y" | "none"
    sort_asc: bool,
    top_n: i64,       // 0 = no limit, >0 = top-N, <0 = bottom-N
    filter_cols: &[String],
) -> Result<DataFrame> {
    // Determine which columns to keep
    let mut keep: Vec<&str> = if filter_cols.is_empty() {
        df.get_column_names()
    } else {
        filter_cols
            .iter()
            .filter(|c| df.get_column_names().contains(&c.as_str()))
            .map(|c| c.as_str())
            .collect()
    };

    // Always ensure x and y are present
    for col in [x_col, y_col] {
        if !keep.contains(&col) {
            keep.push(col);
        }
    }
    if let Some(c) = color_col {
        if !keep.contains(&c) {
            keep.push(c);
        }
    }

    let mut result = df.select(&keep).map_err(|e| anyhow!("{e}"))?;

    // Sort
    let sort_col = match sort_by {
        "x" => Some(x_col),
        "y" => Some(y_col),
        _ => None,
    };
    if let Some(col) = sort_col {
        result = result
            .sort(
                [col],
                SortMultipleOptions::default().with_order_descending(!sort_asc),
            )
            .map_err(|e| anyhow!("{e}"))?;
    }

    // TopN
    if top_n > 0 {
        let n = (top_n as usize).min(result.height());
        result = result.slice(0, n);
    } else if top_n < 0 {
        let n = ((-top_n) as usize).min(result.height());
        let start = result.height().saturating_sub(n);
        result = result.slice(start as i64, n);
    }

    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pivot table
// ─────────────────────────────────────────────────────────────────────────────

/// Build a pivot table using Polars.
pub fn pivot_data_impl(
    df: &DataFrame,
    rows: &[String],
    columns: &[String],
    values: &[String],
    agg: &str,
) -> Result<DataFrame> {
    if rows.is_empty() || values.is_empty() {
        bail!("rows and values must not be empty");
    }

    let agg_fn = match agg {
        "sum" => PivotAgg::Sum,
        "mean" => PivotAgg::Mean,
        "count" => PivotAgg::Count,
        "min" => PivotAgg::Min,
        "max" => PivotAgg::Max,
        other => bail!("Unknown aggregation function: {other}"),
    };

    let col_refs: Option<Vec<&str>> = if columns.is_empty() {
        None
    } else {
        Some(columns.iter().map(|c| c.as_str()).collect())
    };

    let result = pivot(
        df,
        values.iter().map(|c| c.as_str()).collect::<Vec<_>>(),
        Some(rows.iter().map(|c| c.as_str()).collect::<Vec<_>>()),
        col_refs,
        false,
        Some(agg_fn),
        None,
    )
    .map_err(|e| anyhow!("{e}"))?;

    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Data cleaning
// ─────────────────────────────────────────────────────────────────────────────

/// Apply a sequential pipeline of cleaning operations to `df`.
#[allow(clippy::too_many_arguments)]
pub fn clean_data_impl(
    df: &DataFrame,
    fillna_col: &str,
    fillna_val: &str,
    dedup_cols: &[String],
    trim_cols: &[String],
    fr_cols: &[String],
    find_text: &str,
    replace_text: &str,
    use_regex: bool,
    type_col: &str,
    type_target: &str,
) -> Result<DataFrame> {
    let mut lf: LazyFrame = df.clone().lazy();

    // 1. Fill nulls in a single column
    if !fillna_col.is_empty() {
        let fill_expr = lit(fillna_val.to_string());
        lf = lf.with_column(
            col(fillna_col)
                .fill_null(fill_expr)
                .alias(fillna_col),
        );
    }

    // 2. Deduplicate
    let subset: Option<Vec<Expr>> = if dedup_cols.is_empty() {
        None
    } else {
        Some(dedup_cols.iter().map(|c| col(c.as_str())).collect())
    };
    lf = lf.unique(subset, UniqueKeepStrategy::First);

    // Collect early so we can do mutable string operations
    let mut df2 = lf.collect().map_err(|e| anyhow!("{e}"))?;

    // 3. Trim whitespace from selected string columns
    for c in trim_cols {
        if let Ok(series) = df2.column(c) {
            if series.dtype() == &DataType::String {
                let trimmed = series
                    .str()
                    .map_err(|e| anyhow!("{e}"))?
                    .apply(|opt| opt.map(|s| std::borrow::Cow::Owned(s.trim().to_string())));
                df2.replace(c, trimmed.into_series()).map_err(|e| anyhow!("{e}"))?;
            }
        }
    }

    // 4. Find & replace
    if !find_text.is_empty() {
        for c in fr_cols {
            if let Ok(series) = df2.column(c) {
                let ca = series.cast(&DataType::String).map_err(|e| anyhow!("{e}"))?;
                let str_ca = ca.str().map_err(|e| anyhow!("{e}"))?;
                let replaced: Series = if use_regex {
                    str_ca
                        .replace_all(find_text, replace_text)
                        .map_err(|e| anyhow!("{e}"))?
                        .into_series()
                } else {
                    str_ca
                        .replace_all(
                            &regex::escape(find_text),
                            replace_text,
                        )
                        .map_err(|e| anyhow!("{e}"))?
                        .into_series()
                };
                df2.replace(c, replaced.with_name(c.as_str().into()))
                    .map_err(|e| anyhow!("{e}"))?;
            }
        }
    }

    // 5. Type-cast a column
    if !type_col.is_empty() {
        let target_dtype = match type_target {
            "int" => DataType::Int64,
            "float" => DataType::Float64,
            "str" => DataType::String,
            "datetime" => DataType::Datetime(TimeUnit::Milliseconds, None),
            "date" => DataType::Date,
            other => bail!("Unknown target type: {other}"),
        };
        let series = df2
            .column(type_col)
            .map_err(|e| anyhow!("{e}"))?
            .cast(&target_dtype)
            .map_err(|e| anyhow!("{e}"))?;
        df2.replace(type_col, series).map_err(|e| anyhow!("{e}"))?;
    }

    Ok(df2)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. GroupBy aggregation
// ─────────────────────────────────────────────────────────────────────────────

pub fn groupby_agg_impl(
    df: &DataFrame,
    group_cols: &[String],
    agg_col: &str,
    agg_func: &str,
) -> Result<DataFrame> {
    if group_cols.is_empty() {
        bail!("group_cols must not be empty");
    }

    let agg_expr = match agg_func {
        "sum" => col(agg_col).sum(),
        "mean" => col(agg_col).mean(),
        "count" => col(agg_col).count(),
        "min" => col(agg_col).min(),
        "max" => col(agg_col).max(),
        other => bail!("Unknown aggregation function: {other}"),
    }
    .alias(agg_col);

    let result = df
        .clone()
        .lazy()
        .group_by(group_cols.iter().map(|c| col(c.as_str())).collect::<Vec<_>>())
        .agg([agg_expr])
        .sort(
            group_cols.iter().map(|c| c.as_str()).collect::<Vec<_>>(),
            SortMultipleOptions::default(),
        )
        .collect()
        .map_err(|e| anyhow!("{e}"))?;

    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Excel reading
//
// Full Excel (.xlsx / .xls / .xlsm) reading is not yet enabled in this build.
// The `xlsx2csv` Polars feature converts sheets to CSV in-memory, but the
// exact stable API differs across Polars minor versions.
//
// To add real Excel support, integrate the `calamine` crate:
//   1. Add `calamine = "0.25"` to Cargo.toml.
//   2. Read the workbook with `calamine::open_workbook::<Xlsx, _>(path)`.
//   3. Convert each row to a Polars Series and build a DataFrame.
//
// Until then, the `load_file_impl` function returns a descriptive error for
// Excel files, asking the user to convert to CSV first.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Escape helper (used in non-regex find/replace)
// ─────────────────────────────────────────────────────────────────────────────
mod regex {
    /// Escape all regex metacharacters so the string is treated literally.
    pub fn escape(s: &str) -> String {
        // Simple character-by-character escape
        let mut out = String::with_capacity(s.len() * 2);
        for ch in s.chars() {
            match ch {
                '.' | '^' | '$' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|'
                | '\\' => {
                    out.push('\\');
                    out.push(ch);
                }
                _ => out.push(ch),
            }
        }
        out
    }
}
