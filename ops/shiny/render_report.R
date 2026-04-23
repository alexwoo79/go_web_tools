#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
fileID <- ifelse(length(args)>=1, args[1], "")
if (fileID == "") stop("missing fileID")
out_dir <- "/data/uploads/reports"
if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)
out_file <- file.path(out_dir, paste0("report_", fileID, ".html"))
cat("Generating report to:", out_file, "\n")
txt <- paste0("<html><body><h1>Report for ", fileID, "</h1><p>Generated at ", Sys.time(), "</p></body></html>")
writeLines(txt, out_file)
cat(out_file)
