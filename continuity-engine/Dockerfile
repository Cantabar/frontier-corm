FROM golang:1.22-alpine AS builder

WORKDIR /build
COPY continuity-engine/go.mod continuity-engine/go.sum ./
RUN go mod download

COPY continuity-engine/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/continuity-engine .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Binary
COPY --from=builder /out/continuity-engine /usr/local/bin/continuity-engine

# Item registry data (only the two files registry.go actually reads)
COPY static-data/data/phobos/fsd_built/types.json  ./static-data/data/phobos/fsd_built/types.json
COPY static-data/data/phobos/fsd_built/groups.json ./static-data/data/phobos/fsd_built/groups.json
COPY continuity-engine/data/item-values.json       ./continuity-engine/data/item-values.json

EXPOSE 3300
ENV PORT=3300

ENTRYPOINT ["continuity-engine"]

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/continuity-engine"]
