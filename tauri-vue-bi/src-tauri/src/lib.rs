// src-tauri/src/lib.rs
//
// 引擎入口 (Engine Entry Point)
//
// This module wires together:
//   • Tauri application bootstrap
//   • Global in-memory DataFrame state (via Polars LazyFrame + DuckDB)
//   • All Tauri commands exposed to the Vue3 frontend
//
// Architecture overview
// ─────────────────────
//   Frontend (Vue3/TS)  ──invoke──▶  Tauri IPC  ──▶  commands.rs
//                                                         │
//                                              ┌──────────┴──────────┐
//                                         Polars (clean / load)   DuckDB (query / pivot)

pub mod commands;

use std::sync::Mutex;

use anyhow::Result;
use once_cell::sync::Lazy;
use polars::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::Manager;

// ─────────────────────────────────────────────────────────────────────────────
// Global shared state
// ─────────────────────────────────────────────────────────────────────────────

/// The currently loaded DataFrame, shared across all Tauri commands.
/// Wrapped in `Mutex` so that concurrent invocations are serialised.
pub static GLOBAL_DF: Lazy<Mutex<Option<DataFrame>>> = Lazy::new(|| Mutex::new(None));

// ─────────────────────────────────────────────────────────────────────────────
// Shared data types (used by both lib.rs and commands.rs)
// ─────────────────────────────────────────────────────────────────────────────

/// Generic API response wrapper sent back to the frontend.
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResult<T: Serialize> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResult<T> {
    pub fn success(data: T) -> Self {
        Self { ok: true, data: Some(data), error: None }
    }
    pub fn failure(msg: impl Into<String>) -> Self {
        Self { ok: false, data: None, error: Some(msg.into()) }
    }
}

/// A lightweight, serialisable representation of a DataFrame column.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub dtype: String,
}

/// Represents a single row as a map of column-name → JSON value,
/// compatible with ECharts `dataset.source`.
pub type RowMap = serde_json::Map<String, serde_json::Value>;

/// Payload returned by `fetch_chart_data` and similar commands.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChartPayload {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<RowMap>,
    pub total_rows: usize,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: convert Polars DataFrame ─▶ ChartPayload
// ─────────────────────────────────────────────────────────────────────────────

pub fn df_to_payload(df: &DataFrame) -> Result<ChartPayload> {
    let total_rows = df.height();

    // Build column metadata
    let columns: Vec<ColumnInfo> = df
        .get_columns()
        .iter()
        .map(|s| ColumnInfo {
            name: s.name().to_string(),
            dtype: format!("{}", s.dtype()),
        })
        .collect();

    // Serialise each row to a JSON map
    let mut rows: Vec<RowMap> = Vec::with_capacity(total_rows);
    for row_idx in 0..total_rows {
        let mut map = serde_json::Map::new();
        for series in df.get_columns() {
            let val = series_value_to_json(series, row_idx);
            map.insert(series.name().to_string(), val);
        }
        rows.push(map);
    }

    Ok(ChartPayload { columns, rows, total_rows })
}

/// Extract a single cell from a `Series` as a JSON `Value`.
fn series_value_to_json(s: &Series, idx: usize) -> serde_json::Value {
    use serde_json::Value;
    use AnyValue::*;

    match s.get(idx).unwrap_or(AnyValue::Null) {
        Null => Value::Null,
        Boolean(v) => Value::Bool(v),
        Int8(v) => Value::Number(v.into()),
        Int16(v) => Value::Number(v.into()),
        Int32(v) => Value::Number(v.into()),
        Int64(v) => Value::Number(v.into()),
        UInt8(v) => Value::Number(v.into()),
        UInt16(v) => Value::Number(v.into()),
        UInt32(v) => Value::Number(v.into()),
        UInt64(v) => Value::Number(v.into()),
        Float32(v) => {
            serde_json::Number::from_f64(v as f64)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
        Float64(v) => {
            serde_json::Number::from_f64(v)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
        other => Value::String(format!("{other}")),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Tauri commands (high-level orchestration)
// ─────────────────────────────────────────────────────────────────────────────

/// Load a CSV or Excel file into the global DataFrame.
///
/// Parameters
/// ──────────
/// `path`       – absolute path to the file (chosen via the frontend file dialog)
/// `skip_head`  – number of rows to skip at the top
/// `skip_tail`  – number of rows to skip at the bottom
/// `header_row` – 0-based index of the header row (-1 = first row is header)
#[tauri::command]
pub async fn load_file(
    path: String,
    skip_head: usize,
    skip_tail: usize,
    header_row: i64,
) -> ApiResult<ChartPayload> {
    match commands::load_file_impl(&path, skip_head, skip_tail, header_row) {
        Ok(df) => {
            let payload = df_to_payload(&df);
            *GLOBAL_DF.lock().unwrap() = Some(df);
            match payload {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

/// Return a summary of the currently loaded DataFrame (columns + first N rows).
#[tauri::command]
pub async fn get_dataframe_info(limit: Option<usize>) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded. Please load a file first."),
        Some(df) => {
            let n = limit.unwrap_or(100).min(df.height());
            let slice = df.slice(0, n);
            match df_to_payload(&slice) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
    }
}

/// Fetch and transform data for chart rendering.
///
/// This is the primary command called by `ChartAnalysis.vue`.
///
/// Parameters
/// ──────────
/// `x_col`      – X-axis column name
/// `y_col`      – Y-axis column name (must be numeric)
/// `color_col`  – optional grouping/colour column
/// `sort_by`    – "x" | "y" | "none"
/// `sort_asc`   – true = ascending
/// `top_n`      – 0 = no limit; > 0 = keep top N rows; < 0 = keep bottom N rows
/// `filter_cols`– list of columns to retain (empty = keep all)
#[tauri::command]
pub async fn fetch_chart_data(
    x_col: String,
    y_col: String,
    color_col: Option<String>,
    sort_by: String,
    sort_asc: bool,
    top_n: i64,
    filter_cols: Vec<String>,
) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded."),
        Some(df) => {
            match commands::fetch_chart_data_impl(
                df,
                &x_col,
                &y_col,
                color_col.as_deref(),
                &sort_by,
                sort_asc,
                top_n,
                &filter_cols,
            ) {
                Ok(result_df) => match df_to_payload(&result_df) {
                    Ok(p) => ApiResult::success(p),
                    Err(e) => ApiResult::failure(e.to_string()),
                },
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
    }
}

/// Build a pivot table from the currently loaded DataFrame.
///
/// Parameters
/// ──────────
/// `rows`    – columns to use as row-index groups
/// `columns` – columns to use as column-index groups
/// `values`  – columns to aggregate
/// `agg`     – aggregation function: "sum" | "mean" | "count" | "min" | "max"
#[tauri::command]
pub async fn pivot_data(
    rows: Vec<String>,
    columns: Vec<String>,
    values: Vec<String>,
    agg: String,
) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded."),
        Some(df) => match commands::pivot_data_impl(df, &rows, &columns, &values, &agg) {
            Ok(result_df) => match df_to_payload(&result_df) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            },
            Err(e) => ApiResult::failure(e.to_string()),
        },
    }
}

/// Apply cleaning operations to the global DataFrame and return the result.
///
/// The cleaning steps are applied in this order:
///   1. fillna  → 2. dedup  → 3. trim  → 4. find/replace  → 5. type-cast
///
/// Parameters
/// ──────────
/// `fillna_col`    – column to fill nulls in (empty string = skip)
/// `fillna_val`    – fill value
/// `dedup_cols`    – columns to deduplicate on (empty = all columns)
/// `trim_cols`     – string columns to strip whitespace
/// `fr_cols`       – columns to apply find/replace on
/// `find_text`     – text to find
/// `replace_text`  – replacement text
/// `use_regex`     – treat `find_text` as a regex
/// `type_col`      – column to cast (empty string = skip)
/// `type_target`   – target dtype: "int" | "float" | "str" | "datetime" | "date"
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn clean_data(
    fillna_col: String,
    fillna_val: String,
    dedup_cols: Vec<String>,
    trim_cols: Vec<String>,
    fr_cols: Vec<String>,
    find_text: String,
    replace_text: String,
    use_regex: bool,
    type_col: String,
    type_target: String,
) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded."),
        Some(df) => match commands::clean_data_impl(
            df,
            &fillna_col,
            &fillna_val,
            &dedup_cols,
            &trim_cols,
            &fr_cols,
            &find_text,
            &replace_text,
            use_regex,
            &type_col,
            &type_target,
        ) {
            Ok(result_df) => match df_to_payload(&result_df) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            },
            Err(e) => ApiResult::failure(e.to_string()),
        },
    }
}

/// GroupBy aggregation: group by `group_cols`, aggregate `agg_col` with `agg_func`.
#[tauri::command]
pub async fn groupby_agg(
    group_cols: Vec<String>,
    agg_col: String,
    agg_func: String,
) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded."),
        Some(df) => match commands::groupby_agg_impl(df, &group_cols, &agg_col, &agg_func) {
            Ok(result_df) => match df_to_payload(&result_df) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            },
            Err(e) => ApiResult::failure(e.to_string()),
        },
    }
}

/// Fetch Gantt chart data: returns rows with task, start, end, and optional group/milestone columns.
#[tauri::command]
pub async fn fetch_gantt_data(
    task_col: String,
    start_col: String,
    end_col: String,
    color_col: Option<String>,
    milestone_col: Option<String>,
) -> ApiResult<ChartPayload> {
    let guard = GLOBAL_DF.lock().unwrap();
    match guard.as_ref() {
        None => ApiResult::failure("No data loaded."),
        Some(df) => {
            let mut keep_cols: Vec<String> =
                vec![task_col.clone(), start_col.clone(), end_col.clone()];
            if let Some(ref c) = color_col {
                keep_cols.push(c.clone());
            }
            if let Some(ref c) = milestone_col {
                keep_cols.push(c.clone());
            }
            // Keep only existing columns to avoid Polars error
            let valid: Vec<&str> = keep_cols
                .iter()
                .filter(|c| df.get_column_names().contains(&c.as_str()))
                .map(|c| c.as_str())
                .collect();

            match df.select(valid) {
                Ok(result_df) => match df_to_payload(&result_df) {
                    Ok(p) => ApiResult::success(p),
                    Err(e) => ApiResult::failure(e.to_string()),
                },
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri app bootstrap
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_file,
            get_dataframe_info,
            fetch_chart_data,
            pivot_data,
            clean_data,
            groupby_agg,
            fetch_gantt_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
