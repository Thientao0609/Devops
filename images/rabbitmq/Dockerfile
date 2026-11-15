FROM rabbitmq:4.2.9-management@sha256:7fa20d0d23d63ed90499bbf62e24af48ec4ae5eb22d173f3db96e3f85b26884a AS config
COPY enabled_plugins /tmp/enabled_plugins
RUN test -s /tmp/enabled_plugins
FROM rabbitmq:4.2.9-management@sha256:7fa20d0d23d63ed90499bbf62e24af48ec4ae5eb22d173f3db96e3f85b26884a
COPY --from=config --chown=rabbitmq:rabbitmq /tmp/enabled_plugins /etc/rabbitmq/enabled_plugins
USER rabbitmq
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 CMD rabbitmq-diagnostics -q ping
