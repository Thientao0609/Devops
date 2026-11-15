FROM axllent/mailpit:v1.33.1@sha256:aef2aacc11f075ec0fb6874275ee4a421e688e11a96ebb296134d1735c7761ce AS mailpit
FROM alpine:3.24 AS configuration
RUN addgroup -S -g 10001 clinic && adduser -S -D -H -u 10001 -G clinic clinic

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata
COPY --from=configuration /etc/passwd /etc/passwd
COPY --from=configuration /etc/group /etc/group
COPY --from=mailpit /mailpit /mailpit
USER 10001:10001
EXPOSE 1025 8025
HEALTHCHECK --interval=10s --timeout=3s --retries=15 CMD ["/mailpit", "readyz"]
ENTRYPOINT ["/mailpit"]
