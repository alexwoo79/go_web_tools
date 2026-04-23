library(plumber)
library(jsonlite)

#* Receive fileID and produce a simple HTML report saved under /data/uploads
#* @post /render_report
function(req, res){
  body <- jsonlite::fromJSON(req$postBody)
  fileID <- body$fileID
  if (is.null(fileID) || fileID == ""){
    res$status <- 400
    return(list(error = "missing fileID"))
  }
  upload_path <- file.path("/data/uploads", fileID)
  if (!file.exists(upload_path)){
    res$status <- 404
    return(list(error = "file not found"))
  }
  # create simple HTML report
  out_dir <- "/data/uploads/reports"
  if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)
  out_file <- file.path(out_dir, paste0("report_", fileID, ".html"))
  txt <- paste0("<html><body><h1>Report for ", fileID, "</h1><p>Generated at ", Sys.time(), "</p></body></html>")
  writeLines(txt, out_file)
  res$status <- 200
  return(list(result = paste0("/data/uploads/reports/", basename(out_file))))
}
