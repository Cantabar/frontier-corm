FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /continuity-engine .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /continuity-engine /continuity-engine
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3300
ENV PORT=3300

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/continuity-engine"]
