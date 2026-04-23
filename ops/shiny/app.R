library(shiny)

ui <- fluidPage(
  titlePanel("Shiny Analytics PoC"),
  sidebarLayout(
    sidebarPanel(
      helpText("This Shiny app is a minimal PoC. Use the plumber endpoint to render reports.")
    ),
    mainPanel(
      h4("PoC: Report folder"),
      uiOutput("reports")
    )
  )
)

server <- function(input, output, session){
  output$reports <- renderUI({
    files <- list.files("/data/uploads/reports", full.names = TRUE)
    if (length(files)==0) return("No reports yet")
    tags$ul(lapply(files, function(f) tags$li(tags$a(href = paste0('/reports/', basename(f)), target = '_blank', basename(f)))))
  })
}

shinyApp(ui, server)
