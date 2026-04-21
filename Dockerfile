FROM alpine:3.18
RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY ./bin/go-web ./bin/go-web
COPY ./bin/config.yaml ./bin/config.yaml

RUN chmod +x ./bin/go-web

EXPOSE 8080
ENTRYPOINT ["./bin/go-web", "--config", "./bin/config.yaml"]
