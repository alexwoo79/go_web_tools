FROM golang:1.25-alpine AS builder
WORKDIR /src

# cache dependencies
COPY go.mod go.sum ./
RUN apk add --no-cache git ca-certificates && go env -w GOPROXY=https://proxy.golang.org,direct
RUN go mod download || true

# copy sources and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /go-server

FROM alpine:3.18
RUN apk add --no-cache ca-certificates
COPY --from=builder /go-server /usr/local/bin/go-server
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/go-server"]
