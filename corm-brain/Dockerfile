FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /corm-brain .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /corm-brain /corm-brain

# Local item valuations for contract pricing (build artifact from scripts/build-item-values.mjs)
COPY data/item-values.json /data/item-values.json

ENTRYPOINT ["/corm-brain"]
